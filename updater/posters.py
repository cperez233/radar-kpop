"""Lectura de pósters con Tesseract: saca el texto de las imágenes de los anuncios oficiales para updater/auto_dates.py.

Uso:
    from posters import Reader
    r = Reader()                 # r.ok es False si Tesseract no está instalado (entonces read() devuelve "")
    texto = r.read(url)          # texto del póster, ya sin las líneas de venta de boletas
    r.save()                     # guarda la caché en state/posters.json
    python updater/posters.py archivo.jpg|URL   # prueba a mano: imprime lo que se lee

Muchos anuncios de gira son solo una imagen ("2026 WORLD TOUR ... SEOUL 11.21-22 KSPO DOME"). Tesseract (eng + kor + jpn
si están instalados) lee el póster y auto_dates.py busca en ese texto fechas y recintos con las mismas reglas que en el post.
- Cada imagen se lee una sola vez: el texto queda en state/posters.json (se borra a los 60 días) y el robot lo commitea.
- Como mucho MAX_NEW pósters nuevos por corrida y TIMEOUT segundos por póster, para que el run no se alargue.
- Se quitan las líneas de boletas y preventa (TICKET OPEN 10.28, 선예매, FANCLUB PRESALE...): esas fechas no son shows.
Sin Tesseract o si una imagen falla, no pasa nada: el post se sigue leyendo solo por su texto.
"""
from __future__ import annotations

import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "state" / "posters.json"
UA = {"User-Agent": "radar-kpop (+https://radar-kpop.vercel.app)"}
LANGS = ("eng", "kor", "jpn")
MAX_NEW, TIMEOUT, KEEP_DAYS, MIN_WIDTH = 12, 60, 60, 1600
IMG_RE = re.compile(r"<img[^>]+src=[\"']([^\"']+)[\"']", re.I)
# líneas que hablan de boletas, preventa, membresías o transmisiones: sus fechas no son de shows
NOT_SHOW = re.compile(r"ticket|presale|pre-?sale|general sale|on ?sale|booking|예매|티켓|선예매|일반예매|멤버십|membership|fan ?club|"
                      r"チケット|先行|販売|発売|registration|응모|신청|lottery|추첨|live ?stream|생중계|配信|\bopen\b|오픈", re.I)


def images(description: str) -> list[str]:
    """URLs de las fotos de un post de RSSHub (no avatares ni emojis), como mucho 4."""
    out = []
    for u in IMG_RE.findall(description or ""):
        u = u.replace("&amp;", "&")
        if "pbs.twimg.com/media/" in u or (re.search(r"\.(jpe?g|png|webp)(\?|$)", u, re.I) and "profile_images" not in u and "emoji" not in u):
            if u not in out:
                out.append(u)
    return out[:4]


def big(url: str) -> str:
    """En X, la versión grande de la imagen (las miniaturas son muy chicas para leer letra de póster)."""
    if "pbs.twimg.com/media/" not in url:
        return url
    base = url.split("?")[0]
    fmt = re.search(r"format=(\w+)", url)
    ext = re.search(r"\.(jpe?g|png|webp)$", base)
    if ext:
        base, fmt_ = base[: -len(ext.group(0))], ext.group(1)
    else:
        fmt_ = fmt.group(1) if fmt else "jpg"
    return f"{base}?format={fmt_}&name=large"


def clean(text: str) -> str:
    """Texto del póster sin las líneas de boletas y sin renglones de ruido (una o dos letras sueltas).
    Si la línea de boletas no trae fecha ("TICKET OPEN" y abajo "10.28 (TUE) 8PM"), también se quita la siguiente."""
    lines, skip = [], False
    for ln in text.splitlines():
        ln = " ".join(re.sub(r"(?<=[A-Za-z]{2})\.\s+(?=[A-Za-z])", " ", ln).split())  # "TOKYO. DOME": puntos que mete el OCR
        if len(re.sub(r"\W", "", ln)) < 3:
            continue
        if NOT_SHOW.search(ln):
            skip = not re.search(r"\d", ln)
            continue
        if skip:
            skip = False
            continue
        lines.append(ln)
    return "\n".join(lines)


def prepare(data: bytes) -> bytes:
    """Gris y agrandada si es chica: Tesseract lee mucho mejor letra grande. Sin Pillow, la imagen va tal cual."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return data
    try:
        im = Image.open(io.BytesIO(data))
        im = ImageOps.grayscale(ImageOps.exif_transpose(im))
        if im.width < MIN_WIDTH:
            f = MIN_WIDTH / im.width
            im = im.resize((MIN_WIDTH, round(im.height * f)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "PNG")
        return buf.getvalue()
    except Exception:  # noqa: BLE001
        return data


class Reader:
    def __init__(self) -> None:
        self.bin = shutil.which("tesseract")
        self.langs = ""
        if self.bin:
            try:
                have = subprocess.run([self.bin, "--list-langs"], capture_output=True, text=True, timeout=20).stdout.split()
                self.langs = "+".join(x for x in LANGS if x in have) or "eng"
            except Exception:  # noqa: BLE001
                self.bin = None
        try:
            self.cache: dict = json.loads(CACHE.read_text(encoding="utf-8")).get("images", {}) if CACHE.exists() else {}
        except ValueError:
            self.cache = {}
        self.new = self.failed = 0
        self.dirty = False

    @property
    def ok(self) -> bool:
        return bool(self.bin)

    def ocr(self, data: bytes) -> str:
        with tempfile.NamedTemporaryFile(suffix=".png") as f:
            f.write(prepare(data))
            f.flush()
            # psm 11: texto suelto por todo el póster, no un párrafo
            out = subprocess.run([self.bin, f.name, "stdout", "-l", self.langs, "--psm", "11"],
                                 capture_output=True, text=True, timeout=TIMEOUT)
        if out.returncode != 0:
            raise RuntimeError(out.stderr.strip()[:200])
        return out.stdout

    def read(self, url: str) -> str:
        if url in self.cache:
            return self.cache[url]["text"]
        if not self.ok or self.new >= MAX_NEW:
            return ""
        self.new += 1
        try:
            if Path(url).exists():
                data = Path(url).read_bytes()
            else:
                with urllib.request.urlopen(urllib.request.Request(big(url), headers=UA), timeout=30) as r:
                    data = r.read()
            text = clean(self.ocr(data))
        except Exception as exc:  # noqa: BLE001
            self.failed += 1
            print(f"Póster sin leer ({url}): {exc}", file=sys.stderr)
            return ""
        self.cache[url] = {"text": text, "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        self.dirty = True
        return text

    def save(self) -> None:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
        keep = {u: v for u, v in self.cache.items() if v.get("at", "") >= cutoff}
        if not self.dirty and len(keep) == len(self.cache):
            return
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps({"images": keep}, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    r = Reader()
    if not r.ok:
        sys.exit("Tesseract no está instalado (apt install tesseract-ocr tesseract-ocr-kor tesseract-ocr-jpn)")
    for arg in sys.argv[1:]:
        r.cache.pop(arg, None)
        print(f"--- {arg} ({r.langs})\n{r.read(arg)}")

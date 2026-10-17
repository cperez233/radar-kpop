"""Vigila si un grupo sin lightstick dibujado anuncia el suyo. Escribe lightsticks.json.

Uso: python updater/lightstick_watch.py   (después de sightings/fetch_x.py, que deja los posts oficiales en state/social.json)

A quién vigila: los grupos de alerts/feeds.json que no están en LIGHTSTICKS de assets/app.js (hoy, LNGSHOT). Cuando se
dibuja uno en app.js, deja de vigilarse solo.
Qué cuenta como anuncio (sin inventar):
- un post oficial del grupo (no un RT) que nombra el lightstick oficial ("official light stick", 공식 응원봉...), o
- titulares de Google News de 2 medios distintos con el grupo, "light stick"/응원봉 y una palabra de anuncio
  (unveil, reveal, 공개, 출시, pre-order...). Un solo medio no basta, y "fan-made", rumores o preguntas no cuentan.
Qué hace la web: el recuadro "todavía no tienen" pasa a "¡ya lo anunciaron!" con el enlace al anuncio. El dibujo no se
inventa: el vigilante (state/health.json, fuente "lightstick") avisa que falta dibujarlo en app.js.
Pide a Google News como mucho cada 6 horas.
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from status import report  # noqa: E402

OUT = ROOT / "lightsticks.json"
APP = ROOT / "assets" / "app.js"
FEEDS = ROOT / "alerts" / "feeds.json"
SOCIAL = ROOT / "state" / "social.json"
UA = {"User-Agent": "radar-kpop (+https://radar-kpop.vercel.app)"}
NEWS_GAP = timedelta(hours=6)

STICK = re.compile(r"light\s*-?\s*stick|응원봉|ペンライト", re.I)
OFFICIAL = re.compile(r"official|공식|公式", re.I)
ANNOUNCE = re.compile(r"unveil|reveal|introduc|launch|release|pre-?order|on sale|first look|공개|출시|발매|판매|예약|첫\s*공식|お披露目|発売", re.I)
NOISE = re.compile(r"fan-?made|diy|unofficial|rumou?r|wish|hope|want|when will|should|\?|비공식|팬\s*제작|희망", re.I)


def drawn() -> set[str]:
    """Los grupos que ya tienen su lightstick dibujado en app.js."""
    src = APP.read_text(encoding="utf-8")
    block = src[src.index("var LIGHTSTICKS = {"):src.index("var INK =")]
    return set(re.findall(r"^\s{4}(\w+): \{ name:", block, re.M))


def news(q: str, lang: str) -> list[dict]:
    loc = "hl=ko&gl=KR&ceid=KR:ko" if lang == "ko" else "hl=en-US&gl=US&ceid=US:en"
    url = f"https://news.google.com/rss/search?q={urllib.parse.quote(q)}+when:60d&{loc}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
        root = ET.fromstring(r.read())
    return [{"title": it.findtext("title") or "", "link": it.findtext("link") or "", "pubDate": it.findtext("pubDate") or "",
             "source": it.findtext("source") or ""} for it in root.iter("item")][:40]


def when_of(p: dict) -> str:
    try:
        return parsedate_to_datetime(p["pubDate"]).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError, KeyError):
        return ""


def main() -> int:
    now = datetime.now(timezone.utc)
    feeds = json.loads(FEEDS.read_text(encoding="utf-8"))
    aliases = feeds.get("aliases", {})
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    have = drawn()
    watch = [g for g in aliases if g not in have]
    found = {g: v for g, v in (old.get("groups") or {}).items() if g in watch}  # un anuncio no se des-anuncia
    names = {g: aliases[g].get("names") or [g] for g in watch}
    group_re = {g: re.compile("|".join(re.escape(n) for n in names[g]), re.I) for g in watch}

    # 1) posts oficiales del grupo (sin RT): basta uno que nombre el lightstick oficial
    posts = json.loads(SOCIAL.read_text(encoding="utf-8")).get("items", []) if SOCIAL.exists() else []
    for p in posts:
        g = p.get("group")
        text = p.get("title", "") + " " + p.get("summary", "")
        if g not in watch or g in found or text.startswith("RT ") or "/status/" not in p.get("link", ""):
            continue
        if STICK.search(text) and OFFICIAL.search(text) and not NOISE.search(text):
            found[g] = {"official": True, "title": " ".join(p["title"].split())[:200], "url": p["link"], "when": when_of(p) or now.strftime("%Y-%m-%dT%H:%M:%SZ")}

    # 2) Google News, como mucho cada NEWS_GAP: hacen falta 2 medios distintos
    last = old.get("news_at")
    ran = ok = 0
    if watch and ("--force" in sys.argv or not last or now - datetime.fromisoformat(last.replace("Z", "+00:00")) >= NEWS_GAP):
        ran = 1
        for g in watch:
            if g in found:
                continue
            name = names[g][0]
            ko = next((n for n in names[g] if re.search(r"[가-힣]", n)), name)
            hits = {}
            for q, lang in ((f'"{name}" ("light stick" OR lightstick)', "en"), (f"{ko} 응원봉", "ko")):
                try:
                    for p in news(q, lang):
                        t = p["title"]
                        head = re.sub(r"\s+-\s+[^-]+$", "", t)  # sin el " - Medio" del final
                        if group_re[g].search(head) and STICK.search(head) and ANNOUNCE.search(head) and not NOISE.search(head):
                            src = (p["source"] or t.rsplit(" - ", 1)[-1]).strip().lower()
                            hits.setdefault(src, p)
                    ok += 1
                except Exception as exc:  # noqa: BLE001
                    print(f"Google News ({g}): {exc}", file=sys.stderr)
                time.sleep(1.0)
            if len(hits) >= 2:
                p = sorted(hits.values(), key=when_of)[0]  # el primero que lo contó
                found[g] = {"official": False, "title": " ".join(p["title"].split())[:200], "url": p["link"], "when": when_of(p), "sources": len(hits)}
        report("lightstickwatch", ok > 0, "" if ok else "Google News no respondió")

    # el dueño se entera de que hay que dibujarlo (no se inventa la forma)
    report("lightstick", not found, "; ".join(f"{(names.get(g) or [g])[0]} anunció su lightstick: falta dibujarlo en assets/app.js ({v['url']})" for g, v in found.items()))
    doc = {"updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "news_at": now.strftime("%Y-%m-%dT%H:%M:%SZ") if ran else old.get("news_at"),
           "watch": watch, "groups": found}
    if {k: doc[k] for k in ("news_at", "watch", "groups")} != {k: old.get(k) for k in ("news_at", "watch", "groups")}:
        OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"lightsticks.json: vigila {', '.join(watch) or 'nadie'}; anunciados: {', '.join(found) or 'ninguno'}" + ("" if ran else " (noticias: aún no toca)"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

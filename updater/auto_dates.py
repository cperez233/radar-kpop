"""Fechas de gira automáticas desde anuncios oficiales y prensa (sobre todo Asia, que Ticketmaster no cubre).

Uso: python updater/auto_dates.py   (después de sightings/fetch_x.py, que deja los posts oficiales en state/social.json)

Lee:
- los posts de las cuentas oficiales en X (state/social.json, vía RSSHub) y sus avisos [NOTICE] / de Weverse;
- titulares de Google Noticias sobre conciertos de cada grupo.
Si un texto anuncia una gira o concierto (no un comeback), trae una fecha futura y una ciudad o recinto conocido
(sightings/cities.json, updater/venues.json), agrega la fecha a events.json con:
  status "anunciado" (la web la marca "por confirmar"), source "auto", src (enlace al anuncio) y time_tbd (hora sin confirmar).
Nunca duplica un show que ya está (mismo día y misma ciudad) y nunca borra nada. Si una fecha automática sale mal, se
agrega su id a "ignore_auto" en updater/overrides.json y no vuelve a entrar.
Muchos anuncios son solo una imagen (el póster): si el post es de gira y trae fotos, Tesseract las lee (updater/posters.py)
y su texto se suma al del post. Esas fechas quedan con "poster": true. Sin Tesseract, se lee solo el texto del post.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "alerts"))
sys.path.insert(0, str(ROOT / "tools"))
import news  # noqa: E402
import posters  # noqa: E402
from status import report  # noqa: E402

EVENTS = ROOT / "events.json"
SOCIAL = ROOT / "state" / "social.json"
OVERRIDES = ROOT / "updater" / "overrides.json"
CITIES = ROOT / "sightings" / "cities.json"
VENUES = ROOT / "updater" / "venues.json"
UA = {"User-Agent": "radar-kpop (+https://radar-kpop.vercel.app)"}
MAX_AHEAD = timedelta(days=550)
MONTHS = {m: i + 1 for i, ms in enumerate([
    ("jan", "january", "ene", "enero"), ("feb", "february", "febrero"), ("mar", "march", "marzo"), ("apr", "april", "abr", "abril"),
    ("may", "mayo"), ("jun", "june", "junio"), ("jul", "july", "julio"), ("aug", "august", "ago", "agosto"),
    ("sep", "sept", "september", "septiembre"), ("oct", "october", "octubre"), ("nov", "november", "noviembre"),
    ("dec", "december", "dic", "diciembre")]) for m in ms}
MON_RE = "|".join(sorted(MONTHS, key=len, reverse=True))
DAY = r"(\d{1,2})(?!\d)(?:\s*\([A-Za-z월화수목금토일]{1,3}\))?"
RANGE = rf"(?:\s*(?:[-~–&,]|and|y)\s*{DAY})*"
DATE_PATTERNS = [
    re.compile(rf"\b(20\d\d)\s*[./-]\s*(\d{{1,2}})\s*[./-]\s*{DAY}{RANGE}"),             # 2026.11.21-22
    re.compile(rf"(?<![\d.])(\d{{1,2}})\s*[./]\s*{DAY}{RANGE}(?![\d.]*\s*(?:pm|am|kst|시|:))", re.I),  # 11.21~22 (no horas)
    re.compile(rf"(\d{{1,2}})\s*월\s*(\d{{1,2}})\s*일(?:\s*[-~]\s*(\d{{1,2}})\s*일)?"),    # 11월 21일~22일
    re.compile(rf"\b({MON_RE})\.?\s+{DAY}(?:st|nd|rd|th)?{RANGE}(?:,?\s*(20\d\d))?", re.I),  # Nov 21-22, 2026
    re.compile(rf"\b{DAY}(?:st|nd|rd|th)?{RANGE}\s+(?:de\s+)?({MON_RE})\b\.?(?:\s+(?:de\s+)?(20\d\d))?", re.I),  # 21-22 Nov
]


def norm(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).lower()


def future_date(y: int | None, m: int, d: int, today: date) -> date | None:
    try:
        if y:
            out = date(y, m, d)
        else:
            out = date(today.year, m, d)
            if out < today:
                out = date(today.year + 1, m, d)
    except ValueError:
        return None
    return out if today <= out <= today + MAX_AHEAD else None


def find_dates(text: str, today: date) -> list[tuple[int, date]]:
    """[(posición, fecha)] de todas las fechas futuras del texto, con rangos expandidos (21-22 = dos fechas)."""
    found: dict[tuple[int, date], None] = {}
    taken: list[range] = []
    for i, rx in enumerate(DATE_PATTERNS):
        for m in rx.finditer(text):
            if any(m.start() in r for r in taken):
                continue
            g = [x for x in m.groups()]
            nums = [int(x) for x in re.findall(r"(?<![\d])(\d{1,2})(?![\d])", m.group(0)[len(g[0]) if i == 0 else 0:])]
            y, mon, days = None, None, []
            if i == 0:
                y, mon, days = int(g[0]), int(g[1]), nums[1:]
            elif i == 1:
                mon, days = int(g[0]), nums[1:]
            elif i == 2:
                mon, days = int(g[0]), [int(g[1])] + ([int(g[2])] if g[2] else [])
            elif i == 3:
                mon = MONTHS[g[0].lower()]
                y = int(g[-1]) if g[-1] else None
                days = [int(x) for x in re.findall(r"(?<![\d])(\d{1,2})(?![\d])", m.group(0))]
            else:
                mname = next(x for x in g if x and x.lower() in MONTHS)
                mon = MONTHS[mname.lower()]
                y = int(g[-1]) if g[-1] and len(g[-1]) == 4 else None
                days = [int(x) for x in re.findall(r"(?<![\d])(\d{1,2})(?![\d])", m.group(0))]
            if not mon or not 1 <= mon <= 12:
                continue
            taken.append(range(m.start(), m.end()))
            for d in days[:4]:
                fd = future_date(y, mon, d, today)
                if fd:
                    found[(m.start(), fd)] = None
    return sorted(found)


def places() -> list[tuple[str, dict]]:
    """(texto normalizado, lugar) ordenado de más largo a más corto: recintos primero, luego ciudades."""
    cities = {c["city"]: c for c in json.loads(CITIES.read_text(encoding="utf-8"))["cities"]}
    out = []
    for v in json.loads(VENUES.read_text(encoding="utf-8"))["venues"]:
        c = cities.get(v["city"])
        if c:
            for n in v["match"]:
                out.append((norm(n), {**c, "venue": v["name"], "lat": v["lat"], "lon": v["lon"]}))
    for c in cities.values():
        for n in c["names"] + ([] if c.get("strict") else [c["city"]]):
            if len(n) >= 3:
                out.append((norm(n), {**c, "venue": None}))
    return sorted(out, key=lambda x: -len(x[0]))


def find_places(text: str, gaz: list) -> list[tuple[int, dict]]:
    t, hits, used = norm(text), [], []
    for name, p in gaz:
        for m in re.finditer(r"(?<![\w])" + re.escape(name) + r"(?![\w])", t):
            if any(m.start() in r for r in used):
                continue
            used.append(range(m.start(), m.end()))
            hits.append((m.start(), p))
    return sorted(hits, key=lambda x: x[0])


def extract(text: str, today: date, gaz: list) -> list[tuple[date, dict]]:
    """Empareja cada fecha con el lugar más cercano antes de ella (o justo después, o el único del texto)."""
    dates, where = find_dates(text, today), find_places(text, gaz)
    if not dates or not where:
        return []
    out = []
    for pos, d in dates:
        before = [p for p in where if p[0] <= pos and pos - p[0] <= 160]
        after = [p for p in where if p[0] > pos and p[0] - pos <= 60]
        p = before[-1][1] if before else after[0][1] if after else (where[0][1] if len({w[1]["city"] for w in where}) == 1 else None)
        if p and not p.get("venue"):  # "SEOUL 12.19-20 KSPO DOME": el recinto viene después de la fecha
            v = next((w[1] for w in where if w[0] > pos and w[0] - pos <= 80 and w[1].get("venue") and w[1]["city"] == p["city"]), None)
            p = v or p
        if p:
            out.append((d, p))
    return out


def google_news(name: str) -> list[dict]:
    q = urllib.parse.quote(f'"{name}" (concert OR tour OR 콘서트 OR fan meeting) (Seoul OR Tokyo OR Asia OR dome OR stadium)')
    url = f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
        root = ET.fromstring(r.read())
    out = []
    for it in root.iter("item"):
        out.append({"title": it.findtext("title") or "", "link": it.findtext("link") or "", "pubDate": it.findtext("pubDate") or "", "summary": ""})
    return out[:25]


def main() -> int:
    data = json.loads(EVENTS.read_text(encoding="utf-8"))
    ov = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    ignore = set(ov.get("ignore_auto", []))
    gaz = places()
    now = datetime.now(timezone.utc)
    today = now.date()
    social = json.loads(SOCIAL.read_text(encoding="utf-8")).get("items", []) if SOCIAL.exists() else []
    texts: dict[str, list[tuple[str, str, str]]] = {}  # grupo -> [(texto, enlace, fuente)]
    reader, read = posters.Reader(), 0
    for p in social:
        if p["title"].startswith("RT "):
            continue
        text = p["title"] + "\n" + p.get("summary", "")
        texts.setdefault(p["group"], []).append((text, p["link"], "official"))
        if p.get("images") and news.official_kind(p["title"]) in ("tour", "latam"):
            ocr = "\n".join(t for t in (reader.read(u) for u in p["images"]) if t)
            if ocr:  # el póster va como un texto aparte, con el título del post adelante para que se clasifique igual
                read += 1
                texts[p["group"]].append((p["title"] + "\n" + ocr, p["link"], "poster"))
    reader.save()
    if reader.ok:
        print(f"Pósters: {read} leídos ({reader.new} nuevos con Tesseract, {reader.failed} fallaron)")
    else:
        print("Pósters: Tesseract no está instalado, se leen solo los textos de los posts")
    news_ok = 0
    for g in data["groups"]:
        try:
            for it in google_news(g["name"]):
                try:
                    if now - parsedate_to_datetime(it["pubDate"]) > timedelta(days=21):
                        continue
                except (TypeError, ValueError):
                    continue
                texts.setdefault(g["id"], []).append((re.sub(r"\s[-–]\s[^-–]{2,40}$", "", it["title"]), it["link"], "news"))
            news_ok += 1
        except Exception as exc:  # noqa: BLE001
            print(f"{g['id']}: Google Noticias falló ({exc})", file=sys.stderr)

    added = []
    for g in data["groups"]:
        for text, link, src in texts.get(g["id"], []):
            first = text.split("\n")[0]
            kind = news.classify(first) if src == "news" else news.official_kind(first)
            if kind not in ("tour", "latam"):
                continue  # solo anuncios de shows; un comeback trae fechas de lanzamiento, no de concierto
            for d, p in extract(text, today, gaz):
                e = {"local_date": d.isoformat(), "lat": round(p["lat"], 4), "lon": round(p["lon"], 4)}
                if any(x["local_date"] == e["local_date"] and abs(x["lat"] - e["lat"]) < 0.3 and abs(x["lon"] - e["lon"]) < 0.3 for x in g["events"]):
                    continue
                key = re.sub(r"[^a-z0-9]+", "", norm(p["city"]))[:14]
                eid = f"{g['id']}-auto-{d:%Y%m%d}-{key}"
                if eid in ignore or any(x["id"] == eid for x in g["events"]):
                    continue
                tz = ZoneInfo(p.get("tz") or "UTC")
                e.update({
                    "id": eid, "start": datetime(d.year, d.month, d.day, 18, 0, tzinfo=tz).isoformat(),
                    "city": p["city"], "country": p["country"], "venue": p.get("venue"),
                    "status": "anunciado", "source": "auto", "src": link, "src_kind": "news" if src == "news" else "official", "time_tbd": True,
                })
                if src == "poster":
                    e["poster"] = True
                g["events"].append(e)
                added.append(f"{g['id']} {d} {p['city']} ({src})")
        g["events"].sort(key=lambda x: x["start"])

    report("autodates", bool(social) or news_ok > 0, "" if (social or news_ok) else "sin posts oficiales ni noticias para leer")
    if added:
        data["updated_at"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        EVENTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Fechas nuevas por anuncio:\n  " + "\n  ".join(added))
    else:
        print(f"Sin fechas nuevas en anuncios ({sum(len(v) for v in texts.values())} textos revisados)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

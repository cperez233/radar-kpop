"""Próximos estrenos anunciados en posts oficiales (antes de que Apple Music los liste). Escribe releases.json.

Uso: python updater/releases.py   (después de sightings/fetch_x.py y updater/social_feeds.py)
Lee los posts oficiales de X (state/social.json) y de TikTok (socialfeed.json) y busca anuncios con fecha de estreno:
  "EP [S.W.I.S.H.] 11/10 6PM KST"   "GOLDEN HOUR : Part.6 Concept Photo 1 2026. 11. 13 2PM RELEASE"
Con varios posts del mismo estreno gana el título que más se repite. Solo guarda fechas entre hoy y 150 días; el día después
del estreno se borra solo (para entonces Apple Music ya lo tiene y la web lo muestra desde media.json).
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "releases.json"
SOCIAL = ROOT / "state" / "social.json"
FEED = ROOT / "socialfeed.json"
AHEAD = 150

SIGNAL = re.compile(r"\bRELEASE\b|발매|pre-?order|pre-?save|\b(?:mini |1st |2nd |new )?(?:EP|album|single)\b|앨범|싱글", re.I)
# votaciones, conciertos, emisiones: tienen fecha pero no son estrenos
NOT_RELEASE = re.compile(r"투표|vote|voting|콘서트|concert|tour|투어|팬미팅|fan ?meeting|ticket|티켓|공연|방송|broadcast|showcase|쇼케이스|fansign|팬사인|live\b|라이브", re.I)
FULL = re.compile(r"(20\d\d)\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{1,2})")
SHORT = re.compile(r"(?<![\d/.])(\d{1,2})/(\d{1,2})(?![\d/])(?=\s*(?:\d{1,2}\s*(?:AM|PM)|\(|KST|new|release|발매|$))", re.I)
BRACKET = re.compile(r"(?:EP|album|single|앨범|싱글|mini|정규)\s*[\[<『「‘'\"]([^\]>』」’'\"]{2,50})[\]>』」’'\"]", re.I)
CUT = re.compile(r"\s+(?:Concept|Teaser|Photo|Trailer|Film|Poster|Schedule|Track\s?list|Highlight|Preview|Spoiler|Mood|Album Preview|Official|MV)\b.*$|\s*#.*$", re.I)


def when(y: int | None, m: int, d: int, today: date) -> date | None:
    try:
        dd = date(y or today.year, m, d)
    except ValueError:
        return None
    if y is None and dd < today - timedelta(days=1):
        dd = date(today.year + 1, m, d)
    return dd if today <= dd <= today + timedelta(days=AHEAD) else None


def title_of(text: str, start: int) -> str:
    b = BRACKET.search(text)
    if b:
        return b.group(1).strip()
    t = text[:start]
    t = re.sub(r"^\s*(?:\[[^\]]*\]\s*)+", "", t)               # [📷] [NOTICE]
    t = re.sub(r"^[^\s(]+\([^)]*\)\s*[-–:]?\s*", "", t)          # ATEEZ(에이티즈) -
    t = CUT.sub("", t).strip(" -–:|·")
    return t if 2 <= len(t) <= 60 and not re.search(r"https?://", t) else ""


def find(text: str, today: date) -> tuple[date, str] | None:
    if not SIGNAL.search(text) or NOT_RELEASE.search(text):
        return None
    m = FULL.search(text)
    d = when(int(m.group(1)), int(m.group(2)), int(m.group(3)), today) if m else None
    if not d:
        m = SHORT.search(text)
        d = when(None, int(m.group(1)), int(m.group(2)), today) if m else None
    if not d:
        return None
    return d, title_of(text, m.start())


def main() -> int:
    today = datetime.now(timezone.utc).date()
    posts = []
    if SOCIAL.exists():
        posts += [(p["group"], p["title"], p.get("link", "")) for p in json.loads(SOCIAL.read_text(encoding="utf-8")).get("items", []) if not p["title"].startswith("RT ")]
    if FEED.exists():
        for gid, g in json.loads(FEED.read_text(encoding="utf-8")).get("groups", {}).items():
            posts += [(gid, x["title"], x.get("url", "")) for k in ("tiktok", "x") for x in g.get(k, [])]
    found: dict[tuple[str, str], dict] = {}
    for gid, text, url in posts:
        hit = find(text, today)
        if not hit:
            continue
        d, title = hit
        rec = found.setdefault((gid, d.isoformat()), {"titles": Counter(), "url": ""})
        if title:
            rec["titles"][title] += 1
        if not rec["url"] and re.match(r"^https://(x\.com|twitter\.com|www\.tiktok\.com)/", url):
            rec["url"] = url
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"items": []}
    items = {(x["group"], x["date"]): x for x in old.get("items", []) if x["date"] >= today.isoformat()}
    for (gid, d), rec in found.items():
        title = rec["titles"].most_common(1)[0][0] if rec["titles"] else (items.get((gid, d)) or {}).get("title", "")
        if title and rec["url"]:
            items[(gid, d)] = {"group": gid, "title": title, "date": d, "url": rec["url"], "posts": sum(rec["titles"].values())}
    doc = {"updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "items": sorted(items.values(), key=lambda x: x["date"])}
    if doc["items"] != old.get("items"):
        OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("releases.json: " + (", ".join(f"{x['group']} {x['title']} ({x['date']})" for x in doc["items"]) or "sin estrenos anunciados"))
    return 0


if __name__ == "__main__":
    sys.exit(main())

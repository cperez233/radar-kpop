"""Lee noticias (RSS), posts de las cuentas oficiales (RSSHub) y los videos de media.json, y los convierte en candidatos a alerta."""
from __future__ import annotations

import hashlib
import json
import os
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

UA = {"User-Agent": "radar-kpop/1.0"}
ATOM = "{http://www.w3.org/2005/Atom}"
MAX_AGE = timedelta(days=3)

TOUR = re.compile(r"tour|concert|fan ?meeting|fan ?con\b|showcase|festival|gira|concierto|fanmeeting|투어|콘서트|팬미팅|팬콘|ツアー|ライブ", re.I)
COMEBACK = re.compile(r"comeback|new album|new single|teaser|release date|mini album|full album|pre-release|regreso|nuevo [aá]lbum|lanzamiento|컴백|발매|カムバック", re.I)
LATAM = re.compile(
    r"colombia|bogot[aá]|medell[ií]n|south america|latin america|latam|am[eé]rica latina|sudam[eé]rica|"
    r"m[eé]xico|brazil|brasil|chile|peru|per[uú]|argentina",
    re.I,
)


ARRIVAL = re.compile(
    r"\b(arrive[sd]?|arriving|landed|lands in|touch(?:ed)? down)\b|\b(lleg[oó]|llegaron|llega a|llegando|llegada|aterriz[oó]|aterrizaron|ya est[aá]n? en)\b",
    re.I,
)


# posts de cuentas oficiales: reglas más estrictas que para la prensa (suben teasers de realities, streams, VR...)
OFFICIAL_SKIP = re.compile(r"^RT |beyond live|online|온라인|stream|스트리밍|\bVR\b|reality|리얼리티|behind|vlog|\bep\.\s*\d|episode|대형 스크린|screening|movie|영화", re.I)
OFFICIAL_COMEBACK = re.compile(r"comeback|컴백|mini album|full album|정규|미니|(?-i:\bEP\b)|single|싱글|tracklist|트랙리스트|발매|release|vinyl|pre-?order|pre-?save|カムバック", re.I)
OFFICIAL_TOUR = re.compile(r"world tour|tour\b|투어|concert|콘서트|fan ?meeting|팬미팅|팬콘|fan ?con\b|ツアー|ticket open|티켓 오픈|예매", re.I)


def official_kind(title: str) -> str | None:
    """Tipo de anuncio en un post oficial, o None si no es anuncio de gira ni de comeback."""
    if OFFICIAL_SKIP.search(title):
        return None
    if OFFICIAL_COMEBACK.search(title):
        return "comeback"
    if OFFICIAL_TOUR.search(title):
        return "latam" if LATAM.search(title) else "tour"
    return None


def classify(title: str) -> str | None:
    if ARRIVAL.search(title):
        return "arrival"
    if LATAM.search(title) and TOUR.search(title):
        return "latam"
    if COMEBACK.search(title):
        return "comeback"
    if TOUR.search(title):
        return "tour"
    return None


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def fetch(url: str) -> list[dict]:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        root = ET.fromstring(r.read())
    items = []
    for it in root.iter("item"):  # RSS
        items.append({
            "title": (it.findtext("title") or "").strip(),
            "link": (it.findtext("link") or "").strip(),
            "summary": (it.findtext("description") or "")[:400],
            "ts": _parse_dt(it.findtext("pubDate")),
        })
    for en in root.iter(f"{ATOM}entry"):  # Atom (YouTube)
        link = en.find(f"{ATOM}link")
        items.append({
            "title": (en.findtext(f"{ATOM}title") or "").strip(),
            "link": link.get("href") if link is not None else "",
            "summary": "",
            "ts": _parse_dt(en.findtext(f"{ATOM}published")),
        })
    return items


def _match_group(item: dict, aliases: dict) -> str | None:
    text = item["title"] + " " + item["summary"]
    for gid, cfg in aliases.items():
        hit = any(re.search(r"\b" + re.escape(a) + r"\b", item["title"]) for a in cfg["names"])
        if hit and (not cfg.get("context") or re.search(cfg["context"], text)):
            return gid
    return None


def _item_id(item: dict) -> str:
    return hashlib.sha1((item["link"] or item["title"]).encode("utf-8")).hexdigest()[:16]


def collect(feeds: dict, now: datetime) -> list[dict]:
    """Devuelve [{id, group, kind, title, link, source, ts (cuándo se publicó, o None)}] de los ultimos 3 dias. Un feed caido no tumba al resto."""
    out: list[dict] = []

    def keep(item: dict) -> bool:
        return bool(item["title"]) and (item["ts"] is None or now - item["ts"] <= MAX_AGE)

    for feed in feeds.get("news", []):
        try:
            for it in fetch(feed["url"]):
                gid = _match_group(it, feeds["aliases"]) if keep(it) else None
                kind = classify(it["title"]) if gid else None
                if gid and kind:
                    out.append({"id": _item_id(it), "group": gid, "kind": kind, "title": it["title"], "link": it["link"], "source": feed["name"], "ts": it["ts"]})
        except Exception as exc:  # noqa: BLE001
            print(f"Feed caido ({feed['name']}): {exc}")

    for gid, queries in feeds.get("google_news", {}).items():
        for query in ([queries] if isinstance(queries, str) else queries):
            url = "https://news.google.com/rss/search?q=" + urllib.parse.quote(query) + "&hl=es-419&gl=CO&ceid=CO:es-419"
            try:
                for it in fetch(url):
                    kind = classify(it["title"]) if keep(it) else None
                    if kind:
                        out.append({"id": _item_id(it), "group": gid, "kind": kind, "title": it["title"], "link": it["link"], "source": "Google Noticias", "ts": it["ts"]})
            except Exception as exc:  # noqa: BLE001
                print(f"Google Noticias fallo para {gid}: {exc}")

    # Cuentas oficiales en X vía tu RSSHub. sightings/fetch_x.py (corre antes) deja los posts en state/social.json;
    # si ese archivo tiene menos de 1 hora se reusa, si no se piden aquí. Sin RSSHUB_URL se salta.
    rsshub = os.environ.get("RSSHUB_URL", "").rstrip("/")
    cache = Path(__file__).resolve().parent.parent / "state" / "social.json"
    posts: list[tuple[dict, dict]] = []
    try:
        c = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else {}
        fresh_cache = c.get("updated_at") and now - _parse_dt(c["updated_at"]) < timedelta(hours=1)
    except ValueError:
        c, fresh_cache = {}, False
    names = {a["group"]: a["name"] for a in feeds.get("social", [])}
    if fresh_cache:
        for p in c.get("items", []):
            posts.append(({"group": p["group"], "name": names.get(p["group"], p["account"])},
                          {"title": p["title"], "link": p["link"], "summary": p.get("summary", ""), "ts": _parse_dt(p.get("pubDate"))}))
    else:
        for acct in feeds.get("social", []) if rsshub else []:
            try:
                for it in fetch(acct["url"].replace("{RSSHUB}", rsshub)):
                    posts.append((acct, it))
            except Exception as exc:  # noqa: BLE001
                print(f"Cuenta oficial caida ({acct['name']}): {exc}")
    for acct, it in posts:
        if keep(it):
            out.append({"id": _item_id(it), "group": acct["group"], "kind": "social", "title": it["title"], "link": it["link"],
                        "source": acct["name"], "text": it["title"] + " " + it["summary"], "ts": it["ts"]})

    # Videos: los trae updater/media.py (corre antes en el workflow) y quedan en media.json; aquí no se vuelve a pedir a YouTube
    media = Path(__file__).resolve().parent.parent / "media.json"
    try:
        vids = [m for m in json.loads(media.read_text(encoding="utf-8")).get("items", []) if m.get("type") == "video"] if media.exists() else []
    except ValueError:
        vids = []
    for m in vids:
        it = {"title": m.get("title", ""), "link": m.get("url", ""), "summary": "", "ts": _parse_dt(m.get("published") or None)}
        if it["ts"] and keep(it):
            out.append({"id": _item_id(it), "group": m["group"], "kind": "video", "title": it["title"], "link": it["link"], "source": "YouTube", "ts": it["ts"]})

    seen, uniq = set(), []
    for o in out:
        if o["id"] not in seen:
            seen.add(o["id"])
            uniq.append(o)
    return uniq

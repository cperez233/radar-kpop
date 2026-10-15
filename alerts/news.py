"""Lee noticias (RSS) y videos de YouTube (feed Atom) y los convierte en candidatos a alerta."""
from __future__ import annotations

import hashlib
import os
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

UA = {"User-Agent": "radar-kpop/1.0"}
ATOM = "{http://www.w3.org/2005/Atom}"
MAX_AGE = timedelta(days=3)

TOUR = re.compile(r"tour|concert|fan ?meeting|fan ?con\b|showcase|festival|gira|concierto|fanmeeting", re.I)
COMEBACK = re.compile(r"comeback|new album|new single|teaser|release date|mini album|full album|pre-release|regreso|nuevo [aá]lbum|lanzamiento", re.I)
LATAM = re.compile(
    r"colombia|bogot[aá]|medell[ií]n|south america|latin america|latam|am[eé]rica latina|sudam[eé]rica|"
    r"m[eé]xico|brazil|brasil|chile|peru|per[uú]|argentina",
    re.I,
)


ARRIVAL = re.compile(
    r"\b(arrive[sd]?|arriving|landed|lands in|touch(?:ed)? down)\b|\b(lleg[oó]|llegaron|llega a|llegando|llegada|aterriz[oó]|aterrizaron|ya est[aá]n? en)\b",
    re.I,
)


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
    """Devuelve [{id, group, kind, title, link, source}] de los ultimos 3 dias. Un feed caido no tumba al resto."""
    out: list[dict] = []

    def keep(item: dict) -> bool:
        return bool(item["title"]) and (item["ts"] is None or now - item["ts"] <= MAX_AGE)

    for feed in feeds.get("news", []):
        try:
            for it in fetch(feed["url"]):
                gid = _match_group(it, feeds["aliases"]) if keep(it) else None
                kind = classify(it["title"]) if gid else None
                if gid and kind:
                    out.append({"id": _item_id(it), "group": gid, "kind": kind, "title": it["title"], "link": it["link"], "source": feed["name"]})
        except Exception as exc:  # noqa: BLE001
            print(f"Feed caido ({feed['name']}): {exc}")

    for gid, queries in feeds.get("google_news", {}).items():
        for query in ([queries] if isinstance(queries, str) else queries):
            url = "https://news.google.com/rss/search?q=" + urllib.parse.quote(query) + "&hl=es-419&gl=CO&ceid=CO:es-419"
            try:
                for it in fetch(url):
                    kind = classify(it["title"]) if keep(it) else None
                    if kind:
                        out.append({"id": _item_id(it), "group": gid, "kind": kind, "title": it["title"], "link": it["link"], "source": "Google Noticias"})
            except Exception as exc:  # noqa: BLE001
                print(f"Google Noticias fallo para {gid}: {exc}")

    # Cuentas oficiales (X, Weverse, Instagram) via un RSSHub tuyo. Sin RSSHUB_URL se salta.
    rsshub = os.environ.get("RSSHUB_URL", "").rstrip("/")
    for acct in feeds.get("social", []) if rsshub else []:
        try:
            for it in fetch(acct["url"].replace("{RSSHUB}", rsshub)):
                if keep(it):
                    out.append({"id": _item_id(it), "group": acct["group"], "kind": "social", "title": it["title"], "link": it["link"],
                                "source": acct["name"], "text": it["title"] + " " + it["summary"]})
        except Exception as exc:  # noqa: BLE001
            print(f"Cuenta oficial caida ({acct['name']}): {exc}")

    for gid, channel in feeds.get("youtube", {}).items():
        if not channel.startswith("UC"):
            continue
        try:
            for it in fetch("https://www.youtube.com/feeds/videos.xml?channel_id=" + channel):
                if keep(it):
                    out.append({"id": _item_id(it), "group": gid, "kind": "video", "title": it["title"], "link": it["link"], "source": "YouTube"})
        except Exception as exc:  # noqa: BLE001
            print(f"YouTube fallo para {gid}: {exc}")

    seen, uniq = set(), []
    for o in out:
        if o["id"] not in seen:
            seen.add(o["id"])
            uniq.append(o)
    return uniq

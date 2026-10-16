"""Últimos videos de un canal de YouTube. Lo usan updater/media.py (sección de videos) y, a través de media.json, las alertas.

Con YT_API_KEY usa la YouTube Data API v3 (lista de subidas del canal: 1 unidad de cuota por canal, de 10.000 gratis al día).
Sin key intenta el feed RSS público, que YouTube dejó de servir en 2026 (responde 404), así que en la práctica hace falta la key.
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

UA = {"User-Agent": "radar-kpop (+https://radar-kpop.vercel.app)"}
API = "https://www.googleapis.com/youtube/v3/playlistItems"


def _get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
        return r.read()


def latest(channel: str, n: int = 3, key: str | None = None) -> list[dict]:
    """[{id, title, published (ISO), image}] del más nuevo al más viejo."""
    key = key if key is not None else os.environ.get("YT_API_KEY", "").strip()
    if key:
        qs = urllib.parse.urlencode({"part": "snippet", "playlistId": "UU" + channel[2:], "maxResults": n, "key": key})
        body = json.loads(_get(f"{API}?{qs}"))
        out = []
        for it in body.get("items", []):
            sn = it.get("snippet", {})
            vid = sn.get("resourceId", {}).get("videoId")
            if not vid or sn.get("title") in ("Private video", "Deleted video"):
                continue
            out.append({"id": vid, "title": sn.get("title", ""), "published": sn.get("publishedAt", ""),
                        "image": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"})
        return out
    ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
    root = ET.fromstring(_get(f"https://www.youtube.com/feeds/videos.xml?channel_id={channel}"))
    out = []
    for e in root.findall("a:entry", ns)[:n]:
        vid = e.findtext("yt:videoId", default="", namespaces=ns)
        out.append({"id": vid, "title": e.findtext("a:title", default="", namespaces=ns),
                    "published": e.findtext("a:published", default="", namespaces=ns) or "",
                    "image": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"})
    return out

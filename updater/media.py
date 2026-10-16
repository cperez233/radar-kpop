"""Releases and videos: writes media.json with each group's latest music and official YouTube videos.

Usage: python updater/media.py
Free sources:
- Apple Music catalog through the iTunes Search API (lookup by artist id, newest albums and singles).
- The latest uploads of each official YouTube channel (alerts/feeds.json, "youtube"): YouTube Data API with YT_API_KEY
  (free); without it, the public RSS feed, which YouTube stopped serving in 2026.
Artist ids live in alerts/feeds.json, "itunes". If a source fails, the previous items for that group are kept.
"""
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "alerts"))
import youtube  # noqa: E402
OUT = ROOT / "media.json"
UA = {"User-Agent": "radar-kpop (+https://radar-kpop.vercel.app)"}
PER_GROUP = 3


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
        return r.read()


def base_title(t: str) -> str:
    """'NORMAL (MV Still Alternate Cover RM Version) - Single' and its variants count as one release."""
    t = re.sub(r"\s*[\(\[].*?[\)\]]", "", t)
    t = re.sub(r"\s+-\s+(Single|EP)$", "", t, flags=re.I)
    return t.strip().lower()


def music(gid: str, artist_id: int) -> list[dict]:
    body = json.loads(get(f"https://itunes.apple.com/lookup?id={artist_id}&entity=album&sort=recent&limit=25&country=us"))
    seen, out = set(), []
    for r in body.get("results", [])[1:]:
        if r.get("wrapperType") != "collection" or r.get("artistId") != artist_id:
            continue
        key = base_title(r.get("collectionName", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        title = re.sub(r"\s+-\s+(Single|EP)$", "", re.sub(r"\s*\((?:[^)]*(?:Version|Cover|ver\.)[^)]*)\)", "", r["collectionName"])).strip()
        out.append({
            "type": "music", "group": gid, "title": title, "kind": r.get("collectionType", "Album"),
            "date": r.get("releaseDate", "")[:10], "url": r.get("collectionViewUrl", "").split("?")[0],
            "image": r.get("artworkUrl100", "").replace("100x100bb", "300x300bb"),
        })
    out.sort(key=lambda x: x["date"], reverse=True)
    return out[:PER_GROUP]


def videos(gid: str, channel: str) -> list[dict]:
    return [{
        "type": "video", "group": gid, "title": v["title"], "date": v["published"][:10], "published": v["published"],
        "url": f"https://www.youtube.com/watch?v={v['id']}", "image": v["image"],
    } for v in youtube.latest(channel, PER_GROUP)]


def main() -> int:
    feeds = json.loads((ROOT / "alerts" / "feeds.json").read_text(encoding="utf-8"))
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"items": []}
    keep = {}
    for it in old.get("items", []):
        keep.setdefault((it["group"], it["type"]), []).append(it)
    items, ok, failed = [], 0, []
    for gid, aid in feeds.get("itunes", {}).items():
        try:
            items += music(gid, int(aid)); ok += 1
        except Exception as exc:  # noqa: BLE001
            failed.append(f"itunes {gid}: {exc}"); items += keep.get((gid, "music"), [])
        time.sleep(1.2)  # la API de iTunes pide calma (unas 20 consultas por minuto)
    for gid, ch in feeds.get("youtube", {}).items():
        if not ch:
            continue
        try:
            items += videos(gid, ch); ok += 1
        except Exception as exc:  # noqa: BLE001
            failed.append(f"youtube {gid}: {exc}"); items += keep.get((gid, "video"), [])
    items.sort(key=lambda x: x["date"], reverse=True)
    doc = {"updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "sample": False, "items": items}
    if [x["url"] for x in items] == [x["url"] for x in old.get("items", [])]:
        print(f"Sin cambios ({ok} fuentes bien)")
    else:
        OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"media.json: {len(items)} items, {ok} fuentes bien")
    for f in failed:
        print(f, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Numbers for each group's card: writes stats.json.

Usage: python updater/stats.py            (YT_API_KEY=xxxx for the YouTube numbers)
- releases: albums, EPs and singles on Apple Music (iTunes Search API, no key). Versions of the same release count once.
- yt_subs, yt_views, yt_videos: official YouTube channel statistics (YouTube Data API v3, free key, optional).
Ids live in alerts/feeds.json ("itunes", "youtube"). If a source fails, the previous numbers for that group are kept.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from media import UA, base_title  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "stats.json"
FEEDS = ROOT / "alerts" / "feeds.json"


def get_json(url: str) -> dict:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
        return json.load(r)


def releases(artist_id: int) -> int:
    body = get_json(f"https://itunes.apple.com/lookup?id={artist_id}&entity=album&limit=200&country=us")
    seen = {base_title(r.get("collectionName", "")) for r in body.get("results", [])[1:]
            if r.get("wrapperType") == "collection" and r.get("artistId") == artist_id}
    seen.discard("")
    return len(seen)


def youtube(channels: dict, key: str) -> dict:
    qs = urllib.parse.urlencode({"part": "statistics", "id": ",".join(channels.values()), "key": key})
    body = get_json(f"https://www.googleapis.com/youtube/v3/channels?{qs}")
    by_id = {it["id"]: it.get("statistics", {}) for it in body.get("items", [])}
    out = {}
    for gid, cid in channels.items():
        st = by_id.get(cid)
        if not st:
            continue
        out[gid] = {"yt_views": int(st.get("viewCount", 0)), "yt_videos": int(st.get("videoCount", 0))}
        if not st.get("hiddenSubscriberCount"):
            out[gid]["yt_subs"] = int(st.get("subscriberCount", 0))
    return out


def main() -> int:
    feeds = json.loads(FEEDS.read_text(encoding="utf-8"))
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"groups": {}}
    groups = {gid: dict(v) for gid, v in old.get("groups", {}).items()}

    for gid, aid in feeds.get("itunes", {}).items():
        try:
            n = releases(int(aid))
            if n:
                groups.setdefault(gid, {})["releases"] = n
        except Exception as exc:  # noqa: BLE001
            print(f"{gid}: iTunes falló ({exc}), se conserva lo anterior", file=sys.stderr)

    key = os.environ.get("YT_API_KEY")
    if key:
        try:
            for gid, nums in youtube(feeds.get("youtube", {}), key).items():
                groups.setdefault(gid, {}).update(nums)
        except Exception as exc:  # noqa: BLE001
            print(f"YouTube falló ({exc}), se conserva lo anterior", file=sys.stderr)
    else:
        print("Sin YT_API_KEY: solo lanzamientos de Apple Music", file=sys.stderr)

    if groups == old.get("groups"):
        print("Sin cambios")
        return 0
    data = {"updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "groups": groups}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("stats.json actualizado")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Numbers for each group's card: writes stats.json. Same fields for every group.

Usage: python updater/stats.py            (YT_API_KEY=xxxx adds YouTube subscribers)
- Spotify (no key, from kworb.net, which compiles Spotify's public numbers once a day):
  listeners (monthly listeners now), listeners_peak (highest ever), streams (all-time total as lead artist),
  top_song {title, streams, url} (most streamed song).
- yt_subs: official YouTube channel subscribers (YouTube Data API v3, free key, optional).
Ids live in alerts/feeds.json ("spotify", "youtube"). If a source fails, the previous numbers are kept.
kworb updates once a day, so this only refetches when stats.json is older than 12 hours.
"""
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "stats.json"
FEEDS = ROOT / "alerts" / "feeds.json"
UA = {"User-Agent": "radar-kpop (+https://radar-kpop.vercel.app)"}
KWORB = "https://kworb.net/spotify/"
MAX_PAGES = 12  # the listeners ranking comes in pages of 2,500 artists


def get(url: str) -> str:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def num(s: str) -> int:
    return int(re.sub(r"[^\d]", "", s) or 0)


def listeners(ids: dict) -> dict:
    """{group: (monthly listeners, peak)} from the kworb listeners ranking."""
    want, out = {v: k for k, v in ids.items()}, {}
    row = re.compile(r'artist/([A-Za-z0-9]+)_songs\.html">[^<]*</a></div></td><td>([\d,]+)</td><td>[-\d,]+</td>(?:<td>\d+</td>)?<td class="smaller">([\d,]+)</td>')  # page 1 has a peak-rank column, the rest don't
    for page in range(1, MAX_PAGES + 1):
        body = get(KWORB + ("listeners.html" if page == 1 else f"listeners{page}.html"))
        for sid, now, peak in row.findall(body):
            if sid in want:
                out[want[sid]] = (num(now), num(peak))
        if len(out) == len(want) or f"listeners{page + 1}.html" not in body:
            break
        time.sleep(1)
    return out


def songs(sid: str) -> dict:
    body = get(f"{KWORB}artist/{sid}_songs.html")
    m = re.search(r'>Streams</td><td>([\d,]+)</td><td class="smaller">([\d,]+)</td>', body)
    top = re.search(r'<a href="(https://open\.spotify\.com/track/[A-Za-z0-9]+)" target="_blank">([^<]+)</a></div></td><td>([\d,]+)</td>', body)
    out = {}
    if m:
        out["streams"] = num(m.group(2))  # "as lead": songs that are theirs, not features
    if top:
        out["top_song"] = {"title": html.unescape(top.group(2)), "streams": num(top.group(3)), "url": top.group(1)}
    return out


def youtube(channels: dict, key: str) -> dict:
    qs = urllib.parse.urlencode({"part": "statistics", "id": ",".join(channels.values()), "key": key})
    body = json.loads(get(f"https://www.googleapis.com/youtube/v3/channels?{qs}"))
    by_id = {it["id"]: it.get("statistics", {}) for it in body.get("items", [])}
    return {gid: int(by_id[cid]["subscriberCount"]) for gid, cid in channels.items()
            if cid in by_id and not by_id[cid].get("hiddenSubscriberCount")}


def main() -> int:
    feeds = json.loads(FEEDS.read_text(encoding="utf-8"))
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"groups": {}}
    if "--force" not in sys.argv and old.get("updated_at"):
        age = datetime.now(timezone.utc) - datetime.fromisoformat(old["updated_at"].replace("Z", "+00:00"))
        if age < timedelta(hours=12):
            print("stats.json tiene menos de 12 horas, no se vuelve a pedir")
            return 0
    groups = {gid: dict(v) for gid, v in old.get("groups", {}).items()}
    sp = feeds.get("spotify", {})

    try:
        for gid, (now, peak) in listeners(sp).items():
            g = groups.setdefault(gid, {})
            g["listeners"], g["listeners_peak"] = now, max(peak, g.get("listeners_peak", 0))
    except Exception as exc:  # noqa: BLE001
        print(f"kworb listeners falló ({exc}), se conserva lo anterior", file=sys.stderr)
    for gid, sid in sp.items():
        try:
            groups.setdefault(gid, {}).update(songs(sid))
        except Exception as exc:  # noqa: BLE001
            print(f"{gid}: kworb songs falló ({exc}), se conserva lo anterior", file=sys.stderr)
        time.sleep(1)

    key = os.environ.get("YT_API_KEY")
    if key:
        try:
            for gid, subs in youtube(feeds.get("youtube", {}), key).items():
                groups.setdefault(gid, {})["yt_subs"] = subs
        except Exception as exc:  # noqa: BLE001
            print(f"YouTube falló ({exc}), se conserva lo anterior", file=sys.stderr)
    else:
        print("Sin YT_API_KEY: sin suscriptores de YouTube", file=sys.stderr)

    for g in groups.values():  # fields from the first version
        g.pop("releases", None)
    data = {"updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "kworb.net (Spotify), YouTube Data API", "groups": groups}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("stats.json actualizado")
    return 0


if __name__ == "__main__":
    sys.exit(main())

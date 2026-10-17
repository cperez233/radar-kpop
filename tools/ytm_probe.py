"""Temporary probe: how to find the YouTube Music audio of releases that the search missed. Prints titles only."""
import json, os, sys, urllib.parse, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path("updater").resolve()))
from media import GROUP_NAMES, base_title  # noqa: E402

KEY = os.environ["YT_API_KEY"].strip()
def api(path, **q):
    q["key"] = KEY
    try:
        return json.loads(urllib.request.urlopen(f"https://www.googleapis.com/youtube/v3/{path}?{urllib.parse.urlencode(q)}", timeout=25).read())
    except urllib.error.HTTPError as e:
        return {"error": f"{e.code} {e.read()[:150]}"}

items = [x for x in json.load(open("media.json"))["items"] if x["type"] == "music" and not x.get("ytm") and x.get("ytm_try")]
topic = {}
for g in sorted({x["group"] for x in items}):
    a = GROUP_NAMES[g]
    b = api("search", part="snippet", type="channel", maxResults=5, q=f"{a} - Topic")
    print("CHANNEL", a, [(x["snippet"]["channelTitle"], x["id"].get("channelId")) for x in b.get("items", [])], b.get("error", ""))
    for x in b.get("items", []):
        if x["snippet"]["channelTitle"].lower() == f"{a} - topic".lower():
            topic[g] = x["id"]["channelId"]; break
    if g in topic:
        c = api("channels", part="contentDetails", id=topic[g])
        up = ((c.get("items") or [{}])[0].get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads"))
        p = api("playlistItems", part="snippet", maxResults=10, playlistId=up) if up else {}
        print("  UPLOADS", up, [x["snippet"]["title"] for x in p.get("items", [])], p.get("error", ""))
for it in items:
    a = GROUP_NAMES[it["group"]]
    tr = [t["n"] for t in (it.get("tracks") or [])]
    print("\nRELEASE", a, "|", it["title"], "|", it["date"], "| tracks:", tr[:6])
    for q in (f"{a} {it['title']}", f"{a} - Topic {it['title']}", f"{a} {tr[0]}" if tr else None):
        if not q:
            continue
        b = api("search", part="snippet", type="video", maxResults=15, q=q)
        print("  Q", q, "->", [(x["snippet"]["channelTitle"], x["snippet"]["title"][:40]) for x in b.get("items", []) if "topic" in x["snippet"]["channelTitle"].lower()], b.get("error", ""))
    if it["group"] in topic:
        b = api("search", part="snippet", type="video", maxResults=15, channelId=topic[it["group"]], q=tr[0] if tr else it["title"])
        print("  IN-TOPIC ->", [x["snippet"]["title"][:40] for x in b.get("items", [])], b.get("error", ""))

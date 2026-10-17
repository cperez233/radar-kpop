"""Releases and videos: writes media.json with each group's latest music and official YouTube videos.

Usage: python updater/media.py
Free sources:
- Apple Music catalog through the iTunes Search API (lookup by artist id, newest albums and singles).
- The latest uploads of each official YouTube channel (alerts/feeds.json, "youtube"): YouTube Data API with YT_API_KEY
  (free); without it, the public RSS feed, which YouTube stopped serving in 2026.
Artist ids live in alerts/feeds.json, "itunes". If a source fails, the previous items for that group are kept.
The list comes only from Apple Music, so every app shows the same releases; each one then gets its direct link in
- Spotify: the artist's albums and singles (Web API with SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET, free app);
- YouTube Music: the release's official MV from the group's channel, opened in music.youtube.com.
A link found once is kept. Without a direct link, the page opens that app's search for the title.
"""
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "alerts"))
import youtube  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from status import report  # noqa: E402
OUT = ROOT / "media.json"
UA = {"User-Agent": "radar-kpop (+https://radar-kpop.vercel.app)"}
PER_GROUP = 3
GROUP_NAMES = {"bts": "BTS", "skz": "Stray Kids", "twice": "TWICE", "blackpink": "BLACKPINK", "seventeen": "SEVENTEEN", "enhypen": "ENHYPEN",
               "newjeans": "NewJeans", "ateez": "ATEEZ", "cortis": "CORTIS", "lngshot": "LNGSHOT"}


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


def tracks(item: dict) -> list[dict]:
    """The release's songs with their free 30-second previews (iTunes), for the page's own player."""
    cid = re.search(r"/(\d+)$", item["url"])
    if not cid:
        return []
    body = json.loads(get(f"https://itunes.apple.com/lookup?id={cid.group(1)}&entity=song&country=us&limit=20"))
    out = []
    for r in body.get("results", []):
        if r.get("wrapperType") == "track" and r.get("kind") == "song":
            p = r.get("previewUrl", "")
            out.append({"n": r.get("trackName", ""), "ms": r.get("trackTimeMillis", 0),
                        "p": p if p.startswith("https://audio-ssl.itunes.apple.com/") else ""})
    return out[:14]


def spotify_token() -> str:
    cid, sec = os.environ.get("SPOTIFY_CLIENT_ID", "").strip(), os.environ.get("SPOTIFY_CLIENT_SECRET", "").strip()
    if not (cid and sec):
        return ""
    req = urllib.request.Request("https://accounts.spotify.com/api/token", data=b"grant_type=client_credentials", headers={
        "Authorization": "Basic " + base64.b64encode(f"{cid}:{sec}".encode()).decode(), "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())["access_token"]


def spotify_get(token: str, url: str) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", **UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as exc:
        # Spotify explica el error en el cuerpo: se guarda para el vigilante en vez de un "400" a secas
        raise RuntimeError(f"HTTP {exc.code}: {exc.read()[:200].decode('utf-8', 'replace')}") from None


def spotify_albums(token: str, artist_id: str) -> list[dict]:
    """Albums and singles of the artist, newest first. Pages of 10 (the 2026 limit for apps in development mode)."""
    out, url = [], f"https://api.spotify.com/v1/artists/{artist_id}/albums?include_groups=album,single&limit=10"
    for _ in range(3):
        body = spotify_get(token, url)
        out += [{"key": base_title(a.get("name", "")), "date": a.get("release_date", ""), "url": (a.get("external_urls") or {}).get("spotify", "")}
                for a in body.get("items", []) if (a.get("external_urls") or {}).get("spotify", "").startswith("https://open.spotify.com/")]
        url = body.get("next")
        if not url:
            break
        time.sleep(.2)
    return out


def spotify_search(token: str, item: dict, artist: str) -> list[dict]:
    """Fallback: search the release by name and artist."""
    q = urllib.parse.quote(f'album:{item["title"]} artist:{artist}')
    body = spotify_get(token, f"https://api.spotify.com/v1/search?type=album&limit=5&q={q}")
    return [{"key": base_title(a.get("name", "")), "date": a.get("release_date", ""), "url": (a.get("external_urls") or {}).get("spotify", "")}
            for a in (body.get("albums") or {}).get("items", []) if any(x.get("name", "").lower() == artist.lower() for x in a.get("artists", []))]


def days_apart(a: str, b: str) -> int:
    try:
        return abs((datetime.fromisoformat(a[:10]) - datetime.fromisoformat(b[:10])).days)
    except ValueError:
        return 999


def match_spotify(item: dict, albums: list[dict]) -> str:
    """Same release name (without '- EP', versions or covers); if several, the closest date. A loose name only counts within 10 days."""
    key = base_title(item["title"])
    same = [a for a in albums if a["key"] == key]
    if not same:
        same = [a for a in albums if key and a["key"] and (a["key"].startswith(key) or key.startswith(a["key"])) and days_apart(a["date"], item["date"]) <= 10]
    same.sort(key=lambda a: days_apart(a["date"], item["date"]))
    # un remix o una versión nueva no es el álbum de hace un año: si la fecha queda muy lejos, mejor la búsqueda
    return same[0]["url"] if same and days_apart(same[0]["date"], item["date"]) <= 60 else ""


def match_mv(item: dict, vids: list[dict]) -> str:
    """The group's official MV of that release, opened in YouTube Music."""
    key = base_title(item["title"])
    if len(key) < 2:
        return ""
    for v in vids:
        t = v["title"].lower()
        if re.search(r"behind|teaser|making|practice|reaction|sketch|shorts?\b|reel|recording|episode|live clip|performance|lyric", t):
            continue  # un detrás de cámaras o un teaser no es el MV
        if v["group"] == item["group"] and re.search(r"\b(m/?v|music video)\b", t) and re.search(r"(^|[\s'‘’\"“”(\[])" + re.escape(key) + r"($|[\s'‘’\"“”)\].:!?-])", t):
            vid = re.search(r"[?&]v=([\w-]{6,})", v["url"])
            if vid:
                return f"https://music.youtube.com/watch?v={vid.group(1)}"
    return ""


def search_mv(item: dict, channel: str) -> str:
    """If the MV is no longer among the latest uploads: one search in the group's channel (100 of the 10,000 daily units;
    it only runs once per new release because the link is kept)."""
    key = os.environ.get("YT_API_KEY", "").strip()
    if not (key and channel):
        return ""
    q = urllib.parse.quote(f"{item['title']} MV")
    body = json.loads(get(f"https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&channelId={channel}&q={q}&key={key}"))
    vids = [{"group": item["group"], "title": x["snippet"]["title"], "url": f"https://www.youtube.com/watch?v={x['id']['videoId']}"}
            for x in body.get("items", []) if x.get("id", {}).get("videoId")]
    return match_mv(item, vids)


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
    n_it = n_yt = 0
    for gid, aid in feeds.get("itunes", {}).items():
        try:
            items += music(gid, int(aid)); ok += 1; n_it += 1
        except Exception as exc:  # noqa: BLE001
            failed.append(f"itunes {gid}: {exc}"); items += keep.get((gid, "music"), [])
        time.sleep(1.2)  # la API de iTunes pide calma (unas 20 consultas por minuto)
    for gid, ch in feeds.get("youtube", {}).items():
        if not ch:
            continue
        try:
            items += videos(gid, ch); ok += 1; n_yt += 1
        except Exception as exc:  # noqa: BLE001
            failed.append(f"youtube {gid}: {exc}"); items += keep.get((gid, "video"), [])
    # enlaces directos por app (la lista sigue siendo la de Apple Music: así todas las apps muestran lo mismo)
    prev = {it["url"]: it for it in old.get("items", []) if it.get("type") == "music"}
    vids = [x for x in items if x["type"] == "video"] + [x for x in old.get("items", []) if x.get("type") == "video"]
    try:
        token = spotify_token()
    except Exception as exc:  # noqa: BLE001
        token = ""; failed.append(f"spotify token: {exc}")
    sp_cache, n_sp, n_search, n_tr, sp_blocked = {}, 0, 0, 0, False
    for it in (x for x in items if x["type"] == "music"):
        before = prev.get(it["url"], {})
        if before and before.get("ytm_v") != 2:  # la búsqueda del MV mejoró: se vuelve a buscar una vez
            before = {k: v for k, v in before.items() if k not in ("ytm", "ytm_try")}
        it["ytm_v"] = 2
        for k in ("spotify", "ytm", "tracks"):
            if before.get(k):
                it[k] = before[k]
        # canciones y avances: una consulta por lanzamiento nuevo (hasta 6 por corrida, el catálogo pide calma)
        if not it.get("tracks") and n_tr < 6:
            n_tr += 1
            try:
                it["tracks"] = tracks(it) or None; time.sleep(1.2)
            except Exception as exc:  # noqa: BLE001
                failed.append(f"itunes tracks {it['group']}: {exc}")
        if not it.get("ytm"):
            it["ytm"] = match_mv(it, vids) or None
        # búsqueda de un MV que ya no está entre las últimas subidas: una sola vez por lanzamiento (queda marcado)
        if not it.get("ytm") and not before.get("ytm_try") and n_search < 6:
            n_search += 1; it["ytm_try"] = 1
            try:
                it["ytm"] = search_mv(it, feeds.get("youtube", {}).get(it["group"], "")) or None
            except Exception as exc:  # noqa: BLE001
                failed.append(f"youtube search {it['group']}: {exc}"); it.pop("ytm_try", None)
        elif before.get("ytm_try"):
            it["ytm_try"] = 1
        sid = feeds.get("spotify", {}).get(it["group"])
        # Spotify da un cupo diario chico: lo que no se encontró se reintenta una vez al día, no en cada corrida
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if before.get("sp_try") and not it.get("spotify"):
            it["sp_try"] = before["sp_try"]
        if token and sid and not it.get("spotify") and it.get("sp_try") != today and not sp_blocked:
            # primero el catálogo del artista (una consulta por grupo); si no aparece o falla, una búsqueda por nombre
            try:
                if sid not in sp_cache:
                    sp_cache[sid] = spotify_albums(token, sid); time.sleep(.3)
                it["spotify"] = match_spotify(it, sp_cache[sid]) or None
            except Exception as exc:  # noqa: BLE001
                sp_cache[sid] = []; failed.append(f"spotify {it['group']}: {exc}")
                sp_blocked = "429" in str(exc)  # cupo agotado: no se insiste en esta corrida
            if not it.get("spotify") and n_sp < 4 and not sp_blocked:
                n_sp += 1
                try:
                    it["spotify"] = match_spotify(it, spotify_search(token, it, GROUP_NAMES.get(it["group"], ""))) or None
                except Exception as exc:  # noqa: BLE001
                    failed.append(f"spotify search {it['group']}: {exc}"); sp_blocked = "429" in str(exc)
            if not it.get("spotify") and not sp_blocked:
                it["sp_try"] = today
        for k in ("spotify", "ytm", "tracks"):
            if not it.get(k):
                it.pop(k, None)
        if it.get("spotify"):
            it.pop("sp_try", None)
    if token:
        n_links = sum(1 for x in items if x.get("spotify"))
        sp_err = next((f for f in failed if f.startswith("spotify")), "")
        report("spotify", n_links > 0 or not sp_err, "" if n_links else sp_err)
        if sp_blocked:
            print("Spotify: cupo diario agotado, se sigue mañana", file=sys.stderr)
    report("itunes", n_it > 0, "" if n_it else "el catálogo de Apple Music no respondió")
    yt_err = next((f for f in failed if f.startswith("youtube")), "")
    report("youtube", n_yt > 0, "" if n_yt else ("la key fue rechazada (revisa YT_API_KEY)" if " 400" in yt_err or " 403" in yt_err else yt_err or "no respondió"))
    items.sort(key=lambda x: x["date"], reverse=True)
    doc = {"updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "sample": False, "items": items}
    sig = lambda xs: [(x["url"], x.get("spotify"), x.get("ytm"), x.get("ytm_try"), x.get("ytm_v"), x.get("sp_try"), len(x.get("tracks") or [])) for x in xs]  # noqa: E731
    if sig(items) == sig(old.get("items", [])):
        print(f"Sin cambios ({ok} fuentes bien)")
    else:
        OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"media.json: {len(items)} items, {ok} fuentes bien")
    for f in failed:
        print(f, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

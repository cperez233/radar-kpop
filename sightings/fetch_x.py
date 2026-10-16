"""Avistamientos: lee las cuentas oficiales de cada grupo en X y guarda en sightings.json los posts que mencionan una ciudad.

Uso:
    python sightings/fetch_x.py            # con RSSHUB_URL o X_BEARER_TOKEN en el entorno o en .env
    python sightings/fetch_x.py --sample   # fuerza los datos de ejemplo

Fuentes, en orden:
1. RSSHUB_URL (gratis): tu RSSHub, ruta /twitter/user/<cuenta>. Es la principal.
2. X_BEARER_TOKEN (de pago por uso, ~0,005 USD por post): solo si no hay RSSHub o si RSSHub falla entero.
   Para gastar poco: ids de usuario guardados en sightings/user_ids.json, solo posts nuevos (since_id) y como mucho
   una lectura por hora (MIN_GAP). Si X responde 402/403 (sin saldo o sin permiso) se detiene sin insistir.
Si ninguna fuente responde, se conserva sightings.json como estaba. Sin ninguna de las dos, escribe datos de ejemplo
marcados con "sample": true (la web los muestra con una etiqueta).

Reglas para que esto nunca sea acoso:
- Solo cuentas oficiales (las de alerts/feeds.json, "social").
- Solo nivel ciudad: el post se ubica en la ciudad que menciona, con las coordenadas del centro de la ciudad.
- Se descartan los posts que hablan de aeropuertos, hoteles o vuelos, para no mandar gente a esperar a nadie.
- No se guarda ninguna ubicación de personas ni de fans, y no se leen respuestas ni posts de otras cuentas.
"""
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from status import report  # noqa: E402
OUT = ROOT / "sightings.json"
IDS = ROOT / "sightings" / "user_ids.json"
SOCIAL = ROOT / "state" / "social.json"
NOTICES = ROOT / "notices.json"  # avisos oficiales: posts [NOTICE]/[공지] y enlaces a Weverse de las cuentas oficiales
NOTICE = re.compile(r"^\s*\[(NOTICE|공지|NEWS|안내|INFO|お知らせ)\]|weverse\.io/[\w-]+/(notice|live|artist)", re.I)
NOTICES_PER_GROUP, NOTICES_DAYS = 6, 45  # posts crudos de RSSHub; las alertas los reusan para no pedirlos dos veces
API = "https://api.x.com/2"
BLOCK = re.compile(r"airport|aeropuerto|aeroporto|공항|空港|hotel|호텔|ホテル|flight|vuelo|departure|arrival gate|출국|입국|terminal", re.I)
KEEP_DAYS = 30
PLACES_EN = json.loads((ROOT / "assets" / "places-en.json").read_text(encoding="utf-8"))["places"]
MAX_ITEMS = 60
NOT_PLACE = re.compile(r"paris,? texas|tokyo drift|london boy|seoul city sky|new york state of mind", re.I)  # títulos que no son lugares
MIN_GAP = timedelta(minutes=55)


def load_env() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def gazetteer(events: dict) -> list[dict]:
    cities = json.loads((ROOT / "sightings" / "cities.json").read_text(encoding="utf-8"))["cities"]
    known = {norm(n) for c in cities for n in c["names"]}
    for g in events["groups"]:  # las ciudades de las giras también cuentan
        for e in g.get("events", []):
            base = e["city"].split(" (")[0]
            if norm(base) not in known:
                cities.append({"city": base, "country": e["country"], "lat": e["lat"], "lon": e["lon"], "names": [base]})
                known.add(norm(base))
    out = []
    for c in cities:
        for n in c["names"] + [c["city"]]:
            out.append((norm(n), c))
    out.sort(key=lambda x: -len(x[0]))  # primero los nombres largos: "Santiago de Chile" antes que "Santiago"
    return out


def find_city(text: str, gaz: list) -> dict | None:
    t = norm(text)
    for name, c in gaz:
        if re.search(r"(?<![\w])" + re.escape(name) + r"(?![\w])", t):
            return c
    return None


def accounts() -> dict:
    feeds = json.loads((ROOT / "alerts" / "feeds.json").read_text(encoding="utf-8"))
    return {s["group"]: s["url"].rstrip("/").rsplit("/", 1)[1] for s in feeds.get("social", [])}


def api(path: str, token: str, **qs) -> dict:
    url = f"{API}{path}" + ("?" + urllib.parse.urlencode(qs) if qs else "")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "User-Agent": "radar-kpop"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def item(gid: str, names: dict, handle: str, tid: str, text: str, when: str, gaz: list) -> dict | None:
    text = html.unescape(text)
    if BLOCK.search(text) or NOT_PLACE.search(text):
        return None
    c = find_city(text, gaz)
    if not c:
        return None
    return {
        "id": f"x-{tid}", "group": gid, "group_name": names.get(gid, gid),
        "city": c["city"], "country": c["country"], "lat": c["lat"], "lon": c["lon"],
        "text": " ".join(re.sub(r"\(\s*\)", " ", re.sub(r"https?://[^\s)]+", "", text)).split())[:220],
        "url": f"https://x.com/{handle}/status/{tid}", "account": handle, "when": when,
    }


def fetch_rsshub(base: str, events: dict) -> list[dict] | None:
    """Posts de cada cuenta oficial vía RSSHub. None si no respondió ninguna cuenta."""
    gaz, names, items, ok, raw = gazetteer(events), {g["id"]: g["name"] for g in events["groups"]}, [], 0, []
    for gid, handle in accounts().items():
        root = None
        for attempt in (1, 2):  # RSSHub en Vercel a veces corta la conexión: un reintento
            try:
                req = urllib.request.Request(f"{base}/twitter/user/{handle}", headers={"User-Agent": "radar-kpop"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    root = ET.fromstring(r.read())
                break
            except Exception as exc:  # noqa: BLE001
                if attempt == 2:
                    print(f"RSSHub @{handle}: {exc}", file=sys.stderr)
                time.sleep(3)
        if root is None:
            continue
        ok += 1
        for it in root.iter("item"):
            raw.append({"group": gid, "account": handle, "title": (it.findtext("title") or "").strip(), "link": it.findtext("link") or "",
                        "summary": re.sub(r"<[^>]+>", " ", it.findtext("description") or "")[:400], "pubDate": it.findtext("pubDate") or ""})
            link = it.findtext("link") or ""
            m = re.search(r"/status/(\d+)", link)
            if not m or (it.findtext("title") or "").startswith("RT "):
                continue  # los retweets son de otras cuentas
            text = re.sub(r"<[^>]+>", " ", it.findtext("description") or it.findtext("title") or "")
            try:
                when = parsedate_to_datetime(it.findtext("pubDate")).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            except (TypeError, ValueError):
                continue
            x = item(gid, names, handle, m.group(1), " ".join(text.split()), when, gaz)
            if x:
                items.append(x)
    print(f"RSSHub: {ok} de {len(accounts())} cuentas respondieron")
    if ok:
        save_notices(raw)
    report("rsshub", ok > 0, "" if ok else "ninguna cuenta respondió: puede que haya vencido la cookie auth_token en Vercel")
    if ok:
        SOCIAL.parent.mkdir(parents=True, exist_ok=True)
        SOCIAL.write_text(json.dumps({"updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "items": raw}, ensure_ascii=False) + "\n", encoding="utf-8")
    return items if ok else None


def save_notices(raw: list[dict]) -> None:
    """Junta los avisos oficiales nuevos con los que ya había (por grupo, los más recientes) y escribe notices.json."""
    old = json.loads(NOTICES.read_text(encoding="utf-8")) if NOTICES.exists() else {"groups": {}}
    groups = {g: list(v) for g, v in old.get("groups", {}).items()}
    cutoff = (datetime.now(timezone.utc) - timedelta(days=NOTICES_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    for p in raw:
        text = p["title"] + " " + p.get("summary", "")
        if p["title"].startswith("RT ") or not NOTICE.search(text):
            continue
        try:
            when = parsedate_to_datetime(p["pubDate"]).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except (TypeError, ValueError):
            continue
        wv = re.search(r"https://weverse\.io/[^\s)\"'<]+", text)
        title = " ".join(re.sub(r"https?://\S+|#\S+|▶️|🔗", " ", html.unescape(p["title"])).split())[:140]
        item = {"title": title, "url": wv.group(0) if wv else p["link"], "post": p["link"], "when": when, "weverse": bool(wv)}
        lst = groups.setdefault(p["group"], [])
        if not any(x["post"] == item["post"] for x in lst):
            lst.append(item)
    for g in groups:
        groups[g] = sorted((x for x in groups[g] if x["when"] >= cutoff), key=lambda x: x["when"], reverse=True)[:NOTICES_PER_GROUP]
    if groups != old.get("groups"):
        NOTICES.write_text(json.dumps({"updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "groups": groups},
                                      ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"notices.json: {sum(len(v) for v in groups.values())} avisos oficiales")


def fetch_real(token: str, events: dict) -> list[dict] | None:
    gaz = gazetteer(events)
    names = {g["id"]: g["name"] for g in events["groups"]}
    ids = json.loads(IDS.read_text(encoding="utf-8")) if IDS.exists() else {}
    since = ids.setdefault("_since", {})
    items, ok = [], 0
    for gid, handle in accounts().items():
        try:
            if handle not in ids:
                ids[handle] = api(f"/users/by/username/{handle}", token)["data"]["id"]
            qs = {"max_results": 5, "exclude": "retweets,replies", "tweet.fields": "created_at"}
            if handle in since:
                qs["since_id"] = since[handle]  # solo lo nuevo: si no hay posts nuevos, no se cobra nada
            body = api(f"/users/{ids[handle]}/tweets", token, **qs)
            ok += 1
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 402, 403):
                print(f"X respondió {exc.code} (sin saldo, sin permiso o token malo): se deja de consultar en esta corrida", file=sys.stderr)
                break
            print(f"{gid} (@{handle}): X respondió {exc.code}", file=sys.stderr)
            continue
        except Exception as exc:  # noqa: BLE001
            print(f"{gid} (@{handle}): {exc}", file=sys.stderr)
            continue
        newest = body.get("meta", {}).get("newest_id")
        if newest:
            since[handle] = newest
        for tw in body.get("data", []):
            x = item(gid, names, handle, tw["id"], tw.get("text", ""), tw.get("created_at", datetime.now(timezone.utc).isoformat()), gaz)
            if x:
                items.append(x)
    IDS.write_text(json.dumps(ids, indent=2) + "\n", encoding="utf-8")
    return items if ok else None


def sample(events: dict, now: datetime) -> list[dict]:
    """Un ejemplo por grupo en gira, en la ciudad de su parada más reciente o la próxima. Texto marcado como ejemplo."""
    items = []
    for i, g in enumerate(events["groups"]):
        evs = sorted(g.get("events", []), key=lambda e: e["start"])
        if not evs:
            continue
        past = [e for e in evs if datetime.fromisoformat(e["start"]) <= now]
        up = [e for e in evs if datetime.fromisoformat(e["start"]) > now]
        e = past[-1] if past and (now - datetime.fromisoformat(past[-1]["start"])).days < 21 else (up[0] if up else None)
        if not e:
            continue
        city = e["city"].split(" (")[0]
        items.append({
            "id": f"sample-{g['id']}-{e['id']}", "group": g["id"], "group_name": g["name"],
            "city": city, "country": e["country"], "lat": e["lat"], "lon": e["lon"],
            "text": f"Ejemplo: así se vería un post oficial de {g['name']} que menciona {city}.",
            "text_en": f"Sample: this is how an official {g['name']} post that mentions {PLACES_EN.get(city, city)} would look.",
            "url": "", "account": "", "when": (now - timedelta(hours=3 + i * 5)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })
    return items


def main() -> int:
    load_env()
    events = json.loads((ROOT / "events.json").read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)
    token = os.environ.get("X_BEARER_TOKEN", "").strip()
    rsshub = os.environ.get("RSSHUB_URL", "").strip().rstrip("/")
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"items": [], "sample": True}
    if (rsshub or token) and "--sample" not in sys.argv:
        fresh, source = (fetch_rsshub(rsshub, events), "rsshub") if rsshub else (None, "")
        if fresh is None and token:
            last = old.get("updated_at") if old.get("source") == "x" else None
            if last and now - datetime.fromisoformat(last.replace("Z", "+00:00")) < MIN_GAP:
                print("Se leyó X hace menos de una hora, se espera a la próxima")
                return 0
            fresh, source = fetch_real(token, events), "x"
        if fresh is None:
            print("Ninguna fuente de avistamientos respondió: se conserva sightings.json como estaba", file=sys.stderr)
            return 0
        keep = [] if old.get("sample") else old.get("items", [])
        merged = {x["id"]: x for x in keep + fresh}
        cutoff = now - timedelta(days=KEEP_DAYS)
        items = [x for x in merged.values() if datetime.fromisoformat(x["when"].replace("Z", "+00:00")) >= cutoff]
        items.sort(key=lambda x: x["when"], reverse=True)
        seen, uniq = set(), []
        for x in items:  # un avistamiento por grupo y ciudad: el más reciente (una promo repetida no llena la lista)
            if (x["group"], x["city"]) not in seen:
                seen.add((x["group"], x["city"]))
                uniq.append(x)
        items = uniq
        doc = {"updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": source, "sample": False, "items": items[:MAX_ITEMS]}
        print(f"{len(fresh)} posts con ciudad, {len(doc['items'])} avistamientos guardados ({source})")
        if not old.get("sample") and [x["id"] for x in old.get("items", [])] == [x["id"] for x in doc["items"]]:
            print("Avistamientos sin cambios")
            return 0
    else:
        print("Sin RSSHUB_URL ni X_BEARER_TOKEN: se escriben datos de ejemplo.", file=sys.stderr)
        doc = {"updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "sample", "sample": True, "items": sample(events, now)}
        if old.get("sample") and [x["id"] for x in old.get("items", [])] == [x["id"] for x in doc["items"]]:
            print("Ejemplo sin cambios")
            return 0
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())

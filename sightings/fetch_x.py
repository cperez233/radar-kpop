"""Avistamientos: lee las cuentas oficiales de cada grupo en X y guarda en sightings.json los posts que mencionan una ciudad.

Uso:
    python sightings/fetch_x.py            # con X_BEARER_TOKEN en el entorno o en .env
    python sightings/fetch_x.py --sample   # fuerza los datos de ejemplo

Reglas para que esto nunca sea acoso:
- Solo cuentas oficiales (las de alerts/feeds.json, "social").
- Solo nivel ciudad: el post se ubica en la ciudad que menciona, con las coordenadas del centro de la ciudad.
- Se descartan los posts que hablan de aeropuertos, hoteles o vuelos, para no mandar gente a esperar a nadie.
- No se guarda ninguna ubicación de personas ni de fans, y no se leen respuestas ni posts de otras cuentas.

Sin token, escribe datos de ejemplo marcados con "sample": true (la web los muestra con una etiqueta).
X API v2: GET /2/users/by/username/:name y GET /2/users/:id/tweets. X cobra por cada post y perfil leído (pago por uso),
así que el gasto se mantiene mínimo:
- los ids de usuario se piden una sola vez y quedan en sightings/user_ids.json;
- se guarda el último post visto de cada cuenta ("_since") y solo se piden los más nuevos (since_id);
- se lee como mucho una vez por hora aunque el workflow corra cada 15 minutos (MIN_GAP).
"""
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sightings.json"
IDS = ROOT / "sightings" / "user_ids.json"
API = "https://api.x.com/2"
BLOCK = re.compile(r"airport|aeropuerto|aeroporto|공항|空港|hotel|호텔|ホテル|flight|vuelo|departure|arrival gate|출국|입국|terminal", re.I)
KEEP_DAYS = 30
PLACES_EN = json.loads((ROOT / "assets" / "places-en.json").read_text(encoding="utf-8"))["places"]
MAX_ITEMS = 60
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


def fetch_real(token: str, events: dict) -> list[dict]:
    gaz = gazetteer(events)
    names = {g["id"]: g["name"] for g in events["groups"]}
    ids = json.loads(IDS.read_text(encoding="utf-8")) if IDS.exists() else {}
    since = ids.setdefault("_since", {})
    items = []
    for gid, handle in accounts().items():
        try:
            if handle not in ids:
                ids[handle] = api(f"/users/by/username/{handle}", token)["data"]["id"]
            qs = {"max_results": 5, "exclude": "retweets,replies", "tweet.fields": "created_at"}
            if handle in since:
                qs["since_id"] = since[handle]  # solo lo nuevo: si no hay posts nuevos, no se cobra nada
            body = api(f"/users/{ids[handle]}/tweets", token, **qs)
        except Exception as exc:  # noqa: BLE001
            print(f"{gid} (@{handle}): {exc}", file=sys.stderr)
            continue
        newest = body.get("meta", {}).get("newest_id")
        if newest:
            since[handle] = newest
        for tw in body.get("data", []):
            text = tw.get("text", "")
            if BLOCK.search(text):
                continue
            c = find_city(text, gaz)
            if not c:
                continue
            items.append({
                "id": f"x-{tw['id']}", "group": gid, "group_name": names.get(gid, gid),
                "city": c["city"], "country": c["country"], "lat": c["lat"], "lon": c["lon"],
                "text": re.sub(r"https://t\.co/\S+", "", text).strip()[:220],
                "url": f"https://x.com/{handle}/status/{tw['id']}", "account": handle,
                "when": tw.get("created_at", datetime.now(timezone.utc).isoformat()),
            })
    IDS.write_text(json.dumps(ids, indent=2) + "\n", encoding="utf-8")
    return items


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
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"items": [], "sample": True}
    if token and "--sample" not in sys.argv:
        last = old.get("updated_at") if not old.get("sample") else None
        if last and now - datetime.fromisoformat(last.replace("Z", "+00:00")) < MIN_GAP:
            print("Se leyó X hace menos de una hora, se espera a la próxima")
            return 0
        fresh = fetch_real(token, events)
        keep = [] if old.get("sample") else old.get("items", [])
        merged = {x["id"]: x for x in keep + fresh}
        cutoff = now - timedelta(days=KEEP_DAYS)
        items = [x for x in merged.values() if datetime.fromisoformat(x["when"].replace("Z", "+00:00")) >= cutoff]
        items.sort(key=lambda x: x["when"], reverse=True)
        doc = {"updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "x", "sample": False, "items": items[:MAX_ITEMS]}
        print(f"{len(fresh)} posts con ciudad, {len(doc['items'])} avistamientos guardados")
    else:
        if not token:
            print("Falta X_BEARER_TOKEN (en .env o en los secretos del workflow). Se escriben datos de ejemplo.", file=sys.stderr)
        doc = {"updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "sample", "sample": True, "items": sample(events, now)}
        if old.get("sample") and [x["id"] for x in old.get("items", [])] == [x["id"] for x in doc["items"]]:
            print("Ejemplo sin cambios")
            return 0
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())

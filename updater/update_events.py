"""Actualiza events.json con las fechas de gira de cada grupo.

Fuente automatica: Ticketmaster Discovery API (gratis, key en developer.ticketmaster.com).
Fuente manual: updater/overrides.json, para festivales, apariciones o fechas que la API no trae.

Uso:
    TM_API_KEY=xxxx python updater/update_events.py

Reglas:
- Si la API falla o devuelve cero eventos para un grupo, se conservan las fechas que ya estaban.
- Solo se escribe el archivo si algo cambio, asi el commit del workflow no se llena de ruido.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVENTS = ROOT / "events.json"
OVERRIDES = ROOT / "updater" / "overrides.json"
API = "https://app.ticketmaster.com/discovery/v2/events.json"

# id del grupo en events.json -> nombre exacto del artista en Ticketmaster
ARTISTS = {
    "bts": "BTS",
    "skz": "Stray Kids",
    "twice": "TWICE",
    "blackpink": "BLACKPINK",
    "lngshot": "LNGSHOT",
    "seventeen": "SEVENTEEN",
    "enhypen": "ENHYPEN",
    "newjeans": "NewJeans",
    "cortis": "CORTIS",
}


def fetch_artist(name: str, key: str) -> list[dict]:
    out, page = [], 0
    while page < 5:
        qs = urllib.parse.urlencode({
            "apikey": key, "keyword": name, "classificationName": "music",
            "size": 100, "page": page, "sort": "date,asc",
        })
        with urllib.request.urlopen(f"{API}?{qs}", timeout=30) as r:
            body = json.load(r)
        events = body.get("_embedded", {}).get("events", [])
        out.extend(events)
        if page + 1 >= body.get("page", {}).get("totalPages", 1):
            break
        page += 1
    return out


def to_event(group_id: str, name: str, ev: dict) -> dict | None:
    attractions = [a.get("name", "").lower() for a in ev.get("_embedded", {}).get("attractions", [])]
    if name.lower() not in attractions:
        return None  # keyword trajo otra cosa (tributos, eventos con nombre parecido)
    venues = ev.get("_embedded", {}).get("venues", [])
    if not venues:
        return None
    v = venues[0]
    loc = v.get("location") or {}
    start = ev["dates"]["start"]
    if "dateTime" not in start or "latitude" not in loc:
        return None
    return {
        "id": f"{group_id}-{ev['id']}",
        "local_date": start["localDate"],
        "start": start["dateTime"],
        "city": v.get("city", {}).get("name", ""),
        "country": v.get("country", {}).get("name", ""),
        "venue": v.get("name"),
        "lat": round(float(loc["latitude"]), 4),
        "lon": round(float(loc["longitude"]), 4),
        "status": "confirmado",
    }


def main() -> int:
    key = os.environ.get("TM_API_KEY")
    if not key:
        # sin key no se cae el workflow: se conservan las fechas y siguen los demas pasos
        print("Falta TM_API_KEY: se conservan las fechas actuales (solo se aplican overrides)", file=sys.stderr)

    data = json.loads(EVENTS.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    before = json.dumps(data["groups"], sort_keys=True)

    for g in data["groups"]:
        name = ARTISTS.get(g["id"])
        fresh = []
        if name:
            try:
                for ev in (fetch_artist(name, key) if key else []):
                    e = to_event(g["id"], name, ev)
                    if e:
                        fresh.append(e)
            except Exception as exc:  # noqa: BLE001
                print(f"{g['id']}: fallo la API ({exc}), se conserva lo anterior", file=sys.stderr)
        manual = overrides.get(g["id"], {}).get("events", [])
        if fresh or manual:
            keep_past = [e for e in g["events"] if e["start"] < datetime.now(timezone.utc).isoformat()]
            merged = {e["id"]: e for e in keep_past + fresh + manual}
            # mismo día y mismo recinto = mismo show: gana el manual (puede traer lineup u onsale)
            by_show = {}
            for e in merged.values():
                by_show[(e["local_date"], round(e["lat"], 1), round(e["lon"], 1))] = e
            for e in manual:
                by_show[(e["local_date"], round(e["lat"], 1), round(e["lon"], 1))] = e
            g["events"] = sorted(by_show.values(), key=lambda e: e["start"])
        for field in ("watch", "watch_en"):
            if field in overrides.get(g["id"], {}):
                g[field] = overrides[g["id"]][field]

    if json.dumps(data["groups"], sort_keys=True) == before:
        print("Sin cambios")
        return 0
    data["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    EVENTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("events.json actualizado")
    return 0


if __name__ == "__main__":
    sys.exit(main())

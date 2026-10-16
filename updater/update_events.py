"""Actualiza events.json con las fechas de gira de cada grupo, solo, cada vez que corre el robot.

Fuentes:
- Automática: Ticketmaster Discovery API (gratis, key en developer.ticketmaster.com). Cubre sobre todo América y Europa;
  las fechas de Asia (Interpark, Yes24, Ticketpia) no salen ahí y se cargan a mano.
- Manual: updater/overrides.json, para festivales, Asia o fechas que la API no trae, y las notas de cada grupo.

Uso:
    TM_API_KEY=xxxx python updater/update_events.py

Reglas:
- Las fechas curadas a mano nunca se borran por no salir en Ticketmaster. Ticketmaster solo agrega fechas o actualiza
  las que vinieron de Ticketmaster; si una de esas desaparece de la API (y la consulta salió bien), se quita.
- Mismo día y misma ciudad = mismo show: gana la fecha curada (o la de overrides), Ticketmaster no la duplica.
- Las fechas pasadas se podan: se quedan las de los últimos PAST_DAYS días y siempre las últimas KEEP_LAST de cada grupo,
  para que la tarjeta pueda mostrar la última parada y la última gira.
- Si un grupo no tiene fechas futuras, el nombre de la gira se marca "(terminada)"; si llega una gira nueva por
  Ticketmaster, se toma su nombre.
- Notas (watch) de overrides: se muestran mientras el grupo está sin fechas, salvo "watch_always": true, y nunca después
  de "watch_until" (AAAA-MM-DD).
- Si la API falla, devuelve 0 eventos o falta la key, se conserva lo que ya había. Solo se escribe si algo cambió.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from status import report  # noqa: E402
EVENTS = ROOT / "events.json"
OVERRIDES = ROOT / "updater" / "overrides.json"
PLACES = ROOT / "assets" / "places-en.json"
API = "https://app.ticketmaster.com/discovery/v2/events.json"
PAST_DAYS = 270
KEEP_LAST = 8
ENDED = (" (terminada)", " (ended)")

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
    "ateez": "ATEEZ",
}

# Ticketmaster da los países en inglés; la web los guarda en español (assets/places-en.json traduce de vuelta)
COUNTRY_ES = {
    "United States Of America": "EE. UU.", "United States": "EE. UU.", "Canada": "Canadá", "Mexico": "México",
    "Brazil": "Brasil", "Argentina": "Argentina", "Chile": "Chile", "Peru": "Perú", "Colombia": "Colombia",
    "Great Britain": "Reino Unido", "United Kingdom": "Reino Unido", "Germany": "Alemania", "France": "Francia",
    "Spain": "España", "Italy": "Italia", "Netherlands": "Países Bajos", "Belgium": "Bélgica", "Switzerland": "Suiza",
    "Austria": "Austria", "Poland": "Polonia", "Sweden": "Suecia", "Denmark": "Dinamarca", "Norway": "Noruega",
    "Ireland": "Irlanda", "Portugal": "Portugal", "Australia": "Australia", "New Zealand": "Nueva Zelanda",
    "Japan": "Japón", "Korea, Republic of": "Corea del Sur", "South Korea": "Corea del Sur", "Singapore": "Singapur",
    "Thailand": "Tailandia", "Philippines": "Filipinas", "Malaysia": "Malasia", "Indonesia": "Indonesia",
    "Taiwan": "Taiwán", "Turkey": "Turquía", "United Arab Emirates": "Emiratos Árabes Unidos",
}


# barrios o suburbios donde quedan los estadios -> nombre que usa la web (assets/places-en.json lo traduce)
CITY_FIX = {
    "Docklands": "Melbourne", "Olympic Park": "Sídney", "Sydney Olympic Park": "Sídney", "Inglewood": "Inglewood (Los Ángeles)",
    "East Rutherford": "East Rutherford (Nueva York)", "Elmont": "Elmont (Nueva York)", "Newark": "Newark (Nueva York)",
    "Santa Clara": "Santa Clara (San Francisco)", "Arlington": "Arlington (Dallas)", "Frisco": "Frisco (Dallas)",
    "Foxborough": "Foxborough (Boston)", "Rosemont": "Rosemont (Chicago)", "Sunrise": "Sunrise (Miami)",
    "Paradise": "Las Vegas", "Saint-Denis": "Saint-Denis (París)", "Nanterre": "Nanterre (París)",
}
# entradas de Ticketmaster que son productos (palcos, paquetes VIP, parqueadero), no shows
NOT_A_SHOW = re.compile(r"\b(vip|packages?|suites?|box seats?|parking|hospitality|upgrades?|premium|merch)\b", re.I)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def parse(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def fetch_artist(name: str, key: str) -> list[dict]:
    out, page = [], 0
    while page < 5:
        qs = urllib.parse.urlencode({
            "apikey": key, "keyword": name, "classificationName": "music",
            "size": 100, "page": page, "sort": "date,asc",
        })
        with urllib.request.urlopen(f"{API}?{qs}", timeout=30) as r:
            body = json.load(r)
        out.extend(body.get("_embedded", {}).get("events", []))  # sin "_embedded" = 0 resultados, es normal
        if page + 1 >= body.get("page", {}).get("totalPages", 1):
            break
        page += 1
    return out


def to_event(group_id: str, name: str, ev: dict, city_es: dict) -> dict | None:
    attractions = [a.get("name", "").lower() for a in ev.get("_embedded", {}).get("attractions", [])]
    if name.lower() not in attractions:
        return None  # la búsqueda trajo otra cosa (tributos, eventos con nombre parecido)
    if NOT_A_SHOW.search(ev.get("name", "")):
        return None
    if ev.get("dates", {}).get("status", {}).get("code") in ("cancelled", "canceled", "offsale"):
        return None
    venues = ev.get("_embedded", {}).get("venues", [])
    if not venues:
        return None
    v = venues[0]
    loc = v.get("location") or {}
    start = ev.get("dates", {}).get("start", {})
    if "localDate" not in start or "latitude" not in loc:
        return None
    # hora local con su desfase (la web muestra la hora del recinto); si no hay hora, 20:00 como referencia
    tz = ev.get("dates", {}).get("timezone") or v.get("timezone")
    local = datetime.fromisoformat(f"{start['localDate']}T{start.get('localTime', '20:00:00')}")
    if tz:
        stamp = local.replace(tzinfo=ZoneInfo(tz)).isoformat()
    elif start.get("dateTime"):
        stamp = start["dateTime"].replace("Z", "+00:00")
    else:
        return None
    city = v.get("city", {}).get("name", "")
    country = v.get("country", {}).get("name", "")
    e = {
        "id": f"{group_id}-tm-{ev['id']}",
        "local_date": start["localDate"],
        "start": stamp,
        "city": CITY_FIX.get(city) or city_es.get(city, city),
        "country": COUNTRY_ES.get(country, country),
        "venue": v.get("name"),
        "lat": round(float(loc["latitude"]), 4),
        "lon": round(float(loc["longitude"]), 4),
        "status": "confirmado",
        "source": "tm",
        "tm_name": ev.get("name", ""),
    }
    sale = ev.get("sales", {}).get("public", {}).get("startDateTime")
    if sale:
        e["onsale"] = sale
    return e


def same_show(a: dict, b: dict) -> bool:
    return a["local_date"] == b["local_date"] and abs(a["lat"] - b["lat"]) < 0.3 and abs(a["lon"] - b["lon"]) < 0.3


def tour_title(names: list[str], group: str) -> str:
    """Nombre de gira a partir de los títulos de Ticketmaster ('BTS WORLD TOUR ARIRANG', 'Stray Kids: ...')."""
    best = Counter(n for n in names if n).most_common(1)
    if not best:
        return ""
    t = re.sub(re.escape(group), "", best[0][0], flags=re.I)
    t = re.sub(r"^[\s:–—-]+|[\s:–—-]+$", "", t)
    t = re.sub(r"\s*[-–|]\s*(VIP|Platinum|Official).*$", "", t, flags=re.I)
    return t.strip() or best[0][0]


def apply_notes(g: dict, ov: dict, has_upcoming: bool, today: str) -> None:
    """Notas de overrides.json. Cada nota puede ser texto o {"text": ..., "until": "AAAA-MM-DD"}: pasada esa fecha deja de salir sola,
    para que nada quede desactualizado en la web ("no hay shows en 2026" en 2027)."""
    for field in ("watch", "watch_en"):
        if field not in ov:
            continue
        expired = ov.get("watch_until") and today > ov["watch_until"]
        show = not expired and (ov.get("watch_always") or not has_upcoming)
        notes = [n if isinstance(n, str) else n.get("text", "") for n in ov[field] if isinstance(n, str) or today <= n.get("until", "9999")]
        g[field] = [n for n in notes if n] if show else []


def merge_group(g: dict, fresh: list[dict] | None, manual: list[dict], now: datetime) -> None:
    """fresh = eventos de Ticketmaster (None si la consulta falló o no hay key)."""
    events = {e["id"]: e for e in g["events"]}
    for e in manual:  # overrides: siempre ganan
        for k in [k for k, x in events.items() if k != e["id"] and same_show(x, e)]:
            del events[k]
        events[e["id"]] = e
    if fresh is not None:
        fresh_ids = {e["id"] for e in fresh}
        for k, x in list(events.items()):  # fechas de Ticketmaster que ya no salen (y siguen en el futuro): se quitan
            if x.get("source") == "tm" and k not in fresh_ids and parse(x["start"]) > now:
                del events[k]
        for e in fresh:
            dup = next((x for k, x in events.items() if k != e["id"] and x.get("source") != "tm" and same_show(x, e)), None)
            if dup:
                if e.get("onsale") and not dup.get("onsale"):
                    dup["onsale"] = e["onsale"]  # la curada se queda, pero aprovecha la fecha de venta
                continue
            events[e["id"]] = e
    ordered = sorted(events.values(), key=lambda e: e["start"])
    past = [e for e in ordered if parse(e["start"]) <= now]
    upcoming = [e for e in ordered if parse(e["start"]) > now]
    cutoff = now - timedelta(days=PAST_DAYS)
    keep_past = [e for i, e in enumerate(past) if parse(e["start"]) >= cutoff or i >= len(past) - KEEP_LAST]
    g["events"] = keep_past + upcoming

    tour = g.get("tour", "")
    if upcoming:
        tm_up = [e for e in upcoming if e.get("source") == "tm"]
        if tour.endswith(ENDED[0]) and tm_up and len(tm_up) == len(upcoming):
            # gira nueva que solo conoce Ticketmaster: se toma su nombre
            name = tour_title([e.get("tm_name", "") for e in tm_up], g.get("name", ""))
            if name:
                g["tour"] = g["tour_en"] = name
        elif tour.endswith(ENDED[0]):
            g["tour"] = tour[: -len(ENDED[0])]
            if g.get("tour_en", "").endswith(ENDED[1]):
                g["tour_en"] = g["tour_en"][: -len(ENDED[1])]
    elif tour and not tour.endswith(ENDED[0]):
        g["tour"] = tour + ENDED[0]
        g["tour_en"] = (g.get("tour_en") or tour) + ENDED[1]


def main() -> int:
    key = os.environ.get("TM_API_KEY", "").strip()
    if not key:
        print("Falta TM_API_KEY: se conservan las fechas actuales (solo se aplican overrides y la poda)", file=sys.stderr)

    data = json.loads(EVENTS.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    places = json.loads(PLACES.read_text(encoding="utf-8"))["places"] if PLACES.exists() else {}
    city_es = {en: es for es, en in places.items()}
    before = json.dumps(data["groups"], sort_keys=True)
    now = now_utc()
    today = now.strftime("%Y-%m-%d")
    auth_failed = False
    tm_ok = tm_err = 0

    for g in data["groups"]:
        name = ARTISTS.get(g["id"])
        fresh = None
        if key and name and not auth_failed:
            try:
                raw = fetch_artist(name, key)
                fresh = []
                for e in (to_event(g["id"], name, ev, city_es) for ev in raw):
                    if e and not any(same_show(e, x) for x in fresh):  # Ticketmaster repite shows con varios listados
                        fresh.append(e)
                print(f"{g['id']}: Ticketmaster trajo {len(raw)} resultados, {len(fresh)} shows del grupo")
                tm_ok += 1
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 403):
                    print(f"Ticketmaster rechazó la key ({exc.code}): revisa el secreto TM_API_KEY. Se conserva todo.", file=sys.stderr)
                    auth_failed = True
                else:
                    tm_err += 1
                    print(f"{g['id']}: Ticketmaster respondió {exc.code}, se conserva lo anterior", file=sys.stderr)
            except Exception as exc:  # noqa: BLE001
                print(f"{g['id']}: falló Ticketmaster ({exc}), se conserva lo anterior", file=sys.stderr)
                tm_err += 1
        ov = overrides.get(g["id"], {})
        merge_group(g, fresh, ov.get("events", []), now)
        apply_notes(g, ov, any(parse(e["start"]) > now for e in g["events"]), today)

    if key:
        report("ticketmaster", not auth_failed and tm_ok > 0,
               "la key fue rechazada (revisa TM_API_KEY)" if auth_failed else "" if tm_ok else f"no respondió ({tm_err} errores)")
    if json.dumps(data["groups"], sort_keys=True) == before:
        print("Sin cambios")
        return 0
    data["updated_at"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    EVENTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("events.json actualizado")
    return 0


if __name__ == "__main__":
    sys.exit(main())

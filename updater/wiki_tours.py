"""Fechas de gira desde las tablas de Wikipedia: la fuente automática para Asia, donde Ticketmaster no llega.

Uso: python updater/wiki_tours.py [--force]   (después de update_events.py y antes de auto_dates.py)

Qué hace
- Lee las páginas de gira de cada grupo (updater/wiki_tours.json) y, una vez por semana, descubre solo las giras nuevas desde la
  página índice del grupo ("List of X live performances"): si una página de gira trae fechas futuras y habla del grupo, se agrega sola.
- Por cada fecha futura de Wikipedia que la web no tiene, agrega el show a events.json con status "anunciado" (la web lo marca
  "por confirmar"), source "wiki", src (la página), time_tbd (hora sin confirmar) y verified_at.
- Un show que ya vino de Wikipedia y deja de salir en la tabla (cancelado, movido) se quita. Si la tabla lo marca cancelado, también.
- Lo cargado a mano o por otras fuentes NUNCA se borra ni se cambia: solo se le anota verified_at/verified_by cuando Wikipedia
  coincide, y cuando Wikipedia dice otra cosa (otra ciudad ese día, la fecha cancelada, o una fecha dentro de la gira que no aparece)
  se guarda en state/wiki.json ("drift") y el vigilante avisa por Discord/ntfy. Así nada queda desactualizado en silencio.
- Un grupo nunca juega dos shows el mismo día: se compara por fecha, y es el mismo show si la ciudad o las coordenadas coinciden.

Cuidados
- Wikipedia limita a quien pide mucho: se consulta como máximo cada MIN_HOURS horas, con una sola petición liviana (la versión de cada
  página) y se vuelve a bajar el texto solo de las páginas que cambiaron. Ante un 429 se espera y se conserva lo anterior.
- Si Wikipedia falla, devuelve páginas vacías o cambia de formato, no se toca nada. Si de golpe faltaran más de la mitad de las fechas
  que vinieron de Wikipedia, tampoco se quita ninguna (se avisa).
- Si no se puede ubicar una ciudad (ni en el gazetteer ni con las coordenadas de Wikipedia), la fecha no se agrega y se avisa.
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from status import report  # noqa: E402
import wikitable  # noqa: E402

EVENTS = ROOT / "events.json"
OVERRIDES = ROOT / "updater" / "overrides.json"
REGISTRY = ROOT / "updater" / "wiki_tours.json"
CITIES = ROOT / "sightings" / "cities.json"
VENUES = ROOT / "updater" / "venues.json"
STATE = ROOT / "state" / "wiki.json"
API = "https://en.wikipedia.org/w/api.php"
UA = "radar-kpop/1.0 (https://radar-kpop.vercel.app; proyecto de fans; github.com/cperez233/radar-kpop)"
MIN_HOURS = 2          # entre una consulta y la siguiente
DISCOVER_DAYS = 7      # cada cuánto se buscan giras nuevas en las páginas índice
RECHECK_DAYS = 14      # cada cuánto se vuelve a mirar una página descartada
MAX_CANDIDATES = 4     # páginas nuevas que se evalúan por corrida
KEEP_ROW_DAYS = 30     # las filas pasadas más viejas no se guardan
FAILS_BEFORE_ALERT = 3 # corridas seguidas con error antes de avisar
COUNTRY_ES = {"South Korea": "Corea del Sur", "Japan": "Japón", "Taiwan": "Taiwán", "Thailand": "Tailandia", "Philippines": "Filipinas",
              "Singapore": "Singapur", "Indonesia": "Indonesia", "Malaysia": "Malasia", "Vietnam": "Vietnam", "China": "China", "Hong Kong": "Hong Kong",
              "Macau": "Macao", "India": "India", "United States": "EE. UU.", "Canada": "Canadá", "Mexico": "México", "Brazil": "Brasil",
              "Australia": "Australia", "United Kingdom": "Reino Unido", "France": "Francia", "Germany": "Alemania", "Spain": "España",
              "Italy": "Italia", "Netherlands": "Países Bajos", "Saudi Arabia": "Arabia Saudita", "United Arab Emirates": "Emiratos Árabes Unidos",
              "New Zealand": "Nueva Zelanda", "Argentina": "Argentina", "Chile": "Chile", "Peru": "Perú", "Colombia": "Colombia"}


def norm(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFKD", s or "") if not unicodedata.combining(c)).lower()
    return re.sub(r"[\W_]+", "", s)  # conserva letras de cualquier alfabeto (hangul, kana) para que no choquen claves vacías


def hav(lat1, lon1, lat2, lon2) -> float:
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def parse_ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def iso(d: datetime) -> str:
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------- Wikipedia ----------

class Wiki:
    """Cliente mínimo de la API de Wikipedia con pausa entre peticiones y espera ante 429. Falla en silencio devolviendo None."""

    def __init__(self, budget: int = 30, pause: float = 2.0):
        self.budget, self.pause, self.errors = budget, pause, 0

    def api(self, **params) -> dict | None:
        url = API + "?" + urllib.parse.urlencode({"format": "json", "formatversion": 2, "redirects": 1, **params})
        for attempt in range(3):
            if self.budget <= 0:
                return None
            self.budget -= 1
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                    body = json.load(r)
                time.sleep(self.pause)
                return body
            except urllib.error.HTTPError as exc:
                self.errors += 1
                wait = int(exc.headers.get("Retry-After", 0) or 0) if exc.code == 429 else 0
                print(f"Wikipedia respondió {exc.code}" + (f", espera {wait or 10 * (attempt + 1)} s" if exc.code == 429 else ""), file=sys.stderr)
                if exc.code != 429:
                    return None
                time.sleep(min(60, wait or 10 * (attempt + 1)))
            except Exception as exc:  # noqa: BLE001
                self.errors += 1
                print(f"Wikipedia falló ({exc})", file=sys.stderr)
                return None
        return None

    def revisions(self, titles: list[str], content: bool) -> dict[str, dict]:
        """{título pedido: {"title", "revid", "text"?}} (sigue redirecciones; las páginas que no existen no salen)."""
        out: dict[str, dict] = {}
        step = 5 if content else 40
        for i in range(0, len(titles), step):
            chunk = titles[i:i + step]
            body = self.api(action="query", prop="revisions", rvprop="ids|content" if content else "ids", rvslots="main", titles="|".join(chunk))
            if not body:
                continue
            q = body.get("query", {})
            alias = {}
            for k in ("normalized", "redirects"):
                for m in q.get(k, []):
                    alias[m["from"]] = m["to"]
            pages = {p["title"]: p for p in q.get("pages", []) if not p.get("missing") and p.get("revisions")}
            for t in chunk:
                final = t
                for _ in range(3):
                    final = alias.get(final, final)
                p = pages.get(final)
                if p:
                    rev = p["revisions"][0]
                    out[t] = {"title": p["title"], "revid": rev["revid"]}
                    if content:
                        out[t]["text"] = rev.get("slots", {}).get("main", {}).get("content", "")
        return out

    def coords(self, titles: list[str]) -> dict[str, tuple[float, float] | None]:
        out: dict[str, tuple[float, float] | None] = {}
        for i in range(0, len(titles), 40):
            chunk = titles[i:i + 40]
            body = self.api(action="query", prop="coordinates", coprimary="primary", colimit="max", titles="|".join(chunk))
            if not body:
                continue
            q = body.get("query", {})
            alias = {}
            for k in ("normalized", "redirects"):
                for m in q.get(k, []):
                    alias[m["from"]] = m["to"]
            got = {p["title"]: p for p in q.get("pages", [])}
            for t in chunk:
                p = got.get(alias.get(alias.get(t, t), alias.get(t, t)))
                c = (p or {}).get("coordinates")
                out[t] = (round(c[0]["lat"], 4), round(c[0]["lon"], 4)) if c else None
        return out


# ---------- ubicar ciudades ----------

class Gazetteer:
    def __init__(self):
        cities = json.loads(CITIES.read_text(encoding="utf-8"))["cities"]
        venues = json.loads(VENUES.read_text(encoding="utf-8"))["venues"]
        self.cities = cities
        self.by_city = {c["city"]: c for c in cities}
        self.cmap, self.vmap = {}, {}
        for c in cities:
            for n in c["names"] + [c["city"]]:
                if norm(n):
                    self.cmap.setdefault(norm(n), c)
        for v in venues:
            c = self.by_city.get(v["city"])
            if c:
                for n in v["match"] + [v["name"]]:
                    if norm(n):
                        self.vmap.setdefault(norm(n), (v, c))

    def lookup(self, row: dict) -> dict | None:
        """Ubicación de una fila sin pedir nada a Wikipedia: recinto conocido, o ciudad conocida."""
        for part in re.split(r"\s*/\s*", row.get("venue") or ""):
            hit = self.vmap.get(norm(part)) if norm(part) else None
            if hit:
                v, c = hit
                return {"city": c["city"], "country": c["country"], "lat": v["lat"], "lon": v["lon"], "tz": c.get("tz"), "venue": v["name"]}
        c = self.cmap.get(norm(row.get("city", ""))) if norm(row.get("city", "")) else None
        if c:
            return {"city": c["city"], "country": c["country"], "lat": c["lat"], "lon": c["lon"], "tz": c.get("tz"), "venue": row.get("venue")}
        return None

    def from_coords(self, row: dict, lat: float, lon: float) -> dict | None:
        """Ciudad nueva con las coordenadas de Wikipedia; la zona horaria es la de la ciudad conocida más cercana (< 1500 km)."""
        best = min(self.cities, key=lambda c: hav(lat, lon, c["lat"], c["lon"]))
        if not best.get("tz") or hav(lat, lon, best["lat"], best["lon"]) > 1500:
            return None
        return {"city": row["city"], "country": COUNTRY_ES.get(row.get("country", ""), row.get("country", "")), "lat": lat, "lon": lon,
                "tz": best["tz"], "venue": row.get("venue")}


# ---------- reconciliar ----------

def same_place(e: dict, g: dict) -> bool:
    if abs(e["lat"] - g["lat"]) < 0.3 and abs(e["lon"] - g["lon"]) < 0.3:
        return True
    return norm(e["city"].split(" (")[0]) == norm(g["city"].split(" (")[0])


def make_event(gid: str, row: dict, geo: dict, page: str, now: datetime) -> dict:
    d = date.fromisoformat(row["date"])
    tz = ZoneInfo(geo["tz"])
    key = re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", geo["city"]).encode("ascii", "ignore").decode().lower())[:14] or "x"
    return {
        "id": f"{gid}-wiki-{d:%Y%m%d}-{key}", "local_date": row["date"], "start": datetime(d.year, d.month, d.day, 18, 0, tzinfo=tz).isoformat(),
        "city": geo["city"], "country": geo["country"], "venue": geo.get("venue"), "lat": round(geo["lat"], 4), "lon": round(geo["lon"], 4),
        "status": "anunciado", "source": "wiki", "src": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(page.replace(" ", "_")),
        "src_kind": "wiki", "time_tbd": True, "verified_at": iso(now),
    }


def reconcile(g: dict, rows: list[dict], geo_of, page_of, now: datetime, ignore: set[str]) -> dict:
    """Aplica las filas de Wikipedia de un grupo a g["events"]. Devuelve {"added", "removed", "verified", "drift", "unplaced"}."""
    out = {"added": [], "removed": [], "verified": 0, "drift": [], "unplaced": []}
    today = now.date().isoformat()
    by_date: dict[str, dict] = {}
    for r in rows:
        if r["date"] >= today:
            by_date.setdefault(r["date"], r)  # una fecha por día: un grupo no toca dos veces el mismo día
    live = {d: r for d, r in by_date.items() if not r["cancelled"]}
    cancelled = {d for d, r in by_date.items() if r["cancelled"]}
    existing = {e["local_date"]: e for e in g["events"]}
    name = g.get("name", g["id"])

    for d, r in sorted(live.items()):
        geo = geo_of(r)
        e = existing.get(d)
        if e:
            if geo and not same_place(e, geo):
                out["drift"].append(f"{name} {d}: la web dice {e['city']} y Wikipedia dice {r['city']}")
            elif e.get("verified_by") != "wiki" or e.get("source") == "wiki":
                e["verified_by"], e["verified_at"] = "wiki", iso(now)
                out["verified"] += 1
            continue
        if not geo or not geo.get("tz"):
            out["unplaced"].append(f"{name} {d} {r['city']}")
            continue
        # misma ciudad que otro show del grupo: se llama igual (la web agrupa las paradas por el nombre de la ciudad)
        twin = next((x for x in g["events"] if abs(x["lat"] - geo["lat"]) < 0.3 and abs(x["lon"] - geo["lon"]) < 0.3), None)
        if twin:
            geo = {**geo, "city": twin["city"], "country": twin["country"], "venue": twin.get("venue") or geo.get("venue"), "lat": twin["lat"], "lon": twin["lon"]}
        ev = make_event(g["id"], r, geo, page_of(r), now)
        if ev["id"] in ignore:
            continue
        g["events"].append(ev)
        out["added"].append(f"{name} {d} {geo['city']}")

    wiki_n = sum(1 for e in g["events"] if e.get("source") == "wiki" and e["local_date"] >= today)
    gone = [e for e in g["events"] if e.get("source") == "wiki" and parse_ts(e["start"]) > now and e["local_date"] not in live]
    if gone and wiki_n and len(gone) > wiki_n / 2 and wiki_n >= 4:
        out["drift"].append(f"{name}: Wikipedia dejó de listar {len(gone)} de {wiki_n} fechas suyas; no se quitó ninguna")
    else:
        for e in gone:
            g["events"].remove(e)
            out["removed"].append(f"{name} {e['local_date']} {e['city']}")

    live_future = sorted(live)
    for e in g["events"]:
        if e.get("source") == "wiki" or parse_ts(e["start"]) <= now or e["local_date"] in live:
            continue
        d = e["local_date"]
        if d in cancelled:
            out["drift"].append(f"{name} {d} {e['city']}: Wikipedia lo marca cancelado o pospuesto")
        elif any(norm(r["city"]) == norm(e["city"].split(" (")[0]) for r in live.values()):
            out["drift"].append(f"{name} {d} {e['city']}: Wikipedia tiene otras fechas en esa ciudad y no esta (¿se movió?)")
        elif live_future and live_future[0] < d < live_future[-1]:
            out["drift"].append(f"{name} {d} {e['city']}: cae dentro de la gira y Wikipedia no la lista (¿se canceló?)")
    g["events"].sort(key=lambda x: x["start"])
    return out


# ---------- descubrir giras nuevas ----------

def candidate_titles(index_text: str, known: set[str]) -> list[str]:
    """Enlaces a páginas de gira del índice del grupo, de los más recientes (al final de la página) a los más viejos."""
    seen, out = set(), []
    for m in re.finditer(r"\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]", index_text):
        t = m.group(1).strip()
        if re.search(r"\btour\b|tour$", t, re.I) and t not in seen and norm(t) not in known and not t.lower().startswith(("list of", "category", "file")):
            seen.add(t)
            out.append(t)
    return out[::-1]


def about_group(text: str, names: list[str]) -> bool:
    lead = text[:6000]
    return any(re.search(r"\b" + re.escape(n) + r"\b", lead, re.I) for n in names)


# ---------- principal ----------

def load_state() -> dict:
    try:
        return json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    except ValueError:
        return {}


def run(now: datetime, wiki: Wiki, force: bool = False, write: bool = True) -> int:
    state = load_state()
    if not force and state.get("last_run") and now - parse_ts(state["last_run"]) < timedelta(hours=MIN_HOURS):
        print("Wikipedia: se consultó hace menos de %d h, se espera" % MIN_HOURS)
        return 0
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))["groups"]
    data = json.loads(EVENTS.read_text(encoding="utf-8"))
    ov = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    ignore = set(ov.get("ignore_auto", []))
    pages: dict = state.setdefault("pages", {})
    discovered: dict = state.setdefault("discovered", {})
    rejected: dict = state.setdefault("rejected", {})
    today = now.date()
    keep_from = (today - timedelta(days=KEEP_ROW_DAYS)).isoformat()

    def refresh(titles: list[str]) -> bool:
        """Baja el texto solo de las páginas cuya versión cambió. Devuelve False si Wikipedia no respondió."""
        titles = [t for t in dict.fromkeys(titles)]
        if not titles:
            return True
        vers = wiki.revisions(titles, content=False)
        if not vers and titles:
            return False
        stale = [t for t in titles if t in vers and pages.get(t, {}).get("revid") != vers[t]["revid"]]
        if stale:
            got = wiki.revisions(stale, content=True)
            for t, info in got.items():
                rows = [r for r in wikitable.parse_tables(info.get("text", "")) if r["date"] >= keep_from]
                pages[t] = {"title": info["title"], "revid": info["revid"], "fetched": iso(now), "rows": rows}
                print(f"  {info['title']}: {len(rows)} fechas")
        for t in titles:
            if t not in vers:
                pages.pop(t, None)  # ya no existe
        return True

    ok = True
    # 1) giras nuevas: una vez por semana, desde la página índice de cada grupo
    last_disc = state.get("last_discovery")
    if force or not last_disc or now - parse_ts(last_disc) >= timedelta(days=DISCOVER_DAYS):
        known = {norm(t) for r in registry.values() for t in r.get("pages", [])} | {norm(t) for v in discovered.values() for t in v}
        for gid, reg in registry.items():
            if not reg.get("index"):
                continue
            idx = wiki.revisions(reg["index"], content=True)
            if not idx:
                ok = False
                continue
            cands = []
            for info in idx.values():
                cands += candidate_titles(info.get("text", ""), known)
            fresh = [t for t in cands if not rejected.get(t) or now - parse_ts(rejected[t]) >= timedelta(days=RECHECK_DAYS)][:MAX_CANDIDATES]
            got = wiki.revisions(fresh, content=True) if fresh else {}
            for t in fresh:
                info = got.get(t)
                rows = [r for r in wikitable.parse_tables(info["text"])] if info else []
                if info and about_group(info["text"], reg.get("names", [])) and any(r["date"] >= today.isoformat() for r in rows):
                    discovered.setdefault(gid, []).append(info["title"])
                    known.add(norm(info["title"]))
                    pages[info["title"]] = {"title": info["title"], "revid": info["revid"], "fetched": iso(now), "rows": [r for r in rows if r["date"] >= keep_from]}
                    print(f"  gira nueva de {gid}: {info['title']}")
                    rejected.pop(t, None)
                else:
                    rejected[t] = iso(now)
        if ok:
            state["last_discovery"] = iso(now)

    # 2) páginas de cada grupo: las conocidas y las descubiertas
    wanted = {gid: list(dict.fromkeys(reg.get("pages", []) + discovered.get(gid, []))) for gid, reg in registry.items()}
    ok = refresh([t for ts in wanted.values() for t in ts]) and ok

    # 3) ubicar lo que falte: gazetteer y, si no, coordenadas de Wikipedia (una petición por lote)
    gaz = Gazetteer()
    coords: dict = state.setdefault("coords", {})
    need: list[str] = []
    for gid, ts in wanted.items():
        for t in ts:
            for r in pages.get(t, {}).get("rows", []):
                if r["date"] >= today.isoformat() and not r["cancelled"] and not gaz.lookup(r):
                    for link in (r.get("venue_link"), r.get("city_link")):
                        if link and link not in coords and link not in need:
                            need.append(link)
    if need:
        coords.update(wiki.coords(need))

    def geo_of(r: dict) -> dict | None:
        g = gaz.lookup(r)
        if g:
            return g
        for link in (r.get("venue_link"), r.get("city_link")):
            c = coords.get(link) if link else None
            if c:
                return gaz.from_coords(r, c[0], c[1])
        return None

    # 4) reconciliar grupo por grupo
    before = json.dumps(data["groups"], sort_keys=True)
    added, removed, drift, unplaced, verified = [], [], [], [], 0
    sources = data.setdefault("sources", [])
    for g in data["groups"]:
        ts = [t for t in wanted.get(g["id"], []) if t in pages]
        rows, page_of = [], {}
        for t in ts:
            for r in pages[t]["rows"]:
                rows.append(r)
                page_of.setdefault((r["date"], r["city"]), pages[t]["title"])
        if not rows:
            continue
        res = reconcile(g, rows, geo_of, lambda r, p=page_of, d=ts[0]: p.get((r["date"], r["city"]), pages[d]["title"]), now, ignore)
        added += res["added"]; removed += res["removed"]; drift += res["drift"]; unplaced += res["unplaced"]; verified += res["verified"]
        for t in ts:
            url = "https://en.wikipedia.org/wiki/" + urllib.parse.quote(pages[t]["title"].replace(" ", "_"))
            if any(e.get("source") == "wiki" for e in g["events"]) and not any(s.get("url") == url for s in sources):
                sources.append({"name": "Wikipedia, " + pages[t]["title"], "name_en": "Wikipedia, " + pages[t]["title"], "url": url})

    # 5) estado, avisos y escritura
    state["drift"] = drift
    state["last_run"] = iso(now)
    state["fails"] = 0 if ok else state.get("fails", 0) + 1
    if write:
        report("wiki", ok or state["fails"] < FAILS_BEFORE_ALERT, "" if ok or state["fails"] < FAILS_BEFORE_ALERT else "Wikipedia no respondió varias veces seguidas (se conserva lo anterior)")
        report("fechas_manuales", not drift and not unplaced,
               "" if not (drift or unplaced) else "; ".join((drift + ["sin ubicar: " + u for u in unplaced])[:3]) + (f" (+{len(drift) + len(unplaced) - 3} más)" if len(drift) + len(unplaced) > 3 else ""))
    if json.dumps(data["groups"], sort_keys=True) != before:
        data["updated_at"] = iso(now)
        if write:
            EVENTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wikipedia: {len(added)} fechas nuevas, {len(removed)} quitadas, {verified} verificadas, {len(drift)} diferencias, {len(unplaced)} sin ubicar")
    for lbl, items in (("nueva", added), ("quitada", removed), ("diferencia", drift), ("sin ubicar", unplaced)):
        for x in items:
            print(f"  {lbl}: {x}")
    if write:
        STATE.parent.mkdir(parents=True, exist_ok=True)
        STATE.write_text(json.dumps(state, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    return 0


def main() -> int:
    try:
        return run(datetime.now(timezone.utc), Wiki(), force="--force" in sys.argv)
    except Exception as exc:  # noqa: BLE001  (un fallo aquí nunca debe frenar al resto del robot)
        print(f"wiki_tours falló: {exc!r}", file=sys.stderr)
        return 0


if __name__ == "__main__":
    sys.exit(main())

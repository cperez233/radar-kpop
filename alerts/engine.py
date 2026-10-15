"""Motor de alertas del radar K-pop.

Corre cada pocos minutos (GitHub Action). En cada pasada:
  1. Compara events.json con la foto anterior: fechas nuevas, quitadas o cambiadas.
  2. Mira el reloj contra la agenda: llegada a una ciudad, siguiente parada, show por empezar.
  3. Revisa noticias y videos: comebacks, giras, anuncios para Latinoamerica.
  4. Para cada suscriptor con ciudad: aviso cuando se anuncia un show cerca y recordatorios de 7 d, 24 h y 3 h.
  5. Envia por Discord (canal y DM) y WhatsApp, sin repetir nada que ya salio.

Importante: "llegar" y "moverse" salen de la agenda oficial (dia del show y fin del show), no de ubicacion en vivo.

Variables de entorno (todas opcionales; sin ellas corre en modo prueba):
  DISCORD_WEBHOOK_URL, DISCORD_BOT_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID,
  WHATSAPP_TEMPLATE (por defecto radar_alerta), SUBSCRIBERS_JSON, DRY_RUN=1, NOW=2026-10-16T12:00:00Z,
  SUBSCRIBERS_URL y SUBSCRIBERS_TOKEN (lista de suscriptores del servidor de backend/, se suma a SUBSCRIBERS_JSON),
  VAPID_PRIVATE_KEY y VAPID_SUBJECT (notificaciones push, con pywebpush instalado)
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import channels  # noqa: E402
import news  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
EVENTS = ROOT / "events.json"
FEEDS = ROOT / "alerts" / "feeds.json"
STATE = ROOT / "state" / "state.json"
FEED_OUT = ROOT / "alerts.json"

SHOW_H = 4
KEEP_DAYS = 45
FEED_MAX = 60
DEFAULT_WA = {"prox", "prox_new", "stop_today", "live", "latam", "arrival_official", "arrival"}
MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


# ---------- utilidades ----------

def dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def hav(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    k = math.pi / 180
    dp, dl = (lat2 - lat1) * k, (lon2 - lon1) * k
    a = math.sin(dp / 2) ** 2 + math.cos(lat1 * k) * math.cos(lat2 * k) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def day_label(ld: str) -> str:
    y, m, d = (int(x) for x in ld.split("-"))
    return f"{d} {MONTHS[m - 1]}" + (f" {y}" if y != 2026 else "")


def dates_label(evs: list[dict]) -> str:
    return ", ".join(day_label(e["local_date"]) for e in evs)


def km(n: float) -> str:
    return f"{round(n):,}".replace(",", ".")


def mk(kind: str, key: str, group: dict, title: str, body: str, when: datetime, **extra) -> dict:
    a = {"key": key, "type": kind, "group": group["id"], "group_name": group["name"], "title": title, "body": body, "when": iso(when)}
    a.update(extra)
    return a


def prep(group: dict) -> list[dict]:
    evs = [dict(e, _t=dt(e["start"])) for e in group["events"]]
    return sorted(evs, key=lambda e: e["_t"])


def stops(evs: list[dict]) -> list[list[dict]]:
    """Agrupa shows consecutivos en la misma ciudad: cada grupo de esos es una parada."""
    out: list[list[dict]] = []
    for e in evs:
        if out and out[-1][0]["city"] == e["city"]:
            out[-1].append(e)
        else:
            out.append([e])
    return out


# ---------- 1. cambios en la agenda ----------

def snapshot(data: dict) -> dict:
    return {
        e["id"]: {"g": g["id"], "d": e["local_date"], "s": e["start"], "c": e["city"], "v": e["venue"]}
        for g in data["groups"] for e in g["events"]
    }


def diff_events(old: dict, data: dict, now: datetime) -> list[dict]:
    alerts: list[dict] = []
    for g in data["groups"]:
        evs = prep(g)
        new_by_city: dict[str, list[dict]] = {}
        for e in evs:
            if e["id"] not in old and e["_t"] > now:
                new_by_city.setdefault(e["city"], []).append(e)
            elif e["id"] in old:
                o = old[e["id"]]
                if (o["d"], o["s"], o["c"], o["v"]) != (e["local_date"], e["start"], e["city"], e["venue"]) and e["_t"] > now:
                    h = hashlib.sha1(json.dumps([e["local_date"], e["start"], e["city"], e["venue"]]).encode()).hexdigest()[:8]
                    alerts.append(mk(
                        "changed", f"chg:{e['id']}:{h}", g, f"{g['name']} cambió su show en {e['city']}",
                        f"Antes: {day_label(o['d'])} en {o['c']}" + (f" ({o['v']})" if o["v"] else "") +
                        f". Ahora: {day_label(e['local_date'])} en {e['city']}" + (f" ({e['venue']})" if e["venue"] else "") + ".",
                        now, places=[{"lat": e["lat"], "lon": e["lon"], "city": e["city"]}],
                    ))
        for city, es in new_by_city.items():
            alerts.append(mk(
                "new_date", f"new:{g['id']}:{es[0]['id']}", g, f"{g['name']} agregó fechas en {city}",
                f"{dates_label(es)}" + (f" en {es[0]['venue']}" if es[0]["venue"] else "") + f", {es[0]['country']}.",
                now, places=[{"lat": es[0]["lat"], "lon": es[0]["lon"], "city": city}],
            ))
    current = {e["id"] for g in data["groups"] for e in g["events"]}
    names = {g["id"]: g["name"] for g in data["groups"]}
    gmap = {g["id"]: g for g in data["groups"]}
    for eid, o in old.items():
        if eid not in current and dt(o["s"]) > now and o["g"] in gmap:
            alerts.append(mk(
                "removed", f"gone:{eid}", gmap[o["g"]], f"{names[o['g']]} quitó {o['c']} de la agenda",
                f"La fecha del {day_label(o['d'])} ya no aparece en las fuentes. Puede ser cancelación o cambio, confirma en la boletería.", now,
            ))
    return alerts


# ---------- 2. reloj contra la agenda ----------

def time_alerts(data: dict, now: datetime) -> list[dict]:
    alerts: list[dict] = []
    for g in data["groups"]:
        sts = stops(prep(g))
        for i, st in enumerate(sts):
            first, last = st[0], st[-1]
            end = last["_t"] + timedelta(hours=SHOW_H)
            place = {"lat": first["lat"], "lon": first["lon"], "city": first["city"]}
            where = f"{first['venue']}, {first['city']}" if first["venue"] else first["city"]

            local_now = now.astimezone(first["_t"].tzinfo)
            if local_now.date().isoformat() == first["local_date"] and local_now.hour >= 8 and now < end:
                alerts.append(mk(
                    "stop_today", f"today:{g['id']}:{first['id']}", g, f"Hoy {g['name']} abre en {first['city']}",
                    f"{where}. Hora aproximada, confirma en la boletería.", now, places=[place],
                ))
            for e in st:
                if e["_t"] - timedelta(minutes=45) <= now < e["_t"] + timedelta(hours=SHOW_H):
                    alerts.append(mk(
                        "live", f"live:{e['id']}", g, f"{g['name']} sube al escenario en {e['city']}",
                        f"{where}. Hora aproximada, el show puede arrancar un poco antes o después.", now, places=[place],
                    ))
            if now >= end and now < end + timedelta(hours=24) and i + 1 < len(sts):
                nxt = sts[i + 1]
                hop = hav(last["lat"], last["lon"], nxt[0]["lat"], nxt[0]["lon"])
                alerts.append(mk(
                    "next_stop", f"next:{g['id']}:{last['id']}", g, f"{g['name']} sigue a {nxt[0]['city']}",
                    f"Cerró en {last['city']}. Siguiente parada: {nxt[0]['city']}, {nxt[0]['country']} ({dates_label(nxt)}), a unos {km(hop)} km.",
                    now, places=[{"lat": nxt[0]["lat"], "lon": nxt[0]["lon"], "city": nxt[0]["city"]}],
                ))
    return alerts


# ---------- 3. noticias y videos ----------

CITY_ALIASES = {
    "londres": ["london"], "viena": ["vienna", "wien"], "edimburgo": ["edinburgh"], "yakarta": ["jakarta"],
    "taipei": ["taipei"], "singapur": ["singapore"], "sidney": ["sydney"], "tokio": ["tokyo"], "milan": ["milano"],
    "zurich": ["zurich"], "paris": ["paris"], "kaohsiung": ["kaohsiung"], "seul": ["seoul"], "la plata": ["buenos aires"],
}


def norm(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def city_names(city: str) -> list[str]:
    base = norm(city.split("(")[0].strip())
    return [base] + CITY_ALIASES.get(base, [])


def active_places(g: dict, now: datetime) -> list[str]:
    """Ciudades de las paradas que empiezan en menos de 72 h o estan en curso: ahi tiene sentido un 'llegamos'."""
    out = []
    for st in stops(prep(g)):
        if st[0]["_t"] - timedelta(hours=72) <= now < st[-1]["_t"] + timedelta(hours=SHOW_H):
            out.append(st[0]["city"])
    return out


def short(s: str, n: int = 140) -> str:
    s = " ".join(s.split())
    return s if len(s) <= n else s[: n - 1] + "…"


def news_alerts(items: list[dict], seen: set, data: dict, now: datetime, bootstrap: bool) -> list[dict]:
    gmap = {g["id"]: g for g in data["groups"]}
    alerts = []
    for it in items:
        if it["id"] in seen or it["group"] not in gmap or bootstrap:
            continue
        g = gmap[it["group"]]
        if it["kind"] == "social":
            text = norm(it["text"])
            hit = next((c for c in active_places(g, now) if any(n in text for n in city_names(c))), None)
            if hit:
                title = f"Posible llegada de {g['name']} a {hit}"
            elif news.ARRIVAL.search(it["text"]):
                title = f"{g['name']} avisó que llegó"
            else:
                continue
            alerts.append(mk("arrival_official", f"news:{it['id']}", g, title,
                             f"Lo publicó {it['source']}: «{short(it['title'])}». Salió de su cuenta oficial.", now, url=it["link"]))
            continue
        label = {"arrival": "Llegada reportada", "latam": "Latinoamérica", "comeback": "Comeback", "tour": "Gira", "video": "Nuevo video"}[it["kind"]]
        body = f"{short(it['title'])} ({it['source']})"
        if it["kind"] == "arrival":
            body += ". Lo reporta la prensa, no es confirmación oficial."
        alerts.append(mk(it["kind"], f"news:{it['id']}", g, f"{label}: {g['name']}", body, now, url=it["link"]))
    return alerts


# ---------- 4. alertas por suscriptor ----------

def follows(sub: dict, group_id: str) -> bool:
    gs = sub.get("groups", ["*"])
    return "*" in gs or group_id in gs


def near(sub: dict, place: dict) -> float | None:
    if "lat" not in sub or not sub.get("radius_km"):
        return None
    d = hav(sub["lat"], sub["lon"], place["lat"], place["lon"])
    return d if d <= sub["radius_km"] else None


def subscriber_alerts(data: dict, new_alerts: list[dict], subs: list[dict], now: datetime) -> list[dict]:
    out: list[dict] = []
    gmap = {g["id"]: g for g in data["groups"]}
    for a in new_alerts:
        if a["type"] != "new_date":
            continue
        for s in subs:
            d = near(s, a["places"][0]) if follows(s, a["group"]) else None
            if d is not None:
                out.append(mk("prox_new", f"{a['key']}:{s['id']}", gmap[a["group"]],
                              f"{a['group_name']} anunció un show cerca de ti", f"{a['places'][0]['city']}, a {km(d)} km. {a['body']}", now, sub=s["id"]))
    for g in data["groups"]:
        for st in stops(prep(g)):
            first = st[0]
            place = {"lat": first["lat"], "lon": first["lon"], "city": first["city"]}
            for s in subs:
                d = near(s, place) if follows(s, g["id"]) else None
                if d is None:
                    continue
                due = [(h, lab) for h, lab in ((3, "en menos de 3 horas"), (24, "en menos de 24 horas"), (168, "en menos de 7 días")) if first["_t"] - timedelta(hours=h) <= now < first["_t"]]
                if due:  # solo el hito mas cercano, para no mandar tres avisos juntos
                    h, lab = due[0]
                    out.append(mk("prox", f"prox{h}:{s['id']}:{first['id']}", g, f"{g['name']} toca {lab} cerca de ti",
                                  f"{first['city']}, a {km(d)} km. {dates_label(st)}.", now, sub=s["id"]))
    return out


# ---------- 5. entrega ----------

def wants(sub: dict, field: str, alert: dict, default: set | None = None) -> bool:
    types = sub.get(field)
    if types is None:
        return default is None or alert["type"] in default
    return "*" in types or alert["type"] in types


def deliver(alerts: list[dict], subs: list[dict], state: dict, dry: bool) -> int:
    sent: dict = state.setdefault("sent", {})
    stamp = iso(datetime.now(timezone.utc))
    count = 0
    webhook, token = os.environ.get("DISCORD_WEBHOOK_URL"), os.environ.get("DISCORD_BOT_TOKEN")
    wa_token, wa_phone = os.environ.get("WHATSAPP_TOKEN"), os.environ.get("WHATSAPP_PHONE_ID")
    template = os.environ.get("WHATSAPP_TEMPLATE", "radar_alerta")

    def once(key: str, fn) -> None:
        nonlocal count
        if key in sent:
            return
        if fn():
            sent[key] = stamp
            count += 1

    for a in alerts:
        if not a.get("sub"):
            once(f"{a['key']}|canal", lambda a=a: channels.send_discord_webhook(webhook, a, dry))
        for s in subs:
            if a.get("sub") and a["sub"] != s["id"]:
                continue
            if not a.get("sub") and not follows(s, a["group"]):
                continue
            if s.get("discord_user_id") and wants(s, "types", a):
                once(f"{a['key']}|dc:{s['id']}", lambda a=a, s=s: channels.send_discord_dm(token, s["discord_user_id"], a, dry))
            if s.get("whatsapp") and s.get("whatsapp_opt_in") and wants(s, "whatsapp_types", a, DEFAULT_WA):
                once(f"{a['key']}|wa:{s['id']}", lambda a=a, s=s: channels.send_whatsapp(wa_token, wa_phone, s["whatsapp"], template, a, dry))
            if s.get("push") and wants(s, "types", a):
                once(f"{a['key']}|push:{s['id']}", lambda a=a, s=s: channels.send_webpush(s, a, dry))
    return count


# ---------- principal ----------

def remote_subscribers() -> list[dict]:
    """Suscriptores guardados por el servidor de backend/ (GET /subscribers con token). Si falla, sigue sin ellos."""
    url, token = os.environ.get("SUBSCRIBERS_URL"), os.environ.get("SUBSCRIBERS_TOKEN")
    if not url or not token:
        return []
    import urllib.request  # noqa: PLC0415
    try:
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "User-Agent": "radar-kpop"})
        with urllib.request.urlopen(req, timeout=20) as r:
            body = json.load(r)
        return [s for s in body.get("subscribers", []) if isinstance(s, dict) and s.get("id")]
    except Exception as exc:  # noqa: BLE001
        print(f"No se pudo leer SUBSCRIBERS_URL: {exc}", file=sys.stderr)
        return []


def load_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def main() -> int:
    dry = os.environ.get("DRY_RUN") == "1"
    now = dt(os.environ["NOW"]) if os.environ.get("NOW") else datetime.now(timezone.utc)
    data = load_json(EVENTS, None)
    if not data:
        print("No hay events.json", file=sys.stderr)
        return 1
    state = load_json(STATE, {})
    subs = json.loads(os.environ["SUBSCRIBERS_JSON"]) if os.environ.get("SUBSCRIBERS_JSON") else []
    subs += remote_subscribers()
    feeds = load_json(FEEDS, {})

    bootstrap = "snapshot" not in state  # primera corrida: guardar la foto sin avisar fechas "nuevas"
    alerts: list[dict] = [] if bootstrap else diff_events(state["snapshot"], data, now)
    alerts += time_alerts(data, now)

    seen = set(state.get("news_seen", []))
    items = news.collect(feeds, now) if feeds and not os.environ.get("NO_NEWS") else []
    alerts += news_alerts(items, seen, data, now, "news_seen" not in state)
    seen |= {i["id"] for i in items}

    alerts += subscriber_alerts(data, alerts, subs, now)

    sent_before = set(state.get("sent", {}))
    n = deliver(alerts, subs, state, dry)
    print(f"{len(alerts)} alertas candidatas, {n} envíos nuevos" + (" (modo prueba, no se guarda estado)" if dry else ""))

    if dry:
        return 0

    cutoff = iso(datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS))
    state["sent"] = {k: v for k, v in state.get("sent", {}).items() if v >= cutoff}
    state["snapshot"] = snapshot(data)
    state["news_seen"] = sorted(seen)[-800:]
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    fresh = [a for a in alerts if not a.get("sub") and f"{a['key']}|canal" in state["sent"] and f"{a['key']}|canal" not in sent_before]
    if fresh or not FEED_OUT.exists():
        feed = load_json(FEED_OUT, {"alerts": []})["alerts"]
        public = [{k: a.get(k) for k in ("type", "group", "group_name", "title", "body", "when", "url")} for a in fresh]
        FEED_OUT.write_text(json.dumps({"updated_at": iso(now), "alerts": (public + feed)[:FEED_MAX]}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())

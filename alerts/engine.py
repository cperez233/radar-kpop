"""Motor de alertas del radar K-pop.

Corre cada pocos minutos (GitHub Action). En cada pasada:
  1. Compara events.json con la foto anterior: fechas nuevas, quitadas o cambiadas.
  2. Mira el reloj contra la agenda: llegada a una ciudad, siguiente parada, show por empezar.
  3. Revisa noticias y videos: comebacks, giras, anuncios para Latinoamerica.
  4. Para cada suscriptor con ciudad: aviso cuando se anuncia un show cerca y recordatorios de 7 d, 24 h y 3 h.
  5. Envia por Discord (canal y DM), ntfy, WhatsApp y push, sin repetir nada que ya salio.

Importante: "llegar" y "moverse" salen de la agenda oficial (dia del show y fin del show), no de ubicacion en vivo.

Variables de entorno (todas opcionales; sin ellas corre en modo prueba):
  DISCORD_WEBHOOK_URL, DISCORD_BOT_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID,
  WHATSAPP_TEMPLATE (por defecto radar_alerta), SUBSCRIBERS_JSON, DRY_RUN=1, NOW=2026-10-16T12:00:00Z,
  SUBSCRIBERS_URL y SUBSCRIBERS_TOKEN (lista de suscriptores del servidor de backend/, se suma a SUBSCRIBERS_JSON),
  VAPID_PRIVATE_KEY y VAPID_SUBJECT (notificaciones push, con pywebpush instalado),
  NTFY_TOPIC (push al celular con la app ntfy; NTFY_SERVER si usas otro servidor que ntfy.sh)
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import os
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import channels  # noqa: E402
import news  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from status import report  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
EVENTS = ROOT / "events.json"
FEEDS = ROOT / "alerts" / "feeds.json"
STATE = ROOT / "state" / "state.json"
FEED_OUT = ROOT / "alerts.json"
PEOPLE = ROOT / "assets" / "people.json"  # cumpleaños y redes de cada miembro
MEDIA = ROOT / "media.json"
KST = timezone(timedelta(hours=9))
BOGOTA = timezone(timedelta(hours=-5))

SHOW_H = 4
# nombres alternativos de cada grupo, para que "Stray Kids" o "방탄소년단" no cuenten como tema
META_NAMES = {"bts": ["bangtan", "방탄소년단"], "skz": ["stray", "kids", "스트레이키즈"], "twice": ["트와이스"], "blackpink": ["블랙핑크"],
              "lngshot": ["longshot", "롱샷"], "seventeen": ["세븐틴", "svt"], "enhypen": ["엔하이픈"], "newjeans": ["뉴진스"], "cortis": ["코르티스"]}
KEEP_DAYS = 45
FEED_MAX = 60
NTFY_SKIP = {"video"}  # al celular no: los grupos suben varios videos al día (siguen en Discord y en la web)
DEFAULT_WA = {"prox", "prox_new", "stop_today", "live", "latam", "arrival_official", "arrival"}
MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
PLACES_EN = json.loads((ROOT / "assets" / "places-en.json").read_text(encoding="utf-8"))["places"] if (ROOT / "assets" / "places-en.json").exists() else {}


def en(place: str) -> str:
    """Nombre en inglés de una ciudad o país de events.json (la web en modo EN usa el mismo diccionario)."""
    return PLACES_EN.get(place) or PLACES_EN.get(place.split(" (")[0], place)


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


def day_label(ld: str, lang: str = "es") -> str:
    y, m, d = (int(x) for x in ld.split("-"))
    if lang == "en":
        return f"{MONTHS_EN[m - 1]} {d}" + (f", {y}" if y != 2026 else "")
    return f"{d} {MONTHS[m - 1]}" + (f" {y}" if y != 2026 else "")


def dates_label(evs: list[dict], lang: str = "es") -> str:
    return ", ".join(day_label(e["local_date"], lang) for e in evs)


def km(n: float) -> str:
    return f"{round(n):,}".replace(",", ".")


def mk(kind: str, key: str, group: dict, title: str, body: str, when: datetime, **extra) -> dict:
    """title/body en español; title_en/body_en (opcionales) para la web en inglés."""
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
                        title_en=f"{g['name']} changed its show in {en(e['city'])}",
                        body_en=f"Before: {day_label(o['d'], 'en')} in {en(o['c'])}" + (f" ({o['v']})" if o["v"] else "") +
                        f". Now: {day_label(e['local_date'], 'en')} in {en(e['city'])}" + (f" ({e['venue']})" if e["venue"] else "") + ".",
                    ))
        for city, es in new_by_city.items():
            alerts.append(mk(
                "new_date", f"new:{g['id']}:{es[0]['id']}", g, f"{g['name']} agregó fechas en {city}" + (" (por confirmar)" if es[0].get("source") == "auto" else ""),
                f"{dates_label(es)}" + (f" en {es[0]['venue']}" if es[0]["venue"] else "") + f", {es[0]['country']}." +
                (" Salió de un anuncio; la hora y los detalles están por confirmar." if es[0].get("source") == "auto" else ""),
                now, places=[{"lat": es[0]["lat"], "lon": es[0]["lon"], "city": city}], url=es[0].get("src") or None,
                title_en=f"{g['name']} added dates in {en(city)}" + (" (to be confirmed)" if es[0].get("source") == "auto" else ""),
                body_en=f"{dates_label(es, 'en')}" + (f" at {es[0]['venue']}" if es[0]["venue"] else "") + f", {en(es[0]['country'])}.",
            ))
    current = {e["id"] for g in data["groups"] for e in g["events"]}
    names = {g["id"]: g["name"] for g in data["groups"]}
    gmap = {g["id"]: g for g in data["groups"]}
    same_day = {(e["_g"], e["local_date"], e["city"]) for g in data["groups"] for e in [dict(x, _g=g["id"]) for x in g["events"]]}
    for eid, o in old.items():
        if eid not in current and dt(o["s"]) > now and o["g"] in gmap and (o["g"], o["d"], o["c"]) not in same_day:  # otro listado del mismo show sigue
            alerts.append(mk(
                "removed", f"gone:{eid}", gmap[o["g"]], f"{names[o['g']]} quitó {o['c']} de la agenda",
                f"La fecha del {day_label(o['d'])} ya no aparece en las fuentes. Puede ser cancelación o cambio, confirma en la boletería.", now,
                title_en=f"{names[o['g']]} removed {en(o['c'])} from the schedule",
                body_en=f"The {day_label(o['d'], 'en')} date no longer shows up in the sources. It may be a cancellation or a change, check with the box office.",
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
            where_en = f"{first['venue']}, {en(first['city'])}" if first["venue"] else en(first["city"])

            local_now = now.astimezone(first["_t"].tzinfo)
            if local_now.date().isoformat() == first["local_date"] and local_now.hour >= 8 and now < end:
                alerts.append(mk(
                    "stop_today", f"today:{g['id']}:{first['id']}", g, f"Hoy {g['name']} abre en {first['city']}",
                    f"{where}. Hora aproximada, confirma en la boletería.", now, places=[place],
                    title_en=f"Today {g['name']} opens in {en(first['city'])}", body_en=f"{where_en}. Approximate time, check with the box office.",
                ))
            for e in st:
                if e.get("time_tbd"):
                    continue  # sin hora confirmada no se avisa "sube al escenario"
                if e["_t"] - timedelta(minutes=45) <= now < e["_t"] + timedelta(hours=SHOW_H):
                    alerts.append(mk(
                        "live", f"live:{e['id']}", g, f"{g['name']} sube al escenario en {e['city']}",
                        f"{where}. Hora aproximada, el show puede arrancar un poco antes o después.", now, places=[place],
                        title_en=f"{g['name']} goes on stage in {en(e['city'])}", body_en=f"{where_en}. Approximate time, the show may start a little earlier or later.",
                    ))
            if now >= end and now < end + timedelta(hours=24) and i + 1 < len(sts):
                nxt = sts[i + 1]
                hop = hav(last["lat"], last["lon"], nxt[0]["lat"], nxt[0]["lon"])
                alerts.append(mk(
                    "next_stop", f"next:{g['id']}:{last['id']}", g, f"{g['name']} sigue a {nxt[0]['city']}",
                    f"Cerró en {last['city']}. Siguiente parada: {nxt[0]['city']}, {nxt[0]['country']} ({dates_label(nxt)}), a unos {km(hop)} km.",
                    now, places=[{"lat": nxt[0]["lat"], "lon": nxt[0]["lon"], "city": nxt[0]["city"]}],
                    title_en=f"{g['name']} moves on to {en(nxt[0]['city'])}",
                    body_en=f"Wrapped up in {en(last['city'])}. Next stop: {en(nxt[0]['city'])}, {en(nxt[0]['country'])} ({dates_label(nxt, 'en')}), about {round(hop):,} km away.",
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


STOP = set("the and for with from that this their about after into over will are was has have its new now des del los las una por con para que sus como mas the8 en el la de un al y o a e su se lo le es".split())
TOPIC_HOURS = 48


def topic_words(title: str, group_words: set) -> set:
    """Palabras que definen de qué habla una noticia (sin relleno ni el nombre del grupo)."""
    title = re.sub(r"\s[-–|]\s[^-–|]{2,40}$", "", title)  # "... - Soompi" / "| Koreaboo": el medio no cuenta
    return {w for w in re.findall(r"[a-z0-9가-힣]{3,}", norm(title)) if w not in STOP and w not in group_words}


def same_topic(a: set, b: set) -> bool:
    if not a or not b:
        return False
    inter = len(a & b)
    return inter >= 4 or inter / len(a | b) >= 0.45


def news_alerts(items: list[dict], seen: set, data: dict, now: datetime, bootstrap: bool, topics: list | None = None) -> list[dict]:
    """topics: noticias ya avisadas en las últimas 48 h ([{g, w, t}]); se actualiza aquí. Cinco medios con la misma
    historia = una sola alerta."""
    gmap = {g["id"]: g for g in data["groups"]}
    alerts = []
    topics = topics if topics is not None else []
    cutoff = iso(now - timedelta(hours=TOPIC_HOURS))
    topics[:] = [x for x in topics if x["t"] >= cutoff]
    for it in items:
        if it["id"] in seen or it["group"] not in gmap or bootstrap:
            continue
        g = gmap[it["group"]]
        if it["kind"] == "social":
            text = norm(it["text"])
            hit = None if news.OFFICIAL_SKIP.search(it["title"]) else next((c for c in active_places(g, now) if any(n in text for n in city_names(c))), None)
            if hit:
                alerts.append(mk("arrival_official", f"news:{it['id']}", g, f"Posible llegada de {g['name']} a {hit}",
                                 f"Lo publicó {it['source']}: «{short(it['title'])}». Salió de su cuenta oficial.", now, url=it["link"],
                                 title_en=f"{g['name']} may have arrived in {en(hit)}",
                                 body_en=f"Posted by {it['source']}: \"{short(it['title'])}\". From their official account."))
                continue
            # anuncio oficial de gira o comeback (también lo que suben a Weverse y repiten en X); uno por grupo, tipo y día
            kind = news.official_kind(it["title"])
            if kind:
                lab = {"tour": ("gira", "tour"), "latam": ("Latinoamérica", "Latin America"), "comeback": ("comeback", "comeback")}[kind]
                alerts.append(mk("official", f"official:{g['id']}:{kind}:{now:%Y-%m-%d}", g, f"Anuncio oficial de {g['name']}: {lab[0]}",
                                 f"«{short(it['title'], 180)}» ({it['source']}).", now, url=it["link"],
                                 title_en=f"Official {g['name']} news: {lab[1]}", body_en=f"\"{short(it['title'], 180)}\" ({it['source']})."))
            continue
        if it["kind"] != "video":
            gw = {w for n in [g["name"], g["id"]] + (META_NAMES.get(g["id"], [])) for w in re.findall(r"[a-z0-9가-힣]{3,}", norm(n))}
            words = topic_words(it["title"], gw)
            if any(x["g"] == g["id"] and same_topic(words, set(x["w"])) for x in topics):
                continue  # la misma historia ya salió (otro medio o el mismo con otro título)
            topics.append({"g": g["id"], "w": sorted(words), "t": iso(now)})
        label = {"arrival": "Llegada reportada", "latam": "Latinoamérica", "comeback": "Comeback", "tour": "Gira", "video": "Nuevo video"}[it["kind"]]
        label_en = {"arrival": "Reported arrival", "latam": "Latin America", "comeback": "Comeback", "tour": "Tour", "video": "New video"}[it["kind"]]
        body = body_en = f"{short(it['title'])} ({it['source']})"
        if it["kind"] == "arrival":
            body += ". Lo reporta la prensa, no es confirmación oficial."
            body_en += ". Reported by the press, not an official confirmation."
        alerts.append(mk(it["kind"], f"news:{it['id']}", g, f"{label}: {g['name']}", body, now, url=it["link"],
                         title_en=f"{label_en}: {g['name']}", body_en=body_en))
    return alerts


# ---------- 3b. cumpleaños y resumen semanal ----------

def roster_names() -> dict:
    p = ROOT / "assets" / "chibis" / "roster.json"
    try:
        return {g: {m["id"]: m for m in ms} for g, ms in json.loads(p.read_text(encoding="utf-8")).items()}
    except (OSError, ValueError):
        return {}


def birthdays_between(people: dict, start: datetime, days: int) -> list[tuple[datetime, str, str, int]]:
    """[(día, grupo, miembro, años que cumple)] entre start y start+days (fechas en hora de Corea)."""
    out = []
    for gid, g in people.get("groups", {}).items():
        for mid, m in g.get("members", {}).items():
            b = m.get("birthday") or ""
            if not re.match(r"^\d{4}-\d\d-\d\d$", b):
                continue
            y, mo, d = map(int, b.split("-"))
            for k in range(days):
                day = (start + timedelta(days=k)).date()
                if (day.month, day.day) == (mo, d):
                    out.append((datetime(day.year, mo, d, tzinfo=KST), gid, mid, day.year - y))
    return sorted(out)


def birthday_alerts(data: dict, people: dict, now: datetime) -> list[dict]:
    gmap, names, alerts = {g["id"]: g for g in data["groups"]}, roster_names(), []
    for day, gid, mid, age in birthdays_between(people, now.astimezone(KST), 1):
        g = gmap.get(gid)
        name = names.get(gid, {}).get(mid, {}).get("name", mid)
        if not g:
            continue
        alerts.append(mk("birthday", f"bday:{gid}:{mid}:{day.year}", g, f"🎂 Hoy cumple {name} ({g['name']})",
                         f"Cumple {age} años. ¡생일 축하해, {name}!", now, member=mid,
                         title_en=f"🎂 It's {name}'s birthday ({g['name']})", body_en=f"Turning {age}. Happy birthday, {name}! 생일 축하해!"))
    return alerts


def weekly_alert(data: dict, people: dict, now: datetime) -> list[dict]:
    """Los lunes desde las 8 a. m. (hora de Colombia): lo que viene en los próximos 7 días."""
    local = now.astimezone(BOGOTA)
    if local.weekday() != 0 or local.hour < 8:
        return []
    end = now + timedelta(days=7)
    lines, lines_en = [], []
    for g in data["groups"]:
        for st in stops(prep(g)):
            if now <= st[0]["_t"] < end:
                lines.append(f"🎤 {g['name']} en {st[0]['city']} ({dates_label(st)})")
                lines_en.append(f"🎤 {g['name']} in {en(st[0]['city'])} ({dates_label(st, 'en')})")
    try:
        media = json.loads(MEDIA.read_text(encoding="utf-8")).get("items", [])
    except (OSError, ValueError):
        media = []
    gnames = {g["id"]: g["name"] for g in data["groups"]}
    for m in media:
        if m.get("type") == "music" and local.date().isoformat() <= m.get("date", "") < (local + timedelta(days=7)).date().isoformat():
            lines.append(f"💿 {gnames.get(m['group'], m['group'])}: {m['title']} ({day_label(m['date'])})")
            lines_en.append(f"💿 {gnames.get(m['group'], m['group'])}: {m['title']} ({day_label(m['date'], 'en')})")
    names = roster_names()
    for day, gid, mid, age in birthdays_between(people, now.astimezone(KST), 7):
        n = names.get(gid, {}).get(mid, {}).get("name", mid)
        lines.append(f"🎂 {n} ({gnames.get(gid, gid)}) cumple {age} el {day_label(day.date().isoformat())}")
        lines_en.append(f"🎂 {n} ({gnames.get(gid, gid)}) turns {age} on {day_label(day.date().isoformat(), 'en')}")
    if not lines:
        lines, lines_en = ["Semana tranquila: sin shows, estrenos ni cumpleaños."], ["A quiet week: no shows, releases or birthdays."]
    wk = local.isocalendar()
    g0 = {"id": "radar", "name": "Radar K-pop"}
    return [mk("weekly", f"weekly:{wk[0]}-{wk[1]}", g0, "📅 Tu semana K-pop", "\n".join(lines[:15]), now,
               title_en="📅 Your K-pop week", body_en="\n".join(lines_en[:15]))]


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
    ntfy_topic, ntfy_server = os.environ.get("NTFY_TOPIC", "").strip(), os.environ.get("NTFY_SERVER", "").strip() or "https://ntfy.sh"
    wa_token, wa_phone = os.environ.get("WHATSAPP_TOKEN"), os.environ.get("WHATSAPP_PHONE_ID")
    template = os.environ.get("WHATSAPP_TEMPLATE", "radar_alerta")

    tally = {"discord": [0, 0], "ntfy": [0, 0]}  # [bien, mal] para el vigilante

    def track(name: str, ok: bool) -> bool:
        tally[name][0 if ok else 1] += 1
        return ok

    def once(key: str, fn) -> None:
        nonlocal count
        if key in sent:
            return
        if fn():
            sent[key] = stamp
            count += 1

    for a in alerts:
        if not a.get("sub"):
            once(f"{a['key']}|canal", lambda a=a: track("discord", channels.send_discord_webhook(webhook, a, dry)) if webhook and not dry
                 else channels.send_discord_webhook(webhook, a, dry))
            if ntfy_topic and a["type"] not in NTFY_SKIP:
                once(f"{a['key']}|ntfy", lambda a=a: track("ntfy", channels.send_ntfy(ntfy_topic, a, dry, ntfy_server)))
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
    if not dry:
        for name, (good, bad) in tally.items():
            if good or bad:
                report(name, good > 0 or bad == 0, "" if good else f"fallaron los {bad} envíos")
    return count


def test_alert(now: datetime) -> int:
    """TEST_ALERT=1: manda una alerta de prueba por Discord y ntfy (botón 'Run workflow' con la opción de prueba)."""
    a = {"type": "official", "group": "bts", "group_name": "Radar K-pop", "when": iso(now), "url": "https://radar-kpop.vercel.app",
         "title": "Prueba del Radar K-pop 💜", "body": "Si ves esto, las alertas llegan bien. 보라해!"}
    webhook, topic = os.environ.get("DISCORD_WEBHOOK_URL"), os.environ.get("NTFY_TOPIC", "").strip()
    ok_d = channels.send_discord_webhook(webhook, a, False) if webhook else None
    ok_n = channels.send_ntfy(topic, a, False, os.environ.get("NTFY_SERVER", "").strip() or "https://ntfy.sh") if topic else None
    print(f"Prueba: Discord {'enviada' if ok_d else 'falló' if ok_d is False else 'sin DISCORD_WEBHOOK_URL'}, "
          f"ntfy {'enviada' if ok_n else 'falló' if ok_n is False else 'sin NTFY_TOPIC'}")
    return 0


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
    if os.environ.get("TEST_ALERT") == "1":
        return test_alert(now)
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
    people = load_json(PEOPLE, {})
    alerts += birthday_alerts(data, people, now)
    alerts += weekly_alert(data, people, now)

    seen = set(state.get("news_seen", []))
    items = news.collect(feeds, now) if feeds and not os.environ.get("NO_NEWS") else []
    topics = state.get("news_topics", [])
    alerts += news_alerts(items, seen, data, now, "news_seen" not in state, topics)
    seen |= {i["id"] for i in items}

    alerts += subscriber_alerts(data, alerts, subs, now)

    uniq, keys = [], set()
    for a in alerts:  # varias alertas pueden compartir clave (p. ej. un anuncio oficial por grupo y día): sale la primera
        if a["key"] not in keys:
            keys.add(a["key"])
            uniq.append(a)
    alerts = uniq

    sent_before = set(state.get("sent", {}))
    n = deliver(alerts, subs, state, dry)
    print(f"{len(alerts)} alertas candidatas, {n} envíos nuevos" + (" (modo prueba, no se guarda estado)" if dry else ""))

    if dry:
        return 0

    cutoff = iso(datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS))
    state["sent"] = {k: v for k, v in state.get("sent", {}).items() if v >= cutoff}
    state["snapshot"] = snapshot(data)
    state["news_seen"] = sorted(seen)[-800:]
    state["news_topics"] = topics[-300:]
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    fresh = [a for a in alerts if not a.get("sub") and f"{a['key']}|canal" in state["sent"] and f"{a['key']}|canal" not in sent_before]
    if fresh or not FEED_OUT.exists():
        feed = load_json(FEED_OUT, {"alerts": []})["alerts"]
        public = [{k: a.get(k) for k in ("type", "group", "group_name", "title", "body", "title_en", "body_en", "when", "url")} for a in fresh]
        FEED_OUT.write_text(json.dumps({"updated_at": iso(now), "alerts": (public + feed)[:FEED_MAX]}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())

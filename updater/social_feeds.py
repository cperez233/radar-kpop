"""Redes de cada grupo y de cada miembro para la pestaña "Redes" y los perfiles: escribe socialfeed.json.

Uso: RSSHUB_URL=https://... python updater/social_feeds.py   (después de sightings/fetch_x.py)
- TikTok del grupo y de los miembros que tienen cuenta (assets/people.json), vía tu RSSHub (/tiktok/user/@cuenta, sin cookie).
- Instagram solo si tu RSSHub tiene configurado Instagram. Prueba varias rutas de RSSHub en orden (IG_ROUTES, o la variable
  INSTAGRAM_ROUTES separada por comas) y recuerda la última que funcionó para empezar por ella. Una cuenta que falla no apaga
  Instagram entero: se apaga una ruta tras IG_MAX_STRIKES fallas seguidas, todo Instagram si responde 429 (límite) o si se
  pasa de IG_BUDGET segundos, y cada cuenta conserva sus posts anteriores. El vigilante solo avisa si Instagram ya funcionó
  alguna vez (así, sin cookie configurada, no hay avisos).
- Posts oficiales en X del grupo: los reusa de state/social.json (los trae fetch_x.py), sin pedirlos otra vez.
Guarda los últimos PER_ACCOUNT posts por cuenta (texto, enlace y fecha; las miniaturas de TikTok caducan, no se guardan).
Para no cargar a RSSHub, pide como mucho una vez por hora. Si una cuenta falla, se conserva lo anterior.
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import status  # noqa: E402
from status import report  # noqa: E402

OUT = ROOT / "socialfeed.json"
PEOPLE = ROOT / "assets" / "people.json"
SOCIAL = ROOT / "state" / "social.json"
PER_ACCOUNT = 5
MIN_GAP = timedelta(minutes=55)
TIMEOUT = 30
RETRIES = 3  # intentos por pedido; espera 2 s, 4 s... (o lo que diga Retry-After, máximo 30 s)
# rutas de Instagram en RSSHub, en orden: API privada (la de INSTAGRAM_COOKIE), API web y picnob (espejo sin cookie)
IG_ROUTES = ["/instagram/user/{h}", "/instagram/2/user/{h}", "/picnob/user/{h}"]
IG_MAX_STRIKES = 3  # fallas seguidas para dar por caída una ruta en esta corrida
IG_BUDGET = 240  # segundos máximos para Instagram por corrida: si se pasa, lo que falte queda con lo anterior


class FetchError(Exception):
    def __init__(self, msg: str, code: int | None = None, retry_after: float | None = None):
        super().__init__(msg)
        self.code, self.retry_after = code, retry_after


def clean(s: str) -> str:
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    return " ".join(re.sub(r"https?://\S+", " ", s).split())[:220]


def fetch_xml(url: str, retries: int = RETRIES) -> ET.Element:
    """Pide un feed con reintentos. Reintenta cortes de red, 5xx, 408 y 429; un 4xx distinto (cuenta que no existe) no."""
    last: FetchError | None = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "radar-kpop"}), timeout=TIMEOUT) as r:
                body = r.read()
            try:
                return ET.fromstring(body)
            except ET.ParseError as exc:  # RSSHub a veces responde 200 con una página de error en HTML
                last = FetchError(f"respuesta no es un feed ({exc})")
        except urllib.error.HTTPError as exc:
            ra = exc.headers.get("Retry-After") if exc.headers else None
            last = FetchError(f"HTTP {exc.code}", exc.code, float(ra) if ra and ra.isdigit() else None)
            if exc.code < 500 and exc.code not in (408, 429):
                raise last from None
        except Exception as exc:  # noqa: BLE001  (timeout, conexión cortada, DNS)
            last = FetchError(str(exc) or exc.__class__.__name__)
        if attempt < retries:
            time.sleep(min(last.retry_after or 2 ** attempt, 30))
    assert last is not None
    raise last


def parse(root: ET.Element) -> list[dict]:
    out = []
    for it in root.iter("item"):
        try:
            when = parsedate_to_datetime(it.findtext("pubDate")).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except (TypeError, ValueError):
            continue
        out.append({"title": clean(it.findtext("title") or it.findtext("description")), "url": (it.findtext("link") or "").strip(), "when": when})
    out.sort(key=lambda x: x["when"], reverse=True)
    return out[:PER_ACCOUNT]


def feed(url: str, retries: int = RETRIES) -> list[dict]:
    return parse(fetch_xml(url, retries))


def ig_link(url: str, handle: str) -> str:
    """Los espejos (picnob) enlazan a su propia página: se lleva al post en instagram.com, o al perfil si no se reconoce."""
    if "instagram.com/" in url:
        return url
    m = re.search(r"/(?:p|post|reel)/([A-Za-z0-9_-]{5,})", url)
    return f"https://www.instagram.com/p/{m.group(1)}/" if m else f"https://www.instagram.com/{handle}/"


class Instagram:
    """Instagram por RSSHub con rutas de respaldo, interruptor por ruta y presupuesto de tiempo para toda la corrida."""

    def __init__(self, base: str, preferred: str | None):
        env = [r.strip() for r in os.environ.get("INSTAGRAM_ROUTES", "").split(",") if r.strip()]
        routes = [r for r in (env or IG_ROUTES) if "{h}" in r]
        if preferred in routes:
            routes.remove(preferred)
            routes.insert(0, preferred)
        self.base, self.routes = base, routes
        self.strikes = {r: 0 for r in routes}
        self.deadline = time.monotonic() + IG_BUDGET
        self.stopped = ""  # motivo si Instagram quedó apagado en esta corrida
        self.ok = self.bad = 0
        self.route_ok: str | None = None
        self.errors: list[str] = []

    def on(self) -> bool:
        if not self.stopped and time.monotonic() > self.deadline:
            self.stopped = f"se pasó de {IG_BUDGET} s"
        if not self.stopped and not self.routes:
            self.stopped = "ninguna ruta respondió"
        return not self.stopped

    def fetch(self, handle: str) -> list[dict] | None:
        """Posts de una cuenta; None si ninguna ruta pudo leerla (se conserva lo anterior)."""
        for route in list(self.routes):
            if not self.on():
                return None
            try:
                # 2 intentos: RSSHub responde 503 cuando la ruta no está configurada, y eso no se arregla insistiendo
                items = feed(self.base + route.replace("{h}", handle), retries=2)
            except FetchError as exc:
                self.errors.append(f"{route.split('{')[0]}{handle}: {exc}")
                if exc.code == 429:
                    self.stopped = "Instagram pide esperar (429)"
                    return None
                if exc.code == 404:  # la cuenta no existe en esta ruta: no es culpa de la ruta
                    continue
                self.strikes[route] += 1
                if self.strikes[route] >= IG_MAX_STRIKES:
                    self.routes.remove(route)
                    print(f"Instagram: la ruta {route} falló {IG_MAX_STRIKES} veces seguidas; se deja en esta corrida", file=sys.stderr)
                continue
            self.strikes[route] = 0
            self.route_ok = self.route_ok or route
            self.ok += 1
            for it in items:
                it["url"] = ig_link(it["url"], handle)
            return items
        self.bad += 1
        return None


def main() -> int:
    base = os.environ.get("RSSHUB_URL", "").strip().rstrip("/")
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"groups": {}}
    now = datetime.now(timezone.utc)
    if "--force" not in sys.argv and old.get("updated_at") and now - datetime.fromisoformat(old["updated_at"].replace("Z", "+00:00")) < MIN_GAP:
        print("socialfeed.json tiene menos de una hora, se espera")
        return 0
    people = json.loads(PEOPLE.read_text(encoding="utf-8")).get("groups", {})
    groups = {g: dict(v) for g, v in old.get("groups", {}).items()}

    # X: posts oficiales que ya trajo fetch_x.py (sin retweets)
    if SOCIAL.exists():
        posts: dict[str, list] = {}
        for p in json.loads(SOCIAL.read_text(encoding="utf-8")).get("items", []):
            if p["title"].startswith("RT ") or "/status/" not in p.get("link", ""):
                continue
            try:
                when = parsedate_to_datetime(p["pubDate"]).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            except (TypeError, ValueError):
                continue
            posts.setdefault(p["group"], []).append({"title": clean(p["title"]), "url": p["link"], "when": when})
        for g, lst in posts.items():
            groups.setdefault(g, {})["x"] = sorted(lst, key=lambda x: x["when"], reverse=True)[:PER_ACCOUNT]

    if not base:
        print("Sin RSSHUB_URL: solo los posts de X que ya había", file=sys.stderr)
    ok = bad = 0
    ig = Instagram(base, old.get("instagram_route")) if base else None
    for gid, g in people.items() if base else []:
        dest = groups.setdefault(gid, {})
        jobs = [("tiktok", g.get("tiktok"), dest)] + [("instagram", g.get("instagram"), dest)]
        for mid, m in g.get("members", {}).items():
            md = dest.setdefault("members", {}).setdefault(mid, {})
            jobs += [("tiktok", m.get("tiktok"), md), ("instagram", m.get("instagram"), md)]
        for kind, handle, target in jobs:
            if not handle:
                continue
            if kind == "instagram":
                if ig.on():
                    items = ig.fetch(handle)
                    if items:
                        target[kind] = items
                    time.sleep(1)  # Instagram castiga ráfagas: un poco más de espacio que TikTok
                continue
            try:
                items = feed(f"{base}/tiktok/user/@{handle}")
                if items:
                    target[kind] = items
                ok += 1
            except Exception as exc:  # noqa: BLE001
                bad += 1
                print(f"TikTok @{handle}: {exc}", file=sys.stderr)
            time.sleep(0.5)
    if base:
        report("tiktok", ok > 0 or bad == 0, "" if ok else "ninguna cuenta de TikTok respondió en RSSHub")
        for e in ig.errors[:5]:
            print(f"Instagram {e}", file=sys.stderr)
        if len(ig.errors) > 5:
            print(f"Instagram: {len(ig.errors) - 5} errores más", file=sys.stderr)
        # el vigilante solo vigila Instagram si alguna vez funcionó: sin cookie configurada no hay avisos
        if ig.ok or "instagram" in status.load().get("sources", {}):
            why = ig.stopped or "ninguna cuenta respondió"
            msg = "" if ig.ok else why + ("; se reintenta en la próxima hora" if "429" in why else ": puede que haya vencido INSTAGRAM_COOKIE en Vercel (ver CLAVES.md)")
            report("instagram", ig.ok > 0, msg)
    data = {"updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "groups": groups}
    route = (ig.route_ok if ig else None) or old.get("instagram_route")
    if route:
        data["instagram_route"] = route
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"socialfeed.json: TikTok {ok} cuentas bien, {bad} fallaron" + (f"; Instagram {ig.ok} bien, {ig.bad} sin leer" + (f" ({ig.stopped})" if ig.stopped else "") if ig else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())

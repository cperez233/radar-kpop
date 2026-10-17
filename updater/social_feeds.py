"""Redes de cada grupo y de cada miembro para la pestaña "Redes" y los perfiles: escribe socialfeed.json.

Uso: RSSHUB_URL=https://... python updater/social_feeds.py   (después de sightings/fetch_x.py)
- TikTok del grupo y de los miembros que tienen cuenta (assets/people.json), vía tu RSSHub (/tiktok/user/@cuenta, sin cookie).
- Instagram (/instagram/user/cuenta) solo si tu RSSHub tiene configurado Instagram. Para que Instagram no marque la cuenta
  de la cookie como bot: solo IG_PER_RUN cuentas por corrida (en turno, cada cuenta se renueva cada ~5 h), con pausas
  al azar entre una y otra, y si falla no se vuelve a intentar en IG_BACKOFF (una cookie vencida no se insiste).
- Posts oficiales en X del grupo: los reusa de state/social.json (los trae fetch_x.py), sin pedirlos otra vez.
Guarda los últimos PER_ACCOUNT posts por cuenta (texto, enlace y fecha; las miniaturas de TikTok caducan, no se guardan).
Para no cargar a RSSHub, pide como mucho una vez por hora. Si una cuenta falla, se conserva lo anterior.
"""
from __future__ import annotations

import html
import json
import os
import random
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from status import report  # noqa: E402

OUT = ROOT / "socialfeed.json"
PEOPLE = ROOT / "assets" / "people.json"
SOCIAL = ROOT / "state" / "social.json"
PER_ACCOUNT = 5
MIN_GAP = timedelta(minutes=55)
IG_PER_RUN = 10
IG_BACKOFF = timedelta(hours=6)


def clean(s: str) -> str:
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    return " ".join(re.sub(r"https?://\S+", " ", s).split())[:220]


def feed(url: str) -> list[dict]:
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "radar-kpop"}), timeout=60) as r:
                root = ET.fromstring(r.read())
            break
        except Exception:  # noqa: BLE001
            if attempt == 2:
                raise
            time.sleep(3)
    out = []
    for it in root.iter("item"):
        try:
            when = parsedate_to_datetime(it.findtext("pubDate")).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except (TypeError, ValueError):
            continue
        out.append({"title": clean(it.findtext("title") or it.findtext("description")), "url": (it.findtext("link") or "").strip(), "when": when})
    out.sort(key=lambda x: x["when"], reverse=True)
    return out[:PER_ACCOUNT]


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
    tiktok, insta = [], []
    for gid, g in people.items() if base else []:
        dest = groups.setdefault(gid, {})
        tiktok.append((g.get("tiktok"), dest))
        insta.append((g.get("instagram"), dest))
        for mid, m in g.get("members", {}).items():
            md = dest.setdefault("members", {}).setdefault(mid, {})
            tiktok.append((m.get("tiktok"), md))
            insta.append((m.get("instagram"), md))
    for handle, target in tiktok:
        if not handle:
            continue
        try:
            items = feed(f"{base}/tiktok/user/@{handle}")
            if items:
                target["tiktok"] = items
            ok += 1
        except Exception as exc:  # noqa: BLE001
            bad += 1
            print(f"TikTok @{handle}: {exc}", file=sys.stderr)
        time.sleep(0.5)
    if base:
        report("tiktok", ok > 0 or bad == 0, "" if ok else "ninguna cuenta de TikTok respondió en RSSHub")

    # Instagram: unas pocas cuentas por corrida, en turno; si falla, pausa larga
    insta = [(h, t) for h, t in insta if h]
    ig_cursor = old.get("ig_cursor", 0) % len(insta) if insta else 0
    ig_pause = old.get("ig_pause_until", "")
    ig_ok, ig_err = 0, ""
    if insta and (not ig_pause or now >= datetime.fromisoformat(ig_pause.replace("Z", "+00:00"))):
        ig_pause = ""
        for i in range(min(IG_PER_RUN, len(insta))):
            handle, target = insta[(ig_cursor + i) % len(insta)]
            if i:
                time.sleep(random.uniform(4, 10))
            try:
                items = feed(f"{base}/instagram/user/{handle}")
                if items:
                    target["instagram"] = items
                ig_ok += 1
            except Exception as exc:  # noqa: BLE001
                ig_err = str(exc)
                ig_pause = (now + IG_BACKOFF).strftime("%Y-%m-%dT%H:%M:%SZ")
                print(f"Instagram @{handle} falló ({exc}); no se vuelve a intentar hasta {ig_pause}", file=sys.stderr)
                break
        ig_cursor = (ig_cursor + ig_ok) % len(insta)
        ig_was_on = any("instagram" in v or any("instagram" in m for m in v.get("members", {}).values()) for v in old.get("groups", {}).values())
        if ig_ok or ig_was_on:  # solo avisar si Instagram ya estaba configurado alguna vez
            report("instagram", not ig_err, "" if not ig_err else "Instagram no respondió en RSSHub: puede que haya vencido INSTAGRAM_COOKIE en Vercel")
    elif insta:
        print(f"Instagram en pausa hasta {ig_pause}", file=sys.stderr)
    data = {"updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "groups": groups, "ig_cursor": ig_cursor}
    if ig_pause:
        data["ig_pause_until"] = ig_pause
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"socialfeed.json: TikTok {ok} bien, {bad} fallaron; Instagram {ig_ok} leídas" + (f", en pausa hasta {ig_pause}" if ig_pause else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())

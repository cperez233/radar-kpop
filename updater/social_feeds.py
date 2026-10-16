"""Redes de cada grupo y de cada miembro para la pestaña "Redes" y los perfiles: escribe socialfeed.json.

Uso: RSSHUB_URL=https://... python updater/social_feeds.py   (después de sightings/fetch_x.py)
- TikTok del grupo y de los miembros que tienen cuenta (assets/people.json), vía tu RSSHub (/tiktok/user/@cuenta, sin cookie).
- Instagram (/instagram/user/cuenta) solo si tu RSSHub tiene configurado Instagram; si responde error, se salta en esa corrida.
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
    ig_on = True
    for gid, g in people.items() if base else []:
        dest = groups.setdefault(gid, {})
        jobs = [("tiktok", g.get("tiktok"), dest)] + [("instagram", g.get("instagram"), dest)]
        for mid, m in g.get("members", {}).items():
            md = dest.setdefault("members", {}).setdefault(mid, {})
            jobs += [("tiktok", m.get("tiktok"), md), ("instagram", m.get("instagram"), md)]
        for kind, handle, target in jobs:
            if not handle or (kind == "instagram" and not ig_on):
                continue
            url = f"{base}/tiktok/user/@{handle}" if kind == "tiktok" else f"{base}/instagram/user/{handle}"
            try:
                items = feed(url)
                if items:
                    target[kind] = items
                ok += 1
            except Exception as exc:  # noqa: BLE001
                if kind == "instagram":
                    ig_on = False  # tu RSSHub no tiene Instagram configurado: no se insiste en esta corrida
                    print(f"Instagram no disponible en tu RSSHub ({exc}); se salta", file=sys.stderr)
                else:
                    bad += 1
                    print(f"TikTok @{handle}: {exc}", file=sys.stderr)
            time.sleep(0.5)
    if base:
        report("tiktok", ok > 0 or bad == 0, "" if ok else "ninguna cuenta de TikTok respondió en RSSHub")
    data = {"updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "groups": groups}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"socialfeed.json: {ok} cuentas bien, {bad} fallaron" + ("" if ig_on else ", Instagram desactivado"))
    return 0


if __name__ == "__main__":
    sys.exit(main())

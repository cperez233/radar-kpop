"""Estado de cada fuente del robot, para el resumen del run y el vigilante (tools/health.py --notify).

Cada script llama report("youtube", ok, "mensaje"). Se guarda en state/health.json y solo se reescribe si algo cambió
(ok o mensaje), así el robot no hace commits por nada.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

FILE = Path(__file__).resolve().parent.parent / "state" / "health.json"


def load() -> dict:
    try:
        return json.loads(FILE.read_text(encoding="utf-8")) if FILE.exists() else {}
    except ValueError:
        return {}


def save(data: dict) -> None:
    FILE.parent.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def report(name: str, ok: bool, msg: str = "") -> None:
    data = load()
    src = data.setdefault("sources", {})
    cur = src.get(name, {})
    if cur.get("ok") == ok and cur.get("msg") == msg:
        return
    since = cur.get("since") if cur.get("ok") == ok else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    src[name] = {"ok": ok, "msg": msg[:200], "since": since, "notified": cur.get("notified", False)}
    save(data)

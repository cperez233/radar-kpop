"""Resumen de salud del robot: qué claves hay (sí/no, nunca el valor) y qué tan frescos están los datos.

Lo corre el workflow al final de cada run; sale en Actions > el run > Summary. También sirve en local: python tools/health.py
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEYS = [
    ("TM_API_KEY", "Fechas nuevas de Ticketmaster"),
    ("YT_API_KEY", "Videos y suscriptores de YouTube"),
    ("RSSHUB_URL", "Posts oficiales de X (avistamientos y anuncios)"),
    ("X_BEARER_TOKEN", "Respaldo de X, de pago (solo si RSSHub falla)"),
    ("DISCORD_WEBHOOK_URL", "Alertas en Discord"),
    ("NTFY_TOPIC", "Alertas al celular con ntfy"),
    ("VAPID_PRIVATE_KEY", "Notificaciones push del navegador"),
]


def load(name: str) -> dict:
    p = ROOT / name
    try:
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    except ValueError:
        return {}


def age(stamp: str | None) -> str:
    if not stamp:
        return "sin fecha"
    d = datetime.now(timezone.utc) - datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    h = d.total_seconds() / 3600
    return f"hace {int(d.total_seconds() // 60)} min" if h < 1 else f"hace {h:.0f} h" if h < 48 else f"hace {h / 24:.0f} días"


def main() -> None:
    lines = ["## Radar K-pop: estado del robot", "", "| Clave | Para qué | ¿Está? |", "|---|---|---|"]
    for k, what in KEYS:
        has = os.environ.get(f"HAS_{k}")
        has = (has == "true") if has is not None else bool(os.environ.get(k))
        lines.append(f"| `{k}` | {what} | {'✅' if has else '—'} |")

    ev, media, stats, sight, alerts = load("events.json"), load("media.json"), load("stats.json"), load("sightings.json"), load("alerts.json")
    now = datetime.now(timezone.utc).isoformat()
    upcoming = sum(1 for g in ev.get("groups", []) for e in g.get("events", []) if e["start"] > now)
    tm = sum(1 for g in ev.get("groups", []) for e in g.get("events", []) if e.get("source") == "tm")
    vids = [m for m in media.get("items", []) if m.get("type") == "video"]
    music = [m for m in media.get("items", []) if m.get("type") == "music"]
    lines += ["", "| Datos | Estado | Actualizado |", "|---|---|---|",
              f"| Fechas de gira | {upcoming} shows por venir ({tm} de Ticketmaster) | {age(ev.get('updated_at'))} |",
              f"| Estrenos y videos | {len(music)} estrenos, {len(vids)} videos | {age(media.get('updated_at'))} |",
              f"| Números de Spotify | {sum(1 for g in stats.get('groups', {}).values() if g.get('listeners'))} grupos con oyentes | {age(stats.get('updated_at'))} |",
              f"| Avistamientos | {'datos de ejemplo' if sight.get('sample') else str(len(sight.get('items', []))) + ' reales (' + str(sight.get('source')) + ')'} | {age(sight.get('updated_at'))} |",
              f"| Alertas publicadas | {len(alerts.get('alerts', []))} en la web | {age(alerts.get('updated_at'))} |"]
    text = "\n".join(lines) + "\n"
    print(text)
    out = os.environ.get("GITHUB_STEP_SUMMARY")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(text)


if __name__ == "__main__":
    main()

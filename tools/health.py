"""Resumen de salud del robot: qué claves hay (sí/no, nunca el valor), qué fuentes responden y qué tan frescos están los datos.

Lo corre el workflow al final de cada run; sale en Actions > el run > Summary. También sirve en local: python tools/health.py
Con --notify es el vigilante: cuando una fuente empieza a fallar manda un aviso por Discord y ntfy (una sola vez), y otro
cuando vuelve a funcionar. El estado de cada fuente lo escriben los scripts en state/health.json (tools/status.py).
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "alerts"))
sys.path.insert(0, str(ROOT / "tools"))
import status  # noqa: E402

LABELS = {"ticketmaster": "Ticketmaster (fechas)", "itunes": "Apple Music (estrenos)", "youtube": "YouTube (videos)",
          "kworb": "kworb (números de Spotify)", "rsshub": "RSSHub (cuentas oficiales de X)", "discord": "Discord", "ntfy": "ntfy"}
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
    src = status.load().get("sources", {})
    if src:
        lines += ["", "| Fuente | Estado | Desde |", "|---|---|---|"]
        for k, v in sorted(src.items()):
            lines.append(f"| {LABELS.get(k, k)} | {'✅ bien' if v['ok'] else '⚠️ ' + (v.get('msg') or 'falla')} | {age(v.get('since'))} |")
    text = "\n".join(lines) + "\n"
    print(text)
    out = os.environ.get("GITHUB_STEP_SUMMARY")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(text)


def notify() -> None:
    """Avisa por Discord y ntfy cuando una fuente empieza a fallar o se recupera (sin repetir)."""
    import channels  # noqa: PLC0415

    data = status.load()
    webhook, topic = os.environ.get("DISCORD_WEBHOOK_URL"), os.environ.get("NTFY_TOPIC", "").strip()
    run = os.environ.get("GITHUB_RUN_ID")
    url = f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{os.environ.get('GITHUB_REPOSITORY', '')}/actions/runs/{run}" if run else ""
    changed = False
    for k, v in data.get("sources", {}).items():
        if v["ok"] == (not v.get("notified")):
            continue  # bien y sin aviso pendiente, o mal y ya avisado
        label = LABELS.get(k, k)
        if v["ok"]:
            title, body = f"✅ Radar: {label} volvió a funcionar", "Todo sigue solo."
        else:
            title, body = f"⚠️ Radar: {label} está fallando", (v.get("msg") or "Revisa el último run del robot.") + " El resto del radar sigue funcionando."
        a = {"type": "robot", "group": "", "when": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "url": url, "title": title, "body": body}
        sent = False
        if webhook:
            sent |= channels.send_discord_webhook(webhook, a, False)
        if topic:
            sent |= channels.send_ntfy(topic, a, False, os.environ.get("NTFY_SERVER", "").strip() or "https://ntfy.sh")
        if sent:
            v["notified"] = not v["ok"]
            changed = True
            print(title)
    if changed:
        status.save(data)


if __name__ == "__main__":
    main()
    if "--notify" in sys.argv:
        notify()

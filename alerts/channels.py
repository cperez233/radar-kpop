"""Canales de envio: Discord (webhook y DM por bot), ntfy (push al celular, gratis), WhatsApp Cloud API (plantilla)
y notificaciones push del navegador (Web Push).

Todas las funciones devuelven True si el mensaje salio (o si es prueba) y False si fallo.
En modo prueba (dry=True) solo imprimen lo que enviarian.
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request

GROUP_COLORS = {"bts": 0x6A3AE0, "skz": 0xD2383D, "twice": 0xCF6E14, "blackpink": 0xF2559A, "lngshot": 0x0B8AA8,
                "seventeen": 0x6C7BE8, "enhypen": 0x22A36A, "newjeans": 0xF2B705,
                "cortis": 0x5E8C12, "ateez": 0xB07A12}
DISCORD_API = "https://discord.com/api/v10"
GRAPH_API = "https://graph.facebook.com/v21.0"
UA = "DiscordBot (https://github.com/radar-kpop, 1.0)"


def _post(url: str, payload: dict, headers: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": UA, **headers},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read()
    return json.loads(raw) if raw else {}


def _embed(alert: dict) -> dict:
    e = {
        "title": alert["title"][:250],
        "description": alert["body"][:1800],
        "color": GROUP_COLORS.get(alert["group"], 0x0E6C8B),
        "timestamp": alert["when"],
        "footer": {"text": "Radar K-pop"},
    }
    if alert.get("url"):
        e["url"] = alert["url"]
    return e


def send_discord_webhook(url: str | None, alert: dict, dry: bool) -> bool:
    if dry or not url:
        print(f"[prueba] discord canal | {alert['title']} | {alert['body']}")
        return True
    try:
        _post(url, {"embeds": [_embed(alert)]}, {})
        time.sleep(0.6)  # limite de Discord: 5 mensajes cada 2 s por webhook
        return True
    except (urllib.error.URLError, OSError) as exc:
        print(f"Fallo el webhook de Discord: {exc}")
        return False


NTFY_TAGS = {"new_date": "date", "changed": "warning", "removed": "x", "live": "red_circle", "stop_today": "star",
             "next_stop": "airplane", "arrival_official": "airplane", "arrival": "airplane", "latam": "tada",
             "comeback": "cd", "tour": "ticket", "official": "loudspeaker", "video": "tv", "roster": "newspaper",
             "birthday": "birthday", "weekly": "calendar"}


def send_ntfy(topic: str | None, alert: dict, dry: bool, server: str = "https://ntfy.sh") -> bool:
    """Push al celular con la app ntfy (gratis, sin cuenta): el fan se suscribe al tema NTFY_TOPIC en la app."""
    if not topic:
        return False
    if dry:
        print(f"[prueba] ntfy | {alert['title']}")
        return True
    payload = {"topic": topic, "title": alert["title"][:200], "message": alert.get("body", "")[:1000] or alert["title"],
               "tags": [NTFY_TAGS.get(alert.get("type"), "sparkles")], "priority": 4 if alert.get("type") in ("new_date", "live", "latam", "official") else 3}
    if alert.get("url"):
        payload["click"] = alert["url"]
    try:
        _post(server.rstrip("/"), payload, {})
        return True
    except (urllib.error.URLError, OSError) as exc:
        print(f"Fallo ntfy: {exc}")
        return False


def send_discord_dm(token: str | None, user_id: str, alert: dict, dry: bool) -> bool:
    if dry:
        print(f"[prueba] discord DM {user_id} | {alert['title']}")
        return True
    if not token:
        print("Falta DISCORD_BOT_TOKEN, no se envía el DM")
        return False
    headers = {"Authorization": f"Bot {token}"}
    try:
        ch = _post(f"{DISCORD_API}/users/@me/channels", {"recipient_id": user_id}, headers)
        _post(f"{DISCORD_API}/channels/{ch['id']}/messages", {"embeds": [_embed(alert)]}, headers)
        time.sleep(0.6)
        return True
    except (urllib.error.URLError, OSError, KeyError) as exc:
        print(f"Fallo el DM de Discord a {user_id}: {exc}")
        return False


def wa_text(alert: dict) -> str:
    """Las variables de plantilla de WhatsApp no aceptan saltos de linea ni muchos espacios seguidos."""
    text = f"{alert['title']}. {alert['body']}"
    if alert.get("url"):
        text += f" {alert['url']}"
    text = re.sub(r"\s+", " ", text).strip()
    return text[:600]


def send_whatsapp(token: str | None, phone_id: str | None, to: str, template: str, alert: dict, dry: bool) -> bool:
    digits = re.sub(r"\D", "", to)
    if dry:
        print(f"[prueba] whatsapp +{digits[:4]}... | {wa_text(alert)}")
        return True
    if not token or not phone_id:
        print("Falta WHATSAPP_TOKEN o WHATSAPP_PHONE_ID, no se envía el WhatsApp")
        return False
    payload = {
        "messaging_product": "whatsapp",
        "to": digits,
        "type": "template",
        "template": {
            "name": template,
            "language": {"code": "es"},
            "components": [{"type": "body", "parameters": [{"type": "text", "text": wa_text(alert)}]}],
        },
    }
    try:
        _post(f"{GRAPH_API}/{phone_id}/messages", payload, {"Authorization": f"Bearer {token}"})
        time.sleep(0.3)
        return True
    except urllib.error.HTTPError as exc:
        print(f"Fallo WhatsApp a +{digits[:4]}...: {exc.code} {exc.read()[:200]!r}")
        return False
    except (urllib.error.URLError, OSError) as exc:
        print(f"Fallo WhatsApp a +{digits[:4]}...: {exc}")
        return False


def send_webpush(sub: dict, alert: dict, dry: bool) -> bool:
    """Notificacion push al navegador del fan. Necesita pywebpush (pip install pywebpush) y las llaves VAPID.

    VAPID_PRIVATE_KEY: llave privada (la publica va en config.js, vapidPublicKey). VAPID_SUBJECT: mailto: o https: de contacto.
    """
    import os
    info = sub.get("push") or {}
    if dry:
        print(f"[prueba] push {info.get('endpoint', '')[:40]}... | {alert['title']}")
        return True
    key, subject = os.environ.get("VAPID_PRIVATE_KEY"), os.environ.get("VAPID_SUBJECT", "mailto:radar@example.com")
    if not key or not info.get("endpoint"):
        print("Falta VAPID_PRIVATE_KEY o la suscripción push, no se envía la notificación")
        return False
    try:
        from pywebpush import webpush, WebPushException  # noqa: PLC0415
    except ImportError:
        print("Falta pywebpush (pip install pywebpush), no se envía la notificación")
        return False
    payload = {"title": alert["title"], "body": alert.get("body", "")[:180], "group": alert.get("group", ""), "url": alert.get("url") or "./"}
    try:
        webpush(subscription_info=info, data=json.dumps(payload), vapid_private_key=key, vapid_claims={"sub": subject}, ttl=86400)
        return True
    except WebPushException as exc:
        print(f"Fallo push: {exc}")
        return False

"""Traducción automática de los titulares de noticias para la web (alerts.json).

Las noticias llegan en el idioma del medio (casi siempre español, a veces inglés o coreano). Para cada alerta se guarda:
  src_lang   idioma original detectado ("es", "en", "ko"...)
  body_orig  el titular tal como lo publicó el medio
  body       versión en español   ·   body_en  versión en inglés   ·   auto: true si alguna es traducción
Usa el traductor público de Google (sin clave). Si no responde, la alerta queda como estaba: nunca frena el robot.
"""
from __future__ import annotations

import html
import json
import re
import urllib.parse
import urllib.request

URL = "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=auto&tl={tl}&q={q}"
MYMEMORY = "https://api.mymemory.translated.net/get?q={q}&langpair={sl}|{tl}"  # respaldo gratis (5.000 caracteres al día sin clave)
ES_WORDS = {"el", "la", "los", "las", "de", "del", "que", "en", "y", "un", "una", "por", "para", "con", "se", "su", "sus", "es", "al", "lo", "como", "más", "sobre", "gira"}
# tipos cuyo texto escribe un medio o una cuenta (los demás los arma el robot ya en los dos idiomas)
NEWS_TYPES = {"latam", "tour", "comeback", "news", "official", "roster", "release_news"}


def guess(text: str) -> str:
    """Idioma probable sin red: hangul -> ko, kana -> ja, palabras típicas o tildes -> es, si no en."""
    if re.search(r"[\uac00-\ud7a3]", text):
        return "ko"
    if re.search(r"[\u3040-\u30ff]", text):
        return "ja"
    words = re.findall(r"[a-záéíóúñü]+", text.lower())
    hits = sum(w in ES_WORDS for w in words)
    return "es" if re.search(r"[ñ¿¡áéíóú]", text.lower()) or (words and hits / len(words) > .12) else "en"


def _get(url: str) -> dict:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "radar-kpop"}), timeout=12) as r:
        return json.loads(r.read().decode("utf-8"))


def _tr(text: str, tl: str) -> tuple[str, str]:
    """(traducción, idioma detectado). Google primero; si falla (por ejemplo 429), MyMemory con el idioma adivinado."""
    q = urllib.parse.quote(text[:450])
    try:
        d = _get(URL.format(tl=tl, q=q))
        return "".join(p[0] for p in d[0] if p and p[0]).strip(), (d[2] or "").split("-")[0]
    except Exception:  # noqa: BLE001
        sl = guess(text)
        if sl == tl:
            return text, sl
        d = _get(MYMEMORY.format(q=q, sl=sl, tl=tl))
        out = (d.get("responseData") or {}).get("translatedText") or ""
        if d.get("responseStatus") != 200 or not out or "MYMEMORY WARNING" in out.upper():
            raise RuntimeError(d.get("responseDetails") or "sin traducción")
        return html.unescape(out).strip(), sl


def localize(a: dict) -> bool:
    """Completa src_lang/body/body_en de una alerta de noticia. Devuelve True si la tocó."""
    if a.get("type") not in NEWS_TYPES or a.get("src_lang") or not (a.get("body") or "").strip():
        return False
    orig = a["body"]
    try:
        en, src = _tr(orig, "en")
        if src == "en":
            es, _ = _tr(orig, "es")
            a.update(src_lang="en", body_orig=orig, body=es or orig, body_en=orig, auto=bool(es))
        elif src == "es":
            a.update(src_lang="es", body_orig=orig, body=orig, body_en=en or orig, auto=bool(en))
        else:
            es, _ = _tr(orig, "es")
            a.update(src_lang=src or "?", body_orig=orig, body=es or orig, body_en=en or orig, auto=True)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"Traducción no disponible ({exc}); la noticia queda en su idioma")
        return False


def localize_all(items: list[dict], limit: int = 40) -> int:
    n = 0
    for a in items:
        if n >= limit:
            break
        if localize(a):
            n += 1
    return n

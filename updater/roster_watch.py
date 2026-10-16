"""Vigila a los integrantes: servicio militar, regresos y salidas. Escribe rosterwatch.json.

Uso: python updater/roster_watch.py   (después de sightings/fetch_x.py, que deja los posts oficiales en state/social.json)

Qué busca y dónde:
- Posts oficiales del grupo en X (state/social.json) y Google News (inglés y coreano, una consulta por grupo y una por exintegrante).
- Para cada miembro en servicio militar: aviso de que terminó (전역, 소집해제, discharged...).
- Para cada exintegrante o miembro con contrato pendiente: noticia de regreso (복귀, 재합류, rejoins, returns to...).
- Para el resto: aviso de que se enlista (입대, enlist...) o de que sale del grupo (탈퇴, leaves...).
Cada hallazgo exige el nombre del grupo, el nombre del miembro y una palabra clave en el mismo titular o post.

Qué hace la web con esto (assets/app.js, memStatus):
- Un aviso OFICIAL cambia el estado solo: de vuelta del servicio, de regreso al grupo, o enlistado (si el aviso trae fecha).
- Una noticia sin aviso oficial no cambia nada: solo muestra el enlace "Hay noticias sobre esto". Así un rumor no reescribe la web.
Las alertas (alerts/engine.py) avisan una vez por hallazgo nuevo.
Pide a Google News como mucho cada 3 horas; los posts oficiales se revisan en cada corrida (ya están en disco).
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "updater"))
from status import report  # noqa: E402
from auto_dates import find_dates  # noqa: E402

OUT = ROOT / "rosterwatch.json"
PEOPLE = ROOT / "assets" / "people.json"
ROSTER = ROOT / "assets" / "chibis" / "roster.json"
FEEDS = ROOT / "alerts" / "feeds.json"
SOCIAL = ROOT / "state" / "social.json"
UA = {"User-Agent": "radar-kpop (+https://radar-kpop.vercel.app)"}
NEWS_GAP = timedelta(hours=3)
KEEP = timedelta(days=150)

KIND_RE = {
    "discharge": re.compile(r"전역|소집\s*해제|복무\s*(?:를\s*)?마치|discharg|complet\w* (?:his |her |their )?(?:mandatory )?(?:military|alternative|social)|finish\w* (?:his |her )?(?:military|service)|back from (?:the )?military|licenciad|termina su servicio", re.I),
    "enlist": re.compile(r"입대|입소|군\s*복무를?\s*시작|사회복무요원으로|enlist|begins? (?:his |her )?(?:mandatory )?(?:military|alternative)|military service (?:on|starting)|alistamiento|se enlista|servicio militar el", re.I),
    "return": re.compile(r"복귀|재합류|합류|re-?join|returns? to (?:the group|ador|activities|the team)|back (?:to|in) the group|regresa al grupo|vuelve al grupo", re.I),
    "leave": re.compile(r"탈퇴|계약\s*(?:해지|종료)|leav(?:e|es|ing) the group|depart\w* from the group|exit\w* (?:from )?the group|parts? ways|contract (?:termination|terminated)|deja el grupo|sale del grupo", re.I),
}
# palabras que vuelven un titular inútil para esto (rumores, recuentos, listas)
NOISE = re.compile(r"\b(?:rumou?r|reportedly denies|denies|fake|ranking|predict|expected to|could|might|guess|quiz|which member|ahead of|upcoming|after (?:his|her) (?:enlistment|discharge))\b|추측|루머|앞두고|직후|언제|D-\d|\?", re.I)
NEAR = 30  # el nombre del miembro tiene que estar en los NEAR caracteres antes de la palabra clave, sin otro miembro en medio


def norm_name(n: str) -> str:
    return re.escape(n).replace(r"\ ", r"[\s\-]?").replace(r"\.", r"\.?")


def name_re(name: str, ko: str) -> re.Pattern:
    # sin letras pegadas, y que no sea un mes ("Jun 16") ni una ciudad ("San Francisco")
    alts = [rf"(?<![A-Za-z]){norm_name(name)}(?![A-Za-z])(?!\s*\d)(?!\s+(?:Francisco|Diego|Jos[eé]|Antonio|Juan|Pablo|Andr[eé]s)\b)"]
    if ko:
        alts.append(re.escape(ko))
    flags = 0 if len(name) <= 3 else re.I  # San, Jun, DK, V, Han: solo en mayúscula exacta
    return re.compile("|".join(alts), flags)


def news(q: str, lang: str) -> list[dict]:
    loc = "hl=ko&gl=KR&ceid=KR:ko" if lang == "ko" else "hl=en-US&gl=US&ceid=US:en"
    url = f"https://news.google.com/rss/search?q={urllib.parse.quote(q)}+when:60d&{loc}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
        root = ET.fromstring(r.read())
    return [{"title": it.findtext("title") or "", "link": it.findtext("link") or "", "pubDate": it.findtext("pubDate") or ""} for it in root.iter("item")][:40]


def when_of(p: dict) -> datetime | None:
    try:
        return parsedate_to_datetime(p["pubDate"]).astimezone(timezone.utc)
    except (TypeError, ValueError, KeyError):
        return None


def watched(people: dict, roster: dict) -> dict:
    """grupo -> lista de (id, nombre, ko, tipos que interesan)."""
    out = {}
    for gid, mems in roster.items():
        pg = people.get(gid, {})
        lst = []
        for m in mems:
            st = (pg.get("members", {}).get(m["id"], {}).get("status") or {}).get("kind")
            kinds = {"military": ["discharge"], "pending": ["return"]}.get(st, ["enlist", "leave"])
            lst.append((m["id"], m["name"], m.get("ko", ""), kinds))
        for fid, f in (pg.get("former") or {}).items():
            lst.append((fid, f["name"], f.get("ko", ""), ["return"]))
        out[gid] = lst
    return out


def classify(text: str, gid: str, group_re: re.Pattern, mems: list) -> list[tuple[str, str]]:
    """(miembro, tipo) para cada miembro que es el sujeto de una palabra clave: "세븐틴 호시, 오늘 전역", "Heeseung leaves the group".
    El nombre va ANTES de la palabra y es el último nombre del grupo antes de ella: así "해린은 복귀·다니엘은 소송" no cuenta como regreso de Danielle."""
    if not group_re.search(text) or NOISE.search(text):
        return []
    res = {mid: name_re(name, ko) for mid, name, ko, _ in mems}
    hits = []
    for mid, name, ko, kinds in mems:
        for k in kinds:
            if k == "return" and re.search(r"\bsolo\b|솔로|홀로서기|독자\s*활동", text, re.I):
                continue  # "regresa con su álbum solista" no es volver al grupo
            rx = KIND_RE[k]
            if k == "return":  # "Danielle returns to NewJeans"
                rx = re.compile(rx.pattern + r"|(?:returns?|comes? back|is back) to (?:" + group_re.pattern + ")", re.I)
            for kw in rx.finditer(text):
                win = text[max(0, kw.start() - NEAR):kw.start()]
                last = max(((m.end(), other) for other, rx in res.items() for m in rx.finditer(win)), default=None)
                if last and last[1] == mid:
                    hits.append((mid, k))
                    break
            else:
                continue
            break
    return hits


def main() -> int:
    now = datetime.now(timezone.utc)
    people = json.loads(PEOPLE.read_text(encoding="utf-8")).get("groups", {})
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))
    aliases = json.loads(FEEDS.read_text(encoding="utf-8")).get("aliases", {})
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"items": []}
    items = {x["url"]: x for x in old.get("items", []) if now - datetime.fromisoformat(x["when"].replace("Z", "+00:00")) < KEEP}
    watch = watched(people, roster)
    group_res = {g: re.compile("|".join(re.escape(n) for n in aliases.get(g, {}).get("names", [g])), re.I) for g in watch}

    def add(gid: str, mid: str, kind: str, p: dict, official: bool) -> None:
        w = when_of(p)
        if not w or now - w > KEEP or not p.get("link", "").startswith("https://"):
            return
        item = {"group": gid, "member": mid, "kind": kind, "official": official, "title": " ".join(p["title"].split())[:200],
                "url": p["link"], "when": w.strftime("%Y-%m-%dT%H:%M:%SZ")}
        if kind == "enlist" and official:
            ds = [d for _, d in find_dates(p["title"], w.date() - timedelta(days=1))]
            if ds:
                item["date"] = ds[0].isoformat()
        elif kind in ("discharge", "return") and official:
            item["date"] = w.date().isoformat()
        prev = items.get(item["url"])
        if not prev or (official and not prev.get("official")):
            items[item["url"]] = item

    # 1) posts oficiales (sin retweets: un RT de un fan no es un aviso)
    official = 0
    for p in json.loads(SOCIAL.read_text(encoding="utf-8")).get("items", []) if SOCIAL.exists() else []:
        gid = p.get("group")
        if gid not in watch or p["title"].startswith("RT ") or "/status/" not in p.get("link", ""):
            continue
        text = p["title"] + " " + p.get("summary", "")
        # en su propia cuenta el grupo no siempre se nombra: basta el nombre del miembro
        for mid, kind in classify(text + " " + (aliases.get(gid, {}).get("names") or [gid])[0], gid, group_res[gid], watch[gid]):
            add(gid, mid, kind, p, True)
            official += 1

    # 2) Google News, como mucho cada NEWS_GAP
    last = old.get("news_at")
    ran_news = ok = bad = 0
    if "--force" in sys.argv or not last or now - datetime.fromisoformat(last.replace("Z", "+00:00")) >= NEWS_GAP:
        ran_news = 1
        for gid, mems in watch.items():
            name = (aliases.get(gid, {}).get("names") or [gid])[0]
            ko = next((n for n in aliases.get(gid, {}).get("names", []) if re.search(r"[가-힣]", n)), "")
            # en noticias solo se buscan regresos (del servicio o al grupo): enlistarse o salir solo cuenta con aviso oficial
            news_mems = [m for m in mems if m[3] in (["discharge"], ["return"])]
            if not news_mems:
                continue
            queries = [(f'"{name}" (discharged OR "completes military" OR rejoin OR "returns to")', "en")]
            if ko:
                queries.append((f"{ko} (전역 OR 소집해제 OR 복귀 OR 재합류)", "ko"))
            queries += [(f'"{n}" "{name}" (return OR rejoin OR comeback)', "en") for _, n, _, k in news_mems if k == ["return"]]
            for q, lang in queries:
                try:
                    for p in news(q, lang):
                        for mid, kind in classify(p["title"], gid, group_res[gid], news_mems):
                            add(gid, mid, kind, p, False)
                    ok += 1
                except Exception as exc:  # noqa: BLE001
                    bad += 1
                    print(f"Google News ({gid}): {exc}", file=sys.stderr)
                time.sleep(1.0)
        report("rosterwatch", ok > 0, "" if ok else "Google News no respondió")

    doc = {"updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "news_at": now.strftime("%Y-%m-%dT%H:%M:%SZ") if ran_news else old.get("news_at"),
           "items": sorted(items.values(), key=lambda x: x["when"], reverse=True)}
    if doc["items"] != old.get("items") or doc["news_at"] != old.get("news_at"):
        OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"rosterwatch.json: {len(items)} hallazgos ({official} oficiales en esta corrida)" + (f", noticias: {ok} consultas bien, {bad} fallaron" if ran_news else ", noticias: aún no toca"))
    return 0


if __name__ == "__main__":
    sys.exit(main())

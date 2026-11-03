"""Lector de tablas de fechas de giras de Wikipedia (wikitext) para updater/wiki_tours.py.

Las tablas de giras traen columnas Fecha / Ciudad / País / Recinto (y a veces asistencia e ingresos), con celdas combinadas
(rowspan: una ciudad o un recinto sirve para varias fechas) y notas ({{Efn}}, <ref>). Aquí se aplanan a una lista de filas
{"date": "2026-11-19", "city": "Kaohsiung", "city_link": "Kaohsiung", "country": "Taiwan", "venue": "...", "cancelled": False}.

Solo usa la biblioteca estándar. Si una tabla no se entiende (no hay columna de fecha o de ciudad), se ignora: mejor no agregar
nada que agregar algo mal.
"""
from __future__ import annotations

import re
from datetime import date

MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"])}
MONTHS.update({k[:3]: v for k, v in list(MONTHS.items())})
MONTHS["sept"] = 9
CANCEL = re.compile(r"cancel|postpone|reschedul", re.I)


def strip_markup(s: str) -> str:
    """Texto plano de una celda: sin referencias, plantillas, enlaces ni HTML."""
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<ref[^>]*?/>|<ref[^>]*?>.*?</ref>", "", s, flags=re.S)
    for _ in range(4):  # plantillas anidadas, de adentro hacia afuera
        s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"<br\s*/?>", " / ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("'''", "").replace("''", "").replace("&nbsp;", " ").replace("&ndash;", "-")
    return re.sub(r"\s+", " ", s).strip(" /")


def first_link(s: str) -> str | None:
    """Título del primer enlace [[...]] de la celda (sirve para pedir sus coordenadas a Wikipedia)."""
    s = re.sub(r"<ref[^>]*?/>|<ref[^>]*?>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    m = re.search(r"\[\[([^\]|#]+)", s)
    return m.group(1).strip() if m else None


def split_cells(row: str) -> list[tuple[str, int, bool, int]]:
    """Celdas de una fila: (texto crudo, rowspan, es_encabezado, colspan). Soporta '||' y '!!' en la misma línea."""
    cells = []
    for line in row.split("\n"):
        if not line or line[0] not in "|!" or line.startswith(("|}", "|+", "{|")):
            if cells and line and line[0] not in "|!":
                cells[-1] = (cells[-1][0] + " " + line, cells[-1][1], cells[-1][2], cells[-1][3])  # continuación de la celda anterior
            continue
        head = line[0] == "!"
        for part in re.split(r"\|\||!!", line[1:]):
            attrs, sep, body = part.partition("|") if re.match(r"\s*[a-z-]+\s*=", part.split("|")[0]) and "[[" not in part.split("|")[0] else ("", "", part)
            rs = re.search(r'rowspan\s*=\s*"?(\d+)', attrs)
            cs = re.search(r'colspan\s*=\s*"?(\d+)', attrs)
            cells.append((body if sep else part, int(rs.group(1)) if rs else 1, head, int(cs.group(1)) if cs else 1))
    return cells


def parse_date(text: str, default_year: int | None) -> date | None:
    t = strip_markup(text)
    m = re.search(r"([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\s*[-–]\s*\d{1,2})?(?:,?\s*(\d{4}))?", t)
    d = re.search(r"(\d{1,2})\s+([A-Za-z]{3,9})\.?(?:,?\s*(\d{4}))?", t)
    try:
        if m and m.group(1).lower() in MONTHS:
            mon, day, yr = MONTHS[m.group(1).lower()], int(m.group(2)), m.group(3)
        elif d and d.group(2).lower() in MONTHS:
            mon, day, yr = MONTHS[d.group(2).lower()], int(d.group(1)), d.group(3)
        else:
            iso = re.search(r"(20\d\d)-(\d\d)-(\d\d)", t)
            return date(int(iso.group(1)), int(iso.group(2)), int(iso.group(3))) if iso else None
        year = int(yr) if yr else default_year
        return date(year, mon, day) if year else None
    except ValueError:
        return None


def parse_tables(wikitext: str) -> list[dict]:
    """Todas las filas de fecha de todas las tablas que tengan columnas de fecha y ciudad."""
    out: list[dict] = []
    for m in re.finditer(r"\{\|.*?\n\|\}", wikitext, re.S):
        table = m.group(0)
        caption = re.search(r"\n\|\+(.*)", table)
        rows = re.split(r"\n\|-[^\n]*", table)
        header = [strip_markup(c[0]).lower() for r in rows[:2] for c in split_cells(r) if c[2]]
        idx = {}
        for i, h in enumerate(header):
            for key in ("date", "city", "country", "venue"):
                if key in h and key not in idx:
                    idx[key] = i
        if "date" not in idx or "city" not in idx:
            continue
        ycap = re.search(r"(20\d\d)", (caption.group(1) if caption else "") + " " + " ".join(header))
        default_year = int(ycap.group(1)) if ycap else None
        spans: dict[int, list] = {}  # columna -> [filas que faltan, texto crudo]
        for r in rows[1:]:
            cells = split_cells(r)
            if not cells or all(c[2] and "scope" not in c[0] and not strip_markup(c[0]) for c in cells):
                continue
            row, col, ci = {}, 0, 0
            # la fecha es el encabezado de fila (!) o la primera celda; el resto se acomoda en las columnas que no tienen rowspan activo
            ncols = max(idx.values()) + 1
            while col < ncols:
                if col in spans and spans[col][0] > 0:
                    row[col] = spans[col][1]; spans[col][0] -= 1; col += 1; continue
                if ci >= len(cells):
                    break
                raw, rs, _, cs = cells[ci]; ci += 1
                for k in range(cs):  # colspan: la misma celda ocupa varias columnas (p. ej. "Singapore" como ciudad y país)
                    row[col + k] = raw
                    if rs > 1:
                        spans[col + k] = [rs - 1, raw]
                col += cs
            if idx["date"] not in row:
                continue
            raw_date = row[idx["date"]]
            d = parse_date(raw_date, default_year)
            if not d:
                continue
            city_raw = row.get(idx["city"], "")
            text_all = " ".join(row.values())
            out.append({
                "date": d.isoformat(),
                "city": strip_markup(city_raw),
                "city_link": first_link(city_raw),
                "country": strip_markup(row.get(idx.get("country", -1), "")),
                "venue": strip_markup(row.get(idx.get("venue", -1), "")) or None,
                "venue_link": first_link(row.get(idx.get("venue", -1), "")),
                "cancelled": bool(CANCEL.search(strip_markup(raw_date)) or re.search(r"<s>|<del>|\{\{strike", raw_date)
                              or CANCEL.search(re.sub(r"<ref.*?</ref>", "", text_all, flags=re.S)[:400] if "{{" in raw_date else "")),
            })
    return out

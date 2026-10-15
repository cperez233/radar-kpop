"""Genera los chibis SVG (estilo SD: cabeza enorme, cuerpo chiquito, ojos grandes) de cada miembro.

Uso: python tools/chibis.py
Lee tools/members.json y escribe:
  assets/chibis/<grupo>/<miembro>.svg   un sprite por miembro (viewBox 100 x 140, pies abajo)
  assets/chibis/<grupo>.svg             todo el grupo junto, para avatares pequeños
  assets/chibis/default.svg             chibi genérico para grupos nuevos
  assets/chibis/roster.json             nombres de los miembros para la web (build.py lo embebe)

Son personajes originales inspirados en el peinado y la ropa de una foto de cada grupo. No son retratos.
Para cambiar un peinado, un color o un gesto, edita tools/members.json y vuelve a correr este script.
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "chibis"
INK = "#2E2150"
SKIN = "#FFE6D6"
SKIN_SH = "#F8CDB8"
BLUSH = "#FF8FB8"
S = f'stroke="{INK}" stroke-linejoin="round" stroke-linecap="round"'
W = 'stroke-width="2.2"'

FILTER = ('<filter id="cut" x="-12%" y="-10%" width="124%" height="118%" color-interpolation-filters="sRGB">'
          '<feMorphology in="SourceAlpha" operator="dilate" radius="2.6" result="d"/>'
          '<feOffset in="d" dx="1.2" dy="2.4" result="o"/>'
          '<feFlood flood-color="#B9A4EE"/><feComposite in2="o" operator="in" result="sh"/>'
          '<feFlood flood-color="#FFFFFF"/><feComposite in2="d" operator="in" result="w"/>'
          '<feMerge><feMergeNode in="sh"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')


def mix(c1: str, c2: str, t: float) -> str:
    a = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(c2[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(a, b))


def light(c: str) -> bool:
    r, g, b = (int(c[i:i + 2], 16) for i in (1, 3, 5))
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150


def pts(points) -> str:
    return " ".join(f"L{x} {y}" for x, y in points)


# ---------------- cabello ----------------
CAP_TOP = "M{l} {ys} C{l} 20 29 7 50 7 C71 7 {r} 20 {r} {ys}"
FRONT = {
    "fringe": (60, [(86, 45), (79, 41), (72, 45), (64, 39), (57, 44), (50, 38), (43, 44), (36, 39), (28, 45), (21, 41), (14, 46)]),
    "zigzag": (62, [(85, 44), (80, 50), (74, 37), (68, 48), (61, 35), (55, 47), (48, 34), (42, 47), (35, 36), (29, 49), (22, 39), (15, 48)]),
    "curtain": (66, [(86, 50), (79, 40), (67, 32), (57, 27), (50, 31), (43, 27), (33, 32), (21, 40), (14, 50)]),
    "part": (64, [(87, 48), (80, 42), (69, 40), (57, 35), (46, 30), (39, 25), (33, 31), (27, 38), (20, 44), (14, 51)]),
    "swept": (56, [(87, 40), (78, 30), (64, 25), (50, 24), (36, 25), (22, 30), (13, 40)]),
    "long": (76, [(88, 58), (86, 45), (78, 43), (70, 46), (62, 42), (54, 46), (46, 42), (38, 46), (30, 42), (22, 46), (14, 45), (12, 58)]),
    "longpart": (78, [(88, 60), (81, 42), (66, 28), (50, 23), (34, 28), (19, 42), (12, 60)]),
}
STYLE = {  # peinado -> (flequillo, pelo de atrás)
    "fringe": ("fringe", "short"), "zigzag": ("zigzag", "short"), "curtain": ("curtain", "short"),
    "part": ("part", "short"), "swept": ("swept", "short"), "spiky": ("zigzag", "spiky"),
    "mullet": ("zigzag", "mullet"), "wavy": ("curtain", "wavy"), "long": ("long", "long"),
    "longpart": ("longpart", "long"), "bob": ("long", "bob"), "curly": ("curly", "curly"),
    "pony": ("fringe", "pony"), "lowpony": ("longpart", "lowpony"), "lowbun": ("curtain", "lowbun"),
    "spacebuns": ("long", "spacebuns"), "topbun": ("part", "topbun"), "updo": ("longpart", "updo"),
}


def front_hair(kind: str, hc: str) -> str:
    sh = mix(hc, "#FFFFFF", .38) if not light(hc) else mix(hc, "#FFFFFF", .55)
    if kind == "curly":
        bumps = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{hc}" {S} {W}/>' for x, y, r in
                        [(17, 44, 7), (27, 36, 8), (39, 31, 8), (52, 30, 8), (64, 32, 8), (75, 37, 8), (84, 45, 7)])
        cap = f'<path d="{CAP_TOP.format(l=9, r=91, ys=56)} L86 46 L14 46 Z" fill="{hc}" {S} {W}/>'
        return cap + bumps + f'<path d="M36 16 Q50 10 64 15" fill="none" stroke="{sh}" stroke-width="3" stroke-linecap="round"/>'
    ys, edge = FRONT[kind]
    d = CAP_TOP.format(l=9, r=91, ys=ys) + " " + pts(edge) + f" L9 {ys} Z"
    out = f'<path d="{d}" fill="{hc}" {S} {W}/>'
    out += f'<path d="M30 17 Q44 10 58 12" fill="none" stroke="{sh}" stroke-width="3.2" stroke-linecap="round"/>'
    if kind in ("curtain", "longpart"):
        out += f'<path d="M50 9 Q51 18 50 28" fill="none" stroke="{INK}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>'
    if kind == "swept":
        out += f'<path d="M34 10 Q46 -1 66 6 Q54 6 50 13 Z" fill="{hc}" {S} {W}/>'
    return out


def back_hair(kind: str, hc: str) -> str:
    dk = mix(hc, INK, .25)
    if kind == "short":
        return f'<ellipse cx="50" cy="44" rx="41.5" ry="35" fill="{hc}" {S} {W}/>'
    if kind == "spiky":
        sp = "".join(f'<path d="M{x - 7} {y + 8} L{x} {y - 9} L{x + 7} {y + 8} Z" fill="{hc}" {S} {W}/>' for x, y in
                     [(22, 16), (36, 7), (50, 3), (64, 7), (78, 16)])
        return sp + f'<ellipse cx="50" cy="44" rx="41.5" ry="35" fill="{hc}" {S} {W}/>'
    if kind == "mullet":
        return (f'<path d="M10 50 C10 18 30 8 50 8 C70 8 90 18 90 50 L92 80 Q86 86 80 78 L20 78 Q14 86 8 80 Z" fill="{hc}" {S} {W}/>')
    if kind == "wavy":
        return (f'<path d="M9 50 C9 18 30 8 50 8 C70 8 91 18 91 50 Q95 62 90 72 Q94 80 86 84 L14 84 Q6 80 10 72 Q5 62 9 50 Z" fill="{hc}" {S} {W}/>')
    if kind == "long":
        return (f'<path d="M9 50 C9 18 30 8 50 8 C70 8 91 18 91 50 L94 104 Q88 110 82 104 Q76 110 70 104 L30 104 Q24 110 18 104 Q12 110 6 104 Z" fill="{hc}" {S} {W}/>'
                f'<path d="M14 66 L13 98 M86 66 L87 98" stroke="{dk}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>')
    if kind == "bob":
        return f'<path d="M9 50 C9 18 30 8 50 8 C70 8 91 18 91 50 L93 82 Q50 92 7 82 Z" fill="{hc}" {S} {W}/>'
    if kind == "curly":
        blobs = [(10, 58, 9), (9, 76, 9), (12, 94, 9), (90, 58, 9), (91, 76, 9), (88, 94, 9), (22, 102, 8), (36, 106, 8), (50, 107, 8), (64, 106, 8), (78, 102, 8)]
        c = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{hc}" {S} {W}/>' for x, y, r in blobs)
        return c + f'<path d="M8 50 C8 16 30 6 50 6 C70 6 92 16 92 50 L92 92 Q50 104 8 92 Z" fill="{hc}" {S} {W}/>'
    if kind == "pony":
        return (f'<path d="M78 20 C104 20 104 62 96 98 C94 106 84 106 86 96 C92 64 90 40 74 30 Z" fill="{hc}" {S} {W}/>'
                f'<ellipse cx="50" cy="44" rx="41.5" ry="35" fill="{hc}" {S} {W}/>'
                f'<circle cx="80" cy="24" r="4" fill="{INK}"/>')
    if kind == "lowpony":
        return (f'<path d="M72 72 C90 76 92 96 86 112 C84 118 76 116 78 108 C82 96 78 86 66 80 Z" fill="{hc}" {S} {W}/>'
                f'<path d="M9 50 C9 18 30 8 50 8 C70 8 91 18 91 50 L92 70 L8 70 Z" fill="{hc}" {S} {W}/>')
    if kind == "lowbun":
        return (f'<circle cx="84" cy="76" r="10" fill="{hc}" {S} {W}/>'
                f'<path d="M9 50 C9 18 30 8 50 8 C70 8 91 18 91 50 L91 70 L9 70 Z" fill="{hc}" {S} {W}/>')
    if kind == "spacebuns":
        return (f'<circle cx="22" cy="14" r="10" fill="{hc}" {S} {W}/><circle cx="78" cy="14" r="10" fill="{hc}" {S} {W}/>'
                f'<path d="M17 12 Q22 8 27 12 M73 12 Q78 8 83 12" fill="none" stroke="{mix(hc, "#FFFFFF", .35)}" stroke-width="1.6" stroke-linecap="round"/>'
                f'<path d="M9 50 C9 18 30 8 50 8 C70 8 91 18 91 50 L93 96 Q50 104 7 96 Z" fill="{hc}" {S} {W}/>')
    if kind == "topbun":
        spikes = "".join(f'<path d="M50 6 L{50 + 13 * math.cos(a):.1f} {6 + 13 * math.sin(a):.1f}" stroke="{hc}" stroke-width="3.4" stroke-linecap="round"/>'
                         for a in (math.radians(v) for v in (-150, -115, -70, -30)))
        return (spikes + f'<circle cx="50" cy="8" r="9" fill="{hc}" {S} {W}/>'
                f'<ellipse cx="50" cy="44" rx="41.5" ry="35" fill="{hc}" {S} {W}/>')
    if kind == "updo":
        braid = ""
        for x in (11, 89):
            for i in range(6):
                braid += f'<ellipse cx="{x + (1.5 if i % 2 else -1.5)}" cy="{58 + i * 8}" rx="4" ry="5" fill="{hc}" {S} stroke-width="1.6"/>'
        return (braid + f'<circle cx="50" cy="7" r="10" fill="{hc}" {S} {W}/>'
                f'<ellipse cx="50" cy="44" rx="41.5" ry="35" fill="{hc}" {S} {W}/>')
    return ""


def accessory(kind: str, color: str) -> str:
    if kind == "headband":
        return (f'<path d="M11 40 Q50 2 89 40" fill="none" stroke="{INK}" stroke-width="8" stroke-linecap="round"/>'
                f'<path d="M11 40 Q50 2 89 40" fill="none" stroke="{color}" stroke-width="4.6" stroke-linecap="round"/>')
    if kind == "bandana":
        return (f'<path d="M9 46 C9 18 30 6 50 6 C70 6 91 18 91 46 Q50 34 9 46 Z" fill="{color}" {S} {W}/>'
                f'<path d="M88 40 L99 34 L97 48 Z M88 44 L98 54 L88 56 Z" fill="{color}" {S} {W}/>'
                f'<path d="M24 22 Q40 16 56 18" fill="none" stroke="{mix(color, "#FFFFFF", .3)}" stroke-width="2" stroke-linecap="round"/>')
    if kind == "beanie":
        return (f'<path d="M10 42 C10 14 30 4 50 4 C70 4 90 14 90 42 Z" fill="{color}" {S} {W}/>'
                f'<rect x="8" y="34" width="84" height="11" rx="5.5" fill="{mix(color, "#FFFFFF", .35)}" {S} {W}/>')
    if kind == "bow":
        return (f'<path d="M74 18 L62 9 L63 27 Z M74 18 L87 9 L86 27 Z" fill="{color}" {S} {W}/><circle cx="74" cy="18" r="4" fill="{color}" {S} {W}/>')
    if kind == "clip":
        return f'<rect x="62" y="22" width="18" height="5" rx="2.5" fill="{color}" {S} stroke-width="1.6" transform="rotate(-18 71 24)"/>'
    if kind == "hoops":
        return (f'<circle cx="11" cy="66" r="3.6" fill="none" stroke="#F5C542" stroke-width="1.8"/>'
                f'<circle cx="89" cy="66" r="3.6" fill="none" stroke="#F5C542" stroke-width="1.8"/>')
    return ""


# ---------------- cara ----------------
def eye(x: float, y: float, kind: str, iris: str, lashes: bool, side: int) -> str:
    if kind == "closed":
        return f'<path d="M{x - 8} {y + 1} Q{x} {y - 8} {x + 8} {y + 1}" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
    out = (f'<ellipse cx="{x}" cy="{y}" rx="8.2" ry="10.6" fill="{INK}"/>'
           f'<ellipse cx="{x}" cy="{y + 2}" rx="6.4" ry="8" fill="{iris}"/>'
           f'<ellipse cx="{x}" cy="{y + 5.8}" rx="4.4" ry="3" fill="{mix(iris, "#FFFFFF", .45)}"/>'
           f'<ellipse cx="{x}" cy="{y + .8}" rx="3.2" ry="4.2" fill="{INK}"/>'
           f'<circle cx="{x - 2.8}" cy="{y - 4}" r="3.4" fill="#fff"/>'
           f'<circle cx="{x + 3}" cy="{y + 4}" r="1.5" fill="#fff"/>'
           f'<path d="M{x - 9.4} {y - 5} Q{x} {y - 14.6} {x + 9.4} {y - 5}" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>')
    if lashes:
        ox = x + side * 9.4
        out += f'<path d="M{ox} {y - 5} L{ox + side * 3.4} {y - 8.6}" stroke="{INK}" stroke-width="2.4" stroke-linecap="round"/>'
    return out


def face(m: dict) -> str:
    iris = m.get("iris", "#6A4636")
    lashes = m.get("lashes", False)
    e = m.get("eyes", "open")
    lx, rx, y = 34.5, 65.5, 58
    if e == "happy":
        out = eye(lx, y, "closed", iris, lashes, -1) + eye(rx, y, "closed", iris, lashes, 1)
    elif e == "wink":
        out = eye(lx, y, "open", iris, lashes, -1) + eye(rx, y, "closed", iris, lashes, 1)
    else:
        out = eye(lx, y, "open", iris, lashes, -1) + eye(rx, y, "open", iris, lashes, 1)
    out += (f'<ellipse cx="24" cy="69" rx="6.2" ry="3.4" fill="{BLUSH}" opacity=".75"/>'
            f'<ellipse cx="76" cy="69" rx="6.2" ry="3.4" fill="{BLUSH}" opacity=".75"/>'
            f'<path d="M21 68.5 l1.6 -2 M24.5 68.5 l1.6 -2 M74 68.5 l1.6 -2 M77.5 68.5 l1.6 -2" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".9"/>')
    mo = m.get("mouth", "smile")
    if mo == "open":
        out += f'<path d="M45 70 Q50 79 55 70 Z" fill="#E8536F" {S} stroke-width="1.8"/><path d="M47.5 74.5 Q50 73 52.5 74.5" fill="none" stroke="#FF9DB5" stroke-width="1.6" stroke-linecap="round"/>'
    elif mo == "cat":
        out += f'<path d="M44.5 70 Q47.3 73.6 50 70.4 Q52.7 73.6 55.5 70" fill="none" stroke="{INK}" stroke-width="1.9" stroke-linecap="round"/>'
    elif mo == "grin":
        out += f'<path d="M43.5 69.5 Q50 80 56.5 69.5 Z" fill="#E8536F" {S} stroke-width="1.8"/><path d="M44.5 70.2 H55.5 L54.6 72 H45.4 Z" fill="#fff"/>'
    else:
        out += f'<path d="M46 70.5 Q50 74.5 54 70.5" fill="none" stroke="{INK}" stroke-width="1.9" stroke-linecap="round"/>'
    return out


# ---------------- cuerpo ----------------
def arm(x1, y1, x2, y2, color) -> str:
    return (f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{INK}" stroke-width="10.4" stroke-linecap="round"/>'
            f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{color}" stroke-width="6.2" stroke-linecap="round"/>'
            f'<circle cx="{x2}" cy="{y2}" r="4.4" fill="{SKIN}" {S} stroke-width="2"/>')


def small_heart(x, y, s, fill) -> str:
    return (f'<path d="M{x} {y + s} C{x - 1.6 * s} {y} {x - .9 * s} {y - 1.1 * s} {x} {y - .3 * s} '
            f'C{x + .9 * s} {y - 1.1 * s} {x + 1.6 * s} {y} {x} {y + s} Z" fill="{fill}" {S} stroke-width="1.6"/>')


def body(m: dict, gc: str) -> tuple[str, str]:
    """Devuelve (lo que va detrás de la cabeza, lo que va delante: brazos y manos)."""
    oc, inner = m.get("oc", gc), m.get("inner", "#FFFFFF")
    pants, shoe = m.get("pants", "#2B2638"), m.get("shoe", "#FFFFFF")
    sleeve = SKIN if m.get("outfit") == "tank" else oc
    legs = (f'<rect x="39" y="110" width="9.5" height="16" rx="4.5" fill="{pants}" {S} {W}/>'
            f'<rect x="51.5" y="110" width="9.5" height="16" rx="4.5" fill="{pants}" {S} {W}/>'
            f'<ellipse cx="43" cy="128.5" rx="7.2" ry="4.4" fill="{shoe}" {S} {W}/>'
            f'<ellipse cx="57" cy="128.5" rx="7.2" ry="4.4" fill="{shoe}" {S} {W}/>'
            f'<path d="M38 128 H48 M52 128 H62" stroke="{gc}" stroke-width="1.6" stroke-linecap="round"/>')
    torso = f'<path d="M35 92 Q35 84 44 84 H56 Q65 84 65 92 L67.5 112 Q68 116 63 116 H37 Q32 116 32.5 112 Z" fill="{oc}" {S} {W}/>'
    o = m.get("outfit", "tee")
    det = ""
    if o in ("jacket", "coat", "blazer", "suit"):
        det = (f'<path d="M44 84 L50 100 L56 84 Z" fill="{inner}" {S} stroke-width="1.6"/>'
               f'<path d="M44 84 L47 96 L41 92 Z M56 84 L53 96 L59 92 Z" fill="{mix(oc, "#000000", .18) if not light(oc) else mix(oc, "#000000", .1)}" {S} stroke-width="1.4"/>')
        if o == "blazer":
            det += f'<circle cx="50" cy="106" r="1.6" fill="{gc}"/>'
        if o == "coat":
            det += f'<path d="M50 100 V116" stroke="{INK}" stroke-width="1.4"/>'
    elif o == "shirt":
        det = (f'<path d="M43 84 L50 92 L57 84 L55 82 H45 Z" fill="{inner}" {S} stroke-width="1.6"/>'
               f'<path d="M50 92 V116" stroke="{INK}" stroke-width="1.2" opacity=".6"/>')
    elif o == "hoodie":
        det = (f'<path d="M38 86 Q50 98 62 86" fill="none" stroke="{INK}" stroke-width="1.8"/>'
               f'<path d="M46 92 V102 M54 92 V102" stroke="{inner}" stroke-width="1.6" stroke-linecap="round"/>'
               f'<path d="M41 106 H59" stroke="{mix(oc, INK, .3)}" stroke-width="1.6" stroke-linecap="round"/>')
    elif o == "knit":
        det = "".join(f'<path d="M{x} 88 Q{x + 2} 94 {x} 100 Q{x - 2} 106 {x} 112" fill="none" stroke="{mix(oc, INK, .22)}" stroke-width="1.4"/>' for x in (42, 50, 58))
    elif o == "stripes":
        det = "".join(f'<path d="M35 {y} H65" stroke="{inner}" stroke-width="2.2"/>' for y in (92, 99, 106))
    elif o == "tank":
        det = f'<path d="M42 84 Q50 92 58 84" fill="{SKIN}" {S} stroke-width="1.6"/><path d="M41 84 V90 M59 84 V90" stroke="{gc}" stroke-width="2"/>'
    elif o == "overalls":
        det = (f'<path d="M38 98 H62 L64 116 H36 Z" fill="{oc}" {S} stroke-width="1.6"/>'
               f'<path d="M40 98 L42 84 M60 98 L58 84" stroke="{oc}" stroke-width="3"/><circle cx="41" cy="98" r="1.4" fill="{gc}"/><circle cx="59" cy="98" r="1.4" fill="{gc}"/>')
        torso = torso.replace(f'fill="{oc}"', f'fill="{inner}"', 1)
    else:
        det = f'<path d="M43 84 Q50 90 57 84" fill="none" stroke="{INK}" stroke-width="1.6"/>'
    det += f'<path d="M36 112 H64" stroke="{gc}" stroke-width="2" stroke-linecap="round" opacity=".85"/>'

    pose = m.get("pose", "down")
    left = arm(36, 90, 28, 106, sleeve)
    right = arm(64, 90, 72, 106, sleeve)
    extra = ""
    if pose == "wave":
        right = arm(64, 90, 76, 74, sleeve)
        extra = f'<path d="M81 66 Q84 62 82 58 M85 70 Q90 68 90 63" fill="none" stroke="{gc}" stroke-width="1.8" stroke-linecap="round"/>'
    elif pose == "v":
        right = arm(64, 90, 76, 78, sleeve)
        extra = (f'<path d="M75 75 L72 64 M78 75 L80 64" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>'
                 f'<path d="M75 75 L72 64 M78 75 L80 64" stroke="{SKIN}" stroke-width="2.6" stroke-linecap="round"/>')
    elif pose == "heart":
        left = arm(36, 90, 46, 98, sleeve)
        right = arm(64, 90, 54, 98, sleeve)
        extra = small_heart(50, 90, 5.5, gc)
    elif pose == "hip":
        left = arm(36, 90, 30, 102, sleeve).replace('r="4.4"', 'r="4"')
        right = arm(64, 90, 70, 102, sleeve).replace('r="4.4"', 'r="4"')
    return legs + torso + det, left + right + extra


def sprite(m: dict, gc: str) -> str:
    """El dibujo de un miembro, sin <svg>: coordenadas 0..100 x 0..140."""
    hc = m.get("hc", "#2B2233")
    front_kind, back_kind = STYLE.get(m.get("hair", "fringe"), ("fringe", "short"))
    front_kind = m.get("front", front_kind)
    accs = m.get("acc", [])
    back_body, arms = body(m, gc)
    head = (f'<ellipse cx="11.5" cy="58" rx="4.6" ry="6.4" fill="{SKIN}" {S} {W}/>'
            f'<ellipse cx="88.5" cy="58" rx="4.6" ry="6.4" fill="{SKIN}" {S} {W}/>'
            f'<path d="M12 50 C12 25 29 13 50 13 C71 13 88 25 88 50 C88 72 72 86 50 86 C28 86 12 72 12 50 Z" fill="{SKIN}" {S} {W}/>'
            f'<path d="M30 80 Q50 90 70 80" fill="none" stroke="{SKIN_SH}" stroke-width="2" opacity=".8"/>')
    g = back_hair(back_kind, hc) + back_body + head + face(m) + front_hair(front_kind, hc)
    for a in accs:
        g += accessory(a, m.get("ac", gc))
    return g + arms


def svg_member(m: dict, gc: str, group_name: str) -> str:
    title = f'{m["name"]} ({group_name}), chibi'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" width="100" height="140" role="img" aria-label="{title}">'
            f'<title>{title}</title><defs>{FILTER}</defs><g filter="url(#cut)">{sprite(m, gc)}</g></svg>\n')


ROW = 58  # la fila de adelante baja lo justo para que se vean las caras de atrás


def crowd_layout(n: int):
    """Posiciones (x, y, fila) de n sprites de 100 x 140, en una o dos filas apretaditas."""
    step = 60
    if n <= 5:
        rows = [n]
    else:
        rows = [math.ceil(n / 2), n // 2]
    back = rows[0]
    width = 100 + (back - 1) * step
    out = []
    for r, k in enumerate(rows):
        off = (width - (100 + (k - 1) * step)) / 2
        for i in range(k):
            out.append((off + i * step, r * ROW, r))
    return out, width, 140 + (len(rows) - 1) * ROW


def svg_group(gid: str, g: dict, name: str) -> str:
    ms = g["members"]
    lay, w, h = crowd_layout(len(ms))
    defs = FILTER + "".join(f'<symbol id="{m["id"]}" viewBox="0 0 100 140">{sprite(m, g["color"])}</symbol>' for m in ms)
    uses = "".join(f'<use href="#{m["id"]}" x="{x:.0f}" y="{y}" width="100" height="140" filter="url(#cut)"/>' for m, (x, y, _) in zip(ms, lay))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 {w + 8:.0f} {h + 8}" width="{w + 8:.0f}" height="{h + 8}" role="img" aria-label="{name}, chibis">'
            f'<title>{name}, chibis</title><defs>{defs}</defs>{uses}</svg>\n')


def main() -> None:
    src = json.loads((ROOT / "tools" / "members.json").read_text(encoding="utf-8"))
    events = json.loads((ROOT / "events.json").read_text(encoding="utf-8"))
    names = {g["id"]: g["name"] for g in events["groups"]}
    roster = {}
    for gid, g in src["groups"].items():
        d = OUT / gid
        d.mkdir(parents=True, exist_ok=True)
        for old in d.glob("*.svg"):
            old.unlink()
        for m in g["members"]:
            (d / f'{m["id"]}.svg').write_text(svg_member(m, g["color"], names.get(gid, gid)), encoding="utf-8")
        (OUT / f"{gid}.svg").write_text(svg_group(gid, g, names.get(gid, gid)), encoding="utf-8")
        roster[gid] = [{"id": m["id"], "name": m["name"], "ko": m["ko"]} for m in g["members"]]
    generic = {"id": "fan", "name": "Fan", "hair": "fringe", "hc": "#5A4B82", "outfit": "hoodie", "oc": "#DCCFFF", "inner": "#FFFFFF", "eyes": "happy", "mouth": "open", "pose": "wave"}
    (OUT / "default.svg").write_text(svg_member(generic, "#FF5FA8", "Radar K-pop"), encoding="utf-8")
    (OUT / "roster.json").write_text(json.dumps(roster, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    total = sum(len(v) for v in roster.values())
    print(f"{total} chibis en {len(roster)} grupos")


if __name__ == "__main__":
    main()

"""Draws the chibi SVGs (K-pop fan-sticker style: big head, small body, big glossy eyes, layered hair locks).

Usage: python tools/chibis.py
Reads tools/members.json and writes:
  assets/chibis/<group>/<member>.svg   one sprite per member (viewBox 120 x 160, feet at the bottom)
  assets/chibis/<group>.svg            the whole group, for small avatars
  assets/chibis/default.svg            generic chibi for new groups
  assets/chibis/roster.json            member names for the site (build.py embeds it)

Every chibi is original art drawn in code, inspired by the hair and outfit in an official photo of each group.
They are not portraits. To change a hairstyle, a colour or a pose, edit tools/members.json and run this again.
Groups listed in tools/chibis_images.py (GROUPS) are built there from a hand-made sticker sheet: this script keeps
their names in roster.json but leaves their SVGs alone.
"""
import json
import math
from pathlib import Path

from chibis_images import GROUPS as STICKER_GROUPS

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "chibis"
OL = "#3B2433"          # line colour: warm dark plum, thinner than the old ink
SKIN = "#FFE8DA"
SKIN_SH = "#F7CBB6"
W, H = 120, 160
ROW = 66                # back row offset in group shots, so faces behind stay visible
STEP = 72


def mix(c1: str, c2: str, t: float) -> str:
    a = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(c2[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(a, b))


def lum(c: str) -> float:
    r, g, b = (int(c[i:i + 2], 16) for i in (1, 3, 5))
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255


def S(w: float = 1.6) -> str:
    return f'stroke="{OL}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"'


class Art:
    """Collects defs (gradients) with ids unique per member, so many members can live in one SVG."""

    def __init__(self, uid: str):
        self.uid, self.defs = uid, []

    def lin(self, name: str, stops, x2=0, y2=1) -> str:
        gid = f"{self.uid}-{name}"
        st = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
        self.defs.append(f'<linearGradient id="{gid}" x1="0" y1="0" x2="{x2}" y2="{y2}">{st}</linearGradient>')
        return f"url(#{gid})"

    def rad(self, name: str, stops) -> str:
        gid = f"{self.uid}-{name}"
        st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
        self.defs.append(f'<radialGradient id="{gid}">{st}</radialGradient>')
        return f"url(#{gid})"


# ---------------- hair ----------------
def smooth(pts, closed=True) -> str:
    """Catmull-Rom through the points, as cubic Bezier segments: organic curves without hand-tuning controls."""
    n = len(pts)
    d = f"M{pts[0][0]:.1f} {pts[0][1]:.1f}"
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        if not closed:
            p0 = pts[max(i - 1, 0)]
            p3 = pts[min(i + 2, n - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}"
    return d + (" Z" if closed else "")


def lock(xr, yr, xt, yt, w, bend, fill, sw=1.4) -> str:
    """One petal-shaped lock of hair from a root (xr, yr) to a sharp tip (xt, yt), curved by `bend`."""
    dx, dy = xt - xr, yt - yr
    n = math.hypot(dx, dy) or 1
    px, py = -dy / n, dx / n
    left, right = [], []
    for t in (0, .22, .45, .7, .88):
        cx = xr + dx * t + px * bend * math.sin(math.pi * t)
        cy = yr + dy * t + py * bend * math.sin(math.pi * t)
        half = w / 2 * (1 - t) ** .75 * (1 + .25 * math.sin(math.pi * t))
        left.append((cx - px * half, cy - py * half))
        right.append((cx + px * half, cy + py * half))
    tip = (xt + px * bend * .1, yt + py * bend * .1)
    d = smooth(left + [tip] + right[::-1])
    return f'<path d="{d}" fill="{fill}" {S(sw)}/>'


CAP = "M16 74 C10 34 33 12 60 12 C87 12 110 34 104 74 C100 56 92 42 60 38 C28 42 20 56 16 74 Z"
CAP_LINE = "M16 74 C10 34 33 12 60 12 C87 12 110 34 104 74"


def fringe_locks(kind: str, fill: str) -> str:
    out = ""
    if kind == "fringe":       # bangs falling to the brows
        for xr, xt, yt, b in [(30, 24, 56, -3), (40, 34, 52, -2), (50, 46, 54, -2), (60, 58, 51, 0), (70, 70, 54, 2), (80, 84, 52, 2), (90, 96, 57, 3)]:
            out += lock(xr, 22, xt, yt, 16, b, fill)
    elif kind == "swept":      # side-swept bangs
        for i, (xr, xt, yt) in enumerate([(86, 70, 48), (76, 56, 50), (66, 44, 52), (56, 32, 56), (46, 24, 62)]):
            out += lock(xr, 20, xt, yt, 18, 7, fill)
        out += lock(94, 26, 100, 58, 14, 3, fill)
    elif kind == "curtain":    # centre part, forehead showing
        for xt, yt in [(44, 46), (32, 56), (24, 70)]:
            out += lock(58, 18, xt, yt, 16, -6, fill)
        for xt, yt in [(76, 46), (88, 56), (96, 70)]:
            out += lock(62, 18, xt, yt, 16, 6, fill)
    elif kind == "up":         # pompadour, forehead showing
        for xr, xt, yt, b in [(34, 30, 12, 4), (46, 44, 6, 3), (58, 60, 4, 0), (70, 76, 6, -3), (82, 90, 14, -4)]:
            out += lock(xr, 38, xt, yt, 18, b, fill)
        out += lock(22, 44, 18, 72, 12, -2, fill) + lock(98, 44, 102, 72, 12, 2, fill)
    elif kind == "spiky":      # messy short spikes
        for xr, xt, yt, b in [(30, 18, 14, 3), (44, 36, 2, 2), (60, 62, 0, 0), (76, 86, 4, -2), (90, 104, 18, -3)]:
            out += lock(xr, 30, xt, yt, 16, b, fill)
        for xr, xt, yt, b in [(34, 28, 54, -2), (48, 44, 50, -1), (62, 62, 52, 0), (76, 80, 50, 1), (88, 94, 54, 2)]:
            out += lock(xr, 24, xt, yt, 14, b, fill)
    elif kind == "long":       # straight bangs for long hair
        for xr, xt, yt, b in [(32, 26, 54, -2), (42, 38, 52, -1), (52, 50, 53, 0), (62, 62, 52, 0), (72, 74, 53, 1), (84, 88, 54, 2)]:
            out += lock(xr, 22, xt, yt, 15, b, fill)
    elif kind == "open":       # middle part without bangs
        out += lock(58, 16, 24, 76, 26, -10, fill) + lock(62, 16, 96, 76, 26, 10, fill)
    return out


def side_locks(kind: str, fill: str, long: bool) -> str:
    y = 104 if long else 88
    if kind in ("up",):
        return ""
    if kind == "spiky":
        return lock(24, 48, 19, 80, 8, -2, fill) + lock(96, 48, 101, 80, 8, 2, fill)
    return lock(25, 46, 19, y, 9, -3, fill) + lock(95, 46, 101, y, 9, 3, fill)


def back_hair(kind: str, fill: str, dark: str) -> str:
    if kind == "short":
        return f'<path d="M14 72 C8 32 32 10 60 10 C88 10 112 32 106 72 C104 78 98 80 94 75 L26 75 C22 80 16 78 14 72 Z" fill="{fill}" {S()}/>'
    if kind == "mullet":
        return (f'<path d="M14 76 C8 34 32 10 60 10 C88 10 112 34 106 76 L108 104 L98 96 L94 108 L84 98 L36 98 L26 108 L22 96 L12 104 Z" fill="{fill}" {S()}/>')
    if kind == "wavy":
        return (f'<path d="M14 76 C8 34 32 10 60 10 C88 10 112 34 106 76 Q112 88 104 96 Q110 104 98 106 L22 106 Q10 104 16 96 Q8 88 14 76 Z" fill="{fill}" {S()}/>')
    if kind == "long":
        return (f'<path d="M14 74 C8 32 32 10 60 10 C88 10 112 32 106 74 L112 132 L102 124 L98 138 L88 126 L32 126 L22 138 L18 124 L8 132 Z" fill="{fill}" {S()}/>'
                f'<path d="M18 92 L16 122 M102 92 L104 122" stroke="{dark}" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>')
    if kind == "bob":
        return f'<path d="M14 74 C8 32 32 10 60 10 C88 10 112 32 106 74 L108 104 Q100 112 92 104 L28 104 Q20 112 12 104 Z" fill="{fill}" {S()}/>'
    if kind == "curly":
        blobs = [(14, 70, 11), (12, 90, 11), (16, 110, 11), (106, 70, 11), (108, 90, 11), (104, 110, 11), (30, 120, 10), (48, 124, 10), (72, 124, 10), (90, 120, 10)]
        c = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" {S()}/>' for x, y, r in blobs)
        return c + f'<path d="M12 72 C8 30 32 8 60 8 C88 8 112 30 108 72 L110 116 Q60 130 10 116 Z" fill="{fill}" {S()}/>'
    if kind == "pony":
        return (f'<path d="M92 28 C122 30 120 80 110 120 C108 128 98 128 100 118 C108 82 106 50 88 40 Z" fill="{fill}" {S()}/>'
                + back_hair("short", fill, dark) + f'<circle cx="94" cy="32" r="4.5" fill="#FF7FB0" {S(1.2)}/>')
    if kind == "lowpony":
        return (f'<path d="M84 84 C106 90 108 116 100 136 C98 142 88 140 90 132 C96 116 92 104 78 94 Z" fill="{fill}" {S()}/>'
                + back_hair("short", fill, dark))
    if kind == "lowbun":
        return f'<circle cx="100" cy="88" r="12" fill="{fill}" {S()}/>' + back_hair("short", fill, dark)
    if kind == "spacebuns":
        return (f'<circle cx="28" cy="16" r="12" fill="{fill}" {S()}/><circle cx="92" cy="16" r="12" fill="{fill}" {S()}/>'
                + back_hair("long", fill, dark))
    if kind == "topbun":
        return (f'<path d="M60 6 L48 -2 M60 6 L54 -6 M60 6 L68 -6 M60 6 L74 -1" stroke="{fill}" stroke-width="3.4" stroke-linecap="round"/>'
                f'<circle cx="60" cy="8" r="11" fill="{fill}" {S()}/>' + back_hair("short", fill, dark))
    if kind == "updo":
        braid = ""
        for x in (14, 106):
            for i in range(7):
                braid += f'<ellipse cx="{x + (1.6 if i % 2 else -1.6)}" cy="{70 + i * 9}" rx="4.6" ry="5.6" fill="{fill}" {S(1.2)}/>'
        return braid + f'<circle cx="60" cy="7" r="12" fill="{fill}" {S()}/>' + back_hair("short", fill, dark)
    return back_hair("short", fill, dark)


STYLE = {  # hairstyle -> (fringe, back, long side locks)
    "fringe": ("fringe", "short", False), "zigzag": ("spiky", "short", False), "curtain": ("curtain", "short", False),
    "part": ("swept", "short", False), "swept": ("up", "short", False), "spiky": ("spiky", "short", False),
    "mullet": ("fringe", "mullet", False), "wavy": ("curtain", "wavy", False), "long": ("long", "long", True),
    "longpart": ("open", "long", True), "bob": ("long", "bob", False), "curly": ("long", "curly", True),
    "pony": ("fringe", "pony", False), "lowpony": ("open", "lowpony", False), "lowbun": ("curtain", "lowbun", False),
    "spacebuns": ("long", "spacebuns", True), "topbun": ("swept", "topbun", False), "updo": ("open", "updo", False),
}


def accessory(kind: str, color: str) -> str:
    if kind == "headband":
        return (f'<path d="M18 50 Q60 6 102 50" fill="none" stroke="{OL}" stroke-width="8" stroke-linecap="round"/>'
                f'<path d="M18 50 Q60 6 102 50" fill="none" stroke="{color}" stroke-width="5" stroke-linecap="round"/>')
    if kind == "bandana":
        return (f'<path d="M14 56 C12 22 34 8 60 8 C86 8 108 22 106 56 Q60 40 14 56 Z" fill="{color}" {S()}/>'
                f'<path d="M104 48 L118 40 L116 58 Z M104 54 L116 66 L104 68 Z" fill="{color}" {S()}/>'
                f'<path d="M30 26 Q46 18 62 20" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" opacity=".35"/>')
    if kind == "beanie":
        return (f'<path d="M14 52 C14 18 34 4 60 4 C86 4 106 18 106 52 Z" fill="{color}" {S()}/>'
                f'<rect x="12" y="42" width="96" height="13" rx="6.5" fill="{mix(color, "#FFFFFF", .3)}" {S()}/>')
    if kind == "bow":
        return (f'<path d="M90 24 L76 14 L77 34 Z M90 24 L104 14 L103 34 Z" fill="{color}" {S()}/><circle cx="90" cy="24" r="4.4" fill="{color}" {S()}/>')
    if kind == "clip":
        return f'<rect x="74" y="28" width="22" height="6" rx="3" fill="{color}" {S(1.2)}/>'
    if kind == "hoops":
        return (f'<circle cx="19" cy="78" r="4" fill="none" stroke="#F2C14E" stroke-width="2"/>'
                f'<circle cx="101" cy="78" r="4" fill="none" stroke="#F2C14E" stroke-width="2"/>')
    return ""


# ---------------- face ----------------
def eyes(m: dict, art: Art, delay: float) -> str:
    iris = m.get("iris", "#7A4A34")
    grad = art.lin("iris", [(0, mix(iris, OL, .65)), (.55, iris), (1, mix(iris, "#FFD9A8", .45))])
    lashes = m.get("lashes", False)
    kind = m.get("eyes", "open")

    def open_eye(x: float, side: int) -> str:
        y = 68
        e = (f'<ellipse cx="{x}" cy="{y}" rx="8.6" ry="10.6" fill="#FFFFFF" {S(1.2)}/>'
             f'<ellipse cx="{x}" cy="{y + 1}" rx="7.4" ry="9.6" fill="{grad}"/>'
             f'<ellipse cx="{x}" cy="{y + 1.5}" rx="3.6" ry="4.8" fill="{mix(iris, OL, .8)}"/>'
             f'<ellipse cx="{x - 2.8}" cy="{y - 3.8}" rx="3.2" ry="3.8" fill="#FFFFFF"/>'
             f'<circle cx="{x + 3.2}" cy="{y + 4.4}" r="1.6" fill="#FFFFFF"/>'
             f'<circle cx="{x - 4.2}" cy="{y + 3.2}" r=".8" fill="#FFFFFF" opacity=".8"/>'
             f'<path d="M{x - 9.4} {y - 5.4} Q{x} {y - 15} {x + 9.4} {y - 5.4}" fill="none" stroke="{OL}" stroke-width="3.2" stroke-linecap="round"/>')
        tip = x + side * 9.4
        e += f'<path d="M{tip} {y - 5.4} L{tip + side * (4 if lashes else 2)} {y - (9 if lashes else 7)}" stroke="{OL}" stroke-width="{2.4 if lashes else 2}" stroke-linecap="round"/>'
        if lashes:
            e += f'<path d="M{tip - side * 1.5} {y - 2} L{tip + side * 3} {y - 4}" stroke="{OL}" stroke-width="1.6" stroke-linecap="round"/>'
        e += f'<path d="M{x - 5} {y + 11} Q{x} {y + 12.4} {x + 5} {y + 11}" fill="none" stroke="{OL}" stroke-width="1" opacity=".35" stroke-linecap="round"/>'
        return e

    def closed(x: float) -> str:
        return f'<path d="M{x - 8} {y0 + 1} Q{x} {y0 - 8} {x + 8} {y0 + 1}" fill="none" stroke="{OL}" stroke-width="3" stroke-linecap="round"/>'

    y0 = 68
    if kind == "happy":
        return closed(44) + closed(76)
    left = open_eye(44, -1)
    right = closed(76) if kind == "wink" else open_eye(76, 1)
    # parpadeo propio del SVG: cambios en pasos, sin repintar entre parpadeos
    blink = (f'<style>.b{art.uid}{{transform-box:fill-box;transform-origin:center;animation:k{art.uid} 5.2s steps(1) {delay:.2f}s infinite}}'
             f'@keyframes k{art.uid}{{0%{{transform:none}}94%{{transform:scaleY(.12)}}97%{{transform:none}}}}'
             f'@media (prefers-reduced-motion:reduce){{.b{art.uid}{{animation:none}}}}</style>')
    if kind == "wink":
        return blink + f'<g class="b{art.uid}">{left}</g>' + right
    return blink + f'<g class="b{art.uid}">{left}{right}</g>'


def face(m: dict, art: Art, delay: float) -> str:
    blush = art.rad("blush", [(0, "#FF8FB3", .75), (1, "#FF8FB3", 0)])
    out = (f'<path d="M36 52 Q42 49 48 51 M72 51 Q78 49 84 52" fill="none" stroke="{mix(m.get("hc", "#2B2233"), OL, .3)}" stroke-width="1.6" stroke-linecap="round"/>'
           + eyes(m, art, delay)
           + f'<ellipse cx="34" cy="83" rx="9" ry="5.5" fill="{blush}"/><ellipse cx="86" cy="83" rx="9" ry="5.5" fill="{blush}"/>'
           f'<path d="M31 82 l2 -2.4 M35 82 l2 -2.4 M83 82 l2 -2.4 M87 82 l2 -2.4" stroke="#FFFFFF" stroke-width="1" stroke-linecap="round" opacity=".9"/>'
           f'<path d="M60 77 l-1 2.2" stroke="{SKIN_SH}" stroke-width="1.4" stroke-linecap="round"/>')
    mo = m.get("mouth", "smile")
    if mo == "open":
        out += (f'<path d="M54.5 85 Q60 94 65.5 85 Z" fill="#D9566F" {S(1.3)}/>'
                f'<path d="M57 89.5 Q60 88 63 89.5" fill="none" stroke="#FF9DB5" stroke-width="1.6" stroke-linecap="round"/>')
    elif mo == "cat":
        out += f'<path d="M54 85 Q57 88.6 60 85.4 Q63 88.6 66 85" fill="none" stroke="{OL}" stroke-width="1.6" stroke-linecap="round"/>'
    elif mo == "grin":
        out += (f'<path d="M53 84.5 Q60 95 67 84.5 Z" fill="#D9566F" {S(1.3)}/>'
                f'<path d="M54 85.2 H66 L65 87.2 H55 Z" fill="#FFFFFF"/>')
    else:
        out += f'<path d="M56 86 Q60 89.4 64 86" fill="none" stroke="{OL}" stroke-width="1.6" stroke-linecap="round"/>'
    return out


# ---------------- body ----------------
def sleeve(x1, y1, x2, y2, color) -> str:
    return (f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{OL}" stroke-width="11" stroke-linecap="round"/>'
            f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{color}" stroke-width="7.8" stroke-linecap="round"/>')


def hand(x, y, r=4.6) -> str:
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{SKIN}" {S(1.4)}/>'


def small_heart(x, y, s, fill) -> str:
    return (f'<path d="M{x} {y + s} C{x - 1.6 * s} {y} {x - .9 * s} {y - 1.1 * s} {x} {y - .3 * s} '
            f'C{x + .9 * s} {y - 1.1 * s} {x + 1.6 * s} {y} {x} {y + s} Z" fill="{fill}" {S(1.2)}/>')


def body(m: dict, gc: str, art: Art) -> tuple[str, str]:
    oc, inner = m.get("oc", gc), m.get("inner", "#FFFFFF")
    pants, shoe = m.get("pants", "#2E2A3A"), m.get("shoe", "#FFFFFF")
    o = m.get("outfit", "tee")
    cloth = art.lin("cloth", [(0, mix(oc, "#FFFFFF", .14)), (1, mix(oc, "#000000", .12))])
    sl = SKIN if o == "tank" else cloth
    legs = (f'<rect x="47" y="134" width="11" height="15" rx="5" fill="{pants}" {S()}/>'
            f'<rect x="62" y="134" width="11" height="15" rx="5" fill="{pants}" {S()}/>'
            f'<path d="M43 154 Q43 147 52 147 Q60 147 59 154 Z" fill="{shoe}" {S()}/>'
            f'<path d="M61 154 Q60 147 68 147 Q77 147 77 154 Z" fill="{shoe}" {S()}/>'
            f'<path d="M45 151.5 H57 M63 151.5 H75" stroke="{gc}" stroke-width="1.4" stroke-linecap="round"/>')
    neck = f'<rect x="54" y="94" width="12" height="10" rx="3" fill="{SKIN_SH}" {S(1.2)}/>'
    torso = f'<path d="M41 108 Q41 101 49 100 L71 100 Q79 101 79 108 L83 134 Q83 138 79 138 L41 138 Q37 138 37 134 Z" fill="{cloth}" {S()}/>'
    det = ""
    if o in ("jacket", "coat", "blazer", "suit"):
        lap = mix(oc, "#000000", .2) if lum(oc) > .25 else mix(oc, "#FFFFFF", .16)
        det = (f'<path d="M52 100 L60 120 L68 100 Z" fill="{inner}" {S(1.2)}/>'
               f'<path d="M52 100 L56 116 L47 110 Z M68 100 L64 116 L73 110 Z" fill="{lap}" {S(1.1)}/>')
        if o in ("blazer", "suit"):
            det += f'<circle cx="60" cy="126" r="1.6" fill="{gc}"/>'
        if o == "coat":
            det += f'<path d="M60 120 V138" stroke="{OL}" stroke-width="1.1"/><circle cx="56" cy="126" r="1.2" fill="{OL}"/><circle cx="56" cy="133" r="1.2" fill="{OL}"/>'
        if o == "suit":
            det += f'<path d="M60 102 L58 108 L60 118 L62 108 Z" fill="{gc}" {S(1)}/>'
    elif o == "shirt":
        det = (f'<path d="M51 100 L60 109 L69 100 L66 98 H54 Z" fill="{inner}" {S(1.2)}/>'
               f'<path d="M60 109 V138" stroke="{OL}" stroke-width="1" opacity=".5"/>')
    elif o == "hoodie":
        det = (f'<path d="M45 102 Q60 116 75 102" fill="none" stroke="{OL}" stroke-width="1.4"/>'
               f'<path d="M55 110 V120 M65 110 V120" stroke="{inner}" stroke-width="1.6" stroke-linecap="round"/>'
               f'<path d="M48 126 H72" stroke="{mix(oc, OL, .3)}" stroke-width="1.4" stroke-linecap="round"/>')
    elif o == "knit":
        det = "".join(f'<path d="M{x} 104 Q{x + 2.4} 111 {x} 118 Q{x - 2.4} 125 {x} 132" fill="none" stroke="{mix(oc, OL, .22)}" stroke-width="1.2"/>' for x in (49, 60, 71))
    elif o == "stripes":
        det = "".join(f'<path d="M39 {y} H81" stroke="{inner}" stroke-width="2.2"/>' for y in (110, 118, 126))
    elif o == "tank":
        det = f'<path d="M50 100 Q60 110 70 100" fill="{SKIN}" {S(1.2)}/><path d="M49 100 V106 M71 100 V106" stroke="{gc}" stroke-width="2"/>'
    elif o == "overalls":
        torso = torso.replace(f'fill="{cloth}"', f'fill="{inner}"', 1)
        det = (f'<path d="M45 116 H75 L79 138 H41 Z" fill="{cloth}" {S(1.2)}/>'
               f'<path d="M47 116 L50 100 M73 116 L70 100" stroke="{oc}" stroke-width="3.2"/><circle cx="48" cy="116" r="1.5" fill="{gc}"/><circle cx="72" cy="116" r="1.5" fill="{gc}"/>')
    else:
        det = f'<path d="M51 100 Q60 108 69 100" fill="none" stroke="{OL}" stroke-width="1.3"/>'
    det += f'<path d="M38 134 H82" stroke="{gc}" stroke-width="1.8" stroke-linecap="round" opacity=".9"/>'

    pose = m.get("pose", "down")
    left, right, extra = sleeve(43, 106, 34, 124, sl) + hand(33, 126), sleeve(77, 106, 86, 124, sl) + hand(87, 126), ""
    if pose == "wave":
        right = sleeve(77, 106, 92, 88, sl) + hand(94, 85)
        extra = f'<path d="M99 76 Q103 72 101 67 M104 82 Q110 80 110 74" fill="none" stroke="{gc}" stroke-width="1.8" stroke-linecap="round"/>'
    elif pose == "v":
        right = sleeve(77, 106, 90, 92, sl) + hand(91, 90)
        extra = (f'<path d="M89 88 L86 76 M93 88 L96 76" stroke="{OL}" stroke-width="5.4" stroke-linecap="round"/>'
                 f'<path d="M89 88 L86 76 M93 88 L96 76" stroke="{SKIN}" stroke-width="3" stroke-linecap="round"/>')
    elif pose == "heart":
        left = sleeve(43, 106, 54, 114, sl) + hand(55, 114, 4.2)
        right = sleeve(77, 106, 66, 114, sl) + hand(65, 114, 4.2)
        extra = small_heart(60, 106, 5.6, gc)
    elif pose == "hip":
        left = sleeve(43, 106, 37, 122, sl) + hand(38, 123, 4.2)
        right = sleeve(77, 106, 83, 122, sl) + hand(82, 123, 4.2)
    elif pose == "chin":
        right = sleeve(77, 106, 72, 96, sl) + hand(70, 95, 4.6)
    return legs + neck + torso + det, left + right + extra


def sprite(m: dict, gc: str, uid: str, delay: float = 0.0) -> tuple[str, str]:
    """(defs, drawing) of one member, coordinates 0..120 x 0..160."""
    art = Art(uid)
    hc = m.get("hc", "#2B2233")
    fringe, back, long_side = STYLE.get(m.get("hair", "fringe"), ("fringe", "short", False))
    fringe = {"fringe": "fringe", "zigzag": "spiky", "curtain": "curtain", "part": "swept", "swept": "up", "long": "long",
              "longpart": "open"}.get(m.get("front", ""), fringe)
    light = lum(hc) > .55
    hair = art.lin("hair", [(0, mix(hc, "#FFFFFF", .32 if not light else .45)), (.55, hc), (1, mix(hc, OL, .28))])
    dark = mix(hc, OL, .45)
    back_body, arms = body(m, gc, art)
    head = (f'<ellipse cx="20" cy="70" rx="5.6" ry="7.4" fill="{SKIN}" {S()}/><ellipse cx="100" cy="70" rx="5.6" ry="7.4" fill="{SKIN}" {S()}/>'
            f'<path d="M20 62 C20 36 37 22 60 22 C83 22 100 36 100 62 C100 84 84 100 60 101 C36 100 20 84 20 62 Z" fill="{SKIN}" {S()}/>'
            f'<path d="M26 54 Q60 40 94 54 L94 58 Q60 46 26 58 Z" fill="{SKIN_SH}" opacity=".55"/>')
    sh = mix(hc, "#FFFFFF", .55 if not light else .7)
    shine = (f'<path d="M28 30 Q44 17 62 17 Q46 21 30 33 Z" fill="{sh}" opacity=".8"/>'
             f'<path d="M70 17 Q80 18 88 25 Q79 21 70 20 Z" fill="{sh}" opacity=".6"/>')
    g = (back_hair(back, hair, dark) + back_body + head + face(m, art, delay)
         + f'<path d="{CAP}" fill="{hair}"/>' + f'<path d="{CAP_LINE}" fill="none" {S()}/>'
         + fringe_locks(fringe, hair) + side_locks(fringe, hair, long_side) + shine)
    for a in m.get("acc", []):
        g += accessory(a, m.get("ac", gc))
    return "".join(art.defs), g + arms


FILTER = ('<filter id="cut" x="-12%" y="-10%" width="124%" height="118%" color-interpolation-filters="sRGB">'
          '<feMorphology in="SourceAlpha" operator="dilate" radius="3" result="d"/>'
          '<feOffset in="d" dx="1.4" dy="2.6" result="o"/>'
          '<feFlood flood-color="#B9A4EE" flood-opacity=".9"/><feComposite in2="o" operator="in" result="sh"/>'
          '<feFlood flood-color="#FFFFFF"/><feComposite in2="d" operator="in" result="w"/>'
          '<feMerge><feMergeNode in="sh"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')


def svg_member(m: dict, gc: str, group_name: str, uid: str, delay: float) -> str:
    title = f'{m["name"]} ({group_name}), chibi'
    defs, g = sprite(m, gc, uid, delay)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -10 {W + 12} {H + 14}" width="{W + 12}" height="{H + 14}" role="img" aria-label="{title}">'
            f'<title>{title}</title><defs>{FILTER}{defs}</defs><g filter="url(#cut)">{g}</g></svg>\n')


def crowd_layout(n: int):
    rows = [n] if n <= 5 else [math.ceil(n / 2), n // 2]
    width = W + (rows[0] - 1) * STEP
    out = []
    for r, k in enumerate(rows):
        off = (width - (W + (k - 1) * STEP)) / 2
        for i in range(k):
            out.append((off + i * STEP, r * ROW))
    return out, width, H + (len(rows) - 1) * ROW


def svg_group(gid: str, g: dict, name: str) -> str:
    ms = g["members"]
    lay, w, h = crowd_layout(len(ms))
    defs, uses = FILTER, ""
    for i, (m, (x, y)) in enumerate(zip(ms, lay)):
        d, body_svg = sprite(m, g["color"], f"{gid}-{m['id']}", i * .7)
        defs += d + f'<symbol id="{gid}-{m["id"]}-s" viewBox="-6 -10 {W + 12} {H + 14}">{body_svg}</symbol>'
        uses += f'<use href="#{gid}-{m["id"]}-s" x="{x - 6:.0f}" y="{y - 10}" width="{W + 12}" height="{H + 14}" filter="url(#cut)"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -14 {w + 20:.0f} {h + 22}" width="{w + 20:.0f}" height="{h + 22}" role="img" aria-label="{name}, chibis">'
            f'<title>{name}, chibis</title><defs>{defs}</defs>{uses}</svg>\n')


def main() -> None:
    src = json.loads((ROOT / "tools" / "members.json").read_text(encoding="utf-8"))
    roster = {}
    for gid, g in src["groups"].items():
        if gid not in STICKER_GROUPS:
            d = OUT / gid
            d.mkdir(parents=True, exist_ok=True)
            for old in d.glob("*.svg"):
                old.unlink()
            for i, m in enumerate(g["members"]):
                (d / f'{m["id"]}.svg').write_text(svg_member(m, g["color"], g.get("name", gid), f"{gid}-{m['id']}", i * .9 % 4.6), encoding="utf-8")
            (OUT / f"{gid}.svg").write_text(svg_group(gid, g, g.get("name", gid)), encoding="utf-8")
        roster[gid] = [{"id": m["id"], "name": m["name"], "ko": m["ko"]} for m in g["members"]]
    generic = {"id": "fan", "name": "Fan", "hair": "fringe", "hc": "#6A5A8E", "outfit": "hoodie", "oc": "#DCCFFF", "inner": "#FFFFFF",
               "eyes": "happy", "mouth": "open", "pose": "wave"}
    (OUT / "default.svg").write_text(svg_member(generic, "#FF5FA8", "Radar K-pop", "fan", 0), encoding="utf-8")
    (OUT / "roster.json").write_text(json.dumps(roster, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{sum(len(v) for v in roster.values())} chibis in {len(roster)} groups")


if __name__ == "__main__":
    main()

"""Draws the chibis in the sticker style: huge mochi head, tiny body, big hands doing a gesture by the face.

Usage: python tools/chibis_sticker.py [--out DIR]
Writes, for every group in GROUPS:
  assets/chibis/<group>/<member>.svg   one sprite per member (viewBox -6 -10 132 174, feet at the bottom)
  assets/chibis/<group>.svg            the whole group, same crowd layout as tools/chibis.py
tools/chibis.py leaves these groups alone, so running it does not overwrite them.

Style, taken from the reference stickers:
- Proportions: the head is about 63 % of the figure, wide cheeks and a small soft chin; hands are big and sit by the face.
- Line: dark plum ink, thick on the silhouette (the filter adds it) and thinner inside, then a white sticker border.
- Colour: flat fills with one hard-edged shadow (cel shading), a toothed shine ring and white glints on the hair.
- Eyes: tall and low on the face, heavy upper lash line, iris dark at the top and light at the bottom, two highlights.

Every member is drawn by hand in code (its own hair, face, outfit and gesture) so it reads as that artist,
not as a generic chibi in other colours. They are fan art inspired by public photos, not portraits.
"""
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "chibis"
OL = "#2B1A26"          # ink
W, H = 120, 160
ROW, STEP = 66, 72      # crowd layout, same as tools/chibis.py and app.js
BLUSH = "#FF8FAB"
MOUTH = "#C9445F"
TONGUE = "#FF8A9E"


# ---------------- colour and path helpers ----------------
def mix(c1: str, c2: str, t: float) -> str:
    a = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(c2[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(a, b))


def f(v: float) -> str:
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def smooth(pts, closed=True) -> str:
    """Catmull-Rom through the points as cubic Beziers. A point given as (x, y, 1) is a sharp corner (a hair tip)."""
    n = len(pts)
    P = [(p[0], p[1]) for p in pts]
    sharp = [len(p) > 2 and p[2] for p in pts]
    d = f"M{f(P[0][0])} {f(P[0][1])}"
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p1, p2 = P[i], P[(i + 1) % n]
        p0 = P[(i - 1) % n] if closed else P[max(i - 1, 0)]
        p3 = P[(i + 2) % n] if closed else P[min(i + 2, n - 1)]
        if sharp[i]:
            p0 = p1
        if sharp[(i + 1) % n]:
            p3 = p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}"
    return d + (" Z" if closed else "")


def ink(w: float = 2.2, color: str = OL) -> str:
    return f'stroke="{color}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"'


def path(d: str, fill: str, w: float = 2.2, extra: str = "") -> str:
    return f'<path d="{d}" fill="{fill}" {ink(w)}{(" " + extra) if extra else ""}/>'


def line(d: str, w: float = 1.3, color: str = OL, op: float = 1) -> str:
    o = f' opacity="{op}"' if op < 1 else ""
    return f'<path d="{d}" fill="none" {ink(w, color)}{o}/>'


class Art:
    """Collects defs with ids unique per member, so a whole group can live in one SVG."""

    def __init__(self, uid: str):
        self.uid, self.defs, self.n, self.shapes = uid, [], 0, {}

    def _id(self, name: str) -> str:
        self.n += 1
        return f"{self.uid}-{name}{self.n}"

    def lin(self, stops, x1=0, y1=0, x2=0, y2=1) -> str:
        gid = self._id("g")
        st = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
        self.defs.append(f'<linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{st}</linearGradient>')
        return f"url(#{gid})"

    def rad(self, stops) -> str:
        gid = self._id("r")
        st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
        self.defs.append(f'<radialGradient id="{gid}">{st}</radialGradient>')
        return f"url(#{gid})"

    def shape(self, d: str) -> str:
        """Stores a path once in defs; fills, clips, masks and outlines reuse it with <use>."""
        if d not in self.shapes:
            self.shapes[d] = self._id("p")
            self.defs.append(f'<path id="{self.shapes[d]}" d="{d}"/>')
        return self.shapes[d]

    def use(self, d: str, attrs: str) -> str:
        return f'<use href="#{self.shape(d)}" {attrs}/>'

    def clip(self, d: str) -> str:
        cid = self._id("c")
        self.defs.append(f'<clipPath id="{cid}">{self.use(d, "")}</clipPath>')
        return cid

    def mask_out(self, d: str, dx: float, dy: float) -> str:
        """Mask that hides the shape `d` moved by (dx, dy): used for automatic cel-shade rims."""
        mid = self._id("m")
        self.defs.append(f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="160" height="200">'
                         f'<rect x="-20" y="-20" width="160" height="200" fill="#fff"/>'
                         f'{self.use(d, f"transform=\"translate({dx} {dy})\" fill=\"#000\"")}</mask>')
        return mid


def shaded(art: Art, d: str, base: str, shadow: str, w: float = 2.2,
           sdx: float = -2.6, sdy: float = -3.2, extra_shade: str = "", extra_light: str = "") -> str:
    """A filled shape with a hard cel shadow along the edges facing away from the light (offset sdx, sdy),
    extra shading/highlights clipped inside it, and the ink outline on top."""
    cid = art.clip(d)
    out = art.use(d, f'fill="{base}"')
    out += f'<g clip-path="url(#{cid})">'
    out += art.use(d, f'fill="{shadow}" mask="url(#{art.mask_out(d, sdx, sdy)})"')
    out += extra_shade + extra_light + '</g>'
    out += art.use(d, f'fill="none" {ink(w)}')
    return out


def ring(cx, cy, rx, ry, a0, a1, band, teeth, depth) -> str:
    """Toothed shine band on a round head (ellipse rx, ry; angles in degrees, 90 = up; teeth point to the centre)."""
    k = 28
    outer = []
    for i in range(k + 1):
        a = math.radians(a0 + (a1 - a0) * i / k)
        outer.append((cx + rx * math.cos(a), cy - ry * math.sin(a)))
    inner = []
    for i in range(teeth * 2 + 1):
        a = math.radians(a0 + (a1 - a0) * i / (teeth * 2))
        dd = band + (depth if i % 2 else 0)
        inner.append((cx + (rx - dd) * math.cos(a), cy - (ry - dd) * math.sin(a)))
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in outer) + " L" + " L".join(f"{f(x)} {f(y)}" for x, y in inner[::-1]) + " Z"


def strand(x0, y0, x1, y1, bend=0.0, w=2.0, color=OL, op=1.0) -> str:
    """Tapered clump line: thick at (x0, y0) (a notch between two tips), fading to a point at (x1, y1)."""
    dx, dy = x1 - x0, y1 - y0
    n = math.hypot(dx, dy) or 1
    px, py = -dy / n, dx / n
    mx, my = (x0 + x1) / 2 + px * bend, (y0 + y1) / 2 + py * bend
    d = (f"M{f(x0 + px * w / 2)} {f(y0 + py * w / 2)} Q{f(mx + px * w * .3)} {f(my + py * w * .3)} {f(x1)} {f(y1)} "
         f"Q{f(mx - px * w * .3)} {f(my - py * w * .3)} {f(x0 - px * w / 2)} {f(y0 - py * w / 2)} Z")
    o = f' opacity="{op}"' if op < 1 else ""
    return f'<path d="{d}" fill="{color}"{o}/>'


def heart(x, y, s, fill, w=1.4) -> str:
    return path(f"M{f(x)} {f(y + s)} C{f(x - 1.7 * s)} {f(y)} {f(x - 1 * s)} {f(y - 1.2 * s)} {f(x)} {f(y - .35 * s)} "
                f"C{f(x + 1 * s)} {f(y - 1.2 * s)} {f(x + 1.7 * s)} {f(y)} {f(x)} {f(y + s)} Z", fill, w)


def sparkle(x, y, s, fill="#FFE27A", w=1.2) -> str:
    q = s * .28
    d = (f"M{f(x)} {f(y - s)} Q{f(x + q)} {f(y - q)} {f(x + s)} {f(y)} Q{f(x + q)} {f(y + q)} {f(x)} {f(y + s)} "
         f"Q{f(x - q)} {f(y + q)} {f(x - s)} {f(y)} Q{f(x - q)} {f(y - q)} {f(x)} {f(y - s)} Z")
    return path(d, fill, w)


# ---------------- head ----------------
def face_path(cheek=41.0, jaw=1.0, chin=100.0, top=20.0) -> str:
    """Mochi face: wide round cheeks, small soft chin."""
    c = 60
    return (f"M{f(c - cheek)} 60 C{f(c - cheek)} 34 {f(c - 24)} {f(top)} {c} {f(top)} C{f(c + 24)} {f(top)} {f(c + cheek)} 34 {f(c + cheek)} 60 "
            f"C{f(c + cheek)} 76 {f(c + cheek - 7)} 86 {f(c + 21 * jaw)} {f(chin - 6)} C{f(c + 12 * jaw)} {f(chin - 1.2)} {f(c + 6)} {f(chin)} {c} {f(chin)} "
            f"C{f(c - 6)} {f(chin)} {f(c - 12 * jaw)} {f(chin - 1.2)} {f(c - 21 * jaw)} {f(chin - 6)} C{f(c - cheek + 7)} 86 {f(c - cheek)} 76 {f(c - cheek)} 60 Z")


def ears(skin: str, sh: str, cheek=41.0, y=70.0, rings: str = "") -> str:
    out = ""
    for side in (-1, 1):
        x = 60 + side * (cheek + 1.5)
        out += f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="5.4" ry="7.2" fill="{skin}" {ink(2)}/>'
        out += line(f"M{f(x + side * 1.6)} {f(y - 3.5)} Q{f(x - side * 1.2)} {f(y - 1)} {f(x + side * .6)} {f(y + 3)}", 1.1, sh)
    return out + rings


# ---------------- eyes ----------------
def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return (u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
            u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1])


def bez_n(p0, p1, p2, p3, t):
    """Unit normal of a cubic at t, pointing to the curve's left (up for a left-to-right top edge)."""
    u = 1 - t
    dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0])
    dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1])
    n = math.hypot(dx, dy) or 1
    return dy / n, -dx / n


def poly(pts) -> str:
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"


class Eye:
    def __init__(self, iris="#6B4433", rx=9.6, ry=11.2, crease=True, lift=0.0, lashes=1.0, glints=2, spacing=18.0, y=70.0,
                 iris_w=.88, flick=.6):
        self.iris, self.rx, self.ry, self.crease, self.lift = iris, rx, ry, crease, lift
        self.lashes, self.glints, self.spacing, self.y, self.iris_w = lashes, glints, spacing, y, iris_w
        self.flick = flick


def eye_open(art: Art, e: Eye, side: int, lid: float = 0.0) -> str:
    """Big sticker eye. side -1 = viewer's left. lid 0..1 lowers the upper lid (sleepy)."""
    cx, cy, rx, ry, o = 60 + side * e.spacing, e.y, e.rx, e.ry, side
    top = cy - ry + lid * ry * 1.05
    p0 = (cx - o * rx * .96, cy - ry * .12 + lid * ry * .35)            # inner corner
    p3 = (cx + o * rx * 1.02, cy - ry * .34 - e.lift + lid * ry * .3)   # outer corner
    p1 = (cx - o * rx * .78, top - ry * .02)
    p2 = (cx + o * rx * .5, top - ry * .06 - e.lift * .8)
    b1 = (cx + o * rx * 1.06, cy + ry * .98)
    b2 = (cx - o * rx * 1.02, cy + ry * 1.06)
    wd = (f"M{f(p0[0])} {f(p0[1])} C{f(p1[0])} {f(p1[1])} {f(p2[0])} {f(p2[1])} {f(p3[0])} {f(p3[1])} "
          f"C{f(b1[0])} {f(b1[1])} {f(b2[0])} {f(b2[1])} {f(p0[0])} {f(p0[1])} Z")
    cid = art.clip(wd)
    iris = e.iris
    grad = art.lin([(0, mix(iris, OL, .85)), (.35, mix(iris, OL, .35)), (.7, iris), (1, mix(iris, "#FFD9A6", .6))])
    ix, iy, irx, iry = cx + o * rx * .04, cy + ry * .1, rx * e.iris_w, ry * .94
    g = f'<path d="{wd}" fill="#FFFFFF"/><g clip-path="url(#{cid})">'
    g += f'<ellipse cx="{f(ix)}" cy="{f(iy)}" rx="{f(irx)}" ry="{f(iry)}" fill="{grad}" {ink(1, mix(iris, OL, .75))}/>'
    g += f'<ellipse cx="{f(ix)}" cy="{f(iy + iry * .1)}" rx="{f(irx * .44)}" ry="{f(iry * .5)}" fill="{mix(iris, OL, .88)}" opacity=".9"/>'
    g += (f'<path d="M{f(ix - irx * .7)} {f(iy + iry * .42)} Q{f(ix)} {f(iy + iry * 1.05)} {f(ix + irx * .7)} {f(iy + iry * .42)} '
          f'Q{f(ix)} {f(iy + iry * .78)} {f(ix - irx * .7)} {f(iy + iry * .42)} Z" fill="{mix(iris, "#FFE9C4", .55)}" opacity=".85"/>')
    g += f'<path d="{wd}" fill="{OL}" opacity=".18" transform="translate(0 {f(-ry * 1.3)})"/>'   # lid shadow on the eyeball
    hx, hy = cx - rx * .34, cy - ry * .3 + lid * ry * .55
    g += f'<ellipse cx="{f(hx)}" cy="{f(hy)}" rx="{f(rx * .33)}" ry="{f(ry * .37)}" fill="#FFFFFF" transform="rotate(-20 {f(hx)} {f(hy)})"/>'
    if e.glints >= 2:
        g += f'<circle cx="{f(cx + rx * .36)}" cy="{f(cy + ry * .4)}" r="{f(rx * .15)}" fill="#FFFFFF"/>'
    if e.glints >= 3:
        g += f'<circle cx="{f(cx - rx * .4)}" cy="{f(cy + ry * .5)}" r="{f(rx * .08)}" fill="#FFFFFF" opacity=".9"/>'
        g += f'<circle cx="{f(cx + rx * .2)}" cy="{f(cy - ry * .42 + lid * ry * .5)}" r="{f(rx * .09)}" fill="#FFFFFF" opacity=".95"/>'
    g += '</g>'
    # lower lash: a short soft stroke under the outer half
    lo = [bez(p3, b1, b2, p0, t) for t in (.12, .24, .36, .46)]
    g += line(smooth(lo, closed=False), 1.1, OL, .5)
    # upper lash line: tapered, thick at the outer corner, with a small flick
    ts = [i / 14 for i in range(15)]
    lw = e.lashes
    outer, inner = [], []
    for t in ts:
        x, y = bez(p0, p1, p2, p3, t)
        nx, ny = bez_n(p0, p1, p2, p3, t)
        if o < 0:
            nx, ny = -nx, -ny
        th = (.9 + 2.7 * t ** 1.4) * lw
        outer.append((x + nx * th, y + ny * th))
        inner.append((x - nx * .5, y - ny * .5))
    tip = (p3[0] + o * (1 + 3.2 * e.flick) * lw, p3[1] - (.6 + 2.4 * e.flick) * lw)
    lash = poly(inner + [(p3[0] + o * .6, p3[1] + .8), tip] + outer[::-1])
    g += f'<path d="{lash}" fill="{OL}" stroke="{OL}" stroke-width=".6" stroke-linejoin="round"/>'
    if e.crease and lid < .3:
        cr = []
        for t in (.36, .54, .72, .9):
            x, y = bez(p0, p1, p2, p3, t)
            nx, ny = bez_n(p0, p1, p2, p3, t)
            if o < 0:
                nx, ny = -nx, -ny
            cr.append((x + nx * (3.4 + t * 1.4), y + ny * (3.4 + t * 1.4)))
        g += line(smooth(cr, closed=False), 1.1, OL, .42)
    return g


def eye_closed(cx: float, cy: float, kind: str = "happy", side: int = 1, w: float = 3.0) -> str:
    if kind == "happy":       # ^ ^
        return line(f"M{f(cx - 8)} {f(cy + 3)} Q{f(cx)} {f(cy - 9)} {f(cx + 8)} {f(cy + 3)}", w)
    if kind == "smile":       # eye smile: thick crescent with a lash flick
        d = (f"M{f(cx - 9)} {f(cy + 2)} Q{f(cx)} {f(cy - 8.5)} {f(cx + 9)} {f(cy + 2)} "
             f"Q{f(cx)} {f(cy - 4.5)} {f(cx - 9)} {f(cy + 2)} Z")
        flick = f"M{f(cx + side * 8.4)} {f(cy + .8)} L{f(cx + side * 10.6)} {f(cy - 1)}"
        return path(d, OL, 1.6) + line(flick, 2.0)
    if kind == "wink":        # > or < shape
        return line(f"M{f(cx - side * 7)} {f(cy - 5)} Q{f(cx + side * 1)} {f(cy - 1)} {f(cx + side * 7)} {f(cy + 1)} "
                    f"M{f(cx - side * 6)} {f(cy + 5)} Q{f(cx + side * 1)} {f(cy + 2)} {f(cx + side * 7)} {f(cy + 1)}", w * .95)
    return ""


def blink_style(uid: str, delay: float) -> str:
    return (f'<style>.b{uid}{{transform-box:fill-box;transform-origin:center;animation:k{uid} 5.2s steps(1) {delay:.2f}s infinite}}'
            f'@keyframes k{uid}{{0%{{transform:none}}94%{{transform:scaleY(.12)}}97%{{transform:none}}}}'
            f'@media (prefers-reduced-motion:reduce){{.b{uid}{{animation:none}}}}</style>')


def blush(art: Art, x: float, y: float, rx=8.6, ry=5.2, lines=True) -> str:
    g = art.rad([(0, BLUSH, .8), (.6, BLUSH, .45), (1, BLUSH, 0)])
    out = f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}"/>'
    if lines:
        out += "".join(line(f"M{f(x + dx - 1.2)} {f(y + 1.6)} L{f(x + dx + 1.2)} {f(y - 1.6)}", 1.1, "#E2577C", .8) for dx in (-3.4, 0, 3.4))
    return out


def brows(color: str, y=52.0, spread=18.0, tilt=0.0, w=2.6, length=7.0) -> str:
    out = ""
    for side in (-1, 1):
        x = 60 + side * spread
        out += line(f"M{f(x - side * length * .55)} {f(y + 1 - tilt)} Q{f(x)} {f(y - 1.6)} {f(x + side * length * .6)} {f(y + .8 + tilt)}", w, color)
    return out


def nose(skin_sh: str, y=80.0) -> str:
    return line(f"M60.6 {f(y - 2)} Q59.2 {f(y)} 60.2 {f(y + 1)}", 1.5, mix(skin_sh, OL, .35))


# ---------------- body ----------------
def legs(pants: str, shoe: str, sole: str = "#FFFFFF", trim: str = "") -> str:
    out = (f'<path d="M47 134 L47 147 Q47 150 50 150 L55 150 Q58 150 58 147 L58 134 Z" fill="{pants}" {ink(2)}/>'
           f'<path d="M62 134 L62 147 Q62 150 65 150 L70 150 Q73 150 73 147 L73 134 Z" fill="{pants}" {ink(2)}/>'
           f'<path d="M42.5 155.5 Q42 147.5 51 147.5 Q59.5 147.5 59.5 155.5 Z" fill="{shoe}" {ink(2)}/>'
           f'<path d="M60.5 155.5 Q60.5 147.5 69 147.5 Q78 147.5 77.5 155.5 Z" fill="{shoe}" {ink(2)}/>'
           f'<path d="M43 153 H59 M61 153 H77" stroke="{sole}" stroke-width="1.6" stroke-linecap="round"/>')
    if trim:
        out += f'<path d="M48 150.5 Q51 149.5 54 150.5 M66 150.5 Q69 149.5 72 150.5" stroke="{trim}" stroke-width="1.3" fill="none" stroke-linecap="round"/>'
    return out


def torso_path(sh=1.0, hem=139.0) -> str:
    """Shoulders to hem. sh widens the shoulders (Jin)."""
    l, r = 60 - 23 * sh, 60 + 23 * sh
    return (f"M{f(60 - 12)} 101 L{f(60 + 12)} 101 Q{f(r)} 101.5 {f(r + 2)} 113 L{f(r - 1.5)} {f(hem - 3)} "
            f"Q{f(r - 1.5)} {f(hem)} {f(r - 4.5)} {f(hem)} L{f(l + 4.5)} {f(hem)} Q{f(l + 1.5)} {f(hem)} {f(l + 1.5)} {f(hem - 3)} "
            f"L{f(l - 2)} 113 Q{f(l)} 101.5 48 101 Z")


def neck(skin: str, sh: str, art: Art, face_d: str) -> str:
    nd = "M53.5 90 L53.5 104 Q60 107 66.5 104 L66.5 90 Z"
    cid = art.clip(nd)
    return (f'<path d="{nd}" fill="{skin}" {ink(1.8)}/>'
            f'<g clip-path="url(#{cid})">{art.use(face_d, f"fill=\"{sh}\" transform=\"translate(0 5)\"")}</g>')


def sleeve(art: Art, pts, width: float, fill: str, shadow: str) -> str:
    """A short tube along pts (shoulder -> wrist), round at the shoulder, flat cuff at the wrist."""
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    n = math.hypot(dx, dy) or 1
    px, py = -dy / n * width / 2, dx / n * width / 2
    mx, my = pts[1] if len(pts) > 2 else ((x1 + x2) / 2, (y1 + y2) / 2)
    d = (f"M{f(x1 + px)} {f(y1 + py)} Q{f(mx + px)} {f(my + py)} {f(x2 + px * .86)} {f(y2 + py * .86)} "
         f"L{f(x2 - px * .86)} {f(y2 - py * .86)} Q{f(mx - px)} {f(my - py)} {f(x1 - px)} {f(y1 - py)} "
         f"A{f(width / 2)} {f(width / 2)} 0 0 1 {f(x1 + px)} {f(y1 + py)} Z")
    return shaded(art, d, fill, shadow, sdx=-1.6, sdy=-2.2, w=2)


# ---------------- hands ----------------
# Each hand is drawn around its wrist at (0, 0), pointing up (-y); place() moves, rotates and mirrors it.
def place(svg: str, x: float, y: float, rot: float = 0, s: float = 1, flip: bool = False) -> str:
    sx = -s if flip else s
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)}) scale({f(sx)} {f(s)})">{svg}</g>'


def finger(x1, y1, x2, y2, wd, skin) -> str:
    dx, dy = x2 - x1, y2 - y1
    n = math.hypot(dx, dy) or 1
    px, py = -dy / n * wd / 2, dx / n * wd / 2
    d = (f"M{f(x1 + px)} {f(y1 + py)} L{f(x2 + px)} {f(y2 + py)} A{f(wd / 2)} {f(wd / 2)} 0 0 0 {f(x2 - px)} {f(y2 - py)} "
         f"L{f(x1 - px)} {f(y1 - py)} Z")
    return path(d, skin, 1.7)


def hand_v(skin: str, sh: str) -> str:
    """Peace sign: index and middle up and apart, thumb folded over the others."""
    return (finger(-2.4, -9, -6.2, -21.5, 4.6, skin) + finger(2.2, -9.5, 4.8, -22.5, 4.6, skin)
            + path("M-6.4 -1 C-7.6 -5 -7.4 -10 -4.6 -11.4 L5.6 -11.6 C8 -10.8 8.4 -5 7 -1 C5 1.6 -4.4 1.6 -6.4 -1 Z", skin, 1.8)
            + line("M2.4 -11.4 Q4.8 -9.6 7.4 -10.2", 1.2) + line("M3 -8.2 Q5.4 -6.8 7.6 -7.2", 1.1, OL, .6)
            + path("M-6.8 -7.4 C-3.6 -9.2 0.6 -8.6 2.6 -6.6 C1.8 -5 -2.6 -4.6 -6.6 -5 Z", skin, 1.4)
            + line("M-5 -2.6 Q0 -.8 4.6 -2.4", 1.1, sh))


def hand_open(skin: str, sh: str) -> str:
    """Open palm facing the viewer, fingers together, thumb out."""
    out = ""
    for x0, x1, y1 in ((-4.6, -6.4, -18.6), (-1.5, -2.2, -21), (1.6, 1.8, -20.6), (4.6, 5.6, -17.6)):
        out += finger(x0, -9, x1, y1, 3.8, skin)
    out += path("M-6.6 -1.4 C-7.6 -5 -7.2 -10 -5.6 -11.6 L6.4 -11.6 C7.8 -10 7.8 -5 6.8 -1.4 C4.6 1.4 -4.4 1.4 -6.6 -1.4 Z", skin, 1.8)
    out += finger(-5.6, -4.6, -11.2, -10.6, 4, skin)
    out += line("M-3.4 -6 Q0 -3.6 3.6 -6.4", 1, sh)
    return out


def hand_thumb(skin: str, sh: str) -> str:
    """Thumbs up: fist with the thumb straight up."""
    out = finger(-3, -11, -3.6, -20.6, 6.2, skin)
    out += path("M-7 -1.4 C-8.4 -6 -7.6 -12.4 -3.2 -13 L5.4 -13 C8.6 -12.2 8.8 -2.6 6.8 -.6 C4 1.6 -4.8 1.4 -7 -1.4 Z", skin, 1.8)
    out += line("M-1.2 -10.2 Q3.4 -11.2 7.6 -9.8 M-1 -6.8 Q3.6 -7.8 7.8 -6.4 M-.8 -3.4 Q3.4 -4.2 7.4 -3", 1.1, OL, .75)
    out += line("M-6.2 -8 Q-4 -5 -.8 -3.4", 1, sh)
    return out


def hand_heart(skin: str, sh: str, color: str) -> str:
    """Finger heart: index and thumb crossed in an X above the fist, a heart popping out of the tips."""
    out = finger(-3.4, -9.6, 2.2, -19, 4.8, skin)                                               # index, up and right
    out += path("M-6.6 -1.2 C-8 -5.4 -7.4 -10.4 -3.8 -11.4 L5 -11.4 C8 -10.4 8.4 -4 7 -1.2 C4.6 1.6 -4.4 1.6 -6.6 -1.2 Z", skin, 1.8)
    out += line("M-1.6 -8.6 Q3 -9.4 7.4 -8.2 M-1.4 -5.6 Q3.2 -6.4 7.6 -5.2 M-1.2 -2.8 Q3 -3.4 7.2 -2.4", 1.1, OL, .7)
    out += finger(6.2, -8.4, -2, -18, 5.2, skin)                                                # thumb crossing in front
    out += heart(1.2, -27, 4.4, color, 1.4)
    return out


def hand_palm_up(skin: str, sh: str) -> str:
    """Open hand seen from the front, palm up, fingers together pointing left (-x) and curling up at the tips:
    blowing a kiss off the palm."""
    out = finger(-4.6, -3.6, -9.4, -10.6, 4.4, skin)                                           # thumb, behind
    out += path("M1.2 4.8 C-5 6 -12.4 4.8 -17.4 2.4 Q-21.4 .4 -22.2 -2.4 Q-22.4 -4.6 -20 -4.8 C-15.6 -4.4 -10.4 -5.4 -6.4 -5.4 "
                "C-3.4 -5.4 -1 -5.2 1.2 -4.8 Z", skin, 1.8)
    out += line("M-21.2 -3 L-16.4 -2.6 M-20.6 -1 L-16 -.6 M-19.4 .9 L-15.2 1.2", 1, OL, .6)
    out += line("M-4 1.6 Q-8.4 2.6 -11.6 .6", 1, sh)
    return out


def hand_down(skin: str, sh: str) -> str:
    """Relaxed hand hanging at the side: a soft mitten, thumb resting in front."""
    return (path("M-5.4 -1 C-6.8 2.6 -6 8 -.6 8.8 C4.6 9.4 6.6 5 5.6 -1 Z", skin, 1.8)
            + path("M-5.8 1.2 C-3.4 .4 -.8 2 -.6 4.8 C-2.6 6 -5 5 -5.8 3.4 Z", skin, 1.2)
            + line("M1.6 6.8 L1.8 8.6 M3.8 5.8 L4.4 7.6", 1, OL, .45))


def hand_petal(skin: str, sh: str) -> str:
    """Open hand with the fingers together and softly curved, for the flower pose."""
    out = ""
    for x0, x1, y1 in ((-3.6, -5.6, -18.4), (-.9, -2, -20.6), (1.8, 1.4, -20.2), (4.4, 4.8, -17.4)):
        out += finger(x0, -9, x1, y1, 3.5, skin)
    out += path("M-6.2 -1.2 C-7.2 -5 -6.8 -10 -5 -11.4 L6.2 -11.2 C7.6 -9.4 7.6 -4.8 6.6 -1.2 C4.6 1.4 -4.2 1.4 -6.2 -1.2 Z", skin, 1.8)
    out += finger(-5.4, -4.2, -9.6, -9.6, 3.8, skin)
    out += line("M-3 -5.6 Q0 -3.6 3.4 -6", 1, sh)
    return out


def hand_fist(skin: str) -> str:
    return (path("M-6.4 -1 C-8 -5 -7.4 -11 -3.6 -11.8 L5.2 -11.8 C8.4 -11 8.6 -3.4 6.8 -1 C4.6 1.6 -4.4 1.6 -6.4 -1 Z", skin, 1.8)
            + line("M-.4 -9.4 Q3.6 -10.2 7.4 -8.8 M-.2 -6.4 Q3.8 -7.2 7.6 -5.8 M0 -3.4 Q3.8 -4.2 7.4 -2.8", 1.1, OL, .75)
            + path("M-7 -8.4 C-4 -10 -.6 -9.4 .8 -7.6 C.4 -5.8 -3.6 -5.4 -6.8 -6 Z", skin, 1.4))


# ---------------- shared member parts ----------------
def hair(a: Art, d: str, hc: str, hsh: str, hli: str, shine: str = "", strands: str = "", glint: str = "",
         sdx: float = 2.6, sdy: float = -3.4, base: str = "") -> str:
    """Hair mass: flat colour, hard shadow rim, toothed shine, clump lines in the shadow tone, white glints."""
    light = (f'<path d="{shine}" fill="{hli}"/>' if shine else "") + strands.replace(f'fill="{OL}"', f'fill="{hsh}"') + glint
    return shaded(a, d, base or hc, hsh, sdx=sdx, sdy=sdy, w=2, extra_light=light)


def head(a: Art, skin: str, ssh: str, fd: str, front: str, cheek: float = 41, jewels: str = "", ear_y: float = 70) -> str:
    """Ears, then the face with its cel shadow and the shadow the fringe casts on the forehead."""
    a.face_clip = a.clip(fd)
    return (ears(skin, ssh, cheek, ear_y) + jewels
            + shaded(a, fd, skin, ssh, sdx=-2.2, sdy=-3.4, w=2, extra_shade=a.use(front, f'fill="{ssh}" transform="translate(.4 4)"')))


def glint(x, y, s=1.0, dot=(0, 0)) -> str:
    """White comma of light on the hair plus an optional dot."""
    d = (f"M{f(x)} {f(y + 9 * s)} Q{f(x + 7 * s)} {f(y)} {f(x + 19 * s)} {f(y - 3 * s)} "
         f"Q{f(x + 10 * s)} {f(y + 3 * s)} {f(x + 4 * s)} {f(y + 11.5 * s)} Z")
    out = f'<path d="{d}" fill="#FFFFFF" opacity=".9"/>'
    if dot != (0, 0):
        out += f'<circle cx="{f(dot[0])}" cy="{f(dot[1])}" r="1.5" fill="#FFFFFF"/>'
    return out


def open_eyes(a: Art, e: Eye, delay: float, lid: float = 0.0) -> str:
    return blink_style(a.uid, delay) + f'<g class="b{a.uid}">{eye_open(a, e, -1, lid)}{eye_open(a, e, 1, lid)}</g>'


def cheeks(a: Art, y=85.0, dx=27.5, lines=True) -> str:
    """Both blushes, clipped to the face so the glow never spills past the cheek line."""
    return f'<g clip-path="url(#{a.face_clip})">' + blush(a, 60 - dx, y, lines=lines) + blush(a, 60 + dx, y, lines=lines) + '</g>'



def mouth_open(y=86.5, w=6.0, h=7.0) -> str:
    """Small happy D mouth with a tongue."""
    return (path(f"M{f(60 - w)} {f(y)} Q60 {f(y - 1.2)} {f(60 + w)} {f(y)} Q{f(60 + w * .8)} {f(y + h)} 60 {f(y + h)} "
                 f"Q{f(60 - w * .8)} {f(y + h)} {f(60 - w)} {f(y)} Z", MOUTH, 1.7)
            + f'<path d="M{f(60 - w * .6)} {f(y + h * .72)} Q60 {f(y + h * .35)} {f(60 + w * .6)} {f(y + h * .72)} Q60 {f(y + h * 1.02)} {f(60 - w * .6)} {f(y + h * .72)} Z" fill="{TONGUE}"/>')


def legs_and_neck(a: Art, skin: str, ssh: str, fd: str, pants: str, shoe: str, sole: str = "#FFFFFF", trim: str = "") -> str:
    return legs(pants, shoe, sole, trim) + neck(skin, ssh, a, fd)


# ---------------- members ----------------
def rm(a: Art, delay: float) -> dict:
    """Light ash hair, frosted at the tips, swept up and back with the forehead out; round glasses, deep dimples,
    denim jacket over a white tee, waving like the leader saying hi."""
    skin, ssh = "#FCDCC8", "#EDB49C"
    hc, hsh, hli = "#E0C196", "#B48D63", "#FBF0DC"
    fd = face_path(cheek=40.5, jaw=.98, chin=101)
    eye = Eye(iris="#5B3E2E", rx=9.4, ry=10.4, crease=False, lift=1.6, glints=2, spacing=18, y=71, iris_w=.86)
    front = smooth([(22.5, 71, 1), (18, 61), (14.5, 49), (15, 36), (19.5, 25), (27, 16), (35.5, 9.5), (44.5, 4.6), (51.5, 1.4),
                    (57.5, -3.6, 1), (60.5, 1.4), (69.5, -.6), (77.5, -4.4, 1), (81, 2), (88, 3.4), (92.5, 1.6, 1), (95, 8.4),
                    (101.5, 16), (105.5, 27), (107, 41), (105, 53), (102, 61), (97.8, 71, 1), (96.6, 60), (94.5, 50), (89.5, 42.5),
                    (81.5, 37), (72, 34), (63, 33.5), (55.5, 35), (51.5, 37.5), (49.5, 43), (47.5, 50.5, 1), (46.4, 43),
                    (44.5, 39), (38, 40), (31.5, 43.5), (26.5, 50), (24, 59)])
    grad = a.lin([(0, "#F8EBD2"), (.42, hc), (1, "#A9845E")])
    shine = ring(61, 46, 43, 44, 40, 140, 3, 6, 3.6)
    strands = (strand(55.5, 35.5, 50, 12, 2, 2) + strand(65, 34, 64, 6, 1, 2) + strand(76, 35.5, 80, 8, -2, 2)
               + strand(88, 41, 97, 18, -2, 1.8) + strand(40.5, 40, 32, 20, 2.5, 1.8) + strand(46, 42, 42, 12, 1.5, 1.6)
               + strand(96, 60, 101, 42, -1, 1.4) + strand(24, 59, 19, 44, 1, 1.4))
    hair_front = hair(a, front, hc, hsh, hli, shine, strands, glint(31, 14, .8, (86, 12)), sdx=2.4, sdy=-3, base=grad)

    denim, dsh, dli = "#5774B8", "#3C5491", "#86A0D8"
    td = torso_path()
    body = legs_and_neck(a, skin, ssh, fd, "#3E3A48", "#FFFFFF", "#D6D0E2")
    body += shaded(a, td, denim, dsh, sdx=-2.4, sdy=-2.6, w=2)
    body += path("M52.5 101 Q60 104 67.5 101 L66.5 139 L53.5 139 Z", "#FFFFFF", 1.8) + line("M54.5 102 Q60 106 65.5 102", 1.1, "#D6D0E2")
    body += path("M47 100.5 L54 101.5 L56 109 L50 106.5 Z", denim, 1.6) + path("M73 100.5 L66 101.5 L64 109 L70 106.5 Z", denim, 1.6)
    body += line("M53.6 110 L53 139 M66.4 110 L67 139", 1.4)
    body += (path("M42 115 H50.5 V121 H42 Z", denim, 1.3) + path("M69.5 115 H78 V121 H69.5 Z", denim, 1.3)
             + f'<circle cx="46.2" cy="118" r=".9" fill="#E8D9A8"/><circle cx="73.8" cy="118" r=".9" fill="#E8D9A8"/>')
    body += line("M38.5 130 H52.5 M67.5 130 H81.5", 1.1, dli) + line("M40.5 112 Q41 122 42 133", 1.5, dli, .8)

    head_g = head(a, skin, ssh, fd, front, 40.5)
    fr = "#6E4C36"
    glasses = (f'<path d="M48.4 66 Q60 62.4 71.6 66" fill="none" {ink(1.6, fr)}/>' +
               "".join(f'<ellipse cx="{x}" cy="71.4" rx="11.8" ry="11.4" fill="#FFFFFF" fill-opacity=".12" {ink(1.7, fr)}/>'
                       f'<path d="M{f(x - 7.6)} 65.6 Q{f(x - 5.6)} 63 {f(x - 2.6)} 62.4" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" opacity=".9"/>'
                       for x in (42, 78))
               + f'<path d="M30.2 69 L20 67.6 M89.8 69 L100 67.6" fill="none" {ink(1.5, fr)}/>')
    face = open_eyes(a, eye, delay) + brows("#8A6A4E", y=54, spread=18.5, tilt=-.4, w=2.3, length=8) + glasses
    face += cheeks(a, 86, 28) + nose(ssh, 81.5)
    face += mouth_open(87, 6.4, 6.4)
    # deep dimples: a short dent under each mouth corner
    for x, o in ((48.6, -1), (71.4, 1)):
        face += f'<path d="M{f(x)} 90.2 q{f(o * 1.4)} 1.6 0 3.2" fill="none" {ink(1.5)}/>'
        face += f'<ellipse cx="{f(x + o * .9)}" cy="91.8" rx="1.6" ry="2.2" fill="{ssh}" opacity=".7"/>'

    arms = sleeve(a, [(40, 106), (36.5, 117), (35.5, 127)], 10, denim, dsh) + place(hand_down(skin, ssh), 35.5, 127)
    arms += sleeve(a, [(80, 106), (93, 110), (98, 98)], 10, denim, dsh) + place(hand_open(skin, ssh), 98.5, 98, 14, 1.05)
    fx = line("M108 72 Q112 76 110 81 M113 66 Q118 70 117 76", 1.8, "#7B3FE4") + sparkle(14, 40, 3, "#FFFFFF")
    return dict(body=body, head=head_g, face=face, front=hair_front, arms=arms, fx=fx)


def jin(a: Art, delay: float) -> dict:
    """Dark brown curtain fringe parted a little off centre, broad shoulders, full lips blowing his flying kiss with a wink,
    soft pink knit (his favourite colour)."""
    skin, ssh = "#FFE4D4", "#F2BBA6"
    hc, hsh, hli = "#4E3934", "#2F211E", "#8C6E62"
    fd = face_path(cheek=41.5, jaw=1.0, chin=100)
    eye = Eye(iris="#5A3A2E", rx=9.8, ry=11.4, crease=True, glints=2, spacing=18.4, y=70.5)
    back = smooth([(17, 56), (16, 70), (19, 80), (24, 84, 1), (96, 84, 1), (101, 80), (104, 70), (103, 56)])
    front = smooth([(22.5, 73.5, 1), (19.2, 65), (16.6, 54), (16, 42), (19.5, 30), (27.5, 19), (38, 11), (50, 6), (62, 4.4),
                    (71.5, 5), (77.6, 1.6, 1), (83, 7.6), (95, 15.6), (102.6, 27), (105.6, 40), (105, 52), (102.4, 64),
                    (97.5, 73.5, 1), (96.4, 64), (94.6, 62.4, 1), (92, 54), (88.5, 48), (86.5, 52), (84, 57, 1), (81, 49),
                    (76, 43), (74, 48), (70.5, 55, 1), (66, 45), (56.5, 36, 1), (53, 42), (50, 50.5, 1), (47, 45), (42.5, 42.5),
                    (39.5, 48), (36, 55.5, 1), (33, 49), (30, 47.5), (27.5, 54), (25.4, 62, 1), (24, 68)])
    shine = ring(60, 50, 46, 43, 34, 148, 3.2, 7, 4.2)
    strands = (strand(56.5, 36.5, 53, 8, 1, 2.2) + strand(76, 43.5, 80, 16, -2, 2) + strand(88.5, 48.5, 95, 28, -2, 1.8)
               + strand(42.5, 43, 38, 18, 2, 2) + strand(30, 48, 24, 32, 2, 1.8) + strand(96.6, 64, 101, 46, -1, 1.4)
               + strand(24, 68, 18.5, 50, 1.5, 1.4))
    hair_front = hair(a, front, hc, hsh, hli, shine, strands, glint(29, 15.5, .85, (85, 15)))
    hair_back = shaded(a, back, mix(hc, OL, .25), mix(hsh, OL, .3), sdx=0, sdy=-4, w=2)

    knit, ksh, kli = "#F7A9C4", "#E07CA2", "#FFD3E2"
    td = torso_path(1.1)
    body = legs_and_neck(a, skin, ssh, fd, "#F4F0FA", "#FFFFFF", "#F7A9C4")
    body += shaded(a, td, knit, ksh, sdx=-2.4, sdy=-2.6, w=2,
                   extra_light="".join(line(f"M{x} 112 Q{x + 1.6} 118 {x} 124 Q{x - 1.6} 130 {x} 136", 1.2, ksh, .7) for x in (44, 52, 60, 68, 76)))
    body += path("M50 100.5 Q60 106.5 70 100.5 L70 103 Q60 110 50 103 Z", kli, 1.6)          # ribbed collar
    body += line("M36 134 H84", 1.2, ksh, .8)

    head_g = head(a, skin, ssh, fd, front, 41.5, ear_y=71)
    face = blink_style(a.uid, delay) + f'<g class="b{a.uid}">{eye_open(a, eye, -1)}</g>' + eye_closed(78.4, 70.5, "wink", 1, 3.2)
    face += cheeks(a, 85, 28) + nose(ssh, 81.5)
    # puckered full lips
    face += path("M56.2 89.6 C56 86.4 58.8 85.4 60 87 C61.2 85.4 64 86.4 63.8 89.6 C63.6 93.4 56.4 93.4 56.2 89.6 Z", "#F07890", 1.7)
    face += line("M57.6 89.8 Q60 90.8 62.4 89.8", 1.1) + f'<ellipse cx="58.8" cy="91.4" rx="1.3" ry=".7" fill="#FFFFFF" opacity=".7"/>'

    arms = sleeve(a, [(40, 106), (37, 117)], 10, knit, ksh) + sleeve(a, [(36.5, 117.5), (47, 102.5)], 10, knit, ksh)
    arms += place(hand_palm_up(skin, ssh), 47.4, 101.6, -8, 1.05)
    arms += sleeve(a, [(81, 106), (85.5, 117), (86.5, 127)], 10, knit, ksh) + place(hand_down(skin, ssh), 86.5, 127)
    fx = heart(31, 84, 4.4, "#FF6FA0", 1.5) + heart(19, 76, 3.2, "#FF9CC0", 1.2) + heart(12, 88, 2.4, "#FF9CC0", 1.1) + sparkle(106, 40, 3.6)
    return dict(back=hair_back, body=body, head=head_g, face=face, front=hair_front, arms=arms, fx=fx)


def suga(a: Art, delay: float) -> dict:
    """Black beanie pulled low with black hair spilling out, very pale skin, sleepy half-closed eyes, small pout,
    oversized black hoodie and a microphone."""
    skin, ssh = "#FFF1EA", "#F2CABB"
    hc, hsh, hli = "#2C2836", "#16131D", "#5D5873"
    fd = face_path(cheek=40.5, jaw=.95, chin=99.5)
    eye = Eye(iris="#4A4250", rx=9.4, ry=10.6, crease=False, lift=1.4, glints=2, spacing=18, y=71.5, iris_w=.84, flick=.25)
    back = smooth([(16, 56), (15, 74), (18, 86), (23, 90, 1), (97, 90, 1), (102, 86), (105, 74), (104, 56)])
    front = smooth([(21.5, 85, 1), (16, 75), (13.6, 61), (14, 48), (17, 38), (60, 34), (103, 38), (106, 48), (106.4, 61), (104, 75),
                    (98.5, 85, 1), (97.6, 77), (97, 69), (95.4, 63, 1), (92, 54), (89, 52), (86.6, 59, 1), (83, 52), (79, 50),
                    (75, 57.5, 1), (70.6, 50), (64, 46), (61, 52), (59.5, 58, 1), (57.5, 51), (53, 47), (48, 50), (44.5, 57, 1),
                    (41.5, 51), (37, 50), (34, 56), (31.5, 61, 1), (29.6, 55), (27.4, 56), (26, 68, 1), (24.6, 77)])
    strands = (strand(64, 46.5, 63, 38, 0, 1.8) + strand(53, 47.5, 52, 38, 0, 1.8) + strand(79, 50.5, 80, 40, 0, 1.8)
               + strand(41.5, 51.5, 40, 40, 0, 1.6) + strand(89, 52.5, 91, 42, 0, 1.6) + strand(97.4, 72, 101, 54, -1, 1.4)
               + strand(24.8, 74, 19.5, 56, 1.5, 1.4))
    hair_front = hair(a, front, hc, hsh, hli, "", strands, "")
    hair_back = shaded(a, back, mix(hc, OL, .25), mix(hsh, OL, .3), sdx=0, sdy=-4, w=2)
    # beanie: slouchy dome, ribbed cuff low on the brow, little grey tag
    bc, bsh, bli = "#3D3A4A", "#262331", "#6B6782"
    dome = "M13 50 C9 22 33 0.5 60 0.5 C87 0.5 111 22 107 50 Z"
    cuff = "M10.5 41.5 Q60 29 109.5 41.5 L109 54 Q60 42.5 11 54 Z"
    hat = shaded(a, dome, bc, bsh, sdx=2.6, sdy=-3, w=2,
                 extra_light=f'<path d="{ring(60, 46, 44, 42, 50, 140, 3, 5, 3.4)}" fill="{bli}" opacity=".8"/>' + glint(30, 14, .8)
                 + line("M60 2 Q58 18 60 34 M40 6 Q34 20 34 36 M80 6 Q86 20 86 36", 1.1, bsh))
    ribs = "".join(line(f"M{f(x)} {f(42.5 - 9.5 * (1 - ((x - 60) / 50) ** 2) + .6)} L{f(x)} {f(54.5 - 11.5 * (1 - ((x - 60) / 50) ** 2) - .6)}", 1, bsh)
                   for x in range(16, 106, 6))
    hat += shaded(a, cuff, "#45424F", bsh, sdx=0, sdy=-3, w=2, extra_light=ribs)
    hat += f'<g transform="rotate(-8 90 43)"><rect x="85" y="39.5" width="10" height="6.4" rx="1.2" fill="#E9E6EF" {ink(1.3)}/>' \
           f'<path d="M87 42.7 H93" stroke="#9A95AA" stroke-width="1"/></g>'

    hood, hdsh, hdli = "#34303E", "#1E1B26", "#5C5770"
    td = torso_path(1.04, 140)
    body = legs_and_neck(a, skin, ssh, fd, "#2A2733", "#FFFFFF", "#CFC9DB")
    body += path("M40 104 Q60 92 80 104 Q76 112 60 112 Q44 112 40 104 Z", hdsh, 1.8)          # hood behind the neck
    body += shaded(a, td, hood, hdsh, sdx=-2.4, sdy=-2.6, w=2,
                   extra_light=f'<path d="M41.5 113 Q42 123 43.5 133" fill="none" stroke="{hdli}" stroke-width="1.8" stroke-linecap="round"/>')
    body += path("M46 101.5 Q60 114 74 101.5 Q71 108 60 109.5 Q49 108 46 101.5 Z", hood, 1.6)
    body += line("M55 109 L54.4 119 M65 109 L65.6 119", 1.5, "#F2EFF6") + f'<circle cx="54.4" cy="119.6" r="1.1" fill="#F2EFF6"/><circle cx="65.6" cy="119.6" r="1.1" fill="#F2EFF6"/>'
    body += path("M47 124 H73 L75 136 H45 Z", hood, 1.4)

    head_g = head(a, skin, ssh, fd, front, 40.5)
    face = open_eyes(a, eye, delay, lid=.42) + cheeks(a, 85.5, 27.5) + nose(ssh, 81.5)
    face += line("M56 89.6 Q58 88 60 89 Q62 88 64 89.6", 1.6)
    # microphone in his left hand, held up by the chin
    arms = sleeve(a, [(40, 106), (36.5, 117), (35.5, 127)], 10, hood, hdsh) + place(hand_down(skin, ssh), 35.5, 127)
    mic = (f'<path d="M83.6 98 L86.4 98 L87.6 120 Q85 121.6 82.4 120 Z" fill="#2B2833" {ink(1.6)}/>'
           f'<rect x="82.4" y="97" width="5.2" height="3" rx="1" fill="#7C7790" {ink(1.2)}/>'
           f'<circle cx="85" cy="91" r="6.8" fill="#C9C5D3" {ink(1.8)}/>'
           f'<path d="M80 88.4 Q85 86 90 88.4 M79 92.2 Q85 90 91 92.2 M80.4 95.6 Q85 94 89.6 95.6 M85 84.4 V97.6 M81.6 85.6 Q80.6 91 81.6 96.4 M88.4 85.6 Q89.4 91 88.4 96.4" fill="none" stroke="#8D88A0" stroke-width=".9"/>'
           f'<path d="M81 87.6 Q82.6 85.4 85 85" fill="none" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round"/>')
    arms += mic + sleeve(a, [(80, 106), (86, 117), (82, 114)], 10, hood, hdsh) + place(hand_fist(skin), 84.6, 117, -4, 1, True)
    fx = '<g opacity=".9">' + line("M100 46 h5 l-5 5 h5", 1.6, "#9A88D6") + line("M108 38 h4 l-4 4 h4", 1.4, "#9A88D6") + '</g>'
    return dict(back=hair_back, body=body, head=head_g, face=face, front=hair_front, hat=hat, arms=arms, fx=fx)


def jhope(a: Art, delay: float) -> dict:
    """Fluffy chestnut hair swept to one side, a slightly longer face, laughing with his heart-shaped smile and eyes shut,
    finger heart, colour-block windbreaker."""
    skin, ssh = "#FBDCC6", "#ECB39A"
    hc, hsh, hli = "#70483A", "#4B2E24", "#B1826C"
    fd = face_path(cheek=40, jaw=.93, chin=101.5)
    back = smooth([(15, 56), (13.5, 74), (17, 88), (22, 92, 1), (98, 92, 1), (103, 88), (106.5, 74), (105, 56)])
    front = smooth([(20, 87, 1), (13.5, 75), (10.5, 59), (11.5, 43), (16, 31.5), (13.6, 24, 1), (22, 20), (28.5, 11), (27.6, 4.6, 1),
                    (37.5, 5), (46, 1), (55, 1.4), (61, -2.5, 1), (66, 2), (77, 3.5), (88, 7), (96.5, 12.5), (103.5, 11, 1),
                    (102.5, 20), (107.5, 31), (110, 46), (109.6, 60), (106.4, 74), (100, 86, 1), (97.6, 74), (96.8, 63),
                    (95.2, 65, 1), (93.2, 55), (89.6, 46), (84.4, 38.5, 1), (81.4, 45), (78.6, 52), (75, 59, 1), (72.6, 51),
                    (68.5, 45), (63.5, 50), (58, 57.5, 1), (55.4, 50), (51.5, 44.5), (46.5, 49.5), (41, 56.5, 1), (38.6, 50),
                    (35.5, 46), (31, 52), (26.5, 63, 1), (24.5, 72)])
    shine = ring(60, 50, 46, 44, 32, 150, 3.2, 7, 4.2)
    strands = (strand(68.5, 45.5, 79, 14, -3, 2.2) + strand(51.5, 45, 62, 9, -3, 2.2) + strand(35.5, 46.5, 45, 14, -3, 2)
               + strand(84.4, 39, 83, 9, 1, 2) + strand(89.6, 46.5, 98, 26, -2, 1.8) + strand(97, 66, 103, 44, -1, 1.6)
               + strand(24.4, 72, 17, 52, 1.5, 1.5) + strand(75, 57, 78, 47, 0, 1.1) + strand(58, 55.5, 62, 46, 0, 1.1))
    hair_front = hair(a, front, hc, hsh, hli, shine, strands, glint(28, 16, .85, (84, 12)))
    hair_back = shaded(a, back, mix(hc, OL, .25), mix(hsh, OL, .3), sdx=0, sdy=-4, w=2)

    teal, tsh, yel, coral = "#3EC2BA", "#22958F", "#FFD54F", "#FF7E72"
    td = torso_path()
    body = legs_and_neck(a, skin, ssh, fd, "#3E3A48", "#FFFFFF", "#FF7E72", "#FFD54F")
    cid = a.clip(td)
    body += shaded(a, td, teal, tsh, sdx=-2.4, sdy=-2.6, w=2,
                   extra_shade=f'<path d="M30 116 L90 112 L90 124 L30 128 Z" fill="{yel}"/><path d="M30 128 L90 124 L90 131 L30 135 Z" fill="{coral}"/>'
                   f'<path d="M30 116 L90 112 M30 128 L90 124 M30 135 L90 131" stroke="{OL}" stroke-width="1.3" fill="none"/>')
    body += path("M49 100.5 L71 100.5 L70 106 Q60 109 50 106 Z", "#FFFFFF", 1.6)                     # high collar lining
    body += line("M60 107.5 V139", 1.6) + line("M61.5 108 V139", 1.2, "#F4F1F8")
    body += f'<rect x="58.6" y="108" width="3.4" height="4.6" rx="1" fill="#F4F1F8" {ink(1)}/>'

    head_g = head(a, skin, ssh, fd, front, 40)
    face = brows(mix(hc, OL, .3), y=52.5, spread=18.5, tilt=1.2, w=2.4)
    face += eye_closed(42, 71, "happy", -1, 3.3) + eye_closed(78, 71, "happy", 1, 3.3)
    face += line("M30.5 75 Q29 78 31 80.5 M89.5 75 Q91 78 89 80.5", 1.2, OL, .6)       # laugh lines
    face += cheeks(a, 82.5, 28) + nose(ssh, 80.5)
    # heart-shaped laugh: dipped top lip, round bottom, top teeth
    face += path("M49.5 85.4 Q55 83.2 60 87 Q65 83.2 70.5 85.4 Q71 98.4 60 99.2 Q49 98.4 49.5 85.4 Z", MOUTH, 1.8)
    face += f'<path d="M51.4 86.6 Q55.4 85.4 60 88.6 Q64.6 85.4 68.6 86.6 L68.2 89.4 Q60 91.6 51.8 89.4 Z" fill="#FFFFFF"/>'
    face += f'<path d="M53.5 95.4 Q60 91 66.5 95.4 Q64 98.4 60 98.6 Q56 98.4 53.5 95.4 Z" fill="{TONGUE}"/>'

    arms = sleeve(a, [(40, 106), (36.5, 117), (35.5, 127)], 10, coral, mix(coral, OL, .25)) + place(hand_down(skin, ssh), 35.5, 127)
    arms += sleeve(a, [(80, 106), (92, 112), (96.5, 101)], 10, coral, mix(coral, OL, .25))
    arms += place(hand_heart(skin, ssh, "#FF4F8B"), 97, 101.5, 4, 1.22)
    fx = sparkle(108, 64, 4.4) + sparkle(13, 46, 4) + sparkle(20, 30, 2.6, "#FFFFFF") + sparkle(112, 84, 2.4, "#FFFFFF")
    return dict(back=hair_back, body=body, head=head_g, face=face, front=hair_front, arms=arms, fx=fx)


def jimin(a: Art, delay: float) -> dict:
    """Long golden blonde hair with a centre part and curtain bangs, round mochi cheeks, eye smile, full lips,
    hand on his cheek, cream cable knit."""
    skin, ssh = "#FFE7DA", "#F4C1AE"
    hc, hsh, hli = "#F2D88F", "#D3AA5E", "#FFF8DE"
    fd = face_path(cheek=42, jaw=1.03, chin=99.5)
    back = smooth([(16, 56), (14, 80), (16, 95), (21, 100, 1), (26, 95), (31, 99, 1), (35, 93), (85, 93), (89, 99, 1), (94, 95),
                   (99, 100, 1), (104, 95), (106, 80), (104, 56)])
    front = smooth([(22, 94, 1), (17, 86), (13.5, 78), (10, 86, 1), (9.6, 72), (10.4, 56), (13, 42), (10.6, 35.5, 1), (17.5, 29),
                    (26, 18), (39, 9.5), (53, 5.6), (60, 8.4, 1), (67, 5.6), (81, 9.5), (94, 18), (102.5, 29), (109.4, 35.5, 1),
                    (107, 42), (109.6, 56), (110.4, 72), (110, 86, 1), (106.5, 78), (103, 86), (98, 94, 1), (96.8, 84),
                    (96.6, 72), (95.6, 64.5, 1), (93.2, 58), (90.6, 54.4), (88.6, 57), (86.4, 60.4, 1), (84.6, 53), (80.4, 47.6),
                    (77, 51), (73, 56.6, 1), (71.4, 49), (67.6, 40.6), (64.4, 36), (61.4, 30.5), (60, 28, 1), (58.6, 30.5),
                    (55.6, 36), (52.4, 40.6), (48.6, 49), (47, 56.6, 1), (43, 51), (39.6, 47.6), (35.4, 53), (33.6, 60.4, 1),
                    (31.4, 57), (29.4, 54.4), (26.8, 58), (24.4, 64.5, 1), (23.4, 72), (23.2, 84)])
    stray = smooth([(59.4, 30.6), (62.6, 38.6), (64, 50, 1), (60.6, 40.4), (57.6, 33.6)])
    shine = ring(60, 52, 47, 45, 30, 150, 3.4, 7, 4.4)
    strands = (strand(60, 27.5, 56, 8, 1.5, 2) + strand(60, 27.5, 64, 8, -1.5, 2) + strand(80.4, 48, 86, 22, -2, 1.8)
               + strand(39.6, 48, 34, 22, 2, 1.8) + strand(90.6, 55, 99, 34, -2, 1.7) + strand(29.4, 55, 21, 34, 2, 1.7)
               + strand(97, 74, 104, 54, -1.5, 1.6) + strand(23, 74, 16, 54, 1.5, 1.6)
               + strand(107.4, 77, 106, 64, 0, 1.3) + strand(12.6, 77, 14, 64, 0, 1.3))
    hair_front = hair(a, front, hc, hsh, hli, shine, strands, glint(27, 17, .85, (86, 15)), sdx=2.4, sdy=-3.2)
    hair_front += path(stray, hc, 1.7) + line("M60.6 36 Q62.4 41 62.8 46", 1, hsh)
    hair_back = shaded(a, back, mix(hc, hsh, .35), mix(hsh, OL, .15), sdx=0, sdy=-4, w=2)

    shirt, shsh, shli = "#FBFAFF", "#D6D0E8", "#FFFFFF"
    td = torso_path()
    body = legs_and_neck(a, skin, ssh, fd, "#2E2A38", "#2E2A38", "#7A7488")
    body += shaded(a, td, shirt, shsh, sdx=-2.4, sdy=-2.6, w=2,
                   extra_light=line("M44 118 Q48 124 46 132 M76 116 Q73 122 75 130", 1.2, shsh))
    body += path("M53.5 101 L60 112 L66.5 101 Z", skin, 1.6)                                         # open neck
    body += path("M47 100.5 L53.6 100.6 L58.6 111 L51.6 109 Z", shirt, 1.6) + path("M73 100.5 L66.4 100.6 L61.4 111 L68.4 109 Z", shirt, 1.6)
    body += line("M60 112 V139", 1.2, shsh) + f'<circle cx="61.8" cy="120" r=".9" fill="{shsh}"/><circle cx="61.8" cy="128" r=".9" fill="{shsh}"/>'
    body += f'<path d="M54.4 102.6 Q60 108.6 65.6 102.6" fill="none" stroke="#B9B4C8" stroke-width="1.1"/>'
    body += f'<path d="M57.8 106.6 L60 110 L62.2 106.6 Z" fill="#DCD8E6" {ink(.8)}/>'
    body += path("M52.6 99.4 Q60 103.2 67.4 99.4 L67.2 101.4 Q60 105.4 52.8 101.4 Z", "#2C2834", 1)        # choker

    head_g = head(a, skin, ssh, fd, front, 42)
    face = eye_closed(42, 71.5, "smile", -1) + eye_closed(78, 71.5, "smile", 1)
    face += line("M35 77.5 Q42 80.5 49 77.5 M71 77.5 Q78 80.5 85 77.5", 1.1, ssh)                   # cheeks pushed up
    face += cheeks(a, 83, 28.5) + nose(ssh, 80.5)
    # full lips in a soft open smile
    face += path("M53.6 86 Q60 85 66.4 86 Q65.6 93.6 60 93.8 Q54.4 93.6 53.6 86 Z", MOUTH, 1.7)
    face += f'<path d="M55.6 90.6 Q60 88.6 64.4 90.6 Q62.6 93.4 60 93.4 Q57.4 93.4 55.6 90.6 Z" fill="{TONGUE}"/>'

    # flower pose: wrists together under the chin, hands open around the face
    arms = sleeve(a, [(40, 106), (45, 119), (54, 113)], 10, shirt, shsh) + sleeve(a, [(80, 106), (75, 119), (66, 113)], 10, shirt, shsh)
    arms += place(hand_petal(skin, ssh), 55.6, 111.2, -56, 1.04, True) + place(hand_petal(skin, ssh), 64.4, 111.2, 56, 1.04)
    fx = heart(105, 50, 3.6, "#FF8FB8", 1.3) + sparkle(14, 36, 3.2, "#FFFFFF") + sparkle(110, 70, 2.6)
    return dict(back=hair_back, body=body, head=head_g, face=face, front=hair_front, arms=arms, fx=fx)


def v(a: Art, delay: float) -> dict:
    """Dark brown wavy hair with a curly fringe, a sharper jaw, deep double eyelids, the boxy smile, the mole on the tip of
    his nose, camel coat with a scarf tied at the neck, V sign by the eye."""
    skin, ssh = "#FFE2D0", "#F0B9A2"
    hc, hsh, hli = "#3E2E2E", "#241A1B", "#7D6260"
    fd = face_path(cheek=40.5, jaw=.9, chin=101)
    eye = Eye(iris="#4E3329", rx=9.8, ry=11.4, crease=True, lift=-.6, glints=2, spacing=18.4, y=70.5)
    back = smooth([(15, 56), (12.5, 74), (15, 90), (20.5, 95, 1), (25, 90), (95, 90), (99.5, 95, 1), (105, 90), (107.5, 74), (105, 56)])
    front = smooth([(19.5, 91, 1), (13.6, 83), (14.4, 75), (11.6, 65), (13, 55), (11.4, 45), (15.4, 35), (14.6, 27.5), (22, 20), (25.5, 13),
                    (34.5, 10), (41, 5), (50, 6.5), (57, 2), (67, 3.2), (75, 6.4), (83, 5), (92.5, 11), (99, 19), (106.4, 25),
                    (107.6, 35), (106.6, 45), (108.6, 56), (106.4, 66), (107, 78), (101, 91, 1), (98.6, 80), (97.6, 69),
                    (97.4, 63), (95, 61.5, 1), (93.4, 57), (89.6, 52), (86.6, 54.6), (84.6, 57.5), (82, 58, 1), (81.6, 52),
                    (76.6, 45), (73.4, 49), (70, 55.5, 1), (66.4, 47), (59, 41), (55, 46), (51.6, 56.5, 1), (49.4, 49),
                    (44, 45.4), (40, 50), (37.6, 56), (35, 57, 1), (34.2, 51), (30, 49.6), (28, 57), (27.4, 64), (25, 69.5, 1),
                    (24.6, 80)])
    shine = ring(60, 50, 46, 43, 34, 148, 3.2, 7, 4.2)
    strands = (strand(59, 41.5, 55, 10, 2, 2.2) + strand(76.6, 45.5, 80, 18, -2.5, 2) + strand(89.6, 52.5, 96, 30, -2, 1.8)
               + strand(44, 46, 39, 18, 2.5, 2) + strand(30, 50, 24, 32, 2, 1.8) + strand(97.6, 69, 103, 46, -1, 1.5)
               + strand(24.6, 80, 18, 58, 1.5, 1.5))
    curls = (line("M17 62 Q14.6 66 18 68.4 M15.6 44 Q13.6 48 17 50 M103 62 Q105.6 66 102.2 68.4 M104.4 42 Q106.6 46 103.2 48.4", 1.2, hsh)
             + line("M83 57.4 Q86 58.6 86.4 55.6", 1.3) + line("M35.6 56.4 Q32.6 57.8 32.4 54.6", 1.3) + line("M95.6 61 Q98.4 60.8 98 58", 1.2)
             + line("M70.6 55 Q73.4 54 72.6 51.4", 1.2) + line("M51.2 56 Q48.4 55.4 49 52.6", 1.2))
    hair_front = hair(a, front, hc, hsh, hli, shine, strands + curls, glint(29, 16, .85, (85, 13)))
    hair_back = shaded(a, back, mix(hc, OL, .25), mix(hsh, OL, .3), sdx=0, sdy=-4, w=2)

    coat, csh, cli = "#C99B6A", "#A37548", "#E6C49C"
    scarf, ssc = "#4D3A57", "#33263B"
    td = torso_path(1.04, 141)
    body = legs_and_neck(a, skin, ssh, fd, "#3A3442", "#4A3A33", "#2B211D")
    body += shaded(a, td, coat, csh, sdx=-2.4, sdy=-2.6, w=2)
    body += path("M52 101 L68 101 L66 139 L54 139 Z", "#F3EEE6", 1.6)
    body += path("M47 100.5 L56 103 L58 116 L52 113 L48 120 Z", coat, 1.6) + path("M73 100.5 L64 103 L62 116 L68 113 L72 120 Z", coat, 1.6)
    body += line("M54 116 L53 140 M66 116 L67 140", 1.4) + f'<circle cx="69.4" cy="125" r="1.1" fill="{OL}"/><circle cx="69.6" cy="132" r="1.1" fill="{OL}"/>'
    # scarf knotted at the neck
    body += path("M49 99 Q60 106 71 99 L72 104 Q60 112 48 104 Z", scarf, 1.7)
    body += path("M56 105 L52.5 120 L57.4 119.2 L60.6 108 Z", scarf, 1.6) + path("M60 105.5 L63 118.6 L67.4 116.6 L63.6 105 Z", ssc, 1.6)
    body += f'<circle cx="52" cy="102.2" r=".8" fill="#E8DCEF"/><circle cx="58" cy="105.6" r=".8" fill="#E8DCEF"/><circle cx="66" cy="104" r=".8" fill="#E8DCEF"/>'

    head_g = head(a, skin, ssh, fd, front, 40.5)
    face = open_eyes(a, eye, delay) + cheeks(a, 85, 27.5) + nose(ssh, 81.5)
    face += f'<circle cx="61.4" cy="82.6" r=".95" fill="{OL}"/>'                                # nose-tip mole
    # boxy smile: wide rectangular grin, top teeth
    face += path("M49.4 86 L70.6 86 Q71.4 93.4 67.4 95.6 L52.6 95.6 Q48.6 93.4 49.4 86 Z", MOUTH, 1.8)
    face += f'<path d="M50.6 87.2 L69.4 87.2 L69 90.4 L51 90.4 Z" fill="#FFFFFF"/>'
    face += f'<path d="M54 94.8 Q60 91.6 66 94.8 Z" fill="{TONGUE}"/>'

    arms = sleeve(a, [(40, 106), (36.5, 117), (35.5, 127)], 10, coat, csh) + place(hand_down(skin, ssh), 35.5, 127)
    arms += sleeve(a, [(80, 106), (93, 111), (99, 98)], 10, coat, csh)
    arms += place(hand_v(skin, ssh), 99.5, 98, 10, 1.05)
    fx = sparkle(13, 42, 3.4) + sparkle(110, 50, 2.6, "#FFFFFF")
    return dict(back=hair_back, body=body, head=head_g, face=face, front=hair_front, arms=arms, fx=fx)


def jungkook(a: Art, delay: float) -> dict:
    """Black layered hair with a pointy fringe over the brows, big doe eyes, bunny teeth, lip ring, ear hoops,
    black leather jacket over a white tee, tattooed right hand."""
    skin, ssh = "#FFE4D4", "#F2BBA6"
    hc, hsh, hli = "#353048", "#1C1928", "#6A6590"
    fd = face_path(cheek=41, jaw=.96, chin=100)
    eye = Eye(iris="#5C3B2E", rx=10.4, ry=12.2, crease=True, glints=3, spacing=18.4, y=70.5, iris_w=.9)

    back = smooth([(15, 56), (14, 76), (17, 92), (22, 97, 1), (26, 93), (31, 98, 1), (35, 92), (85, 92), (89, 98, 1),
                   (95, 93), (100, 98, 1), (105, 91), (109, 78), (110, 62), (108, 52)])
    front = smooth([(21, 98, 1), (14.5, 88), (11, 72), (10.5, 56), (13, 40), (18.5, 27), (23.5, 20), (22.5, 13.5, 1), (31, 11),
                    (42, 5.5), (54, 2.5), (60.5, -1.5, 1), (64.5, 3), (76, 4), (89, 9), (99, 16.5), (105, 26), (109, 40),
                    (109.6, 52), (106.4, 58.6), (101.8, 61.4, 1), (100.8, 68), (99.6, 77, 1), (97, 67),
                    (95.5, 56), (94.5, 66), (93, 72, 1), (89.5, 59), (85, 48.5), (81.5, 52), (77.5, 57.5, 1), (74.5, 50),
                    (69, 41), (65, 50), (59.5, 64.5, 1), (55.5, 52), (50.5, 44.5), (46, 50), (41.5, 57.5, 1), (39, 51),
                    (35.5, 47.5), (31, 56), (26.5, 72, 1), (25.5, 82), (24, 91)])
    shine = ring(60, 52, 47, 46, 34, 148, 3.2, 7, 4.2)
    strands = (strand(85, 49, 88, 26, -2, 2.2) + strand(69, 41.5, 64, 6, 2, 2.4) + strand(50.5, 45, 46, 22, 2.5, 2.2)
               + strand(35.5, 48, 30, 30, 2, 2) + strand(95.5, 56.5, 101, 36, -1, 1.8) + strand(24.5, 89, 16, 62, 2, 1.8)
               + strand(59.5, 62, 59, 49, .5, 1.2) + strand(93, 70, 92, 58, 0, 1.1) + strand(26.5, 70, 27.5, 58, 0, 1.1))
    glint = f'<path d="M29 22 Q37 13 49 9.6 Q40 15.6 33 24 Z" fill="#FFFFFF" opacity=".9"/><circle cx="85" cy="15" r="1.5" fill="#FFFFFF"/>'
    hair_front = shaded(a, front, hc, hsh, sdx=2.6, sdy=-3.4, w=2,
                        extra_light=f'<path d="{shine}" fill="{hli}"/>' + glint + strands.replace(f'fill="{OL}"', f'fill="{hsh}"'))
    hair_back = shaded(a, back, mix(hc, OL, .25), mix(hsh, OL, .3), sdx=0, sdy=-4, w=2)

    jacket, jsh, jli = "#2C2836", "#17141E", "#6A6480"
    td = torso_path()
    body = legs("#2B2733", "#F4F1F8", "#C9C2D6") + neck(skin, ssh, a, fd)
    body += shaded(a, td, jacket, jsh, sdx=-2.4, sdy=-2.6, w=2, extra_light=
                   f'<path d="M41.5 112 Q42.5 122 44 133" fill="none" stroke="{jli}" stroke-width="2" stroke-linecap="round"/>'
                   f'<path d="M77 110 Q78 116 78 121" fill="none" stroke="{jli}" stroke-width="1.6" stroke-linecap="round"/>')
    body += path("M52 101 Q60 103 68 101 L67 139 L53 139 Z", "#FFFFFF", 1.8)                          # tee
    body += line("M54 102 Q60 106.5 66 102", 1.2, "#C9C2D6")
    body += path("M47.5 100.5 L54 101 L57 110 L52.5 118 L50 110 Z", jacket, 1.7) + path("M72.5 100.5 L66 101 L63 110 L67.5 118 L70 110 Z", jacket, 1.7)
    body += path("M53 118 L52.2 139 L48 139 Z", jacket, 1.5) + path("M67 118 L67.8 139 L72 139 Z", jacket, 1.5)
    body += line("M68.6 120 V137", 1.5, "#BDB6CC") + f'<rect x="67.3" y="119" width="2.6" height="3.6" rx="1" fill="#D8D2E4" {ink(.9)}/>'

    hoops = (f'<circle cx="103" cy="78.2" r="2.3" fill="none" stroke="#D5CFE2" stroke-width="1.4"/>'
             f'<circle cx="104.8" cy="74.6" r="1.6" fill="none" stroke="#D5CFE2" stroke-width="1.2"/>'
             f'<circle cx="17.2" cy="79" r="2.1" fill="none" stroke="#D5CFE2" stroke-width="1.3"/>')
    head_g = head(a, skin, ssh, fd, front, 41, hoops)

    eyes_g = f'<g class="b{a.uid}">{eye_open(a, eye, -1)}{eye_open(a, eye, 1)}</g>'
    face = blink_style(a.uid, delay) + brows(mix(hc, OL, .1), y=53, w=2.4) + eyes_g
    face += cheeks(a, 85, 27.5) + nose(ssh, 81.5)
    face += path("M53.4 86.6 Q60 85.4 66.6 86.6 Q65.6 95.4 60 95.4 Q54.4 95.4 53.4 86.6 Z", MOUTH, 1.7)
    face += f'<path d="M55.6 92.4 Q60 89.6 64.4 92.4 Q62.4 95 60 95 Q57.6 95 55.6 92.4 Z" fill="{TONGUE}"/>'
    face += path("M56.6 86.3 L56.8 90 Q58.4 91 59.9 90 L59.9 86.1 Z M60.1 86.1 L60.1 90 Q61.6 91 63.2 90 L63.4 86.3 Z", "#FFFFFF", 1)
    face += f'<circle cx="66.4" cy="98.6" r=".95" fill="{OL}"/>'
    face += f'<path d="M64.6 94.4 A2.4 2.4 0 1 0 67.8 92.6" fill="none" stroke="#C9C2D6" stroke-width="1.4" stroke-linecap="round"/>'

    arms = sleeve(a, [(40, 106), (36.5, 117), (35.5, 127)], 10, jacket, jsh) + place(hand_down(skin, ssh), 35.5, 127)
    arms += sleeve(a, [(80, 106), (91, 117), (95, 108)], 10, jacket, jsh)
    tat = line("M-5 -3.4 L-2.6 -6.4 M-4.2 -8.6 L-2 -10.4", 1, "#3A3550", .85) + f'<circle cx="2.6" cy="-2.2" r="1" fill="#3A3550" opacity=".8"/>'
    arms += place(hand_thumb(skin, ssh) + tat, 95.6, 108, 4, 1.08)
    fx = sparkle(112, 38, 3.8) + sparkle(13, 38, 3, "#FFFFFF")
    return dict(back=hair_back, body=body, head=head_g, face=face, front=hair_front, arms=arms, fx=fx)


MEMBERS = {"rm": rm, "jin": jin, "suga": suga, "jhope": jhope, "jimin": jimin, "v": v, "jungkook": jungkook}
ORDER = ["rm", "jin", "suga", "jhope", "jimin", "v", "jungkook"]
NAMES = {"rm": "RM", "jin": "Jin", "suga": "SUGA", "jhope": "j-hope", "jimin": "Jimin", "v": "V", "jungkook": "Jung Kook"}
GROUPS = {"bts": "BTS"}


def sprite(mid: str, uid: str, delay: float):
    a = Art(uid)
    L = MEMBERS[mid](a, delay)
    g = "".join(L.get(k, "") for k in ("back", "body", "head", "face", "front", "hat", "arms", "fx"))
    return "".join(a.defs), g


def filt(fid: str = "cut") -> str:
    """Outer ink line + white sticker border + soft lavender drop, around the whole silhouette."""
    return (f'<filter id="{fid}" x="-14%" y="-12%" width="128%" height="124%" color-interpolation-filters="sRGB">'
            '<feMorphology in="SourceAlpha" operator="dilate" radius=".9" result="k"/>'
            '<feMorphology in="SourceAlpha" operator="dilate" radius="3.8" result="d"/>'
            '<feOffset in="d" dx="1.4" dy="2.6" result="o"/>'
            '<feFlood flood-color="#B9A4EE" flood-opacity=".9"/><feComposite in2="o" operator="in" result="sh"/>'
            '<feFlood flood-color="#FFFFFF"/><feComposite in2="d" operator="in" result="w"/>'
            f'<feFlood flood-color="{OL}"/><feComposite in2="k" operator="in" result="ink"/>'
            '<feMerge><feMergeNode in="sh"/><feMergeNode in="w"/><feMergeNode in="ink"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')


def svg_member(mid: str, group: str, gname: str, delay: float) -> str:
    title = f"{NAMES[mid]} ({gname}), chibi"
    defs, g = sprite(mid, f"{group}-{mid}", delay)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -10 {W + 12} {H + 14}" width="{W + 12}" height="{H + 14}" role="img" aria-label="{title}">'
            f'<title>{title}</title><defs>{filt()}{defs}</defs><g filter="url(#cut)">{g}</g></svg>\n')


def crowd_layout(n: int):
    rows = [n] if n <= 5 else [math.ceil(n / 2), n // 2]
    width = W + (rows[0] - 1) * STEP
    out = []
    for r, k in enumerate(rows):
        off = (width - (W + (k - 1) * STEP)) / 2
        for i in range(k):
            out.append((off + i * STEP, r * ROW))
    return out, width, H + (len(rows) - 1) * ROW


def svg_group(group: str, gname: str, ids) -> str:
    lay, w, h = crowd_layout(len(ids))
    defs, uses = filt(), ""
    for i, (mid, (x, y)) in enumerate(zip(ids, lay)):
        d, body = sprite(mid, f"{group}-{mid}", i * .7)
        defs += d + f'<symbol id="{group}-{mid}-s" viewBox="-6 -10 {W + 12} {H + 14}">{body}</symbol>'
        uses += f'<use href="#{group}-{mid}-s" x="{x - 6:.0f}" y="{y - 10}" width="{W + 12}" height="{H + 14}" filter="url(#cut)"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -14 {w + 20:.0f} {h + 22}" width="{w + 20:.0f}" height="{h + 22}" role="img" aria-label="{gname}, chibis">'
            f'<title>{gname}, chibis</title><defs>{defs}</defs>{uses}</svg>\n')


def main() -> None:
    out = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else OUT
    for group, gname in GROUPS.items():
        ids = [m for m in ORDER if m in MEMBERS]
        d = out / group
        d.mkdir(parents=True, exist_ok=True)
        for i, mid in enumerate(ids):
            (d / f"{mid}.svg").write_text(svg_member(mid, group, gname, i * .9 % 4.6), encoding="utf-8")
        if len(ids) == len(ORDER):
            (out / f"{group}.svg").write_text(svg_group(group, gname, ids), encoding="utf-8")
        print(f"{group}: {len(ids)} chibis -> {d}")


if __name__ == "__main__":
    main()

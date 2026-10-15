"""Genera los chibis SVG de cada grupo en assets/chibis/.

Uso: python tools/chibis.py
Cada chibi es original: comparte el cuerpo base (cabeza grande, cuerpo chiquito, troquel blanco de sticker)
y cambia peinado, ropa, color y un gesto que se reconoce del grupo.
"""
from pathlib import Path

INK = "#2E2150"
SKIN = "#FFE4D2"
BLUSH = "#FF9DBF"
OUT = Path(__file__).resolve().parent.parent / "assets" / "chibis"

DEFS = f"""<defs>
<filter id="cut" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
<feMorphology in="SourceAlpha" operator="dilate" radius="5" result="d"/>
<feOffset in="d" dx="2" dy="5" result="o"/>
<feFlood flood-color="#B9A4EE"/><feComposite in2="o" operator="in" result="sh"/>
<feFlood flood-color="#FFFFFF"/><feComposite in2="d" operator="in" result="w"/>
<feMerge><feMergeNode in="sh"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
</defs>"""

S = f'stroke="{INK}" stroke-linejoin="round" stroke-linecap="round"'
SW = "stroke-width"


def eye(x, y, big=False):
    rx, ry = (7.5, 9.5) if big else (6.5, 8.5)
    return (f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{INK}"/>'
            f'<circle cx="{x - 2.4}" cy="{y - 3.4}" r="3" fill="#fff"/>'
            f'<circle cx="{x + 2.6}" cy="{y + 3}" r="1.4" fill="#fff"/>')


def wink(x, y):
    return f'<path d="M{x - 7} {y + 1} Q{x} {y - 7} {x + 7} {y + 1}" fill="none" {S} stroke-width="3.4"/>'


def blush():
    return (f'<ellipse cx="52" cy="95" rx="8" ry="4.5" fill="{BLUSH}" opacity=".75"/>'
            f'<ellipse cx="108" cy="95" rx="8" ry="4.5" fill="{BLUSH}" opacity=".75"/>')


def head():
    return f'<circle cx="80" cy="74" r="44" fill="{SKIN}" {S} stroke-width="3"/>'


def ears():
    return (f'<ellipse cx="37" cy="82" rx="7" ry="9" fill="{SKIN}" {S} stroke-width="3"/>'
            f'<ellipse cx="123" cy="82" rx="7" ry="9" fill="{SKIN}" {S} stroke-width="3"/>')


def legs(pants="#3B2F5E", shoe="#FFFFFF", accent=None, kick=False):
    left = f'<rect x="60" y="156" width="14" height="20" rx="6" fill="{pants}" {S} stroke-width="3"/>'
    right = f'<rect x="86" y="156" width="14" height="20" rx="6" fill="{pants}" {S} stroke-width="3"/>'
    ls = f'<ellipse cx="65" cy="179" rx="11" ry="7" fill="{shoe}" {S} stroke-width="3"/>'
    rs = f'<ellipse cx="95" cy="179" rx="11" ry="7" fill="{shoe}" {S} stroke-width="3"/>'
    if kick:
        right = f'<rect x="88" y="150" width="14" height="20" rx="6" fill="{pants}" {S} stroke-width="3" transform="rotate(-38 95 156)"/>'
        rs = f'<ellipse cx="108" cy="170" rx="11" ry="7" fill="{shoe}" {S} stroke-width="3" transform="rotate(-30 108 170)"/>'
    stripes = ""
    if accent:
        stripes = (f'<path d="M57 179 H73" stroke="{accent}" stroke-width="3" stroke-linecap="round"/>'
                   + ("" if kick else f'<path d="M87 179 H103" stroke="{accent}" stroke-width="3" stroke-linecap="round"/>'))
    return left + right + ls + rs + stripes


def body(color, extra=""):
    return (f'<path d="M54 116 Q54 108 64 108 H96 Q106 108 106 116 L113 154 Q114 162 105 162 H55 Q46 162 47 154 Z" fill="{color}" {S} stroke-width="3"/>'
            + extra)


def arm(d, color, hand):
    """Brazo como trazo grueso: contorno de tinta, manga de color y mano redonda al final."""
    hx, hy = hand
    return (f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="17" stroke-linecap="round"/>'
            f'<path d="{d}" fill="none" stroke="{color}" stroke-width="11" stroke-linecap="round"/>'
            f'<circle cx="{hx}" cy="{hy}" r="7" fill="{SKIN}" {S} stroke-width="3"/>')


def sparkle(x, y, r, fill="#FFD84D"):
    k = r * 0.32
    return (f'<path d="M{x} {y - r} Q{x + k} {y - k} {x + r} {y} Q{x + k} {y + k} {x} {y + r} '
            f'Q{x - k} {y + k} {x - r} {y} Q{x - k} {y - k} {x} {y - r} Z" fill="{fill}" {S} stroke-width="2"/>')


def heart(x, y, s, fill, stroke=True):
    d = (f"M{x} {y + 0.9 * s} C{x - 1.3 * s} {y + 0.1 * s} {x - 1.1 * s} {y - 0.9 * s} {x - 0.5 * s} {y - 0.9 * s} "
         f"C{x - 0.2 * s} {y - 0.9 * s} {x} {y - 0.6 * s} {x} {y - 0.4 * s} "
         f"C{x} {y - 0.6 * s} {x + 0.2 * s} {y - 0.9 * s} {x + 0.5 * s} {y - 0.9 * s} "
         f"C{x + 1.1 * s} {y - 0.9 * s} {x + 1.3 * s} {y + 0.1 * s} {x} {y + 0.9 * s} Z")
    return f'<path d="{d}" fill="{fill}" {S + ' stroke-width="3"' if stroke else ""}/>'


def svg(name, inner, title, under=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200" width="160" height="200" role="img" aria-label="{title}">'
            f'<title>{title}</title>{DEFS}{under}<g filter="url(#cut)">{inner}</g></svg>\n')


# ---------- BTS: sudadera morada, corazón morado y 7 estrellitas en corona ----------
def bts():
    c, light = "#7B3FE4", "#B48CFF"
    stars = ""
    import math
    for i in range(7):
        a = math.radians(-160 + i * (140 / 6))
        stars += sparkle(80 + 58 * math.cos(a), 72 + 56 * math.sin(a), 6 if i % 2 else 7.5)
    hair = (f'<path d="M34 82 C26 36 56 20 80 20 C104 20 134 36 126 82 C122 70 118 62 112 58 C108 70 100 70 96 58 '
            f'C90 72 80 72 78 56 C72 72 62 70 60 58 C54 64 44 70 34 82 Z" fill="#3A2858" {S} stroke-width="3"/>'
            f'<path d="M58 34 Q70 28 82 30" fill="none" stroke="#6E58A0" stroke-width="4" stroke-linecap="round"/>')
    hood = (f'<path d="M50 112 Q80 128 110 112 L111 121 Q80 136 49 121 Z" fill="{light}" {S} stroke-width="3"/>'
            f'<path d="M72 124 L71 140 M88 124 L89 140" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>')
    held = heart(80, 142, 17, light) + f'<path d="M71 134 Q74 130 78 132" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'
    arms = (arm("M56 122 Q50 138 64 146", c, (64, 146)) + arm("M104 122 Q110 138 96 146", c, (96, 146)))
    face = eye(64, 82) + eye(96, 82) + blush() + f'<path d="M71 96 Q80 108 89 96 Z" fill="#E8536F" {S} stroke-width="2.6"/>'
    inner = (legs() + body(c) + hood + stars + ears() + head() + hair + face + held + arms)
    return svg("bts", inner, "Chibi de BTS")


# ---------- Stray Kids: corre (Run It), bandana roja, chaqueta roja y rayo ----------
def skz():
    c = "#E5323B"
    speed = "".join(f'<path d="M{x} {y} H{x + w}" stroke="{c}" stroke-width="5" stroke-linecap="round" opacity=".55"/>'
                    for x, y, w in [(8, 118, 22), (14, 134, 16), (6, 150, 20)])
    spikes = (f'<path d="M36 74 C30 36 56 18 82 20 C110 20 134 40 124 74 Z" fill="#2A2440" {S} stroke-width="3"/>'
              f'<path d="M48 36 L42 14 L64 26 Z M76 22 L82 8 L92 24 Z M104 28 L122 16 L116 40 Z" fill="#2A2440" {S} stroke-width="3"/>'
              f'<path d="M86 22 Q104 26 112 44" fill="none" stroke="{c}" stroke-width="5" stroke-linecap="round"/>')
    band = (f'<path d="M37 64 Q80 46 123 64 L122 76 Q80 58 38 76 Z" fill="{c}" {S} stroke-width="3"/>'
            f'<circle cx="60" cy="63" r="2" fill="#fff"/><circle cx="80" cy="58" r="2" fill="#fff"/><circle cx="100" cy="62" r="2" fill="#fff"/>'
            f'<path d="M122 66 L142 56 L138 72 Z M122 70 L144 78 L130 86 Z" fill="{c}" {S} stroke-width="3"/>')
    strands = f'<path d="M48 74 L54 86 L60 72 Z M96 72 L104 86 L110 74 Z" fill="#2A2440" {S} stroke-width="2.4"/>'
    jacket = (f'<path d="M80 110 V160" stroke="{INK}" stroke-width="2.4"/>'
              f'<path d="M64 110 L80 122 L96 110" fill="#fff" {S} stroke-width="2.4"/>')
    bolt = f'<path d="M134 104 L122 124 H132 L124 144 L144 118 H134 L142 104 Z" fill="#FFD84D" {S} stroke-width="2.4"/>'
    arms = (arm("M56 122 Q42 128 40 112", c, (40, 110))
            + f'<path d="M37 112 l6 0" stroke="#fff" stroke-width="2"/>'
            + arm("M104 124 Q118 136 124 150", c, (124, 151)))
    stripes = (f'<path d="M45 120 L50 128" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'
               f'<path d="M113 134 L118 129" stroke="#fff" stroke-width="3" stroke-linecap="round"/>')
    face = (wink(64, 83) + eye(96, 82) + blush()
            + f'<path d="M70 95 Q80 108 92 95 Z" fill="#E8536F" {S} stroke-width="2.6"/>'
            + f'<path d="M74 96 L77 101 L80 96 Z" fill="#fff"/>')
    inner = (legs(accent=c, kick=True) + body(c, jacket) + ears() + head() + spikes + band + strands + face + arms + stripes + bolt)
    return svg("skz", inner, "Chibi de Stray Kids", speed)


# ---------- TWICE: moñitos dobles, vestido albaricoque y la pose TT con lagrimitas ----------
def twice():
    c, mag = "#FF8A2B", "#FF4F9A"
    back = f'<path d="M38 70 C30 104 34 128 46 136 L58 118 L102 118 L114 136 C126 128 130 104 122 70 Z" fill="#5B3A3A" {S} stroke-width="3"/>'
    buns = (f'<circle cx="40" cy="38" r="15" fill="#5B3A3A" {S} stroke-width="3"/><circle cx="120" cy="38" r="15" fill="#5B3A3A" {S} stroke-width="3"/>'
            f'<path d="M44 50 L34 46 L36 58 Z M44 50 L54 44 L54 56 Z" fill="{mag}" {S} stroke-width="2.4"/>'
            f'<path d="M116 50 L106 44 L106 56 Z M116 50 L126 46 L124 58 Z" fill="{mag}" {S} stroke-width="2.4"/>')
    bangs = (f'<path d="M37 80 C34 40 58 24 80 24 C102 24 126 40 123 80 C118 70 114 64 110 62 L106 72 L98 62 L94 72 L86 62 '
             f'L80 70 L74 62 L66 72 L62 62 L54 72 L50 64 C44 68 40 74 37 80 Z" fill="#5B3A3A" {S} stroke-width="3"/>'
             f'<path d="M62 34 Q74 28 86 30" fill="none" stroke="#8A5E57" stroke-width="4" stroke-linecap="round"/>')
    collar = (f'<path d="M58 110 L80 126 L102 110 L98 120 L80 132 L62 120 Z" fill="#fff" {S} stroke-width="2.4"/>'
              + heart(80, 131, 6, mag)
              + f'<path d="M58 150 H102" stroke="#fff" stroke-width="3" stroke-linecap="round"/>')
    tt = ""
    for x, d in ((50, 1), (110, -1)):
        tt += (f'<rect x="{x - 8}" y="91" width="16" height="6" rx="3" fill="{SKIN}" {S} stroke-width="2.4"/>'
               f'<rect x="{x - 3}" y="94" width="6" height="15" rx="3" fill="{SKIN}" {S} stroke-width="2.4"/>')
    tears = (f'<path d="M66 90 Q62 98 66 101 Q70 98 66 90 Z" fill="#7FD3F7" {S} stroke-width="2"/>'
             f'<path d="M94 90 Q90 98 94 101 Q98 98 94 90 Z" fill="#7FD3F7" {S} stroke-width="2"/>')
    arms = arm("M55 120 Q44 116 50 108", c, (50, 108)) + arm("M105 120 Q116 116 110 108", c, (110, 108))
    face = eye(64, 80, True) + eye(96, 80, True) + blush() + f'<path d="M75 94 Q80 90 85 94" fill="none" {S} stroke-width="2.6"/>'
    inner = (back + legs(pants=SKIN, shoe=mag) + body(c, collar) + buns + ears() + head() + bangs + face + tears + arms + tt)
    return svg("twice", inner, "Chibi de TWICE")


# ---------- BLACKPINK: pelo negro largo, moño rosa, negro y rosa, corazón de dedos ----------
def blackpink():
    c, pink = "#F2559A", "#FF9CC6"
    back = f'<path d="M36 66 C26 110 30 150 44 158 L60 120 L100 120 L116 158 C130 150 134 110 124 66 Z" fill="#1F1A2E" {S} stroke-width="3"/>'
    bangs = (f'<path d="M36 82 C32 38 58 22 80 22 C102 22 128 38 124 82 C120 72 116 66 112 62 L108 74 L100 62 L96 74 '
             f'L88 62 L80 74 L72 62 L64 74 L60 62 L52 74 L48 64 C42 70 38 76 36 82 Z" fill="#1F1A2E" {S} stroke-width="3"/>'
             f'<path d="M58 34 Q70 27 84 29" fill="none" stroke="#4A4166" stroke-width="4" stroke-linecap="round"/>')
    bow = (f'<path d="M108 30 L88 16 L90 42 Z M108 30 L128 14 L130 42 Z" fill="{c}" {S} stroke-width="3"/>'
           f'<circle cx="108" cy="30" r="6" fill="{pink}" {S} stroke-width="3"/>')
    top = (f'<path d="M54 116 Q54 108 64 108 H96 Q106 108 106 116 L108 134 H52 Z" fill="#2A2235" {S} stroke-width="3"/>'
           f'<path d="M64 108 L72 124 M96 108 L88 124" stroke="{c}" stroke-width="3" stroke-linecap="round"/>')
    skirt = (f'<path d="M52 134 H108 L116 160 Q80 168 44 160 Z" fill="{pink}" {S} stroke-width="3"/>'
             f'<path d="M64 136 L60 162 M80 136 V164 M96 136 L100 162" stroke="{c}" stroke-width="2.4" stroke-linecap="round"/>')
    fheart = (arm("M104 122 Q122 118 118 100", "#2A2235", (118, 99))
              + heart(126, 82, 8, c) + sparkle(138, 98, 5, "#fff"))
    larm = arm("M56 122 Q46 136 54 148", "#2A2235", (54, 149))
    face = (eye(64, 82) + wink(96, 83)
            + f'<path d="M89 76 L92 72 M95 75 L97 71 M101 76 L103 72" stroke="{INK}" stroke-width="2" stroke-linecap="round"/>'
            + blush() + heart(80, 98, 5.5, c))
    inner = (back + legs(pants=SKIN, shoe="#2A2235") + skirt + top + ears() + head() + bangs + bow + face + larm + fheart)
    return svg("blackpink", inner, "Chibi de BLACKPINK")


# ---------- LNGSHOT: gorro de lana turquesa y un tiro largo con una estrella ----------
def lngshot():
    c, light = "#0FA3B1", "#7FDCE3"
    trail = (f'<path d="M124 96 Q140 60 132 28" fill="none" stroke="{c}" stroke-width="4" stroke-dasharray="2 8" stroke-linecap="round"/>'
             + sparkle(130, 22, 12))
    hair = (f'<path d="M38 78 Q40 96 46 100 L50 78 Z M122 78 Q120 96 114 100 L110 78 Z" fill="#2A2440" {S} stroke-width="3"/>'
            f'<path d="M48 70 L56 84 L62 70 Z M98 70 L104 84 L112 70 Z" fill="#2A2440" {S} stroke-width="2.4"/>')
    beanie = (f'<path d="M38 66 C36 30 60 18 80 18 C100 18 124 30 122 66 Z" fill="{c}" {S} stroke-width="3"/>'
              f'<path d="M58 26 V60 M80 20 V60 M102 26 V60" stroke="{light}" stroke-width="3" stroke-linecap="round"/>'
              f'<rect x="34" y="56" width="92" height="17" rx="8.5" fill="{light}" {S} stroke-width="3"/>'
              f'<circle cx="80" cy="16" r="9" fill="#fff" {S} stroke-width="3"/>')
    hoodie = (f'<path d="M80 112 V124" stroke="{INK}" stroke-width="2.4"/>'
              f'<path d="M58 140 H102" stroke="{light}" stroke-width="5" stroke-linecap="round"/>'
              f'<path d="M66 148 Q80 156 94 148" fill="none" stroke="{INK}" stroke-width="2.4" stroke-linecap="round"/>')
    arms = arm("M56 122 Q46 138 58 148", c, (58, 148)) + arm("M104 120 Q122 112 124 98", c, (124, 97))
    brows = (f'<path d="M56 70 L70 73 M104 70 L90 73" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>')
    face = (eye(64, 83) + eye(96, 83) + brows + blush()
            + f'<path d="M72 98 Q82 104 90 96" fill="none" {S} stroke-width="2.8"/>')
    inner = (trail + legs(accent=c) + body(c, hoodie) + ears() + head() + hair + beanie + face + arms)
    return svg("lngshot", inner, "Chibi de LNGSHOT")


# ---------- Grupo nuevo sin chibi propio: fan con lightstick genérico ----------
def default():
    c, light = "#8E7CC3", "#C9B8F2"
    hair = (f'<path d="M36 80 C30 38 56 22 80 22 C104 22 130 38 124 80 C118 66 110 58 100 56 C92 66 72 66 62 56 C52 60 42 68 36 80 Z" fill="#3A2858" {S} stroke-width="3"/>')
    stick = (f'<path d="M118 132 L126 96" stroke="{INK}" stroke-width="9" stroke-linecap="round"/>'
             f'<path d="M118 132 L126 96" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'
             f'<circle cx="127" cy="88" r="13" fill="{light}" {S} stroke-width="3"/>' + sparkle(127, 88, 6, "#fff"))
    arms = arm("M56 122 Q46 138 58 148", c, (58, 148)) + arm("M104 122 Q116 134 118 132", c, (118, 132))
    face = eye(64, 82) + eye(96, 82) + blush() + f'<path d="M71 96 Q80 106 89 96" fill="none" {S} stroke-width="2.8"/>'
    inner = legs() + body(c) + ears() + head() + hair + face + stick + arms
    return svg("default", inner, "Chibi fan")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for fn in (bts, skz, twice, blackpink, lngshot, default):
        (OUT / f"{fn.__name__}.svg").write_text(fn(), encoding="utf-8")
        print("ok", fn.__name__)

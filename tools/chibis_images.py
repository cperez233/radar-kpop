"""Builds the chibi SVGs of groups that have a hand-made sticker sheet (an illustration on a white background).

Usage: python tools/chibis_images.py
For every group in SHEETS it reads tools/art/<group>-stickers.webp, removes the white background, cuts out each
member's sticker and writes:
  assets/chibis/<group>/<member>.svg   the sticker as an embedded WebP (viewBox -6 -10 132 174, bottom-aligned)
  assets/chibis/<group>.svg            the whole group, same crowd layout as tools/chibis.py and app.js
tools/chibis.py leaves these groups alone, so running it does not overwrite them.
Needs Pillow and numpy.
"""
import base64
import io
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "chibis"
ART = ROOT / "tools" / "art"
W, H = 120, 160
ROW, STEP = 66, 72      # crowd layout, same as tools/chibis.py and app.js
BOX = (-4, -8, 128, 170)  # where a sticker may sit inside the sprite: x, y, width, bottom
SCALE = 2.4             # pixels per sprite unit kept in the embedded image (sharp on 2x screens)
GROUP_SCALE = 1.3       # the group sprite is only ever shown small

# group -> (name, {member: (name, crop box x0, y0, x1, y1 in the sheet)}), in roster order
SHEETS = {
    "bts": ("BTS", {
        "rm": ("RM", (40, 30, 372, 404)),
        "jin": ("Jin", (385, 30, 672, 378)),
        "suga": ("SUGA", (690, 30, 1012, 444)),
        "jhope": ("j-hope", (370, 380, 700, 680)),
        "jimin": ("Jimin", (30, 680, 350, 1010)),
        "v": ("V", (370, 680, 690, 1010)),
        "jungkook": ("Jung Kook", (690, 680, 1010, 1010)),
    }),
    "skz": ("Stray Kids", {
        "bangchan": ("Bang Chan", (40, 30, 365, 386)),
        "leeknow": ("Lee Know", (362, 30, 680, 375)),
        "changbin": ("Changbin", (690, 30, 1010, 375)),
        "hyunjin": ("Hyunjin", (40, 386, 360, 685)),
        "han": ("HAN", (360, 378, 700, 685)),
        "felix": ("Felix", (40, 685, 365, 1010)),
        "seungmin": ("Seungmin", (370, 685, 680, 1010)),
        "in": ("I.N", (690, 685, 1010, 1010)),
    }),
    # the sheet also has Heeseung (top middle, 376-671 x 52-378); he is solo since March 2026, so he is not in the roster
    "enhypen": ("ENHYPEN", {
        "jungwon": ("Jungwon", (40, 40, 360, 378)),
        "jay": ("Jay", (681, 40, 1010, 378)),
        "jake": ("Jake", (360, 378, 690, 690)),
        "sunghoon": ("Sunghoon", (40, 690, 358, 1010)),
        "sunoo": ("Sunoo", (358, 690, 684, 1010)),
        "niki": ("Ni-ki", (684, 690, 1010, 1010)),
    }),
    "blackpink": ("BLACKPINK", {
        "jisoo": ("Jisoo", (20, 20, 518, 522)),
        "jennie": ("Jennie", (518, 20, 1010, 522)),
        "rose": ("Rosé", (20, 522, 526, 1010)),
        "lisa": ("Lisa", (526, 522, 1010, 1010)),
    }),
    "lngshot": ("LNGSHOT", {
        "ohyul": ("OHYUL", (20, 20, 520, 519)),
        "ryul": ("RYUL", (520, 20, 1010, 519)),
        "woojin": ("WOOJIN", (20, 519, 520, 1010)),
        "louis": ("LOUIS", (520, 519, 1010, 1010)),
    }),
    "twice": ("TWICE", {
        "nayeon": ("Nayeon", (20, 20, 358, 382)),
        "jeongyeon": ("Jeongyeon", (358, 20, 680, 382)),
        "momo": ("Momo", (680, 20, 1010, 382)),
        "sana": ("Sana", (20, 382, 358, 690)),
        "jihyo": ("Jihyo", (358, 382, 680, 690)),
        "mina": ("Mina", (680, 382, 1010, 690)),
        "dahyun": ("Dahyun", (20, 690, 358, 1010)),
        "chaeyoung": ("Chaeyoung", (358, 690, 680, 1010)),
        "tzuyu": ("Tzuyu", (680, 690, 1010, 1010)),
    }),
}
GROUPS = set(SHEETS)

SHADOW = ('<filter id="cut" x="-10%" y="-10%" width="120%" height="125%" color-interpolation-filters="sRGB">'
          '<feOffset in="SourceAlpha" dx="1.4" dy="2.6" result="o"/>'
          '<feFlood flood-color="#B9A4EE" flood-opacity=".9"/><feComposite in2="o" operator="in" result="sh"/>'
          '<feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')


def cutout(sheet: Image.Image) -> np.ndarray:
    """RGBA copy of the sheet with the white background (near-white pixels reachable from the edge) transparent."""
    rgb = np.asarray(sheet.convert("RGB"))
    cand = rgb.min(axis=2) > 238
    bg = np.zeros_like(cand)
    bg[0], bg[-1], bg[:, 0], bg[:, -1] = cand[0], cand[-1], cand[:, 0], cand[:, -1]
    while True:
        g = bg.copy()
        g[1:] |= bg[:-1]
        g[:-1] |= bg[1:]
        g[:, 1:] |= bg[:, :-1]
        g[:, :-1] |= bg[:, 1:]
        g &= cand
        if (g == bg).all():
            break
        bg = g
    return np.dstack([rgb, np.where(bg, 0, 255).astype(np.uint8)])


def sticker(rgba: np.ndarray, box, scale: float = SCALE) -> tuple[str, float, float, float, float]:
    """Trims one sticker, fits it in BOX (bottom-aligned, centred) and returns (data uri, x, y, w, h)."""
    x0, y0, x1, y1 = box
    a = rgba[y0:y1, x0:x1, 3]
    if a[0].any() or a[-1].any() or a[:, 0].any() or a[:, -1].any():
        print(f"  warning: something touches the edge of crop box {box}")
    ys, xs = np.nonzero(a)
    crop = Image.fromarray(rgba[y0 + ys.min():y0 + ys.max() + 1, x0 + xs.min():x0 + xs.max() + 1], "RGBA")
    bx, by, bw, bottom = BOX
    s = min(bw / crop.width, (bottom - by) / crop.height)
    w, h = crop.width * s, crop.height * s
    px = (round(w * scale), round(h * scale))
    buf = io.BytesIO()
    crop.resize(px, Image.LANCZOS).save(buf, "WEBP", quality=88, method=6)
    uri = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    return uri, bx + (bw - w) / 2, bottom - h, w, h


def image_tag(st) -> str:
    uri, x, y, w, h = st
    return f'<image href="{uri}" x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}"/>'


def crowd_layout(n: int):
    rows = [n] if n <= 5 else [math.ceil(n / 2), n // 2]
    width = W + (rows[0] - 1) * STEP
    out = []
    for r, k in enumerate(rows):
        off = (width - (W + (k - 1) * STEP)) / 2
        for i in range(k):
            out.append((off + i * STEP, r * ROW))
    return out, width, H + (len(rows) - 1) * ROW


def main() -> None:
    for gid, (gname, members) in SHEETS.items():
        rgba = cutout(Image.open(ART / f"{gid}-stickers.webp"))
        d = OUT / gid
        d.mkdir(parents=True, exist_ok=True)
        tags = {}
        for mid, (name, box) in members.items():
            tags[mid] = image_tag(sticker(rgba, box, GROUP_SCALE))
            title = f"{name} ({gname}), chibi"
            (d / f"{mid}.svg").write_text(
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -10 {W + 12} {H + 14}" width="{W + 12}" height="{H + 14}" role="img" aria-label="{title}">'
                f'<title>{title}</title><defs>{SHADOW}</defs><g filter="url(#cut)">{image_tag(sticker(rgba, box))}</g></svg>\n', encoding="utf-8")
        lay, w, h = crowd_layout(len(members))
        defs, uses = SHADOW, ""
        for mid, (x, y) in zip(members, lay):
            defs += f'<symbol id="{gid}-{mid}-s" viewBox="-6 -10 {W + 12} {H + 14}">{tags[mid]}</symbol>'
            uses += f'<use href="#{gid}-{mid}-s" x="{x - 6:.0f}" y="{y - 10}" width="{W + 12}" height="{H + 14}" filter="url(#cut)"/>'
        (OUT / f"{gid}.svg").write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -14 {w + 20:.0f} {h + 22}" width="{w + 20:.0f}" height="{h + 22}" role="img" aria-label="{gname}, chibis">'
            f'<title>{gname}, chibis</title><defs>{defs}</defs>{uses}</svg>\n', encoding="utf-8")
        print(f"{gid}: {len(members)} chibis from {gid}-stickers.webp")


if __name__ == "__main__":
    main()

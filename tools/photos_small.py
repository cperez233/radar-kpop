"""Versiones livianas de las fotos oficiales (assets/photos/<id>.webp) para la web:

- assets/photos/s/<id>.webp: 640 px de ancho, la que se ve en el celular (la grande queda para pantallas anchas y la tarjeta para compartir).
- assets/photos/b/<id>.webp: 48 px de ancho, para el fondo desenfocado detrás de la polaroid (va borroso igual).

Uso: python tools/photos_small.py   (necesita Pillow). build.py las usa solo si existen.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "assets" / "photos"
EXT = (".webp", ".avif", ".jpg", ".jpeg", ".png")

for f in sorted(PHOTOS.iterdir()):
    if f.suffix.lower() not in EXT or not f.is_file():
        continue
    im = Image.open(f).convert("RGB")
    for sub, width, q in (("s", 640, 80), ("b", 48, 60)):
        out = PHOTOS / sub / (f.stem + ".webp")
        out.parent.mkdir(exist_ok=True)
        w = min(width, im.width)
        im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(out, "WEBP", quality=q, method=6)
    print(f.name, "->", f"s/{f.stem}.webp", f"b/{f.stem}.webp")

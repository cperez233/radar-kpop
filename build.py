"""Arma index.html: toma src/template.html y mete events.json como copia de respaldo.

Uso: python build.py
La pagina igual lee events.json por fetch cada 60 s; la copia embebida solo se usa si el fetch falla.
Tambien revisa assets/photos/: si encuentra <id-del-grupo>.(webp|jpg|jpeg|png|avif), la web usa esa foto
en lugar del chibi. Si no hay foto, usa el chibi de assets/chibis/.
"""
import json
from pathlib import Path

root = Path(__file__).parent
data = json.loads((root / "events.json").read_text(encoding="utf-8"))
tpl = (root / "src" / "template.html").read_text(encoding="utf-8")

PHOTO_EXT = (".webp", ".avif", ".jpg", ".jpeg", ".png")
photos = {}
photo_dir = root / "assets" / "photos"
for g in data["groups"]:
    for ext in PHOTO_EXT:
        f = photo_dir / f"{g['id']}{ext}"
        if f.exists():
            photos[g["id"]] = f.name
            break


def js(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


html = tpl.replace("__DATA__", js(data)).replace("__PHOTOS__", js(photos))
(root / "index.html").write_text(html, encoding="utf-8")
print("index.html listo,", len(data["groups"]), "grupos,", len(photos), "fotos oficiales")

# Fotos oficiales (un slot por grupo)

Deja aquí una foto por grupo con el **id del grupo** como nombre. La web la muestra completa, sin recortar, como
polaroid en la tarjeta del grupo y en la imagen para compartir. Los chibis (globo, riel, avisos) siguen siendo los de `assets/chibis/`.
`build.py` lee el ancho y el alto de cada foto para que la página no salte al cargarla.

| Grupo | Archivo esperado |
|---|---|
| BTS | `bts.webp` (o `.jpg`, `.jpeg`, `.png`, `.avif`) |
| Stray Kids | `skz.webp` |
| TWICE | `twice.webp` |
| BLACKPINK | `blackpink.webp` |
| LNGSHOT | `lngshot.webp` |
| SEVENTEEN | `seventeen.webp` |
| ENHYPEN | `enhypen.webp` |
| NewJeans | `newjeans.webp` |

Después de agregar o quitar una foto corre `python build.py` (el workflow lo hace solo cada 15 minutos).

Recomendaciones:
- Cualquier proporción sirve, no se recorta. Mínimo 600 px del lado corto.
- Pesa poco (WebP de 80 a 150 KB es perfecto, la mayoría entra desde el celular).
- Usa material oficial con permiso de uso. Nada de fotos de fans en aeropuertos ni de la vida privada de los idols.

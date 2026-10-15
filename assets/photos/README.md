# Fotos oficiales (un slot por grupo)

Deja aquí una foto por grupo con el **id del grupo** como nombre. La web la usa en el globo, el riel, las tarjetas,
la celebración y la imagen para compartir. Si el archivo no está, usa el chibi de `assets/chibis/`.

| Grupo | Archivo esperado |
|---|---|
| BTS | `bts.webp` (o `.jpg`, `.jpeg`, `.png`, `.avif`) |
| Stray Kids | `skz.webp` |
| TWICE | `twice.webp` |
| BLACKPINK | `blackpink.webp` |
| LNGSHOT | `lngshot.webp` |

Después de agregar o quitar una foto corre `python build.py` (el workflow lo hace solo cada 15 minutos).

Recomendaciones:
- Cuadrada, mínimo 600 x 600 px, con las caras en el centro: se recorta en círculo.
- Pesa poco (WebP de 80 a 150 KB es perfecto, la mayoría entra desde el celular).
- Usa material oficial con permiso de uso. Nada de fotos de fans en aeropuertos ni de la vida privada de los idols.

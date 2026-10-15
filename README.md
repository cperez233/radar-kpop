# Radar K-pop · 케이팝 레이더

> Un mundito de juguete donde ves a tu grupo parado en su próxima ciudad de gira, con su cuenta regresiva, la distancia a tu casa y un botón para presumirlo en tus historias.
> Ningún idol fue rastreado, perseguido ni molestado en la creación de esta web. Solo leemos agendas públicas, como gente decente.

![Radar K-pop](assets/icons/og.png)

---

## ¿Qué es esto, unnie?

Es la versión "a otro nivel" del Radar K-pop. Antes era un sonar serio, de esos que parecen sacados de un submarino. Ahora es un **diario de stickers que orbita un planeta pastel**: papel cuadriculado lila, stickers troquelados con borde blanco y sombra dura, washi tape, brillitos, palabras en hangul por todos lados y un color fuerte por grupo (morado BTS, rojo Stray Kids, albaricoque TWICE, rosa BLACKPINK, turquesa LNGSHOT).

La idea no era hacer un dashboard. Era hacer algo que tu grupo de amigas de fandom se mande a las 2 a. m. con un "MIRA ESTO" en mayúsculas.

La parte del radar se inspira un poquito en el radar de Spider-Man: Brand New Day, pero en versión kawaii y sin villanos (salvo la reventa de boletas).

### La regla de oro (con todo el corazón)

- El chibi está en la **próxima fecha confirmada** de la agenda oficial, **no** donde está el idol en este momento.
- No hay avistamientos de aeropuerto, ni rastreo de vuelos, ni "los vi en el hotel". Eso es de sasaeng y aquí no.
- Los grupos sin fechas descansan en Seúl con su "zZ". Que duerman, que trabajan mucho.

---

## Qué pasa cuando entras

| Lo que haces | Lo que pasa |
|---|---|
| Entras | Un globo 3D gira solito, con nubes de algodón, rutas punteadas y avioncitos de papel volando entre ciudades. |
| Lo arrastras | Gira hacia donde quieras, con inercia. En el celular, si arrastras hacia los lados gira el globo y si arrastras hacia arriba o abajo baja la página (no te secuestramos el scroll). |
| Miras los chibis | Cada grupo es un chibi parado sobre su próxima parada. Rebotan suave, cada uno a su ritmo. Si el show está **en vivo**, se ponen etiqueta rosa LIVE y brillan. |
| Tocas un grupo | El globo vuela hasta su parada (con zoom que respira en el camino), aparecen los arcos de toda la gira con nombres de ciudades y una tarjeta con D-day, distancia y botones. |
| Cambias a Sonar | El radar de siempre, pero en pastel: tú al centro, los grupos alrededor según dirección y distancia, con un barrido rosa. |
| Llega una alerta nueva | `alerts.json` se relee cada minuto. Si hay algo nuevo, la web hace fiesta: pantalla pastel, sticker gigante "새 소식! ¡Alerta nueva!", el chibi del grupo salta, confeti de corazones, estrellas y cintas desde el centro y desde dos "cañones" en las esquinas, todos los chibis del globo celebran, vibra el celular y suena una fanfarria tierna. |
| Tocas el botón de sonido | Silencio total. Se recuerda para la próxima. |
| Ves la tarjeta de un grupo | Cuenta regresiva grande (일 시 분 초) que rueda número por número, kilómetros a tu ciudad, horas de vuelo, la hora del show en hora local y en tu hora, y la gira completa en forma de boletitas. |
| Compartir | Exporta una tarjeta PNG 1080 x 1920 (formato historia) estilo photocard con el chibi, el D-day gigante y la distancia. En el celular abre el menú de compartir; en el computador la descarga. |
| Modo video | Pantalla 9:16 sin interfaz y un tour automático de unos 15 segundos: intro, vuelo a cada grupo con su tarjeta, los que están en pausa, y cierre con "¿Y tú, cuándo los ves?". Listo para grabar pantalla y subir a TikTok. |
| ES / EN | Cambia todo el idioma, incluidos países y ciudades. |
| Instalar | Es una PWA: en Android sale el botón Instalar; en iPhone te explicamos cómo agregarla a la pantalla de inicio. Funciona sin conexión con la última agenda guardada. |
| Recibir alertas | Formulario con pestañas Discord y WhatsApp, vista previa en vivo del mensaje como te llegaría, y tus datos guardados solo en tu navegador. |

### Extras que se nos ocurrieron (porque podíamos)

- **Tu ciudad o tu ubicación real**: más de 30 ciudades (mucha Latinoamérica) o el botón "Usar mi ubicación". Todo se mide desde ahí.
- **Lo más cerca de ti**: un sticker amarillo que te dice qué grupo va a estar más cerquita y en cuántos días.
- **Mi grupo favorito (bias)**: el corazón de cada tarjeta pone a tu grupo de primero en todo. Sin juzgar a los multistans.
- **Agendar**: descarga un `.ics` para tu calendario con recordatorio 24 horas antes. Para que no te enteres del show por el live de otra persona.
- **D-day**: porque en el fandom no se cuentan días, se cuenta D-13, D-1, D-DAY.
- **Probar la celebración**: un botón para ver la fiesta sin esperar una alerta real (o para mostrársela a tus amigas, no te culpamos).
- **Escena final**: los cinco chibis durmiendo en una luna con "다음에 또 봐요" (nos vemos la próxima).

---

## Cómo correrlo

No hay frameworks ni `npm install`. Es una web estática.

```bash
python build.py                 # arma index.html desde src/template.html + events.json
python -m http.server 8000      # y abre http://localhost:8000
```

Ojo: abrir `index.html` con doble clic (file://) muestra la página, pero el navegador bloquea la lectura de `events.json` y el service worker. Usa un servidor, aunque sea el de Python.

### Parámetros para probar (y para grabar videos bonitos)

| Parámetro | Para qué |
|---|---|
| `?now=2026-10-15T18:30:00Z` | Simula otra hora. Así ves a LNGSHOT en vivo sin esperar. |
| `?demo=alert` | Lanza la celebración apenas carga. |
| `?demo=video` | Entra directo al modo video. |
| `?pick=bts` | Abre con un grupo elegido. |
| `?view=sonar` | Abre en modo sonar. |
| `?lang=en` | Abre en inglés. |

---

## Archivos

```
index.html              lo que se publica (lo genera build.py, no lo edites a mano)
src/template.html       la plantilla de la página
assets/app.css          estilos (mobile first)
assets/app.js           toda la lógica: globo, sonar, sonidos, alertas, compartir, video, PWA
assets/chibis/*.svg     un chibi original por grupo (+ default.svg para grupos nuevos)
assets/photos/          slots para las fotos oficiales (lee su README)
assets/icons/           íconos de la PWA, favicon e imagen para redes (og.png)
assets/land-110m.json   continentes (Natural Earth vía world-atlas)
assets/vendor/          d3-geo, d3-array y topojson-client, guardados localmente para que funcione offline
config.js               endpoint del formulario de alertas y URL pública
manifest.webmanifest    datos de la PWA
sw.js                   service worker (agenda siempre fresca, resto instantáneo y offline)
tools/chibis.py         genera los SVG de los chibis
events.json             agenda de giras (mismo esquema de siempre)
alerts.json             feed público de alertas (mismo esquema de siempre)
build.py                mismo flujo de siempre, ahora también detecta fotos oficiales
alerts/, updater/       el motor de alertas y el actualizador de fechas (ver ALERTAS.md)
```

### Lo que NO cambió (lo prometido)

- **`events.json`**: mismo esquema. Solo se agregó el grupo `blackpink` con sus últimas paradas reales de la Deadline World Tour (Tokyo Dome 16 a 18 de enero de 2026 y Kai Tak Stadium de Hong Kong 24 a 26 de enero de 2026, fuente Wikipedia). No tiene fechas anunciadas después, así que su chibi descansa en Seúl con "D-?". No inventamos fechas, somos BLINKs pacientes.
- **`alerts.json`**: mismo esquema (`type`, `group`, `group_name`, `title`, `body`, `when`, `url`).
- **`build.py`**: mismo flujo (plantilla + `events.json` embebido como respaldo). Lo único nuevo es que revisa `assets/photos/` y le avisa a la página qué fotos existen, para que no pida archivos que no están (y la consola quede limpia).
- BLACKPINK también quedó en el motor: alias, búsquedas de noticias, cuenta de X y canal de YouTube en `alerts/feeds.json`, y en el actualizador de Ticketmaster.

---

## Fotos oficiales

Deja `bts.webp`, `skz.webp`, `twice.webp`, `blackpink.webp` o `lngshot.webp` (también sirve `.jpg`, `.png`, `.avif`) en `assets/photos/` y corre `python build.py`. La foto reemplaza al chibi en el globo, el riel, las tarjetas, la celebración y la imagen para compartir. Si no hay foto, sale el chibi. Detalles en [`assets/photos/README.md`](assets/photos/README.md).

## Los chibis

Dibujados a mano en SVG (bueno, a mano en Python) con `tools/chibis.py`. Mismo cuerpo base, peinado y gesto propios:

- **BTS**: sudadera morada, corazón morado entre las manos y una corona de 7 estrellitas.
- **Stray Kids**: corriendo (Run It), bandana roja, chaqueta roja y un rayo.
- **TWICE**: moñitos dobles con lazos magenta, vestido albaricoque y la pose TT con lagrimitas.
- **BLACKPINK**: pelo negro largo, moño rosa, negro y rosa, guiño y corazón de dedos.
- **LNGSHOT**: gorro de lana turquesa lanzando una estrella en un tiro largo.

Son personajes originales. No son retratos de ningún miembro ni copian mascotas, logos o lightsticks oficiales.

## Sonidos

Todos sintetizados con Web Audio, no hay archivos de audio. Se activan con el primer toque (los navegadores bloquean el audio antes, y está bien) y el botón de silencio está siempre arriba a la derecha.

## Alertas por Discord y WhatsApp

Todavía no hay backend para el formulario. Mientras tanto:

1. Lo que llenas se guarda **solo en tu navegador** (`localStorage`), y lo puedes borrar con "Borrar mis datos".
2. Si `config.js` no tiene `subscribeEndpoint`, la web te muestra el JSON listo en el mismo formato de `alerts/subscribers.example.json`, para copiarlo y meterlo al secreto `SUBSCRIBERS_JSON` del workflow.
3. Cuando exista un servidor, pon su URL en `subscribeEndpoint` y la web le hará `POST` con ese JSON.

La configuración del motor (webhooks, bot, API de WhatsApp, RSSHub) está en [`ALERTAS.md`](ALERTAS.md).

## Accesibilidad y buen comportamiento

- Con `prefers-reduced-motion` el globo se queda quieto, no hay rebotes, ni confeti, ni vuelos: todo llega directo.
- Los bucles se pausan cuando no se ven y el globo deja de dibujarse si sales de la pestaña o bajas la página.
- Funciona con teclado (Esc cierra lo que esté abierto), los chibis son botones con nombre, y todo el contenido existe en el HTML aunque el globo no cargue.
- Mobile first de verdad: diseñada a 360, 390 y 412 px, botones de 44 px, sin scroll horizontal.

---

## Pendiente (lo honesto)

- **Backend de alertas**: el formulario está listo, falta el servidor que reciba el `POST` y agregue al suscriptor.
- **Fotos oficiales**: los slots están listos y vacíos esperando tus archivos.
- **Notas de "watch" en inglés**: vienen escritas en español dentro de `events.json`, así que en modo EN se ven en español.
- **Prueba en teléfonos reales**: aquí se probó en Chromium headless (sin GPU); la fluidez real hay que confirmarla en un Android de gama media y en un iPhone.
- **IDs de YouTube y cuentas de X** del motor siguen sin verificar (ver ALERTAS.md).

---

Hecho con amor de fan por [Cristian Pérez](https://cristianperez.me), con la skill editorial-ui. 화이팅!

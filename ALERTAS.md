# Radar K-pop: configuración de alertas

> Volver al [README](README.md). Este documento explica el motor que manda las alertas por Discord, WhatsApp y notificaciones push, el conector de avistamientos en X y el servidor de suscripciones.

El workflow corre cada 15 minutos, revisa la agenda y manda las alertas. Si no pones ninguna llave, corre en modo prueba y no envía nada.

## Qué alertas manda

| Tipo | Cuándo sale | Por defecto en WhatsApp |
|---|---|---|
| Fecha nueva | Aparece un show que antes no estaba | no |
| Cambio | Cambia fecha, hora, ciudad o recinto de un show | no |
| Quitada | Un show futuro desaparece de la agenda | no |
| Hoy abre en... | El día del primer show de una ciudad, desde las 8 a. m. hora local | sí |
| En vivo | 45 min antes del show y hasta 4 h después | sí |
| Sigue a... | Terminó en una ciudad y viene la siguiente (con km de viaje) | no |
| Cerca de ti | Show a menos de tu radio: al anunciarse y a los 7 días, 24 h y 3 h | sí |
| Llegada oficial | Una cuenta oficial del grupo publica algo que menciona la ciudad de su próxima parada (desde 72 h antes), o avisa que llegó | sí |
| Llegada reportada | Un medio publica que el grupo llegó. Se marca como reportado, no como oficial | sí |
| Latinoamérica | Noticia de gira o concierto que menciona países o regiones de Latam | sí |
| Comeback / Gira | Noticias en Soompi, allkpop y Google Noticias | no |
| Video | Video nuevo en el canal oficial de YouTube | no |

"Llegó a una ciudad" sale de lo que ellos mismos publican en sus cuentas oficiales, de lo que reporta la prensa, y de la agenda (día del show y fin del show). El motor no usa avistamientos de fans ni rastreo de vuelos, a propósito.

## 1. Discord (canal para todos)

1. En tu servidor, haz clic derecho en el canal, **Editar canal**, **Integraciones**, **Webhooks**, **Nuevo webhook**.
2. Copia la **URL del webhook**.
3. En GitHub: tu repo, **Settings**, **Secrets and variables**, **Actions**, **New repository secret**. Nombre `DISCORD_WEBHOOK_URL`, valor la URL.

## 2. Discord (mensajes directos por bot)

1. Entra a discord.com/developers/applications y haz clic en **New Application**.
2. Menú **Bot**, **Reset Token**, copia el token. Guárdalo como secreto `DISCORD_BOT_TOKEN`.
3. Menú **OAuth2**, **URL Generator**, marca el scope `bot`, abre la URL generada y agrega el bot a tu servidor.
4. Cada persona debe estar en ese servidor y tener activado **Permitir mensajes directos de miembros del servidor**. Si no, Discord bloquea el DM.
5. Para saber el ID de alguien: Discord, **Ajustes de usuario**, **Avanzado**, activa **Modo desarrollador**, clic derecho al usuario, **Copiar ID de usuario**.

## 3. WhatsApp (API oficial de Meta)

1. Entra a developers.facebook.com, **Mis apps**, **Crear app**, tipo **Empresa**, y agrega el producto **WhatsApp**.
2. En **WhatsApp**, **Configuración de la API** salen el **ID del número de teléfono** (secreto `WHATSAPP_PHONE_ID`) y un token temporal de 24 horas para probar.
3. Token permanente: business.facebook.com, **Configuración del negocio**, **Usuarios del sistema**, crea uno, **Generar token** con el permiso `whatsapp_business_messaging`. Guárdalo como secreto `WHATSAPP_TOKEN`.
4. Plantilla: **WhatsApp Manager**, **Plantillas de mensajes**, **Crear plantilla**. Categoría **Utilidad**, nombre `radar_alerta`, idioma **Español**, cuerpo `Radar K-pop: {{1}}` y un texto de ejemplo en la variable. Meta la aprueba en minutos u horas. Puede reclasificarla como Marketing, que cuesta más.
5. Mientras la app esté en modo desarrollo solo puedes enviar a números que agregues como destinatarios de prueba (hasta 5). Para abrirlo a cualquiera hay que verificar el negocio en Meta.
6. Regla de WhatsApp: solo escribes a quien aceptó recibir mensajes. Por eso el motor exige `"whatsapp_opt_in": true` en cada suscriptor.

Alternativa más rápida para probar: Twilio WhatsApp Sandbox. Cada persona manda un código de unión al número de Twilio y ya puede recibir.

## 4. Suscriptores

Dos formas, se pueden usar juntas:

- **A mano:** copia `alerts/subscribers.example.json`, edítalo y pega todo el JSON como secreto `SUBSCRIBERS_JSON`. No lo subas al repo, trae números de teléfono.
- **Con el servidor** (sección 7): la gente se suscribe desde la web y el motor lee la lista con `SUBSCRIBERS_URL` y `SUBSCRIBERS_TOKEN`.

Campos: `lat` y `lon` de la ciudad (redondeadas), `radius_km` para las alertas de cercanía, `groups` (`["*"]` o `["bts","skz"]`), `types` para Discord y push, `whatsapp_types` para WhatsApp, y `push` para notificaciones.

## 5. Posts oficiales (para "llegaron a la ciudad")

X ya no tiene RSS gratis y su API es de pago. La salida práctica es un RSSHub propio que lea las cuentas oficiales.

1. Despliega RSSHub (github.com/DIYgod/RSSHub, la guía de despliegue está en su documentación) en un servidor tuyo o en un servicio como Railway.
2. Sigue en su documentación la configuración de la ruta de Twitter/X, que pide credenciales y cambia seguido.
3. Guarda la URL base de tu RSSHub como secreto `RSSHUB_URL`.
4. Las cuentas están en `alerts/feeds.json`, sección `social`. Verifica que cada usuario de X sea el oficial.

Es la parte más frágil: si X cambia algo, esas rutas dejan de responder. Sin `RSSHUB_URL` el motor se salta los posts oficiales y sigue con prensa y agenda.

## 6. Avistamientos cercanos (X API)

`sightings/fetch_x.py` lee las cuentas oficiales de `alerts/feeds.json` (sección `social`) con la API v2 de X y guarda en `sightings.json` los posts que mencionan una ciudad. La web los muestra como "avistamientos cercanos", ordenados por distancia a quien la abre.

Reglas que el conector cumple siempre:
- Solo cuentas oficiales, nunca respuestas ni posts de otras cuentas.
- Solo nivel ciudad: el punto en el mapa es el centro de la ciudad (`sightings/cities.json` más las ciudades de las giras).
- Descarta los posts que hablan de aeropuertos, hoteles o vuelos.
- No guarda ubicación de personas.

Para conectarlo:
1. Crea una app en developer.x.com y copia el **Bearer Token**.
2. Guárdalo como secreto `X_BEARER_TOKEN` en GitHub, o en un archivo `.env` en la raíz para correrlo en tu computador (`X_BEARER_TOKEN=...`; `.env` está en `.gitignore`).
3. `python sightings/fetch_x.py`. Sin token escribe datos de ejemplo marcados con `"sample": true`, y la web los muestra con una etiqueta.

El plan gratis de X da muy pocas lecturas al mes: el conector pide 10 posts por cuenta y guarda los ids de usuario en `sightings/user_ids.json`. Si el workflow corre cada 15 minutos, conviene pasar este paso a un cron aparte cada pocas horas, o usar un plan de pago.

## 7. Servidor de suscripciones (Cloudflare Workers, gratis)

`backend/worker.js` recibe los formularios de la web y guarda a cada suscriptor en Cloudflare KV.

1. `npm i -g wrangler` y `wrangler login`.
2. `cd backend && wrangler kv namespace create SUBS`, y pega el id en `wrangler.toml`.
3. En `wrangler.toml`, pon en `ALLOWED_ORIGIN` el dominio de la web (por ejemplo `https://cperez233.github.io`).
4. `wrangler secret put ADMIN_TOKEN` (inventa un token largo) y `wrangler deploy`.
5. En `config.js`, pon la URL del worker en `subscribeEndpoint`.
6. En GitHub, crea los secretos `SUBSCRIBERS_URL` (la URL del worker más `/subscribers`) y `SUBSCRIBERS_TOKEN` (el mismo `ADMIN_TOKEN`).

Rutas: `POST /subscribe`, `POST /push`, `DELETE /subscribe/:id` (con el token que se devolvió al suscribirse; el botón "Borrar mis datos" lo usa) y `GET /subscribers` (solo con `ADMIN_TOKEN`). Prueba local: `node backend/test.mjs`.

## 8. Notificaciones push

1. `npx web-push generate-vapid-keys`.
2. La llave pública va en `config.js`, en `vapidPublicKey`. La privada va como secreto `VAPID_PRIVATE_KEY`, y `VAPID_SUBJECT` con un `mailto:` tuyo.
3. Necesita el servidor de la sección 7. El workflow instala `pywebpush` para mandarlas.
4. En iPhone solo funcionan con la web instalada en la pantalla de inicio (iOS 16.4 o más).

## 9. Estrenos y videos (sin claves)

`updater/media.py` escribe `media.json` con los últimos lanzamientos de cada grupo (iTunes Search API, catálogo de Apple Music) y sus últimos videos oficiales (RSS de cada canal de YouTube). No necesita ninguna clave y el workflow lo corre solo. Los ids de artista están en `alerts/feeds.json`, sección `itunes`.

## 10. Mapa de ciudad (sin claves)

La vista de ciudad usa MapLibre (guardado en `assets/vendor/`) y los mapas vectoriales de OpenFreeMap (`tiles.openfreemap.org`), gratis, sin registro y sin límites. Solo se carga cuando alguien abre un mapa. Los colores pastel se aplican en `kawaiiStyle()` de `assets/app.js`.

## 11. Probar sin enviar nada

```
SUBSCRIBERS_JSON='[...]' DRY_RUN=1 NO_NEWS=1 NOW=2026-10-16T12:00:00Z python alerts/engine.py
```

`NOW` simula la hora. `DRY_RUN=1` imprime lo que enviaría y no guarda estado.

## Pendiente de verificar

- Cuentas e IDs revisados el 15 de octubre de 2026: el canal de YouTube de Stray Kids estaba mal (ahora `UC9rMiEjNaCSsebs31MRDCRA`), la cuenta de X de LNGSHOT es `LNGSHOT4sho` (confianza media: su web oficial no enlaza X) y su canal oficial de YouTube es `UC8PPjyqCQJtNfEwHBcq_uxw`. Agregados SEVENTEEN (`pledis_17`), ENHYPEN (`ENHYPEN`) y NewJeans (`NewJeans_ADOR`).
- Noticias: Soompi y Koreaboo por RSS (allkpop bloquea robots con 403 y se quitó). Si alguna falla, el motor lo avisa en el log y sigue con las demás.
- El actualizador de Ticketmaster y el envío real a WhatsApp y Discord no se probaron contra las APIs reales.

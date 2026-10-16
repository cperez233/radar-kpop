# Radar K-pop: configuración de alertas

> Volver al [README](README.md). Este documento explica el motor que manda las alertas por Discord, ntfy, WhatsApp y notificaciones push, el conector de avistamientos y el servidor de suscripciones. **La lista oficial de claves, con su estado y cómo sacar cada una, está en [CLAVES.md](CLAVES.md).**

El workflow corre cada 15 minutos, revisa la agenda y manda las alertas. Sin canales configurados (Discord, ntfy...) no envía nada, pero las alertas igual salen en la web.

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
| Anuncio oficial | Una cuenta oficial publica un anuncio de gira, entradas o comeback (también los `[NOTICE]` que vienen de Weverse). Máximo uno por grupo, tipo y día | no |
| Comeback / Gira | Noticias en Soompi, Koreaboo y Google Noticias | no |
| Video | Video nuevo en el canal oficial de YouTube (con `YT_API_KEY`; no va a ntfy) | no |
| Robot | Una fuente del robot empieza a fallar o vuelve a funcionar (el vigilante, `tools/health.py --notify`) | no |

"Llegó a una ciudad" sale de lo que ellos mismos publican en sus cuentas oficiales, de lo que reporta la prensa, y de la agenda (día del show y fin del show). El motor no usa avistamientos de fans ni rastreo de vuelos, a propósito.

## 1. Discord (canal para todos)

1. En tu servidor, haz clic derecho en el canal, **Editar canal**, **Integraciones**, **Webhooks**, **Nuevo webhook**.
2. Copia la **URL del webhook**.
3. En GitHub: tu repo, **Settings**, **Secrets and variables**, **Actions**, **New repository secret**. Nombre `DISCORD_WEBHOOK_URL`, valor la URL.

## 1b. ntfy (alertas a tu celular, gratis)

Instala la app ntfy, suscríbete a un tema largo e imposible de adivinar y guarda ese tema como secreto `NTFY_TOPIC`. Cada alerta del canal de Discord también llega como notificación. Pasos en [CLAVES.md](CLAVES.md).

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

## 5. Posts oficiales y avistamientos (RSSHub)

X ya no tiene RSS gratis y su API es de pago, así que las cuentas oficiales se leen con un RSSHub propio
(`RSSHUB_URL`, ruta `/twitter/user/<cuenta>`; el despliegue y el mantenimiento de la cookie están en [CLAVES.md](CLAVES.md)).
Las cuentas están en `alerts/feeds.json`, sección `social`.

`sightings/fetch_x.py` corre primero: lee las 9 cuentas, guarda los posts crudos en `state/social.json` (no se sube al repo)
y escribe en `sightings.json` los que mencionan una ciudad. Después `alerts/engine.py` reusa esos posts para las alertas de
llegada y de anuncio oficial, sin volver a pedirlos.

Reglas que el conector cumple siempre:
- Solo cuentas oficiales, sin retweets ni respuestas.
- Solo nivel ciudad: el punto en el mapa es el centro de la ciudad (`sightings/cities.json` más las ciudades de las giras).
- Descarta los posts que hablan de aeropuertos, hoteles o vuelos, y títulos que no son lugares ("Paris, Texas").
- Un avistamiento por grupo y ciudad (el más reciente), para que una promo repetida no llene la lista.
- No guarda ubicación de personas.

Avisos oficiales: los posts `[NOTICE]`, `[공지]`, `[NEWS]` o con enlace a Weverse se guardan en `notices.json` (los 6 más
recientes por grupo, 45 días) y salen en la tarjeta de cada grupo como "Avisos oficiales", con el enlace directo a Weverse.
Weverse no tiene API pública ni ruta en RSSHub, así que esta es la forma de traer lo que publican ahí.

Respaldo: si RSSHub no responde para ninguna cuenta y hay `X_BEARER_TOKEN`, usa la API oficial de X (de pago, una vez por
hora, solo posts nuevos). Si nada responde, `sightings.json` queda como estaba. Sin ninguna de las dos, datos de ejemplo
marcados con `"sample": true`.

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

## 9. Estrenos y videos

`updater/media.py` escribe `media.json` con los últimos lanzamientos de cada grupo (iTunes Search API, catálogo de Apple Music, sin clave; los que tienen fecha futura salen en la tarjeta como "Próximo estreno") y sus últimos videos oficiales (YouTube Data API con `YT_API_KEY`, porque YouTube dejó de servir sus RSS en 2026). Los ids están en `alerts/feeds.json`, secciones `itunes` y `youtube`.

## 10. Mapa de ciudad (sin claves)

La vista de ciudad usa MapLibre (guardado en `assets/vendor/`) y los mapas vectoriales de OpenFreeMap (`tiles.openfreemap.org`), gratis, sin registro y sin límites. Solo se carga cuando alguien abre un mapa. Los colores pastel se aplican en `kawaiiStyle()` de `assets/app.js`.

## 11. Probar sin enviar nada

```
SUBSCRIBERS_JSON='[...]' DRY_RUN=1 NO_NEWS=1 NOW=2026-10-16T12:00:00Z python alerts/engine.py
```

`NOW` simula la hora. `DRY_RUN=1` imprime lo que enviaría y no guarda estado.

## Verificado

- 16 de octubre de 2026, run real del workflow: Ticketmaster (BTS, ENHYPEN, LNGSHOT; los listados VIP y de palcos se
  descartan), YouTube Data API (27 videos), RSSHub (9 de 9 cuentas) y Discord (26 alertas) funcionan. ntfy publica bien
  (con tildes y coreano). Con una clave mala, Ticketmaster, YouTube y X avisan en el log y conservan los datos.
- Cuentas e IDs revisados el 15 de octubre de 2026: el canal de YouTube de Stray Kids es `UC9rMiEjNaCSsebs31MRDCRA`, la cuenta de X de LNGSHOT es `LNGSHOT4sho` y su canal es `UC8PPjyqCQJtNfEwHBcq_uxw`. SEVENTEEN `pledis_17`, ENHYPEN `ENHYPEN`, NewJeans `NewJeans_ADOR`.
- CORTIS (16 de octubre de 2026): X `cortis_bighit`, YouTube `UCZMYvSPulDSUdx7bdtTFdrg`, iTunes `1831651635`.
- Noticias: Soompi y Koreaboo por RSS (allkpop bloquea robots con 403 y se quitó). Si alguna falla, el motor lo avisa en el log y sigue con las demás.

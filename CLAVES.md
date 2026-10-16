# Claves del robot, paso a paso

El robot (`.github/workflows/update-radar.yml`) corre cada 15 minutos en GitHub. Sin ninguna clave ya trae estrenos,
videos, noticias, las estadísticas de Spotify y reconstruye la página. Cada clave suma algo más.

## 0. Que el robot use `main` (ya está)

GitHub corre las tareas programadas en la **rama por defecto**. Ya es `main` y el robot corrió bien el 16 de octubre de 2026.
Si alguna vez cambia, se arregla en **Settings**, **General**, **Default branch**. Para probarlo a mano: pestaña **Actions**,
**Actualizar radar y mandar alertas**, **Run workflow**; en un minuto debe salir con el chulito verde.

## Cómo se guarda cualquier clave

**Settings**, **Secrets and variables**, **Actions**, botón verde **New repository secret**. En **Name** va el nombre exacto
(por ejemplo `TM_API_KEY`) y en **Secret** el valor. Nadie más la puede ver, ni siquiera tú después de guardarla.

## Cuáles valen la pena

| Clave | Qué agrega | Costo | Recomendación |
|---|---|---|---|
| `TM_API_KEY` | Fechas de gira nuevas solas (Ticketmaster) | Gratis (5.000 consultas al día) | Sí |
| `YT_API_KEY` | Suscriptores de YouTube en "Datos y números" | Gratis (10.000 unidades al día; el radar usa 1 al día) | Sí |
| `DISCORD_WEBHOOK_URL` | Avisos en un canal de Discord | Gratis | Sí, si usas Discord |
| `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` | Notificaciones push en el celular | Gratis (necesita el worker de Cloudflare, también gratis) | Opcional |
| `X_BEARER_TOKEN` | Avistamientos reales (posts oficiales con ciudad) | **De pago**: X cobra unos 0,005 USD por post leído | Solo si quieres pagar |
| `RSSHUB_URL` | Avisos "llegaron a..." desde X | Gratis, pero hay que montar un servidor propio y usar una cuenta de X | No por ahora |
| `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` | Avisos por WhatsApp | **De pago** por mensaje y pide verificar un negocio en Meta | No por ahora |

## Ticketmaster: `TM_API_KEY` (gratis)

1. Entra a **developer.ticketmaster.com** y toca **Get your API key** (o **Sign up**). Crea la cuenta con tu correo.
2. Confirma el correo y entra a **My Apps**. Ya viene una app creada ("...-App").
3. Ábrela y copia la **Consumer Key** (no la Consumer Secret).
4. Guárdala en GitHub como `TM_API_KEY`.

## YouTube: `YT_API_KEY` (gratis)

1. Entra a **console.cloud.google.com** con tu cuenta de Google. Acepta los términos si los pide (no pide tarjeta).
2. Arriba, en el selector de proyectos, **New project**, nombre `radar-kpop`, **Create**, y selecciónalo.
3. En el buscador de arriba escribe **YouTube Data API v3**, ábrela y toca **Enable**.
4. Menú **APIs & Services**, **Credentials**, **Create credentials**, **API key**. Copia la clave.
5. Recomendado: toca la clave, en **API restrictions** elige **Restrict key** y marca solo **YouTube Data API v3**. **Save**.
6. Guárdala en GitHub como `YT_API_KEY`.

## Discord: `DISCORD_WEBHOOK_URL` (gratis)

1. En tu servidor de Discord, entra a la configuración del canal donde quieres los avisos (rueda dentada al lado del nombre).
2. **Integrations**, **Webhooks**, **New Webhook**. Ponle nombre (por ejemplo "Radar K-pop") y foto si quieres.
3. **Copy Webhook URL**.
4. Guárdala en GitHub como `DISCORD_WEBHOOK_URL`.

## Notificaciones push (gratis, un poco más largo)

Necesitan el servidor de suscripciones de `backend/` en Cloudflare Workers (plan gratis). Los pasos están en
[ALERTAS.md](ALERTAS.md), secciones del worker y de push. Resumen: crear cuenta en Cloudflare, `wrangler deploy`,
poner la URL en `config.js` y generar las llaves con `npx web-push generate-vapid-keys`.

## X: `X_BEARER_TOKEN` (de pago)

Desde febrero de 2026 X cobra por uso: unos 0,005 USD por cada post leído. El robot ya está ajustado para gastar poco
(lee una vez por hora y solo los posts nuevos), así que debería quedar en unos pocos dólares al mes. Si igual lo quieres:

1. Entra a **console.x.com** (o developer.x.com) con la cuenta de X que va a pagar.
2. Crea un proyecto y una app, y en **Billing** compra créditos. Pon un **spending limit** bajo (por ejemplo 5 USD).
3. En la app, **Keys and tokens**, **Bearer Token**, **Generate**. Cópialo.
4. Guárdalo en GitHub como `X_BEARER_TOKEN`.

Sin esta clave, la sección de avistamientos muestra ejemplos marcados como tales.

## Lo que ya funciona sin claves

- **Estrenos**: catálogo de Apple Music (iTunes Search API).
- **Videos**: el feed RSS de cada canal oficial de YouTube.
- **Noticias y alertas**: RSS de Soompi, Koreaboo y Google News.
- **Datos y números**: oyentes mensuales, récord, reproducciones y canción top de Spotify (kworb.net).

Todo esto se actualiza solo cada vez que corre el robot.

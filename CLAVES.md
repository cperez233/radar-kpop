# Claves del robot (la lista oficial)

El robot (`.github/workflows/update-radar.yml`) corre solo cada 15 minutos en GitHub (a veces GitHub lo retrasa) y también
a mano en **Actions**, **Actualizar radar y mandar alertas**, **Run workflow**. Ninguna clave va en el código: todas son
secretos de GitHub (**Settings**, **Secrets and variables**, **Actions**, **New repository secret**). Un secreto no se puede
volver a leer; para cambiarlo se usa **Update**.

**¿Cómo sé si todo funciona?** Abre el último run en **Actions** y mira el **Summary**: una tabla dice qué claves hay
(sí/no, nunca el valor) y qué tan frescos están las fechas, los videos, los números de Spotify, los avistamientos y las alertas.
Si un servicio se cae, ese paso sale con advertencia y el resto sigue igual.

## Estado (16 de octubre de 2026)

| Secreto | Qué hace | Costo | Estado |
|---|---|---|---|
| `TM_API_KEY` | Fechas de gira nuevas desde Ticketmaster | Gratis | Funciona: en el primer run trajo BTS, ENHYPEN y LNGSHOT |
| `YT_API_KEY` | Videos nuevos de YouTube y suscriptores | Gratis | Funciona: 27 videos en el primer run |
| `RSSHUB_URL` | Posts de las cuentas oficiales en X: avistamientos, anuncios oficiales y llegadas | Gratis (tu RSSHub en Vercel) | Guardado y probado: responden las 9 cuentas |
| `DISCORD_WEBHOOK_URL` | Alertas en tu canal de Discord | Gratis | Funciona: el primer run mandó 26 alertas |
| `NTFY_TOPIC` | Alertas al celular con la app ntfy | Gratis | **Falta crearlo** (pasos abajo) |
| `X_BEARER_TOKEN` | Respaldo de X, solo si RSSHub falla entero | De pago (~0,005 USD por post) | Guardado, sin saldo. No hace falta cargarle |
| `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` | Notificaciones push del navegador para los fans que se suscriben en la web | Gratis (con el worker de Cloudflare) | Opcional, no configurado |
| `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` | Avisos por WhatsApp | De pago y pide verificar un negocio | Para después |

Lo que no necesita clave: estrenos (catálogo de Apple Music), noticias (Soompi, Koreaboo, Google Noticias) y los números
de Spotify (kworb.net).

## ntfy: alertas al celular (gratis, 3 minutos)

1. Instala la app **ntfy** (Play Store o App Store).
2. Inventa un tema largo que nadie pueda adivinar, por ejemplo `radar-kpop-cris-7f3k9q2m`. Cualquiera que sepa el nombre
   puede leer los avisos, así que no uses algo corto como `radar-kpop`.
3. En la app: **+** (Subscribe to topic), escribe el tema y deja el servidor `ntfy.sh`. **Subscribe**.
4. En GitHub crea el secreto `NTFY_TOPIC` con ese mismo tema (solo el nombre, sin `https://ntfy.sh/`).
5. Corre el workflow a mano. Desde ahí, cada alerta que va a Discord también llega como notificación al celular, menos los videos nuevos (son varios al día; esos quedan en Discord y en la web).

## Ticketmaster: `TM_API_KEY`

1. **developer.ticketmaster.com**, crea la cuenta y entra a **My Apps**.
2. Copia la **Consumer Key** (no la Consumer Secret) y guárdala como `TM_API_KEY`.

Qué esperar: Ticketmaster cubre sobre todo Norteamérica, Latinoamérica y Europa. Que no salga nada para un grupo es normal
(por ejemplo, fechas en Asia que se venden por Interpark o Yes24): el robot lo toma como "sin fechas nuevas", no como error,
y nunca borra las fechas que ya estaban. En el Summary de cada run, el paso de fechas dice cuántos resultados trajo por grupo.
Si la key está mal, el paso lo dice ("Ticketmaster rechazó la key (401)").

## YouTube: `YT_API_KEY`

1. **console.cloud.google.com**, crea un proyecto `radar-kpop` y selecciónalo.
2. Busca **YouTube Data API v3** y toca **Enable**.
3. **APIs & Services**, **Credentials**, **Create credentials**, **API key**. Copia la clave.
4. Recomendado: en la clave, **API restrictions**, **Restrict key**, solo **YouTube Data API v3**.
5. Guárdala como `YT_API_KEY`.

Hace falta porque YouTube dejó de servir sus feeds RSS públicos en 2026 (responden 404). El robot usa unas 900 unidades
al día de las 10.000 gratis.

## RSSHub: `RSSHUB_URL`

Tu RSSHub vive en `https://rss-hub-eta-one.vercel.app` (fork `cperez233/RSSHub`). El secreto lleva esa URL sin barra final.
El robot lee `/twitter/user/<cuenta>` de las 9 cuentas oficiales una sola vez por run (las alertas reusan lo que trajeron
los avistamientos).

Mantenimiento:
- RSSHub entra a X con la cookie `auth_token` de una cuenta secundaria, guardada como variable de entorno en Vercel. Esa
  cookie caduca cada 1 a 3 meses. Señal: en el Summary, "Avistamientos" deja de actualizarse o el paso dice
  "RSSHub @cuenta: ...". Para renovarla: entra a x.com con la cuenta secundaria, F12, **Application**, **Cookies**,
  `x.com`, copia `auth_token`, pégala en la variable de Vercel y haz **Redeploy**.
- No cierres sesión ni cambies la contraseña de esa cuenta (invalida la cookie).
- Si sincronizas el fork con el original, revisa que sigan el override `"sanitize-html>htmlparser2": "8.0.0"` en
  `package.json` y el Install Command `pnpm install --no-frozen-lockfile` en Vercel.

## Discord: `DISCORD_WEBHOOK_URL`

Canal, rueda dentada, **Integrations**, **Webhooks**, **New Webhook**, **Copy Webhook URL**. Guárdala como `DISCORD_WEBHOOK_URL`.

## X: `X_BEARER_TOKEN` (no hace falta)

Con RSSHub funcionando, la API oficial de X solo se usa si RSSHub no responde para ninguna cuenta. Sin saldo, X responde
402 o 403 y el robot sigue con lo que tenía. Si algún día le cargas saldo, pon un límite de gasto bajo en
**console.x.com**, **Billing**; el robot lee como mucho una vez por hora y solo los posts nuevos.

## Más adelante

- **WhatsApp:** la opción oficial (Meta) es de pago y pide verificar un negocio. Una alternativa gratis para avisarte solo
  a ti es CallMeBot; si la quieres, se agrega como un canal más.
- **Correo:** se puede mandar por Gmail con una contraseña de aplicación (`MAIL_USERNAME`, `MAIL_PASSWORD`). No está hecho.
- **Weverse:** no tiene API pública. Los avisos de Weverse casi siempre los repiten en X (`[NOTICE]`), y esos sí llegan
  como "Anuncio oficial" por RSSHub.

# Claves del robot (la lista oficial)

El robot (`.github/workflows/update-radar.yml`) corre solo cada 15 minutos en GitHub (a veces GitHub lo retrasa) y también
a mano en **Actions**, **Actualizar radar y mandar alertas**, **Run workflow**. Ninguna clave va en el código: todas son
secretos de GitHub (**Settings**, **Secrets and variables**, **Actions**, **New repository secret**). Un secreto no se puede
volver a leer; para cambiarlo se usa **Update**.

**Probar las alertas:** **Actions**, **Actualizar radar y mandar alertas**, **Run workflow**, marca **Mandar una alerta
de prueba** y **Run workflow**. En un minuto llega "Prueba del Radar K-pop 💜" a Discord y al celular (ntfy). Esa corrida
no toca nada más.

**El vigilante:** si una fuente empieza a fallar (por ejemplo, vence la cookie de RSSHub, Ticketmaster rechaza la key o
Discord deja de recibir), el robot te avisa una sola vez por Discord y ntfy con "⚠️ Radar: ... está fallando", y otra vez
con "✅ ... volvió a funcionar" cuando se arregla. No tienes que revisar nada a mano.

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
| `NTFY_TOPIC` | Todas las alertas a tu celular (tu tema privado en ntfy) | Gratis | Funciona: llegó la prueba |
| (sin clave) | Alertas para los fans en temas públicos de ntfy por grupo y tipo (`ntfyTopicPrefix` en `config.js`) | Gratis | Activo desde la 4.8 |
| `DISCORD_FORUM_WEBHOOK_URL` | Foro de Discord para los fans: una publicación por grupo, cada quien sigue las suyas | Gratis | Falta crearlo (pasos abajo) |
| `X_BEARER_TOKEN` | Respaldo de X, solo si RSSHub falla entero | De pago (~0,005 USD por post) | Guardado, sin saldo. No hace falta cargarle |
| `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` | Push del navegador con el servidor de `backend/` | Gratis (con el worker de Cloudflare) | Ya no hace falta: la web usa ntfy |
| `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` | Avisos por WhatsApp | De pago y pide verificar un negocio | Descartado por ahora (no hay opción gratis y estable) |

Lo que no necesita clave: estrenos (catálogo de Apple Music), noticias (Soompi, Koreaboo, Google Noticias) y los números
de Spotify (kworb.net).

## ntfy: alertas al celular (gratis, 3 minutos)

1. Instala la app **ntfy** (Play Store o App Store).
2. Inventa un tema largo que nadie pueda adivinar, por ejemplo `radar-kpop-` seguido de letras y números al azar. Cualquiera que sepa el nombre
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
Ese canal recibe todo (es el tuyo, para revisar).

## Discord para los fans: `DISCORD_FORUM_WEBHOOK_URL` (gratis, 5 minutos)

Para que cada fan elija sus grupos, el robot escribe en un **canal tipo foro** con una publicación por grupo
("BTS · alertas", "Stray Kids · alertas"...). Cada fan sigue las publicaciones de sus grupos y Discord solo le avisa de esas.
No hay que meter a nadie a mano ni pedir su usuario: entran con el enlace de invitación.

1. En tu servidor: **+** junto a los canales, **Crear canal**, tipo **Foro**, nombre `alertas`. (Si no sale "Foro", activa la
   comunidad: **Ajustes del servidor**, **Habilitar comunidad**.)
2. En el foro: rueda dentada, **Integraciones**, **Webhooks**, **Nuevo webhook**, **Copiar URL del webhook**.
3. En GitHub crea el secreto `DISCORD_FORUM_WEBHOOK_URL` con esa URL. El robot crea solo cada publicación la primera vez
   que hay una alerta de ese grupo.
4. Invitación: clic derecho al servidor, **Invitar gente**, **Editar enlace de invitación**, caduca **Nunca**. Pon ese enlace
   en `config.js`, en `discordInvite` (no es secreto, o pásamelo y lo pongo yo). Desde ahí la pestaña Discord de la web
   muestra el botón para entrar y los pasos.
5. Recomendado: en **Ajustes del servidor**, **Notificaciones predeterminadas**, deja **Solo @menciones**, así nadie recibe todo.

## X: `X_BEARER_TOKEN` (no hace falta)

Con RSSHub funcionando, la API oficial de X solo se usa si RSSHub no responde para ninguna cuenta. Sin saldo, X responde
402 o 403 y el robot sigue con lo que tenía. Si algún día le cargas saldo, pon un límite de gasto bajo en
**console.x.com**, **Billing**; el robot lee como mucho una vez por hora y solo los posts nuevos.

## Instagram de los miembros (opcional)

La página de cada miembro ya enlaza su Instagram. Para que además muestre sus últimos posts, tu RSSHub tiene que poder
leer Instagram. Hoy responde 503 y pide la variable `INSTAGRAM_COOKIE`. Es gratis, y el procedimiento es igual que con X:

1. En el computador, entra a instagram.com con una **cuenta secundaria** (no la tuya: Instagram puede bloquear cuentas que leen mucho).
2. Abre las herramientas del navegador (F12) → **Application** (Chrome) o **Almacenamiento** (Firefox) → **Cookies** → `https://www.instagram.com`.
3. Copia los valores de `sessionid`, `ds_user_id` y `csrftoken`, y arma un texto así: `sessionid=XXX; ds_user_id=YYY; csrftoken=ZZZ`.
4. En Vercel, abre tu proyecto de RSSHub → **Settings → Environment Variables** → nombre `INSTAGRAM_COOKIE`, valor el texto del paso 3.
5. **Deployments → Redeploy**. Prueba abriendo `TU_RSSHUB/instagram/user/newjeans_official`: debe salir una lista de posts.

El robot lo detecta solo en la siguiente hora; no hay que tocar el código ni GitHub. Para que Instagram no tome la cuenta
por un bot, el robot lee solo 10 cuentas por hora, en turno (cada perfil se renueva cada ~5 horas), con pausas al azar.
Si Instagram falla (por ejemplo, te pidió cambiar la contraseña y la cookie se perdió), no insiste: espera 6 horas antes
de volver a probar y te avisa por Discord/ntfy. El resto del robot sigue normal; basta repetir los pasos 1 a 5.

## Más adelante

- **WhatsApp:** la opción oficial (Meta) es de pago y pide verificar un negocio. Una alternativa gratis para avisarte solo
  a ti es CallMeBot; si la quieres, se agrega como un canal más.
- **Correo:** se puede mandar por Gmail con una contraseña de aplicación (`MAIL_USERNAME`, `MAIL_PASSWORD`). No está hecho.
- **Weverse:** no tiene API pública. Los avisos de Weverse casi siempre los repiten en X (`[NOTICE]`), y esos sí llegan
  como "Anuncio oficial" por RSSHub.

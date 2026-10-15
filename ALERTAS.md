# Radar K-pop: configuración de alertas

> Volver al [README](README.md). Este documento explica el motor que manda las alertas por Discord y WhatsApp.

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

1. Copia `alerts/subscribers.example.json`, edítalo con tus datos y los de tus amigos.
2. Pega todo el JSON como secreto `SUBSCRIBERS_JSON`. No lo subas al repo, trae números de teléfono.
3. Campos: `lat` y `lon` de la ciudad, `radius_km` para las alertas de cercanía, `groups` (`["*"]` o `["bts","skz"]`), `types` para Discord y `whatsapp_types` para WhatsApp.

## 5. Posts oficiales (para "llegaron a la ciudad")

X ya no tiene RSS gratis y su API es de pago. La salida práctica es un RSSHub propio que lea las cuentas oficiales.

1. Despliega RSSHub (github.com/DIYgod/RSSHub, la guía de despliegue está en su documentación) en un servidor tuyo o en un servicio como Railway.
2. Sigue en su documentación la configuración de la ruta de Twitter/X, que pide credenciales y cambia seguido.
3. Guarda la URL base de tu RSSHub como secreto `RSSHUB_URL`.
4. Las cuentas están en `alerts/feeds.json`, sección `social`. Verifica que cada usuario de X sea el oficial.

Es la parte más frágil: si X cambia algo, esas rutas dejan de responder. Sin `RSSHUB_URL` el motor se salta los posts oficiales y sigue con prensa y agenda.

## 6. Probar sin enviar nada

```
SUBSCRIBERS_JSON='[...]' DRY_RUN=1 NO_NEWS=1 NOW=2026-10-16T12:00:00Z python alerts/engine.py
```

`NOW` simula la hora. `DRY_RUN=1` imprime lo que enviaría y no guarda estado.

## Pendiente de verificar

- Los IDs de canal de YouTube en `alerts/feeds.json` están sin confirmar (incluido el de BLACKPINK, agregado en esta versión) y el de LNGSHOT está vacío. Si un ID es incorrecto, el motor lo salta y sigue.
- Las URLs RSS de Soompi y allkpop son las estándar de WordPress. Si alguna falla, el motor lo avisa en el log y sigue con las demás.
- El actualizador de Ticketmaster y el envío real a WhatsApp y Discord no se probaron contra las APIs reales.

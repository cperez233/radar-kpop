/* Configuración del Radar K-pop. Se puede editar sin volver a correr build.py (salvo siteUrl, que build.py usa para la imagen de redes). */
window.RADAR_CONFIG = {
  // URL del servidor de suscripciones (backend/worker.js en Cloudflare), por ejemplo "https://radar-kpop-subs.TU-CUENTA.workers.dev".
  // La web hace POST a /subscribe (Discord y WhatsApp) y a /push (notificaciones), y DELETE al borrar tus datos.
  // Vacío = todavía no hay backend: el formulario guarda los datos solo en el navegador y muestra el JSON para copiarlo.
  subscribeEndpoint: "",

  // Llave pública VAPID para las notificaciones push (la privada va en el secreto VAPID_PRIVATE_KEY del motor).
  // Se generan con: npx web-push generate-vapid-keys
  vapidPublicKey: "",

  // URL pública de la web, por ejemplo "https://cperez233.github.io/radar-kpop". La usan la tarjeta para compartir,
  // el modo video y build.py (imagen para redes con URL completa). Vacío = la dirección actual.
  siteUrl: ""
};

/* Configuración del Radar K-pop. Se puede editar sin volver a correr build.py (salvo siteUrl, que build.py usa para la imagen de redes). */
window.RADAR_CONFIG = {
  // Alertas al celular con la app ntfy (gratis, sin cuenta ni servidor): el robot publica cada alerta en temas públicos
  // "<prefijo>-<grupo>-<tipo>" (por ejemplo radarkpop-bts-shows) y "<prefijo>-pais-<país>"; cada fan elige en la web a cuáles
  // suscribirse. El motor (alerts/engine.py) lee este mismo valor. Vacío = apagado.
  ntfyTopicPrefix: "radarkpop",

  // Invitación al servidor de Discord del radar (por ejemplo "https://discord.gg/abc123"), con un canal tipo foro donde el
  // robot escribe una publicación por grupo (secreto DISCORD_FORUM_WEBHOOK_URL). Vacío = la pestaña Discord dice que viene pronto.
  discordInvite: "",

  // URL pública de la web, por ejemplo "https://cperez233.github.io/radar-kpop". La usan la tarjeta para compartir,
  // el modo video y build.py (imagen para redes con URL completa). Vacío = la dirección actual.
  siteUrl: "https://radar-kpop.vercel.app"
};

/* Radar K-pop · editorial-ui · Cristian Pérez · cristianperez.me
   Sin frameworks: un globo en canvas (d3-geo para la tierra), chibis como stickers en el DOM,
   sonidos sintetizados con Web Audio y todo lo demás en este archivo. */
(function () {
  'use strict';

  /* ================= base ================= */
  var CFG = window.RADAR_CONFIG || {};
  var PHOTOS = window.RADAR_PHOTOS || {};
  var ROSTER = window.RADAR_ROSTER || {};
  var CHANGES = window.RADAR_CHANGES || [];
  var data = window.RADAR_DATA0 || { groups: [], sources: [] };
  var K = Math.PI / 180;
  var SHOW_MS = 4 * 3600e3;
  var SEOUL = { lat: 37.5665, lon: 126.978 };
  var params = new URLSearchParams(location.search);
  var NOW_OFFSET = params.get('now') && !isNaN(Date.parse(params.get('now'))) ? Date.parse(params.get('now')) - Date.now() : 0;
  function now() { return Date.now() + NOW_OFFSET; }
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = mqReduce.matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function hav(lat1, lon1, lat2, lon2) {
    var dp = (lat2 - lat1) * K, dl = (lon2 - lon1) * K;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(lat1 * K) * Math.cos(lat2 * K) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * 6371 * Math.asin(Math.sqrt(a));
  }
  function bearing(lat1, lon1, lat2, lon2) {
    var p1 = lat1 * K, p2 = lat2 * K, dl = (lon2 - lon1) * K;
    var y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) / K + 360) % 360;
  }
  function ease(p) { return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }

  /* ================= grupos ================= */
  var META = {
    bts: { ko: '방탄소년단', fan: 'ARMY', cheer: '보라해', hint: { es: 'te morado-quiero', en: 'I purple you' } },
    skz: { ko: '스트레이 키즈', fan: 'STAY', cheer: '가자, 스테이!', hint: { es: '¡vamos, STAY!', en: "let's go, STAY!" } },
    twice: { ko: '트와이스', fan: 'ONCE', cheer: '원스, 사랑해', hint: { es: 'ONCE, te quiero', en: 'ONCE, love you' } },
    blackpink: { ko: '블랙핑크', fan: 'BLINK', cheer: '보고 싶어', hint: { es: 'te extrañamos', en: 'we miss you' } },
    lngshot: { ko: '롱샷', fan: 'SHOTTIES', cheer: '화이팅!', hint: { es: '¡ánimo!', en: 'fighting!' } },
    seventeen: { ko: '세븐틴', fan: 'CARAT', cheer: '세븐틴 화이팅!', hint: { es: '¡ánimo, SEVENTEEN!', en: 'go SEVENTEEN!' } },
    enhypen: { ko: '엔하이픈', fan: 'ENGENE', cheer: '엔하이픈 화이팅!', hint: { es: '¡ánimo, ENHYPEN!', en: 'go ENHYPEN!' } },
    newjeans: { ko: '뉴진스', fan: 'Bunnies', cheer: '뉴진스 사랑해!', hint: { es: '¡te queremos, NewJeans!', en: 'we love you, NewJeans!' } }
  };
  /* mini trivia: [pregunta es, pregunta en, opciones, índice correcto]. Datos verificados (Wikipedia, Soompi). */
  var TRIVIA = {
    bts: [['¿En qué año debutó BTS?', 'What year did BTS debut?', ['2011', '2013', '2015'], 1], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['ARMY', 'ONCE', 'BLINK'], 0], ['¿Cuál fue su primer sencillo todo en inglés (2020)?', 'Their first all-English single (2020)?', ['Dynamite', 'Fake Love', 'Fancy'], 0]],
    skz: [['¿En qué año debutó Stray Kids?', 'What year did Stray Kids debut?', ['2016', '2018', '2020'], 1], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['STAY', 'CARAT', 'ENGENE'], 0], ['¿Cuál es su agencia?', 'Which agency are they with?', ['HYBE', 'JYP Entertainment', 'YG Entertainment'], 1]],
    twice: [['¿En qué año debutó TWICE?', 'What year did TWICE debut?', ['2015', '2017', '2019'], 0], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['ONCE', 'STAY', 'Bunnies'], 0], ['¿En qué programa se formó TWICE?', 'Which survival show formed TWICE?', ['I-LAND', 'SIXTEEN', 'Produce 101'], 1]],
    blackpink: [['¿En qué año debutó BLACKPINK?', 'What year did BLACKPINK debut?', ['2014', '2016', '2018'], 1], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['BLINK', 'ARMY', 'ONCE'], 0], ['¿Cuál es su agencia?', 'Which agency are they with?', ['SM', 'JYP', 'YG Entertainment'], 2]],
    lngshot: [['¿Quién fundó su sello MORE VISION?', 'Who founded their label MORE VISION?', ['Jay Park', 'PSY', 'Zico'], 0], ['¿Cuál fue su canción de debut?', 'What was their debut song?', ["Moonwalkin'", '4SHO 4SHO', 'Shot Callers'], 0], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['SHOTTIES', 'STAY', 'ENGENE'], 0]],
    seventeen: [['¿En qué año debutó SEVENTEEN?', 'What year did SEVENTEEN debut?', ['2013', '2015', '2017'], 1], ['¿Cuántos miembros tiene?', 'How many members are there?', ['9', '11', '13'], 2], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['CARAT', 'BLINK', 'ARMY'], 0]],
    enhypen: [['¿En qué año debutó ENHYPEN?', 'What year did ENHYPEN debut?', ['2019', '2020', '2022'], 1], ['¿En qué programa se formó?', 'Which survival show formed them?', ['I-LAND', 'SIXTEEN', 'Boys Planet'], 0], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['ENGENE', 'MOA', 'CARAT'], 0]],
    newjeans: [['¿En qué año debutó NewJeans?', 'What year did NewJeans debut?', ['2020', '2022', '2024'], 1], ['¿Cuál es su agencia?', 'Which agency are they with?', ['ADOR', 'Pledis', 'JYP'], 0], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['Bunnies', 'ONCE', 'STAY'], 0]]
  };
  var FALLBACK_COLORS = ['#8E7CC3', '#E0679B', '#3A9BD9', '#53B87A', '#E79A2E'];
  var colorCache = {};
  function gColor(id) {
    if (colorCache[id]) return colorCache[id];
    var v = getComputedStyle(document.documentElement).getPropertyValue('--c-' + id).trim();
    if (!v) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; v = FALLBACK_COLORS[h % FALLBACK_COLORS.length]; }
    return (colorCache[id] = v);
  }
  function gStyle(id) { return '--gc:' + gColor(id); }
  /* avatar pequeño = el grupo completo en chibi (se ve entero, sin recortes) */
  function face(id) { return { src: 'assets/chibis/' + (ROSTER[id] ? id : 'default') + '.svg', photo: false }; }
  function faceImg(id, cls, alt) {
    return '<img src="' + esc(face(id).src) + '" alt="' + esc(alt || '') + '" class="' + (cls || '') + '" decoding="async" draggable="false">';
  }
  function members(id) { return ROSTER[id] || []; }
  function memberSrc(gid, mid) { return 'assets/chibis/' + gid + '/' + mid + '.svg'; }
  function photoOf(id) {
    var p = PHOTOS[id]; if (!p) return null;
    return typeof p === 'string' ? { src: 'assets/photos/' + p } : { src: 'assets/photos/' + p.file, w: p.w, h: p.h };
  }
  /* quién sale en la próxima parada: si el evento trae lineup (una unidad), solo esos */
  function lineupOf(st) {
    var all = members(st.id), lu = st.cur && st.cur.lineup;
    if (!lu || !lu.length) return all;
    var out = all.filter(function (m) { return lu.indexOf(m.id) >= 0; });
    return out.length ? out : all;
  }
  /* multitud de chibis: misma geometría que tools/chibis.py (sprites 100 x 140, paso .6, fila de atrás) */
  function crowdLayout(n, target) {
    var rows = n <= 5 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
    var k = rows[0], mw = Math.min(target * .62, target / (1 + (k - 1) * .6)), mh = mw * 1.4, step = mw * .6, row = mh * .414;
    var width = mw + (k - 1) * step, out = [];
    rows.forEach(function (cnt, r) {
      var off = (width - (mw + (cnt - 1) * step)) / 2;
      for (var i = 0; i < cnt; i++) out.push({ x: off + i * step, y: r * row, r: r });
    });
    return { pos: out, w: width, h: mh + (rows.length - 1) * row, mw: mw, mh: mh };
  }
  function crowdHtml(gid, list, target) {
    var L0 = crowdLayout(list.length, target);
    return { w: L0.w, h: L0.h, html: list.map(function (m, i) {
      var p = L0.pos[i];
      return '<img class="cm" src="' + esc(memberSrc(gid, m.id)) + '" alt="" draggable="false" decoding="async" style="left:' + p.x.toFixed(1) + 'px;top:' + p.y.toFixed(1) + 'px;width:' + L0.mw.toFixed(1) + 'px;z-index:' + (p.r * 20 + i) +
        ';--bd:' + (2.2 + (i % 4) * .35).toFixed(2) + 's;--dl:-' + (i * .41 % 2.4).toFixed(2) + 's;--hi:' + i + '">';
    }).join('') };
  }

  /* ================= idioma ================= */
  var I18N = {
    es: {
      skip: 'Saltar a los grupos', install: 'Instalar', globe: 'Globo', sonar: 'Sonar', videoMode: 'Modo video', dragHint: 'arrástrame', you: 'Tú',
      sonarNote: 'Distancia en escala de raíz: lo cercano se ve más separado.', myCity: 'Tu ciudad', useLocation: 'Usar mi ubicación', checkNow: 'Revisar ahora',
      groupsTitle: '¿Cuándo y dónde?', feedTitle: 'Últimas alertas', testParty: 'Probar la celebración', subTitle: 'Recibir alertas',
      subLead: 'Te avisamos cuando tu grupo anuncia fechas, llega a una ciudad cerca o sube al escenario.',
      fName: 'Tu nombre o apodo', fDiscord: 'Tu ID de usuario de Discord', fDiscordHint: 'Discord, Ajustes, Avanzado, Modo desarrollador. Luego clic derecho en tu nombre y Copiar ID.',
      eDiscord: 'El ID son 17 a 20 números.', fWa: 'Tu WhatsApp con indicativo', eWa: 'Escríbelo con el indicativo, por ejemplo +57 300 000 0000.',
      fOptIn: 'Acepto recibir mensajes del radar por WhatsApp.', eOpt: 'WhatsApp exige que lo aceptes.', fGroups: 'Grupos', fTypes: 'Qué quieres que te avisemos',
      fRadius: 'Avísame de shows a menos de', preview: 'Así te llegaría',
      privacy: 'Tus datos se guardan solo en este navegador. Si el radar tiene servidor configurado, se envían únicamente para mandarte estas alertas. Puedes borrarlos cuando quieras.',
      privacyLink: 'Cómo usamos tus datos', privacyTitle: 'Privacidad',
      privacy1: 'El radar no tiene cuentas, ni cookies de rastreo, ni analítica. En tu navegador (localStorage) se guardan tu ciudad, tu idioma, si silenciaste los sonidos, tu grupo favorito, qué alertas ya viste y, si llenas el formulario, tu nombre, tu ID de Discord o tu WhatsApp, tus grupos y tus tipos de alerta.',
      privacy2: 'Al entrar, el radar le pide tu ubicación al navegador. Si aceptas, la posición se redondea (unos 1 km) y se guarda solo en tu equipo para medir distancias; si no, usamos Bucaramanga o la ciudad que elijas. Tu ubicación nunca sale de tu equipo, salvo la ciudad y el radio del formulario cuando el radar tenga un servidor de alertas configurado.',
      privacy3: 'Las fuentes tipográficas se cargan desde Google Fonts, que recibe tu dirección IP como cualquier sitio que las use. Para borrar todo, usa "Borrar mis datos" o limpia los datos del sitio en tu navegador.',
      subSubmit: 'Guardar mis alertas', subDelete: 'Borrar mis datos', bye: 'Nos vemos en la próxima parada',
      disclaimer1: 'Esto muestra la agenda oficial y pública de cada grupo. No rastrea a nadie en tiempo real: el chibi está en la próxima fecha confirmada, no donde están en este momento.',
      disclaimer2: 'Las horas son aproximadas (20:00 hora local cuando la fuente no la trae) y las coordenadas de los recintos también. Las fechas marcadas como anunciadas vienen de un solo anuncio y pueden cambiar.',
      sources: 'Fuentes', credit: 'Hecho con amor de fan por', dockWorld: 'Mundo', dockGroups: 'Grupos', dockFeed: 'Avisos', dockAlerts: 'Alertas', dockVideo: 'Video',
      iosTitle: 'Instálala en tu iPhone', ios1: 'Toca el botón Compartir de Safari.', ios2: 'Elige "Añadir a pantalla de inicio".', ios3: 'Abre Radar K-pop desde tu pantalla, como una app.', gotIt: 'Listo',
      live: 'En vivo ahora', liveKo: '공연 중', next: 'Próxima parada', nextKo: '다음 공연', rest: 'Sin fechas anunciadas', restKo: '쉬는 중',
      restWhere: 'En pausa', lastStop: 'Última parada', kmFrom: 'km de {city}', flight: '~{h} h de vuelo directo', localTime: 'hora local', yourTime: 'en tu hora',
      days: 'días', hours: 'horas', mins: 'min', secs: 'seg', share: 'Compartir', calendar: 'Agregar al calendario', calShort: 'Agendar', seeCard: 'Ver ficha', seeGlobe: 'Ver en el globo',
      tour: 'Ver gira ({n} ciudades)', pastTour: 'Última gira ({n} ciudades)', announced: 'anunciado', bias: 'Mi grupo favorito', nearest: 'Lo más cerca de ti', nothingNear: 'Ningún grupo tiene fechas por ahora.',
      agendaOf: 'Agenda del {when}', checkedAgo: 'revisada hace {ago}', offline: 'Sin conexión con la agenda, mostrando la última copia ({when})', loading: 'Cargando agenda',
      emptyFeed: 'Todavía no hay alertas. Aparecen aquí cuando cambia la agenda, un grupo pasa a la siguiente ciudad, hay un show por empezar o sale una noticia de gira o comeback.',
      ago: 'hace {n}', newAlert: '¡Alerta nueva!', moreAlerts: 'y {n} alertas más en el feed', close: 'Cerrar', closeVideo: 'Salir', replay: 'Repetir', see: 'Ver',
      shareText: '{g} en {city} en {d}. ¿Y tú, cuándo los ves?', shareRest: '{g} está en pausa, sin fechas anunciadas. Esperando juntos.', shared: 'Tarjeta lista', saved: 'Imagen descargada',
      icsSaved: 'Evento descargado, ábrelo para guardarlo', geoAsk: 'Buscando tu ubicación...', geoFail: 'No pudimos leer tu ubicación', myLocation: 'Mi ubicación',
      subSaved: 'Guardado en este navegador.', subSent: '¡Listo! Te suscribimos a las alertas.', subNoEndpoint: 'Todavía no hay servidor de alertas. Tus datos quedan guardados aquí y este es el formato que necesita el radar:',
      subFail: 'No pudimos enviar los datos. Quedaron guardados aquí, inténtalo más tarde.', copy: 'Copiar', copied: 'Copiado', deleted: 'Datos borrados',
      pvDiscord: '**{g}** sube al escenario en {city}', pvWa: 'Radar K-pop: {g} toca en {city} cerca de ti, a {km} km.', pvNow: 'ahora',
      typesNear: 'Cerca de ti', typesLive: 'En vivo y hoy', typesDates: 'Fechas nuevas o cambios', typesNext: 'Siguiente parada', typesArrival: 'Llegadas',
      typesLatam: 'Latinoamérica', typesNews: 'Comebacks y giras', typesVideo: 'Videos',
      vTitle: '¿Dónde están hoy?', vRest: 'en pausa, esperando fechas', vOutro: '¿Y tú, cuándo los ves?', dday: 'D-DAY', unmute: 'Sonidos activados', mute: 'Sonidos en silencio',
      installed: 'Radar instalado', tapToStart: 'Toca para empezar',
      zoomIn: 'Acercar', zoomOut: 'Alejar', centerMe: 'Centrar en mí', geoLooking: 'Buscando tu ubicación...', geoDenied: 'No pudimos leer tu ubicación. Usamos Bucaramanga, puedes cambiarla en "Tu ciudad".',
      geoOk: 'Usando tu ubicación, cerca de {city}', geoNear: 'cerca de {city}', geoNote: 'Sin permiso de ubicación: estamos midiendo desde Bucaramanga.', retry: 'Reintentar', youRef: 'ti',
      sightTitle: 'Avistamientos cercanos', sightLead: 'Publicaciones oficiales de los grupos que mencionan una ciudad, ordenadas por distancia a ti. Solo la ciudad, nunca hoteles, aeropuertos ni lugares exactos.',
      sightSample: 'Datos de ejemplo: el conector de X todavía no tiene token.', sightAway: 'a {km} km de ti', sightNew: '¡{n} avistamientos nuevos!', sightNew1: '¡Un avistamiento nuevo!', sightSee: 'Ver post oficial',
      sightEmpty: 'Todavía no hay avistamientos. Aparecen cuando una cuenta oficial menciona una ciudad.', tickerK: 'AVISTAMIENTOS CERCANOS', sightSource: 'Fuente: cuentas oficiales en X',
      squad: 'Toca a cada miembro', notOnTour: 'no va en esta gira', photoAlt: 'Foto oficial de {g}', withUnit: 'con {names}',
      triviaTitle: 'Mini trivia', triviaOk: '¡Correcto!', triviaNo: 'Casi... era {a}', triviaScore: '{n} de {t} correctas',
      onsaleToday: '¡HOY VENDEN BOLETAS!', onsaleIn: 'Venta de boletas {d} · {when}', pushTab: 'Celular',
      pushLead: 'Notificaciones en este celular o computador, aunque la web esté cerrada.', pushNeedCfg: 'Todavía falta el servidor de notificaciones (subscribeEndpoint y vapidPublicKey en config.js). Tus preferencias quedan guardadas aquí.',
      pushUnsupported: 'Este navegador no soporta notificaciones. En iPhone primero instala el radar en tu pantalla de inicio.', pushDenied: 'Las notificaciones están bloqueadas. Actívalas en los ajustes del navegador.', pushOn: '¡Listo! Te llegarán notificaciones.',
      changesTitle: 'Novedades', you2: 'Tú',
      fConsent: 'Autorizo al radar a usar estos datos solo para mandarme las alertas que elegí. Si soy menor de edad, tengo permiso de mi mamá, papá o acudiente.', eConsent: 'Necesitamos tu autorización para guardar tus alertas.',
      privacy4: 'Responsable: Cristian Pérez (cristianperez.me). Puedes conocer, actualizar o borrar tus datos y retirar tu autorización cuando quieras: "Borrar mis datos" los borra de este navegador y del servidor, o escríbele desde su web. Si el radar tiene servidor, tus datos se guardan en Cloudflare solo para mandarte alertas, sin tu IP ni tu ubicación exacta; las notificaciones push pasan por el servicio de tu navegador (Google, Apple o Mozilla). Si eres menor de edad, pide permiso a un adulto antes de dejar tu WhatsApp.',
      T: { new_date: 'Fecha nueva', changed: 'Cambio', removed: 'Quitada', stop_today: 'Hoy', live: 'En vivo', next_stop: 'Siguiente parada', arrival_official: 'Llegada oficial', arrival: 'Llegada', latam: 'Latam', comeback: 'Comeback', tour: 'Gira', video: 'Video', prox: 'Cerca de ti', prox_new: 'Cerca de ti' },
      months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], wdays: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
      cardinal: ['N', 'E', 'S', 'O'], locale: 'es-CO'
    },
    en: {
      skip: 'Skip to the groups', install: 'Install', globe: 'Globe', sonar: 'Sonar', videoMode: 'Video mode', dragHint: 'drag me', you: 'You',
      sonarNote: 'Square-root distance scale: nearby stops look more spread out.', myCity: 'Your city', useLocation: 'Use my location', checkNow: 'Check now',
      groupsTitle: 'When and where?', feedTitle: 'Latest alerts', testParty: 'Try the celebration', subTitle: 'Get alerts',
      subLead: 'We ping you when your group announces dates, lands in a city near you or goes on stage.',
      fName: 'Your name or nickname', fDiscord: 'Your Discord user ID', fDiscordHint: 'Discord, Settings, Advanced, Developer Mode. Then right click your name and Copy ID.',
      eDiscord: 'The ID is 17 to 20 digits.', fWa: 'Your WhatsApp with country code', eWa: 'Add the country code, for example +1 305 000 0000.',
      fOptIn: 'I agree to receive radar messages on WhatsApp.', eOpt: 'WhatsApp requires your consent.', fGroups: 'Groups', fTypes: 'What should we tell you about',
      fRadius: 'Tell me about shows closer than', preview: 'This is how it arrives',
      privacy: 'Your data is stored only in this browser. If the radar has a server configured, it is sent only to deliver these alerts. You can delete it anytime.',
      privacyLink: 'How we use your data', privacyTitle: 'Privacy',
      privacy1: 'The radar has no accounts, no tracking cookies and no analytics. Your browser (localStorage) keeps your city, your language, whether you muted sounds, your favorite group, which alerts you already saw and, if you fill the form, your name, your Discord ID or WhatsApp, your groups and alert types.',
      privacy2: 'When you open it, the radar asks your browser for your location. If you allow it, the position is rounded (about 1 km) and stored only on your device to measure distances; if not, we use Bucaramanga or the city you choose. Your location never leaves your device, except the city and radius from the form once the radar has an alert server configured.',
      privacy3: 'Fonts load from Google Fonts, which sees your IP address like on any site that uses them. To erase everything, use "Delete my data" or clear this site\'s data in your browser.',
      subSubmit: 'Save my alerts', subDelete: 'Delete my data', bye: 'See you at the next stop',
      disclaimer1: 'This shows each group\'s official, public schedule. It does not track anyone in real time: the chibi stands on the next confirmed date, not where they are right now.',
      disclaimer2: 'Times are approximate (8 pm local time when the source has none) and so are venue coordinates. Dates marked as announced come from a single announcement and may change.',
      sources: 'Sources', credit: 'Made with fan love by', dockWorld: 'World', dockGroups: 'Groups', dockFeed: 'News', dockAlerts: 'Alerts', dockVideo: 'Video',
      iosTitle: 'Install it on your iPhone', ios1: 'Tap Safari\'s Share button.', ios2: 'Choose "Add to Home Screen".', ios3: 'Open Radar K-pop from your home screen, like an app.', gotIt: 'Got it',
      live: 'Live now', liveKo: '공연 중', next: 'Next stop', nextKo: '다음 공연', rest: 'No dates announced', restKo: '쉬는 중',
      restWhere: 'On a break', lastStop: 'Last stop', kmFrom: 'km from {city}', flight: '~{h} h direct flight', localTime: 'local time', yourTime: 'your time',
      days: 'days', hours: 'hours', mins: 'min', secs: 'sec', share: 'Share', calendar: 'Add to calendar', calShort: 'Save date', seeCard: 'Details', seeGlobe: 'See on the globe',
      tour: 'See tour ({n} cities)', pastTour: 'Last tour ({n} cities)', announced: 'announced', bias: 'My favorite group', nearest: 'Closest to you', nothingNear: 'No group has dates right now.',
      agendaOf: 'Schedule from {when}', checkedAgo: 'checked {ago} ago', offline: 'Can\'t reach the schedule, showing the last copy ({when})', loading: 'Loading schedule',
      emptyFeed: 'No alerts yet. They show up here when the schedule changes, a group moves to the next city, a show is about to start or there is tour or comeback news.',
      ago: '{n} ago', newAlert: 'New alert!', moreAlerts: 'and {n} more alerts in the feed', close: 'Close', closeVideo: 'Exit', replay: 'Replay', see: 'See',
      shareText: '{g} in {city} in {d}. When are you seeing them?', shareRest: '{g} is on a break, no dates yet. Waiting together.', shared: 'Card ready', saved: 'Image downloaded',
      icsSaved: 'Event downloaded, open it to save it', geoAsk: 'Finding you...', geoFail: 'We could not read your location', myLocation: 'My location',
      subSaved: 'Saved in this browser.', subSent: 'Done! You are subscribed.', subNoEndpoint: 'There is no alert server yet. Your data stays here and this is the format the radar needs:',
      subFail: 'We could not send it. It is saved here, try again later.', copy: 'Copy', copied: 'Copied', deleted: 'Data deleted',
      pvDiscord: '**{g}** goes on stage in {city}', pvWa: 'Radar K-pop: {g} plays {city} near you, {km} km away.', pvNow: 'now',
      typesNear: 'Near you', typesLive: 'Live and today', typesDates: 'New or changed dates', typesNext: 'Next stop', typesArrival: 'Arrivals',
      typesLatam: 'Latin America', typesNews: 'Comebacks and tours', typesVideo: 'Videos',
      vTitle: 'Where are they today?', vRest: 'on a break, waiting for dates', vOutro: 'When are you seeing them?', dday: 'D-DAY', unmute: 'Sounds on', mute: 'Sounds muted',
      installed: 'Radar installed', tapToStart: 'Tap to start',
      zoomIn: 'Zoom in', zoomOut: 'Zoom out', centerMe: 'Center on me', geoLooking: 'Finding you...', geoDenied: 'We could not read your location. Using Bucaramanga, you can change it in "Your city".',
      geoOk: 'Using your location, near {city}', geoNear: 'near {city}', geoNote: 'No location permission: measuring from Bucaramanga.', retry: 'Try again', youRef: 'you',
      sightTitle: 'Sightings near you', sightLead: 'Official group posts that mention a city, sorted by distance to you. City level only, never hotels, airports or exact places.',
      sightSample: 'Sample data: the X connector has no token yet.', sightAway: '{km} km from you', sightNew: '{n} new sightings!', sightNew1: 'A new sighting!', sightSee: 'See official post',
      sightEmpty: 'No sightings yet. They show up when an official account mentions a city.', tickerK: 'SIGHTINGS NEAR YOU', sightSource: 'Source: official accounts on X',
      squad: 'Tap each member', notOnTour: 'not on this tour', photoAlt: 'Official photo of {g}', withUnit: 'with {names}',
      triviaTitle: 'Mini trivia', triviaOk: 'Correct!', triviaNo: 'So close... it was {a}', triviaScore: '{n} of {t} right',
      onsaleToday: 'TICKETS ON SALE TODAY!', onsaleIn: 'Tickets on sale {d} · {when}', pushTab: 'Phone',
      pushLead: 'Notifications on this phone or computer, even when the site is closed.', pushNeedCfg: 'The notification server is not set up yet (subscribeEndpoint and vapidPublicKey in config.js). Your preferences are saved here.',
      pushUnsupported: 'This browser does not support notifications. On iPhone, install the radar on your home screen first.', pushDenied: 'Notifications are blocked. Turn them on in your browser settings.', pushOn: 'Done! Notifications are on.',
      changesTitle: 'What\'s new', you2: 'You',
      fConsent: 'I allow the radar to use this data only to send me the alerts I chose. If I am under 18, I have permission from a parent or guardian.', eConsent: 'We need your permission to save your alerts.',
      privacy4: 'Data controller: Cristian Pérez (cristianperez.me). You can see, update or delete your data and withdraw your consent anytime: "Delete my data" erases it from this browser and from the server, or write to him through his site. If the radar has a server, your data is stored on Cloudflare only to send you alerts, without your IP or exact location; push notifications go through your browser\'s service (Google, Apple or Mozilla). If you are under 18, ask an adult before sharing your WhatsApp.',
      T: { new_date: 'New date', changed: 'Changed', removed: 'Removed', stop_today: 'Today', live: 'Live', next_stop: 'Next stop', arrival_official: 'Official arrival', arrival: 'Arrival', latam: 'Latam', comeback: 'Comeback', tour: 'Tour', video: 'Video', prox: 'Near you', prox_new: 'Near you' },
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], wdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      cardinal: ['N', 'E', 'S', 'W'], locale: 'en-US'
    }
  };
  var EN_PLACES = {
    'Perú': 'Peru', 'Brasil': 'Brazil', 'Taiwán': 'Taiwan', 'Tailandia': 'Thailand', 'Malasia': 'Malaysia', 'Singapur': 'Singapore', 'Filipinas': 'Philippines',
    'Japón': 'Japan', 'Suiza': 'Switzerland', 'Italia': 'Italy', 'Francia': 'France', 'Luxemburgo': 'Luxembourg', 'Reino Unido': 'United Kingdom',
    'Corea del Sur': 'South Korea', 'México': 'Mexico', 'EE. UU.': 'USA', 'España': 'Spain', 'Panamá': 'Panama', 'Rep. Dominicana': 'Dominican Rep.',
    'Sídney': 'Sydney', 'Londres': 'London', 'Yakarta': 'Jakarta', 'Taipéi': 'Taipei', 'Milán': 'Milan', 'Viena': 'Vienna', 'Zúrich': 'Zurich', 'París': 'Paris',
    'Edimburgo': 'Edinburgh', 'Tokio': 'Tokyo', 'Seúl': 'Seoul', 'Nueva York': 'New York', 'Los Ángeles': 'Los Angeles', 'Ciudad de México': 'Mexico City',
    'Bogotá': 'Bogota', 'Medellín': 'Medellin', 'São Paulo': 'São Paulo', 'Macao': 'Macau', 'Milán': 'Milan', 'Ámsterdam': 'Amsterdam', 'Berlín': 'Berlin', 'Países Bajos': 'Netherlands', 'Alemania': 'Germany', 'Indonesia': 'Indonesia'
  };
  var lang = store('radar-lang') || ((navigator.language || 'es').toLowerCase().indexOf('en') === 0 ? 'en' : 'es');
  if (params.get('lang') === 'en' || params.get('lang') === 'es') lang = params.get('lang');
  function L() { return I18N[lang]; }
  function t(k, vars) {
    var s = L()[k]; if (s == null) s = I18N.es[k]; if (s == null) return k;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, v) { return vars[v] != null ? vars[v] : m; });
    return s;
  }
  function place(s) {
    if (lang !== 'en' || !s) return s || '';
    var keys = Object.keys(EN_PLACES);
    for (var i = 0; i < keys.length; i++) if (s === keys[i] || s.indexOf(keys[i] + ' ') === 0) return EN_PLACES[keys[i]] + s.slice(keys[i].length);
    return s;
  }
  function tourName(s) { return lang === 'en' ? String(s || '').replace('(terminada)', '(ended)').replace(/^Con /, 'With ') : (s || ''); }
  function fmtKm(n) { return Math.round(n).toLocaleString(L().locale); }
  function parts(ld) { var p = ld.split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; }
  function fmtDate(ld, withYear) {
    var p = parts(ld), wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
    var y = (withYear || p.y !== new Date(now()).getFullYear()) ? ' ' + p.y : '';
    return lang === 'en' ? L().wdays[wd] + ', ' + L().months[p.m - 1] + ' ' + p.d + y : L().wdays[wd] + ' ' + p.d + ' ' + L().months[p.m - 1] + y;
  }
  function fmtShort(ld) { var p = parts(ld); return lang === 'en' ? L().months[p.m - 1] + ' ' + p.d : p.d + ' ' + L().months[p.m - 1]; }
  function myTime(ms) {
    try { return new Date(ms).toLocaleString(L().locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return new Date(ms).toString(); }
  }
  function agoTxt(ms) {
    var s = Math.max(0, ms / 1000);
    var v = s < 60 ? Math.round(s) + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d';
    return v;
  }

  /* ================= ciudades de origen ================= */
  var ORIGINS = [
    ['Bucaramanga', 'Colombia', 7.1254, -73.1198], ['Bogotá', 'Colombia', 4.711, -74.0721], ['Medellín', 'Colombia', 6.2442, -75.5812],
    ['Cali', 'Colombia', 3.4516, -76.532], ['Barranquilla', 'Colombia', 10.9685, -74.7813], ['Cartagena', 'Colombia', 10.391, -75.4794],
    ['Ciudad de México', 'México', 19.4326, -99.1332], ['Guadalajara', 'México', 20.6597, -103.3496], ['Monterrey', 'México', 25.6866, -100.3161],
    ['Lima', 'Perú', -12.0464, -77.0428], ['Quito', 'Ecuador', -0.1807, -78.4678], ['Guayaquil', 'Ecuador', -2.1709, -79.9224],
    ['Caracas', 'Venezuela', 10.4806, -66.9036], ['Panamá', 'Panamá', 8.9824, -79.5199], ['San José', 'Costa Rica', 9.9281, -84.0907],
    ['Santo Domingo', 'Rep. Dominicana', 18.4861, -69.9312], ['San Juan', 'Puerto Rico', 18.4655, -66.1057], ['La Paz', 'Bolivia', -16.4897, -68.1193],
    ['Asunción', 'Paraguay', -25.2637, -57.5759], ['Montevideo', 'Uruguay', -34.9011, -56.1645], ['Santiago', 'Chile', -33.4489, -70.6693],
    ['Buenos Aires', 'Argentina', -34.6037, -58.3816], ['São Paulo', 'Brasil', -23.5505, -46.6333], ['Miami', 'EE. UU.', 25.7617, -80.1918],
    ['Nueva York', 'EE. UU.', 40.7128, -74.006], ['Los Ángeles', 'EE. UU.', 34.0522, -118.2437], ['Madrid', 'España', 40.4168, -3.7038],
    ['Londres', 'Reino Unido', 51.5074, -0.1278], ['París', 'Francia', 48.8566, 2.3522], ['Seúl', 'Corea del Sur', 37.5665, 126.978],
    ['Tokio', 'Japón', 35.6762, 139.6503], ['Manila', 'Filipinas', 14.5995, 120.9842], ['Sídney', 'Australia', -33.8688, 151.2093]
  ];
  /* origen: la ubicación real si el navegador la da; si no, una ciudad. Bucaramanga es el respaldo. */
  var originIdx = 0, geoOrigin = null, geoState = 'idle';
  var savedOrigin = store('radar-origin');
  (function () {
    var s = parseInt(savedOrigin, 10); if (s >= 0 && s < ORIGINS.length) originIdx = s;
    try { geoOrigin = JSON.parse(store('radar-geo') || 'null'); } catch (e) { geoOrigin = null; }
    if (savedOrigin === 'geo' && geoOrigin) originIdx = -1;
  })();
  function origin() {
    if (originIdx === -1 && geoOrigin) return { name: t('myLocation'), country: '', lat: geoOrigin.lat, lon: geoOrigin.lon, geo: true, near: geoOrigin.near || '' };
    var o = ORIGINS[originIdx] || ORIGINS[0]; return { name: o[0], country: o[1], lat: o[2], lon: o[3] };
  }
  function originRef() { var o = origin(); return o.geo ? t('youRef') : place(o.name); }
  function originLabel() { var o = origin(); return o.geo ? t('myLocation') + (o.near ? ' (' + t('geoNear', { city: place(o.near) }) + ')' : '') : place(o.name); }
  /* ciudad conocida más cercana (solo para nombrar, nunca se envía a ningún lado) */
  function nearestPlace(lat, lon) {
    var best = null;
    ORIGINS.forEach(function (c) { var d = hav(lat, lon, c[2], c[3]); if (!best || d < best.d) best = { d: d, name: c[0] }; });
    (data.groups || []).forEach(function (g) { (g.events || []).forEach(function (e) { var d = hav(lat, lon, e.lat, e.lon); if (!best || d < best.d) best = { d: d, name: e.city }; }); });
    return best && best.d < 90 ? best.name : '';
  }
  function useFallback(reason, quiet) {
    geoState = reason;
    if (originIdx === -1 || savedOrigin == null || savedOrigin === 'geo') originIdx = 0;
    renderAll();
    var once = false; try { once = sessionStorage.getItem('radar-geo-told') === '1'; sessionStorage.setItem('radar-geo-told', '1'); } catch (e) { once = false; }
    if (!quiet || !once) toast(t('geoDenied'));
  }
  function locate(manual) {
    if (!navigator.geolocation || !window.isSecureContext) { useFallback('fail', !manual); return; }
    geoState = 'asking'; renderNear();
    if (manual) toast(t('geoLooking'));
    navigator.geolocation.getCurrentPosition(function (p) {
      var lat = +p.coords.latitude.toFixed(2), lon = +p.coords.longitude.toFixed(2);
      geoOrigin = { lat: lat, lon: lon, near: nearestPlace(lat, lon) };
      store('radar-geo', JSON.stringify(geoOrigin));
      originIdx = -1; savedOrigin = 'geo'; store('radar-origin', 'geo'); geoState = 'ok';
      Sound.play('pop'); renderAll();
      toast(geoOrigin.near ? t('geoOk', { city: place(geoOrigin.near) }) : t('myLocation'));
    }, function (err) {
      useFallback(err && err.code === 1 ? 'denied' : 'fail', !manual);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 900000 });
  }

  /* ================= estado de cada grupo ================= */
  function stops(evs) {
    var out = [];
    evs.forEach(function (e) { var l = out[out.length - 1]; if (l && l[0].city === e.city) l.push(e); else out.push([e]); });
    return out;
  }
  function stateOf(g, ms) {
    var ev = (g.events || []).map(function (e) { var c = Object.assign({}, e); c.t = Date.parse(e.start); return c; }).sort(function (a, b) { return a.t - b.t; });
    var up = ev.filter(function (e) { return e.t + SHOW_MS > ms; });
    var past = ev.filter(function (e) { return e.t + SHOW_MS <= ms; });
    var st = { g: g, id: g.id, up: up, past: past, all: ev };
    if (up.length) { st.mode = up[0].t <= ms ? 'live' : 'next'; st.cur = up[0]; }
    else { st.mode = 'rest'; st.cur = null; st.last = past[past.length - 1] || null; }
    st.upStops = stops(up);
    st.pos = st.cur ? { lat: st.cur.lat, lon: st.cur.lon, city: st.cur.city } : { lat: SEOUL.lat, lon: SEOUL.lon, city: 'Seúl', rest: true };
    return st;
  }
  var bias = store('radar-bias') || '';
  var states = [];
  function computeStates() {
    var ms = now();
    states = data.groups.map(function (g) { return stateOf(g, ms); });
    var rank = { live: 0, next: 1, rest: 2 };
    states.sort(function (a, b) {
      if (bias && (a.id === bias) !== (b.id === bias)) return a.id === bias ? -1 : 1;
      if (rank[a.mode] !== rank[b.mode]) return rank[a.mode] - rank[b.mode];
      if (a.cur && b.cur) return a.cur.t - b.cur.t;
      return 0;
    });
    return states;
  }
  function stOf(id) { for (var i = 0; i < states.length; i++) if (states[i].id === id) return states[i]; return null; }
  function modeSig() { var ms = now(); return data.groups.map(function (g) { var s = stateOf(g, ms); return g.id + s.mode + (s.cur ? s.cur.id : ''); }).join('|'); }
  function dday(e) {
    var ms = now(); if (!e) return '';
    if (ms >= e.t && ms < e.t + SHOW_MS) return t('dday');
    var a = new Date(ms); a.setHours(0, 0, 0, 0);
    var b = new Date(e.t); b.setHours(0, 0, 0, 0);
    var d = Math.round((b - a) / 864e5);
    return d <= 0 ? t('dday') : 'D-' + d;
  }
  function flightH(km) { return Math.max(1, Math.round(km / 850 + 0.6)); }

  /* ================= sonido (Web Audio, sintetizado) ================= */
  var Sound = {
    ctx: null, master: null, muted: store('radar-muted') === '1', noiseBuf: null,
    unlock: function () {
      try {
        if (!this.ctx) {
          var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
          this.ctx = new AC();
          var comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
          this.master = this.ctx.createGain(); this.master.gain.value = .9;
          this.master.connect(comp); comp.connect(this.ctx.destination);
          var len = this.ctx.sampleRate * .8, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
          for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
          this.noiseBuf = buf;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { /* sin audio */ }
    },
    ok: function () { return !this.muted && this.ctx && this.ctx.state === 'running'; },
    tone: function (f, at, dur, type, vol, f2) {
      var c = this.ctx, o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + (at || 0);
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur * .8);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || .08, t0 + .012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + .05);
    },
    bell: function (f, at, vol) { this.tone(f, at, .5, 'sine', vol || .07); this.tone(f * 2, at, .32, 'sine', (vol || .07) * .35); this.tone(f * 3.01, at, .18, 'triangle', (vol || .07) * .12); },
    noise: function (at, dur, f1, f2, vol) {
      var c = this.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), t0 = c.currentTime + (at || 0);
      s.buffer = this.noiseBuf; bp.type = 'bandpass'; bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(f1, t0); bp.frequency.exponentialRampToValueAtTime(f2, t0 + dur * .6); bp.frequency.exponentialRampToValueAtTime(f1 * .8, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || .1, t0 + dur * .35); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(bp); bp.connect(g); g.connect(this.master); s.start(t0); s.stop(t0 + dur + .05);
    },
    play: function (name, arg) {
      if (!this.ok()) return;
      var s = this;
      switch (name) {
        case 'boop': var f0 = [523.3, 587.3, 659.3, 784, 880, 1046.5, 1174.7, 1318.5][(arg || 0) % 8]; s.tone(f0, 0, .16, 'sine', .08, f0 * 1.5); s.tone(f0 * 2, .05, .1, 'triangle', .025); break;
        case 'hop': [0, 1, 2, 3].forEach(function (i) { s.tone(660 + i * 180, i * .06, .1, 'sine', .05, 900 + i * 220); }); break;
        case 'open': s.tone(620, 0, .1, 'sine', .06, 980); s.tone(1240, .05, .08, 'triangle', .025); break;
        case 'close': s.tone(900, 0, .1, 'sine', .05, 540); break;
        case 'ping': s.bell(1760, 0, .05); s.tone(2637, .12, .5, 'sine', .03); s.tone(1318.5, .26, .6, 'sine', .025); break;
        case 'right': s.bell(1046.5, 0, .05); s.bell(1318.5, .07, .05); s.bell(1568, .14, .05); s.bell(2093, .21, .05); break;
        case 'tap': s.tone(1180, 0, .09, 'triangle', .05, 1560); break;
        case 'pop': s.tone(520, 0, .12, 'sine', .09, 1240); s.tone(2200, .03, .05, 'sine', .02); break;
        case 'select': s.bell(1318.5, 0, .06); s.bell(1975.5, .085, .055); break;
        case 'toggle': s.tone(880, 0, .1, 'triangle', .05, 620); s.tone(1320, .06, .08, 'sine', .03); break;
        case 'whoosh': s.noise(0, .75, 380, 2200, .09); s.tone(300, .05, .5, 'sine', .025, 620); break;
        case 'boing': s.tone(180, 0, .35, 'sine', .08, 420); break;
        case 'heart': s.bell(1568, 0, .05); s.bell(2093, .07, .05); s.bell(2637, .14, .045); break;
        case 'shutter': s.noise(0, .08, 3000, 6000, .08); [2093, 2637, 3136, 4186].forEach(function (f, i) { s.bell(f, .08 + i * .055, .035); }); break;
        case 'tick': s.tone(1500, 0, .06, 'square', .025); break;
        case 'fanfare':
          [1046.5, 1318.5, 1568, 2093, 2637].forEach(function (f, i) { s.tone(f, i * .085, .26, 'triangle', .07); s.tone(f / 2, i * .085, .2, 'sine', .03); });
          [2093, 2637, 3136].forEach(function (f) { s.tone(f, .48, .9, 'sine', .035); });
          s.tone(160, 0, .4, 'sine', .07, 440);
          [4186, 5274, 4699, 6272, 5588, 7040].forEach(function (f, i) { s.tone(f, .55 + i * .07, .14, 'sine', .018); });
          s.noise(.02, .5, 1500, 5000, .04);
          break;
      }
    }
  };
  function firstTouch() { Sound.unlock(); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, firstTouch, { passive: true, capture: true }); });

  /* ================= globo ================= */
  var landFeature = null, landListeners = [];
  fetch('assets/land-110m.json').then(function (r) { return r.json(); }).then(function (topo) {
    landFeature = topojson.feature(topo, topo.objects.land);
    landListeners.forEach(function (fn) { fn(); });
  }).catch(function () { /* el globo sigue sin continentes */ });

  var CLOUDS = [[-40, 18, 1], [20, -8, .8], [95, 30, 1.1], [150, -20, .9], [-110, 40, .85], [60, 55, .7], [-75, -35, 1], [175, 15, .75], [-150, -5, .9], [10, 45, .8]];

  function Globe(canvas, pinsEl, opt) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.pinsEl = pinsEl; this.opt = opt || {};
    this.lon = this.opt.lon != null ? this.opt.lon : -60; this.lat = this.opt.lat != null ? this.opt.lat : 6; this.zoom = 1;
    this.spin = this.opt.spin || 5; this.vlon = 0; this.vlat = 0; this.idleUntil = 0; this.tween = null; this.drag = null;
    this.markers = []; this.routes = []; this.sel = null; this.running = false; this.inView = true;
    this.proj = d3.geoOrthographic().clipAngle(90).precision(1.2);
    this.path = d3.geoPath(this.proj);
    this.grat = d3.geoGraticule10();
    this.pinEls = {}; this.sightEls = {}; this.sights = []; this.me = null; this.last = 0; this.time = 0; this.landPath = null; this.landKey = '';
    // capas estáticas en CSS (halo, océano con borde troquelado, volumen): el compositor solo las escala
    var host = canvas.parentNode;
    this.halo = document.createElement('div'); this.halo.className = 'g-halo'; this.halo.setAttribute('aria-hidden', 'true');
    this.ball = document.createElement('div'); this.ball.className = 'g-ball'; this.ball.setAttribute('aria-hidden', 'true');
    this.shadeEl = document.createElement('div'); this.shadeEl.className = 'g-shade'; this.shadeEl.setAttribute('aria-hidden', 'true');
    host.insertBefore(this.halo, canvas); host.insertBefore(this.ball, canvas); host.insertBefore(this.shadeEl, canvas.nextSibling);
    this._z = -1;
    var self = this;
    this.frameFn = function (ts) { self.frame(ts); };
    this.resize();
    landListeners.push(function () { self.landKey = ''; self.kick(); });
    if (!this.opt.passive) this.bindInput();
  }
  Globe.prototype.resize = function () {
    var r = this.c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.w = r.width; this.h = r.height; this.dpr = Math.min(window.devicePixelRatio || 1, (navigator.hardwareConcurrency || 8) <= 4 ? 1.5 : 2);
    this.c.width = Math.round(this.w * this.dpr); this.c.height = Math.round(this.h * this.dpr);
    var fit = this.opt.fit || .4;
    this.R0 = Math.min(this.w * fit, this.h * (this.opt.hfit || .36));
    this.cx = this.w / 2; this.cy = this.h * (this.opt.cy || .47);
    this.buildStatic();
    var R0 = this.R0, self = this;
    [[this.halo, 1.45], [this.ball, 1], [this.shadeEl, 1]].forEach(function (pair) {
      var el = pair[0], r = R0 * pair[1];
      el.style.width = el.style.height = (2 * r) + 'px'; el.style.left = (self.cx - r) + 'px'; el.style.top = (self.cy - r) + 'px';
    });
    this.ball.style.setProperty('--rim', (R0 * .045).toFixed(1) + 'px');
    this._z = -1;
    this.landKey = '';
    if (this.opt.onResize) this.opt.onResize(this);
    this.kick();
  };
  Globe.prototype.buildStatic = function () {
    var s, x;
    // trama de puntitos para la tierra (como sticker impreso)
    s = document.createElement('canvas'); s.width = s.height = 8; x = s.getContext('2d');
    x.fillStyle = 'rgba(46,33,80,.13)'; x.beginPath(); x.arc(2, 2, 1, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(6, 6, 1, 0, Math.PI * 2); x.fill();
    this.dots = this.ctx.createPattern(s, 'repeat');
  };
  Globe.prototype.project = function (lon, lat, alt) {
    var l0 = this.lon * K, p0 = this.lat * K, l = lon * K, p = lat * K, cp = Math.cos(p), dl = l - l0;
    var x = cp * Math.sin(dl), y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * cp * Math.cos(dl), z = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * cp * Math.cos(dl);
    var s = 1 + (alt || 0), R = this.R0 * this.zoom;
    x *= s; y *= s; z *= s;
    return { x: this.cx + x * R, y: this.cy - y * R, z: z, vis: z > 0 || (x * x + y * y) > 1 };
  };
  /* gestos: un dedo gira, dos dedos hacen zoom (pellizco). touch-action: none en el contenedor, así la página no se mueve. */
  var ZMIN = .75, ZMAX = 4;
  Globe.prototype.bindInput = function () {
    var self = this, host = this.c.parentNode, c = this.c, ptrs = {};
    function count() { return Object.keys(ptrs).length; }
    function two() { var k = Object.keys(ptrs); return [ptrs[k[0]], ptrs[k[1]]]; }
    function startDrag(id, x, y, moved, pin) {
      self.drag = { id: id, x: x, y: y, lon: self.lon, lat: self.lat, lt: performance.now(), lx: x, ly: y, moved: !!moved, pin: pin || null };
    }
    host.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button) return;
      if (e.target.closest && e.target.closest('button:not(.pin):not(.sight), a, .zoom-ctrl')) return;
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { host.setPointerCapture(e.pointerId); } catch (er) { /* nada */ }
      self.tween = null; self.vlon = self.vlat = 0;
      if (count() === 1) startDrag(e.pointerId, e.clientX, e.clientY, false, e.target.closest ? e.target.closest('.pin, .sight') : null);
      else if (count() === 2) {
        var p = two(); self.pinch = { d0: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, z0: self.zoom };
        if (self.drag) self.drag.moved = true;
        hideHintOnce(self);
      }
    });
    host.addEventListener('pointermove', function (e) {
      if (!ptrs[e.pointerId]) return;
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (self.pinch && count() >= 2) {
        var p = two(), d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        self.setZoom(self.pinch.z0 * d / self.pinch.d0);
        self.idleUntil = performance.now() + 10000;
        return;
      }
      var dr = self.drag; if (!dr || dr.id !== e.pointerId) return;
      var dx = e.clientX - dr.x, dy = e.clientY - dr.y;
      if (!dr.moved && Math.abs(dx) + Math.abs(dy) > 6) { dr.moved = true; c.classList.add('grabbing'); hideHintOnce(self); }
      if (!dr.moved) return;
      var k = 180 / (Math.PI * self.R0 * self.zoom) * .95;
      self.lon = dr.lon - dx * k; self.lat = clamp(dr.lat + dy * k, -78, 78);
      var tt = performance.now(), dt = Math.max(1, tt - dr.lt);
      self.vlon = .6 * self.vlon + .4 * (-(e.clientX - dr.lx) * k / dt);
      self.vlat = .6 * self.vlat + .4 * ((e.clientY - dr.ly) * k / dt);
      dr.lt = tt; dr.lx = e.clientX; dr.ly = e.clientY;
      self.kick();
    });
    function end(e) {
      if (!ptrs[e.pointerId]) return;
      delete ptrs[e.pointerId];
      if (count() < 2) self.pinch = null;
      if (count() === 1) {  // queda un dedo después del pellizco: sigue girando desde ahí, sin saltos
        var k = Object.keys(ptrs)[0]; startDrag(+k, ptrs[k].x, ptrs[k].y, true); self.vlon = self.vlat = 0; return;
      }
      if (count()) return;
      var dr = self.drag; self.drag = null; c.classList.remove('grabbing');
      self.idleUntil = performance.now() + 10000;
      if (!dr) return;
      if (performance.now() - dr.lt > 90 || reduce) self.vlon = self.vlat = 0;
      if (!dr.moved && e.type === 'pointerup') {
        if (dr.pin && dr.pin.classList.contains('sight')) { if (self.opt.onSight) self.opt.onSight(dr.pin.getAttribute('data-sid')); }
        else {
          var r = c.getBoundingClientRect(), hit = dr.pin ? dr.pin.getAttribute('data-id') : self.hitTest(e.clientX - r.left, e.clientY - r.top);
          if (hit && self.opt.onPick) self.opt.onPick(hit);
        }
      }
      self.kick();
    }
    host.addEventListener('pointerup', end); host.addEventListener('pointercancel', end);
    host.addEventListener('lostpointercapture', function (e) { if (ptrs[e.pointerId]) end(e); });
    // trackpad: pellizco llega como ctrl + rueda. La rueda sola sigue bajando la página.
    host.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault(); self.setZoom(self.zoom * Math.exp(-e.deltaY * .01)); self.idleUntil = performance.now() + 10000;
    }, { passive: false });
    // teclado: flechas giran, + y - acercan
    c.tabIndex = 0;
    c.addEventListener('keydown', function (e) {
      var step = 12 / self.zoom, used = true;
      if (e.key === 'ArrowLeft') self.flyTo(self.lon - step, self.lat, self.zoom, 260);
      else if (e.key === 'ArrowRight') self.flyTo(self.lon + step, self.lat, self.zoom, 260);
      else if (e.key === 'ArrowUp') self.flyTo(self.lon, clamp(self.lat + step, -78, 78), self.zoom, 260);
      else if (e.key === 'ArrowDown') self.flyTo(self.lon, clamp(self.lat - step, -78, 78), self.zoom, 260);
      else if (e.key === '+' || e.key === '=') self.zoomBy(1.4);
      else if (e.key === '-' || e.key === '_') self.zoomBy(1 / 1.4);
      else used = false;
      if (used) { e.preventDefault(); self.idleUntil = performance.now() + 10000; }
    });
  };
  function hideHintOnce(g) { if (g.opt.onDragStart) g.opt.onDragStart(); }
  Globe.prototype.setZoom = function (z) {
    this.zoom = clamp(z, ZMIN, ZMAX); this.tween = null;
    if (this.opt.onZoom) this.opt.onZoom(this.zoom);
    this.kick();
  };
  Globe.prototype.zoomBy = function (f) {
    var z = clamp(this.zoom * f, ZMIN, ZMAX);
    this.flyTo(this.lon, this.lat, z, reduce ? 0 : 380, true);
    if (this.opt.onZoom) this.opt.onZoom(z);
  };
  Globe.prototype.hitTest = function (x, y) {
    var best = null, bd = 46;
    this.markers.forEach(function (m) {
      if (!m.screen || !m.screen.front) return;
      var d = Math.hypot(m.screen.x - x, m.screen.y - (m.ph || 60) * .45 - y);
      if (d < bd) { bd = d; best = m.id; }
    });
    return best;
  };
  Globe.prototype.setData = function (markers, routes) {
    var self = this;
    this.markers = markers; this.routes = routes;
    var keep = {};
    markers.forEach(function (m, i) {
      keep[m.id] = 1;
      var el = self.pinEls[m.id];
      if (!el) {
        el = document.createElement('button'); el.type = 'button'; el.className = 'pin away'; el.setAttribute('data-id', m.id);
        el.innerHTML = '<span class="pin-bob"><span class="pin-glow"></span><span class="crowd"></span><span class="pin-tag"></span></span>';
        // el clic con mouse o dedo lo resuelve el gesto del globo; este solo atiende teclado (Enter / Espacio)
        el.addEventListener('click', function (e) { if (e.detail === 0 && self.opt.onPick) self.opt.onPick(m.id); });
        if (self.opt.passive) { el.tabIndex = -1; el.style.pointerEvents = 'none'; }
        self.pinsEl.appendChild(el); self.pinEls[m.id] = el; el._t = ''; el._ck = '';
      }
      var ck = m.list.map(function (x) { return x.id; }).join(',') + '|' + Math.round(self.pinTarget || 90);
      if (el._ck !== ck) {
        var cr = crowdHtml(m.id, m.list, self.pinTarget || 90), box = el.querySelector('.crowd');
        box.style.width = cr.w.toFixed(1) + 'px'; box.style.height = cr.h.toFixed(1) + 'px'; box.innerHTML = cr.html;
        m.pw = cr.w; m.ph = cr.h; el._pw = cr.w; el._ph = cr.h; el._ck = ck;
      } else { m.pw = el._pw; m.ph = el._ph; }
      el.style.cssText = gStyle(m.id) + ';width:' + m.pw.toFixed(1) + 'px;--bd:' + (1.9 + (i % 5) * .23).toFixed(2) + 's;--bdl:-' + (i * .37).toFixed(2) + 's';
      el._t = '';
      el.classList.toggle('live', m.mode === 'live'); el.classList.toggle('rest', m.mode === 'rest'); el.classList.toggle('low', !!m.low);
      el.querySelector('.pin-tag').innerHTML = esc(m.name) + (m.label ? ' <i>' + esc(m.label) + '</i>' : '');
      el.setAttribute('aria-label', m.aria || m.name);
    });
    Object.keys(this.pinEls).forEach(function (id) { if (!keep[id]) { self.pinEls[id].remove(); delete self.pinEls[id]; } });
    this.kick();
  };
  /* avistamientos: insignias redondas sobre la ciudad (nivel ciudad, nunca más fino) */
  Globe.prototype.setSights = function (list) {
    var self = this, keep = {};
    this.sights = list;
    list.forEach(function (sg) {
      keep[sg.sid] = 1;
      var el = self.sightEls[sg.sid];
      if (!el) {
        el = document.createElement('button'); el.type = 'button'; el.className = 'sight away'; el.setAttribute('data-sid', sg.sid);
        el.innerHTML = '<span class="sight-ring"></span><img alt="" draggable="false" decoding="async">';
        el.addEventListener('click', function (e) { if (e.detail === 0 && self.opt.onSight) self.opt.onSight(sg.sid); });
        if (self.opt.passive) { el.tabIndex = -1; el.style.pointerEvents = 'none'; }
        self.pinsEl.appendChild(el); self.sightEls[sg.sid] = el; el._t = '';
      }
      el.querySelector('img').src = face(sg.group).src;
      el.style.cssText = gStyle(sg.group); el._t = '';
      el.classList.toggle('fresh', !!sg.fresh);
      el.setAttribute('aria-label', sg.aria);
    });
    Object.keys(this.sightEls).forEach(function (k) { if (!keep[k]) { self.sightEls[k].remove(); delete self.sightEls[k]; } });
    this.kick();
  };
  Globe.prototype.setSel = function (id) {
    this.sel = id;
    var self = this;
    Object.keys(this.pinEls).forEach(function (k) { self.pinEls[k].classList.toggle('sel', k === id); self.pinEls[k].classList.toggle('dim', !!id && k !== id); });
    this.kick();
  };
  Globe.prototype.flyTo = function (lon, lat, zoom, dur, noDip) {
    if (reduce || !dur) { this.lon = lon; this.lat = lat; this.zoom = zoom; this.tween = null; this.kick(); return; }
    var dl = ((lon - this.lon) % 360 + 540) % 360 - 180;
    this.tween = { t0: performance.now(), dur: dur, lon0: this.lon, lat0: this.lat, z0: this.zoom, dl: dl, dlat: lat - this.lat, z1: zoom, dip: noDip ? 0 : Math.min(.32, Math.abs(dl) / 280 + Math.abs(lat - this.lat) / 400) };
    this.vlon = this.vlat = 0;
    this.kick();
  };
  Globe.prototype.kick = function () {
    if (this.running || !this.inView || document.hidden) return;
    this.running = true; this.last = 0;
    requestAnimationFrame(this.frameFn);
  };
  Globe.prototype.frame = function (ts) {
    if (!this.inView || document.hidden) { this.running = false; return; }
    var dt = this.last ? Math.min(64, ts - this.last) : 16; this.last = ts; this.time += dt / 1000;
    var tw = this.tween, moving = false;
    if (tw) {
      var p = clamp((ts - tw.t0) / tw.dur, 0, 1), k = ease(p);
      this.lon = tw.lon0 + tw.dl * k; this.lat = tw.lat0 + tw.dlat * k;
      this.zoom = tw.z0 + (tw.z1 - tw.z0) * k - tw.dip * Math.sin(Math.PI * p);
      if (p >= 1) { this.tween = null; if (tw.done) tw.done(); }
      moving = true;
    } else if (!this.drag) {
      if (Math.abs(this.vlon) + Math.abs(this.vlat) > .0004) {
        this.lon += this.vlon * dt; this.lat = clamp(this.lat + this.vlat * dt, -78, 78);
        var f = Math.pow(.94, dt / 16); this.vlon *= f; this.vlat *= f; moving = true;
      } else if (!reduce && !this.sel && this.zoom < 1.3 && performance.now() > this.idleUntil && this.spin) {
        this.lon += this.spin * dt / 1000;
        this.lat += (8 - this.lat) * Math.min(1, dt / 2400);
        moving = true;
      }
    }
    this.lon = ((this.lon + 540) % 360) - 180;
    this.draw();
    var animated = !reduce && (moving || this.routes.length || true);
    if (animated || this.drag) requestAnimationFrame(this.frameFn); else this.running = false;
  };
  Globe.prototype.draw = function () {
    var ctx = this.ctx, d = this.dpr, R = this.R0 * this.zoom, cx = this.cx, cy = this.cy, TAU = Math.PI * 2, self = this;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (this._z !== this.zoom) {
      this._z = this.zoom;
      var tz = 'scale(' + this.zoom.toFixed(4) + ')';
      this.halo.style.transform = tz; this.ball.style.transform = tz; this.shadeEl.style.transform = tz;
    }
    this.proj.scale(R).translate([cx, cy]).rotate([-this.lon, -this.lat]);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    // cuadrícula como renglones de cuaderno
    ctx.setLineDash([2, 6]); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.stroke(new Path2D(this.path(this.grat))); ctx.setLineDash([]);
    if (landFeature) {
      var lp = new Path2D(this.path(landFeature));
      ctx.save(); ctx.translate(R * .006, R * .022); ctx.fillStyle = 'rgba(123,93,206,.38)'; ctx.fill(lp); ctx.restore();
      ctx.fillStyle = '#C6F3DA'; ctx.fill(lp);
      ctx.fillStyle = this.dots; ctx.fill(lp);
      ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.6, R * .009); ctx.strokeStyle = '#fff'; ctx.stroke(lp);
    }
    ctx.restore();
    // nubes de algodón
    var drift = reduce ? 0 : this.time * 1.4;
    CLOUDS.forEach(function (cl, i) {
      var p = self.project(cl[0] + drift * (i % 2 ? 1 : .7), cl[1], .07);
      if (p.z < .2) return;
      ctx.globalAlpha = Math.min(1, (p.z - .2) * 3.2);
      self.cloud(p.x, p.y, R * .07 * cl[2] * (.7 + .3 * p.z));
    });
    ctx.globalAlpha = 1;
    // rutas de gira
    this.routes.forEach(function (rt) { self.drawRoute(rt); });
    // puntos de parada y sombra bajo cada chibi
    this.markers.forEach(function (m) {
      var own = self.sel === m.id || m.alat == null;
      var p = own ? self.project(m.lon, m.lat, 0) : self.project(m.alon, m.alat, 0), ox = own ? 0 : (m.dx || 0), oy = own ? 0 : (m.dy || 0);
      m.screen = { x: p.x + ox, y: p.y + oy, z: p.z, front: p.z > .12 };
      if (p.z <= .05) return;
      ctx.globalAlpha = Math.min(1, p.z * 3);
      ctx.fillStyle = 'rgba(46,33,80,.22)'; ctx.beginPath(); ctx.ellipse(p.x + ox, p.y + 1 + oy, 15 * (.7 + .3 * p.z), 5, 0, 0, TAU); ctx.fill();
      if (!own) { p = self.project(m.lon, m.lat, 0); if (p.z <= .05) { ctx.globalAlpha = 1; return; } }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, TAU); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#2E2150'; ctx.stroke();
      ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    });
    // tú: corazón con la palabra "Tú"
    if (this.me) {
      var mp = this.project(this.me.lon, this.me.lat, 0);
      if (mp.z > .05) {
        ctx.globalAlpha = Math.min(1, mp.z * 3);
        var pr = reduce ? 0 : (this.time % 2.2) / 2.2;
        ctx.strokeStyle = 'rgba(255,95,168,' + (1 - pr).toFixed(2) + ')'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(mp.x, mp.y, 6 + pr * 22, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#FF5FA8'; ctx.strokeStyle = '#2E2150'; ctx.lineWidth = 2;
        var hs = 7; ctx.beginPath(); ctx.moveTo(mp.x, mp.y + hs * .9);
        ctx.bezierCurveTo(mp.x - hs * 1.5, mp.y - hs * .1, mp.x - hs * .8, mp.y - hs * 1.2, mp.x, mp.y - hs * .4);
        ctx.bezierCurveTo(mp.x + hs * .8, mp.y - hs * 1.2, mp.x + hs * 1.5, mp.y - hs * .1, mp.x, mp.y + hs * .9); ctx.fill(); ctx.stroke();
        ctx.font = '400 13px Jua, "Baloo 2", sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(this.me.label, mp.x, mp.y + 22); ctx.fillStyle = '#2E2150'; ctx.fillText(this.me.label, mp.x, mp.y + 22);
        ctx.globalAlpha = 1;
      }
    }
    this.placePins();
  };
  Globe.prototype.cloud = function (x, y, s) {
    var ctx = this.ctx, TAU = Math.PI * 2, blobs = [[0, 0, 1], [-.95, .3, .68], [.95, .32, .62], [.4, -.42, .72], [-.4, -.3, .6]];
    ctx.fillStyle = 'rgba(185,164,238,.55)';
    ctx.beginPath(); blobs.forEach(function (b) { ctx.moveTo(x + b[0] * s + b[2] * s, y + b[1] * s + s * .3); ctx.arc(x + b[0] * s, y + b[1] * s + s * .3, b[2] * s, 0, TAU); }); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); blobs.forEach(function (b) { ctx.moveTo(x + b[0] * s + b[2] * s, y + b[1] * s); ctx.arc(x + b[0] * s, y + b[1] * s, b[2] * s, 0, TAU); }); ctx.fill();
  };
  Globe.prototype.drawRoute = function (rt) {
    var ctx = this.ctx, self = this, sel = this.sel === rt.id, faded = this.sel && !sel;
    if (faded && !rt.lead) return;
    var pts = rt.samples.map(function (s) { return self.project(s[0], s[1], s[2]); });
    var path = new Path2D(), on = false;
    pts.forEach(function (p) { if (p.vis) { if (on) path.lineTo(p.x, p.y); else path.moveTo(p.x, p.y); on = true; } else on = false; });
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var a = rt.past ? .45 : 1;
    ctx.globalAlpha = (faded ? .25 : sel ? 1 : .7) * a;
    ctx.lineWidth = sel ? 8 : 6; ctx.strokeStyle = '#fff'; ctx.stroke(path);
    ctx.lineWidth = sel ? 3.6 : 2.6; ctx.strokeStyle = rt.color;
    ctx.setLineDash(sel ? [9, 8] : [.1, 7]); ctx.lineDashOffset = reduce ? 0 : -this.time * (sel ? 26 : 14);
    ctx.stroke(path); ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // avioncito de papel
    if (rt.lead && !reduce && !faded) {
      var n = pts.length - 1, u = ((this.time * .16 + rt.phase) % 1) * n, i = Math.floor(u), f = u - i;
      var p0 = pts[i], p1 = pts[Math.min(n, i + 1)];
      if (p0.vis && p1.vis) {
        var x = p0.x + (p1.x - p0.x) * f, y = p0.y + (p1.y - p0.y) * f, ang = Math.atan2(p1.y - p0.y, p1.x - p0.x), s = sel ? 11 : 8.5;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2E2150'; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s, -s * .75); ctx.lineTo(-s * .45, 0); ctx.lineTo(-s, s * .75); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = rt.color; ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * .45, 0); ctx.lineTo(-s, s * .75); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
    // paradas de la gira elegida con su nombre
    if (sel && rt.stops) {
      var boxes = [];
      var mk = this.markers.filter(function (m) { return m.id === rt.id; })[0];
      if (mk && mk.screen) boxes.push([mk.screen.x - 34, mk.screen.y - 80, mk.screen.x + 34, mk.screen.y + 12]);
      ctx.font = '400 13px Jua, "Baloo 2", sans-serif';
      rt.stops.forEach(function (st, j) {
        var p = self.project(st.lon, st.lat, 0); if (p.z < .1) return;
        var tw = ctx.measureText(st.label).width, box = [p.x - tw / 2 - 3, p.y + 8, p.x + tw / 2 + 3, p.y + 25];
        st.hideLabel = boxes.some(function (q) { return box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]; });
        if (!st.hideLabel) boxes.push(box);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2E2150'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = rt.color; ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2); ctx.fill();
        if (st.first || st.hideLabel) return;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(st.label, p.x, p.y + 20);
        ctx.fillStyle = '#2E2150'; ctx.fillText(st.label, p.x, p.y + 20);
      });
    }
  };
  Globe.prototype.placePins = function () {
    var self = this, zs = clamp(.85 + (self.zoom - 1) * .3, .85, 1.25);
    this.markers.forEach(function (m) {
      var el = self.pinEls[m.id]; if (!el || !m.screen) return;
      var s = m.screen, front = s.front, sc = (.74 + .26 * Math.max(0, s.z)) * zs * (self.starId === m.id ? 1.3 : 1);
      var x = s.x - m.pw / 2, y = s.y - m.ph * .97;
      var key = front ? (x.toFixed(1) + ',' + y.toFixed(1) + ',' + sc.toFixed(3)) : 'away';
      if (key === el._t) return;
      el._t = key;
      if (!front) { el.classList.add('away'); return; }
      el.classList.remove('away');
      el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + sc.toFixed(3) + ')';
      el.style.zIndex = String(Math.round(s.z * 100) + 10);
    });
    this.sights.forEach(function (sg) {
      var el = self.sightEls[sg.sid]; if (!el) return;
      var p = self.project(sg.lon, sg.lat, 0), front = p.z > .15;
      var key = front ? (p.x.toFixed(1) + ',' + p.y.toFixed(1)) : 'away';
      if (key === el._t) return;
      el._t = key;
      if (!front) { el.classList.add('away'); return; }
      el.classList.remove('away');
      el.style.transform = 'translate3d(' + (p.x - 17 + (sg.dx || 0)).toFixed(1) + 'px,' + (p.y - 17).toFixed(1) + 'px,0)';
      el.style.zIndex = String(Math.round(p.z * 10));
    });
  };

  /* marcadores y rutas a partir de los estados */
  function buildGeo() {
    var o = origin(), markers = [], routes = [];
    states.forEach(function (st) {
      var color = gColor(st.id), city = place(st.pos.city), label;
      if (st.mode === 'live') label = 'LIVE';
      else if (st.mode === 'next') label = dday(st.cur);
      else label = 'zZ';
      var list = lineupOf(st);
      markers.push({
        id: st.id, name: st.g.name, lat: st.pos.lat, lon: st.pos.lon, color: color, mode: st.mode, label: label, list: list,
        cw: crowdLayout(Math.max(1, list.length), pinWidth()).w,
        aria: st.g.name + ', ' + (st.mode === 'rest' ? t('rest') : city + ', ' + fmtKm(hav(o.lat, o.lon, st.pos.lat, st.pos.lon)) + ' km')
      });
      // ruta: de la última parada pasada a la actual, y de ahí todas las que vienen
      var ss = st.upStops.map(function (s) { return { lat: s[0].lat, lon: s[0].lon, label: place(s[0].city).split(' (')[0] }; });
      if (!ss.length) return;
      var prev = st.past.length ? st.past[st.past.length - 1] : null;
      var chain = [];
      if (prev && prev.city !== st.upStops[0][0].city) chain.push({ lat: prev.lat, lon: prev.lon, past: true });
      chain = chain.concat(ss);
      ss[0].first = true;
      for (var i = 0; i < chain.length - 1; i++) {
        var a = chain[i], b = chain[i + 1];
        if (hav(a.lat, a.lon, b.lat, b.lon) < 30) continue;
        var interp = d3.geoInterpolate([a.lon, a.lat], [b.lon, b.lat]), ang = d3.geoDistance([a.lon, a.lat], [b.lon, b.lat]);
        var h = .03 + .22 * Math.min(1, ang / 2.2), samples = [];
        for (var j = 0; j <= 48; j++) { var u = j / 48, q = interp(u); samples.push([q[0], q[1], h * Math.sin(Math.PI * u)]); }
        var isLead = a.past ? false : (i === (chain[0].past ? 1 : 0));
        routes.push({ id: st.id, color: color, samples: samples, past: !!a.past, lead: isLead, phase: (i * .37 + st.id.length * .11) % 1, stops: i === (chain[0].past ? 1 : 0) ? ss : null });
      }
      if (!routes.some(function (r) { return r.id === st.id && r.stops; })) routes.push({ id: st.id, color: color, samples: [], stops: ss });
    });
    // separa chibis que caen en la misma ciudad
    var groups = [];
    markers.forEach(function (m) {
      var g = groups.filter(function (gr) { return gr.some(function (o) { return hav(o.lat, o.lon, m.lat, m.lon) < 2300; }); })[0];
      if (g) g.push(m); else groups.push([m]);
    });
    // grupos en la misma zona: en filas de hasta 3 (la de atrás un poco más arriba) para que nadie tape a nadie
    groups.forEach(function (gr) {
      if (gr.length === 1) return;
      // centro de la región: la foto grupal se arma ahí; al elegir un grupo, vuelve a su ciudad exacta
      var cl = gr.reduce(function (a, m) { return [a[0] + m.lat / gr.length, a[1] + m.lon / gr.length]; }, [0, 0]);
      gr.forEach(function (m) { m.alat = cl[0]; m.alon = cl[1]; });
      var cols = gr.length <= 3 ? gr.length : Math.ceil(gr.length / 2), maxH = 0;
      gr.forEach(function (m) { maxH = Math.max(maxH, crowdLayout(Math.max(1, m.list.length), pinWidth()).h); });
      for (var r = 0; r * cols < gr.length; r++) {
        var row = gr.slice(r * cols, r * cols + cols), total = row.reduce(function (a, m) { return a + m.cw * .86; }, 0), x = -total / 2;
        row.forEach(function (m, i) {
          m.dx = x + m.cw * .43; x += m.cw * .86;
          m.dy = -r * maxH * .62;
          m.low = gr.length > cols ? r === 0 : i % 2 === 1;
        });
      }
    });
    return { markers: markers, routes: routes };
  }

  /* ================= sonar ================= */
  var MAXKM = 20015;
  function sonarR(km) { return 88 * Math.sqrt(Math.min(km, MAXKM) / MAXKM); }
  function sizeSonar() {
    var v = $('#sonarView'), so = $('#sonar'); if (!v || v.hidden) return;
    var big = innerWidth >= 1024, sz = Math.max(220, Math.min(v.clientWidth - 24, v.clientHeight - (big ? 200 : 150), 600));
    so.style.width = so.style.height = sz + 'px';
  }
  function renderSonar() {
    sizeSonar();
    var o = origin(), s = '<svg viewBox="0 0 200 200" aria-hidden="true">';
    s += '<circle cx="102" cy="104" r="92" fill="#B9A4EE"/><circle cx="100" cy="100" r="92" fill="#fff" stroke="#2E2150" stroke-width="1.6"/>';
    s += '<circle cx="100" cy="100" r="88" fill="#E6F8EF"/>';
    for (var a = 0; a < 360; a += 30) s += '<line x1="100" y1="100" x2="' + (100 + 88 * Math.sin(a * K)).toFixed(1) + '" y2="' + (100 - 88 * Math.cos(a * K)).toFixed(1) + '" stroke="#B5E6CF" stroke-width=".7"/>';
    [2500, 5000, 10000, 15000].forEach(function (km, i) {
      var r = sonarR(km);
      s += '<circle cx="100" cy="100" r="' + r.toFixed(1) + '" fill="none" stroke="' + (i % 2 ? '#FFB3D4' : '#9FD8F0') + '" stroke-width="1.3" stroke-dasharray="1.5 3" stroke-linecap="round"/>';
      s += '<text x="101.5" y="' + (100 - r - 1.5).toFixed(1) + '" font-family="Baloo 2, sans-serif" font-weight="700" font-size="5" fill="#5A4B82">' + fmtKm(km) + ' km</text>';
    });
    var C = L().cardinal;
    [[100, 4.5, C[0]], [197, 101.8, C[1]], [100, 199, C[2]], [3, 101.8, C[3]]].forEach(function (c) {
      s += '<text x="' + c[0] + '" y="' + c[1] + '" text-anchor="middle" font-family="Jua, sans-serif" font-size="7" fill="#2E2150">' + c[2] + '</text>';
    });
    $('#sonarPlate').innerHTML = s + '</svg>';
    $('#sonarMe').innerHTML = esc(t('you')) + (o.geo ? '' : ' · ' + esc(place(o.name)));
    var html = '';
    // posición real y luego un pequeño relajo para que no se monten los que están cerca entre sí
    states.forEach(function (st) {
      var km = hav(o.lat, o.lon, st.pos.lat, st.pos.lon), b = bearing(o.lat, o.lon, st.pos.lat, st.pos.lon) * K, r = sonarR(km);
      st.sonar = { x: 100 + r * Math.sin(b), y: 100 - r * Math.cos(b), km: km };
      st.sonar.tx = st.sonar.x; st.sonar.ty = st.sonar.y;
    });
    var MIN = states.length > 6 ? 44 : 36;
    for (var it = 0; it < 120; it++) {
      states.forEach(function (a, i) {
        states.forEach(function (b2, j) {
          if (j <= i) return;
          var dx = b2.sonar.x - a.sonar.x, dy = b2.sonar.y - a.sonar.y, d = Math.hypot(dx, dy) || .01;
          if (d < MIN) { var push = (MIN - d) / 2, ux = dx / d, uy = dy / d; a.sonar.x -= ux * push; a.sonar.y -= uy * push; b2.sonar.x += ux * push; b2.sonar.y += uy * push; }
        });
      });
      states.forEach(function (st) { var cx = st.sonar.x - 100, cy = st.sonar.y - 100, d = Math.hypot(cx, cy); if (d > 80) { st.sonar.x = 100 + cx / d * 80; st.sonar.y = 100 + cy / d * 80; } });
    }
    states.forEach(function (st) {
      var x = st.sonar.x, y = st.sonar.y, km = st.sonar.km;
      var lab = st.mode === 'live' ? 'LIVE' : st.mode === 'next' ? dday(st.cur) : 'zZ';
      html += '<button type="button" class="blip ' + st.mode + '" data-pick="' + esc(st.id) + '" aria-pressed="' + (sel === st.id) + '" style="left:' + (x / 2).toFixed(2) + '%;top:' + (y / 2).toFixed(2) + '%;' + gStyle(st.id) + '" aria-label="' + esc(st.g.name + ', ' + (st.mode === 'rest' ? t('rest') : place(st.pos.city)) + ', ' + fmtKm(km) + ' km') + '">' +
        '<span class="blip-face">' + faceImg(st.id) + '</span><span class="blip-l">' + esc(st.g.name) + ' <i>' + esc(lab) + '</i></span></button>';
    });
    $('#sonarBlips').innerHTML = html;
    renderSonarLine();
  }
  function renderSonarLine() {
    var st = sel && stOf(sel), svg = $('#sonarLine');
    svg.setAttribute('viewBox', '0 0 200 200');
    if (!st || !st.sonar) { svg.innerHTML = ''; return; }
    var c = gColor(st.id);
    svg.innerHTML = (Math.hypot(st.sonar.x - st.sonar.tx, st.sonar.y - st.sonar.ty) > 2 ? '<circle cx="' + st.sonar.tx.toFixed(1) + '" cy="' + st.sonar.ty.toFixed(1) + '" r="2.4" fill="' + c + '" stroke="#2E2150" stroke-width=".8"/>' : '') + '<line x1="100" y1="100" x2="' + st.sonar.x.toFixed(1) + '" y2="' + st.sonar.y.toFixed(1) + '" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>' +
      '<line x1="100" y1="100" x2="' + st.sonar.x.toFixed(1) + '" y2="' + st.sonar.y.toFixed(1) + '" stroke="' + c + '" stroke-width="1.6" stroke-dasharray="3 3" stroke-linecap="round"/>' +
      '<text x="' + ((100 + st.sonar.x) / 2).toFixed(1) + '" y="' + ((100 + st.sonar.y) / 2 - 3).toFixed(1) + '" text-anchor="middle" font-family="Jua, sans-serif" font-size="6.5" fill="' + c + '" stroke="#fff" stroke-width="2" paint-order="stroke">' + fmtKm(st.sonar.km) + ' km</text>';
  }

  /* ================= render de la interfaz ================= */
  var sel = null, view = 'globe', globe = null;
  var feed = [], feedOk = true, lastCheck = Date.now();

  function applyStatic() {
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
    $('#muteBtn').setAttribute('aria-label', Sound.muted ? t('unmute') : t('mute'));
  }
  function stateLine(st) {
    if (st.mode === 'live') return '<b>LIVE</b> ' + esc(place(st.cur.city).split(' (')[0]);
    if (st.mode === 'next') return '<b>' + esc(dday(st.cur)) + '</b> ' + esc(place(st.cur.city).split(' (')[0]);
    return '<b lang="ko">쉬는 중</b> ' + esc(t('restWhere'));
  }
  function renderRail() {
    $('#rail').innerHTML = states.map(function (st) {
      return '<button type="button" class="r-item ' + st.mode + '" data-pick="' + esc(st.id) + '" aria-pressed="' + (sel === st.id) + '" style="' + gStyle(st.id) + '">' +
        '<span class="r-face">' + faceImg(st.id) + '</span><span class="r-name' + (st.g.name.length >= 9 ? ' long' : '') + '">' + esc(st.g.name) + '</span><span class="r-st">' + stateLine(st) + '</span></button>';
    }).join('');
  }
  var ICON = {
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4 4 4M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16M12 13v4M10 15h4"/></svg>',
    globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.8 10 Q12 12.5 20.2 10 M12 3.5 Q8 12 12 20.5 M12 3.5 Q16 12 12 20.5"/></svg>',
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="3"/><path d="M8.5 15.5h7M8.5 12.5h4"/><circle cx="12" cy="8" r="1.6"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5C5 15.5 3 12.3 3 9.2 3 6.6 5 4.5 7.6 4.5c1.9 0 3.4 1 4.4 2.6 1-1.6 2.5-2.6 4.4-2.6C19 4.5 21 6.6 21 9.2c0 3.1-2 6.3-9 11.3z"/></svg>'
  };
  function renderFocus() {
    var el = $('#focus'), st = sel && stOf(sel);
    $('#stage').classList.toggle('zoomed', !!st && view === 'globe');
    if (!st || (view === 'sonar' && innerWidth < 600)) { el.hidden = true; el.innerHTML = ''; return; }
    var o = origin(), km = hav(o.lat, o.lon, st.pos.lat, st.pos.lon);
    var where = st.mode === 'rest'
      ? '<b>' + esc(t('rest')) + '</b>' + (st.last ? ' · ' + esc(t('lastStop')) + ': ' + esc(place(st.last.city)) + ', ' + esc(fmtShort(st.last.local_date)) + ' ' + parts(st.last.local_date).y : '')
      : '<b>' + esc(place(st.cur.city)) + '</b>, ' + esc(place(st.cur.country)) + ' · ' + fmtKm(km) + ' km';
    var lu = lineupOf(st); if (lu.length < members(st.id).length) where += '<br>' + esc(t('withUnit', { names: lu.map(function (m) { return m.name; }).join(' & ') }));
    el.hidden = false;
    el.setAttribute('style', gStyle(st.id));
    el.innerHTML = '<span class="f-face">' + faceImg(st.id) + '</span>' +
      '<div><p class="f-name">' + esc(st.g.name) + (META[st.id] ? ' <small lang="ko">' + esc(META[st.id].ko) + '</small>' : '') + '</p><p class="f-where">' + where + '</p></div>' +
      '<div class="f-dday">' + (st.mode === 'live' ? 'LIVE' : st.mode === 'next' ? esc(dday(st.cur)) : 'zZ') + '</div>' +
      '<div class="f-acts"><button type="button" class="act solid" data-share="' + esc(st.id) + '">' + ICON.share + esc(t('share')) + '</button>' +
      '<a class="act" href="#card-' + esc(st.id) + '" data-goto="' + esc(st.id) + '">' + ICON.card + esc(t('seeCard')) + '</a>' +
      (st.cur ? '<button type="button" class="act ico" data-ics="' + esc(st.id) + '" aria-label="' + esc(t('calendar')) + '">' + ICON.cal + '</button>' : '') + '</div>' +
      '<button type="button" class="f-x" data-unsel aria-label="' + esc(t('close')) + '">' + ICON.x + '</button>';
  }
  function renderNear() {
    var o = origin(), best = null, ms = now();
    states.forEach(function (st) {
      st.up.forEach(function (e) { var d = hav(o.lat, o.lon, e.lat, e.lon); if (!best || d < best.d) best = { d: d, e: e, st: st }; });
    });
    var el = $('#nearCard'), note = $('#geoNote');
    if (geoState === 'asking') { note.hidden = false; note.innerHTML = '<span class="geo-dot" aria-hidden="true"></span>' + esc(t('geoLooking')); }
    else if ((geoState === 'denied' || geoState === 'fail') && originIdx !== -1) { note.hidden = false; note.innerHTML = esc(t('geoNote')) + ' <button type="button" class="link-btn" data-geo-retry>' + esc(t('retry')) + '</button>'; }
    else note.hidden = true;
    if (!best) { el.innerHTML = '<div class="nearest"><p class="n-v">' + esc(t('nothingNear')) + '</p></div>'; return; }
    var e = best.e;
    e.t = Date.parse(e.start);
    el.innerHTML = '<div class="nearest" style="' + gStyle(best.st.id) + '"><span class="n-face">' + faceImg(best.st.id) + '</span>' +
      '<p class="n-k">' + esc(t('nearest')) + ' · ' + esc(originLabel()) + '</p>' +
      '<p class="n-v"><b>' + esc(best.st.g.name) + '</b> · ' + esc(place(e.city)) + '</p>' +
      '<p class="n-s">' + fmtKm(best.d) + ' km · ' + esc(fmtDate(e.local_date)) + ' · ' + esc(ms >= e.t ? t('live') : dday(e)) + '</p></div>';
  }
  function cdTiles(start) {
    var lab = [['일', 'days'], ['시', 'hours'], ['분', 'mins'], ['초', 'secs']];
    return '<div class="cd" data-cd="' + esc(start) + '">' + lab.map(function (l) {
      return '<div class="cd-t"><div class="cd-n"><span>00</span></div><div class="cd-l"><span class="ko" lang="ko">' + l[0] + '</span>' + esc(t(l[1])) + '</div></div>';
    }).join('') + '</div>';
  }
  function squadHtml(st) {
    var all = members(st.id); if (!all.length) return '';
    var on = lineupOf(st).map(function (m) { return m.id; }), unit = on.length < all.length;
    return '<div class="squad-wrap"><p class="squad-k">' + esc(t('squad')) + (unit ? ' · <b>' + esc(t('withUnit', { names: lineupOf(st).map(function (m) { return m.name; }).join(' & ') })) + '</b>' : '') + '</p><ul class="squad" data-n="' + all.length + '">' + all.map(function (m, i) {
      var off = unit && on.indexOf(m.id) < 0;
      return '<li><button type="button" class="mem' + (off ? ' off' : '') + '" data-mem="' + esc(st.id + ':' + m.id) + '" data-i="' + i + '" aria-label="' + esc(m.name + (off ? ', ' + t('notOnTour') : '')) + '" style="--dl:-' + (i * .37 % 2.6).toFixed(2) + 's">' +
        '<span class="mem-say" lang="ko" aria-hidden="true">' + esc(m.ko) + '!</span><img src="' + esc(memberSrc(st.id, m.id)) + '" alt="" loading="lazy" decoding="async" draggable="false"><span class="mem-n">' + esc(m.name) + '</span></button></li>';
    }).join('') + '</ul></div>';
  }
  function triviaHtml(gid) {
    var q = TRIVIA[gid]; if (!q) return '';
    return '<details class="agenda trivia"><summary>' + esc(t('triviaTitle')) + ' <span class="ko" lang="ko">퀴즈</span></summary><ol class="tq">' + q.map(function (x, i) {
      return '<li data-q="' + i + '"><p>' + esc(lang === 'en' ? x[1] : x[0]) + '</p><div class="tq-o">' + x[2].map(function (o, j) {
        return '<button type="button" class="chip-btn" data-trivia="' + esc(gid + ':' + i + ':' + j) + '">' + esc(o) + '</button>';
      }).join('') + '</div><p class="tq-r" aria-live="polite"></p></li>';
    }).join('') + '</ol><p class="tq-score" aria-live="polite"></p></details>';
  }
  /* venta de boletas: sticker cuando la venta está a 14 días o menos (campo opcional onsale del evento) */
  function onsaleHtml(st) {
    var ms = now(), best = null;
    st.up.forEach(function (e) { if (!e.onsale) return; var t0 = Date.parse(e.onsale); if (isNaN(t0) || t0 + 864e5 < ms || t0 - ms > 14 * 864e5) return; if (!best || t0 < best.t) best = { t: t0, e: e }; });
    if (!best) return '';
    var a = new Date(ms); a.setHours(0, 0, 0, 0); var b = new Date(best.t); b.setHours(0, 0, 0, 0);
    var d = Math.round((b - a) / 864e5);
    if (d <= 0) return '<p class="onsale today"><span class="ko" lang="ko">티켓팅</span> ' + esc(t('onsaleToday')) + ' <small>' + esc(place(best.e.city)) + ' · ' + esc(myTime(best.t)) + '</small></p>';
    return '<p class="onsale"><span class="ko" lang="ko">티켓팅</span> ' + esc(t('onsaleIn', { d: 'D-' + d, when: myTime(best.t) })) + ' <small>' + esc(place(best.e.city)) + '</small></p>';
  }
  function cardHtml(st) {
    var g = st.g, o = origin(), m = META[g.id] || {}, h = '';
    h += '<article class="card ' + (sel === g.id ? 'is-sel' : '') + '" id="card-' + esc(g.id) + '" data-g="' + esc(g.id) + '" style="' + gStyle(g.id) + '">';
    h += '<span class="tape" aria-hidden="true"></span>';
    h += '<div class="c-top"><div class="c-face">' + faceImg(g.id, '', '') + '</div><div class="c-id">' +
      (m.ko ? '<p class="c-ko" lang="ko">' + esc(m.ko) + '</p>' : '') + '<h3 class="c-name' + (g.name.length >= 9 && /^\S+$/.test(g.name) ? ' xlong' : g.name.length >= 7 ? ' long' : '') + '">' + esc(g.name) + '</h3>' +
      '<p class="c-tour">' + esc(tourName(g.tour)) + '</p></div>' +
      '<button type="button" class="bias" data-bias="' + esc(g.id) + '" aria-pressed="' + (bias === g.id) + '" aria-label="' + esc(t('bias')) + ': ' + esc(g.name) + '">' + ICON.heart + '</button></div>';
    if (st.mode === 'rest') {
      h += '<span class="c-state rest"><span class="ko" lang="ko">' + t('restKo') + '</span> ' + esc(t('rest')) + '</span>';
      if (st.last) h += '<p class="c-when">' + esc(t('lastStop')) + ': <b>' + esc(place(st.last.city)) + ', ' + esc(place(st.last.country)) + '</b> · ' + esc(fmtDate(st.last.local_date, true)) + (st.last.venue ? ' · ' + esc(st.last.venue) : '') + '</p>';
      h += '<div class="cd-rest"><b>D-?</b><span>' + (m.cheer ? '<span lang="ko" class="ko">' + esc(m.cheer) + '</span> ' + esc(m.hint[lang]) + '. ' : '') + esc(lang === 'en' ? 'The chibi waits in Seoul until there are new dates.' : 'El chibi espera en Seúl hasta que haya fechas nuevas.') + '</span></div>';
    } else {
      var e = st.cur, km = hav(o.lat, o.lon, e.lat, e.lon), live = st.mode === 'live';
      h += '<span class="c-state ' + (live ? 'live' : '') + '"><span class="ko" lang="ko">' + (live ? t('liveKo') : t('nextKo')) + '</span> ' + esc(live ? t('live') : t('next')) + '</span>';
      h += '<p class="c-where">' + esc(place(e.city)) + '<small>' + esc(place(e.country)) + (e.venue ? ' · ' + esc(e.venue) : '') + '</small></p>';
      h += '<p class="c-when"><b>' + esc(fmtDate(e.local_date)) + ', ' + esc(e.start.slice(11, 16)) + '</b> ' + esc(t('localTime')) +
        (e.status === 'anunciado' ? ' <span class="tag">' + esc(t('announced')) + '</span>' : '') + '<br>' + esc(t('yourTime')) + ': ' + esc(myTime(e.t)) + '</p>';
      h += onsaleHtml(st);
      h += live ? '<div class="cd-live"><span class="ko" lang="ko">지금 무대 위!</span>' + esc(lang === 'en' ? 'On stage right now' : 'En el escenario ahora mismo') + '</div>' : cdTiles(e.start);
      h += '<div class="facts"><span class="km">' + fmtKm(km) + ' <small>' + esc(t('kmFrom', { city: originRef() })) + '</small></span><span class="fly">' + esc(t('flight', { h: flightH(km) })) + '</span><span class="dday">' + esc(live ? 'LIVE' : dday(e)) + '</span></div>';
    }
    h += '<div class="acts"><button type="button" class="act solid" data-share="' + esc(g.id) + '">' + ICON.share + esc(t('share')) + '</button>' +
      '<button type="button" class="act" data-pick="' + esc(g.id) + '" data-top="1" aria-label="' + esc(t('seeGlobe')) + '">' + ICON.globe + esc(t('globe')) + '</button>' +
      (st.cur ? '<button type="button" class="act" data-ics="' + esc(g.id) + '" aria-label="' + esc(t('calendar')) + '">' + ICON.cal + esc(t('calShort')) + '</button>' : '') + '</div>';
    var watch = lang === 'en' && g.watch_en && g.watch_en.length ? g.watch_en : g.watch;
    if (watch && watch.length) h += '<ul class="watch" lang="' + (watch === g.watch_en ? 'en' : 'es') + '">' + watch.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
    h += squadHtml(st);
    var ph = photoOf(g.id);
    if (ph) h += '<figure class="polaroid"><img src="' + esc(ph.src) + '"' + (ph.w ? ' width="' + ph.w + '" height="' + ph.h + '"' : '') + ' alt="' + esc(t('photoAlt', { g: g.name })) + '" loading="lazy" decoding="async"><figcaption>' + esc(g.name) + (m.fan ? ' · ' + esc(m.fan) : '') + '</figcaption></figure>';
    h += triviaHtml(g.id);
    var rows = st.upStops;
    if (rows.length > 1 || (st.mode === 'rest' && st.past.length)) {
      var list = rows.length ? rows : stops(st.past).slice(-6);
      var isPast = !rows.length;
      h += '<details class="agenda"><summary>' + esc(t(isPast ? 'pastTour' : 'tour', { n: list.length })) + '</summary><ul class="stubs">' + list.map(function (r) {
        var e0 = r[0], d = hav(o.lat, o.lon, e0.lat, e0.lon);
        var dates = r.map(function (x) { return parts(x.local_date).d; }).join(' · ') + ' ' + L().months[parts(e0.local_date).m - 1];
        return '<li class="stub' + (isPast ? ' past' : '') + '"><span class="s-d">' + esc(dates) + '</span><span class="s-c">' + esc(place(e0.city)) + ', ' + esc(place(e0.country)) +
          (e0.venue ? '<span>' + esc(e0.venue) + '</span>' : '') + '</span><span class="s-k">' + fmtKm(d) + ' km</span></li>';
      }).join('') + '</ul></details>';
    }
    return h + '</article>';
  }
  function renderCards() {
    var open = {};
    $$('#cards details[open]').forEach(function (d) { open[d.closest('.card').getAttribute('data-g')] = 1; });
    $('#cards').innerHTML = states.map(cardHtml).join('');
    Object.keys(open).forEach(function (id) { var d = $('#card-' + id + ' details'); if (d) d.open = true; });
    tick(true);
  }
  function feedKey(a) { return [a.type, a.group, a.title, a.when].join('|'); }
  function renderFeed() {
    var el = $('#feed');
    if (!feed.length) {
      el.innerHTML = '<li class="bub empty"><span class="bub-face">' + faceImg('default') + '</span><div class="bub-body"><p class="bub-b">' + esc(t('emptyFeed')) + '</p></div></li>';
      return;
    }
    el.innerHTML = feed.slice(0, 12).map(function (a) {
      var title = esc(a.title);
      if (a.url && /^https?:\/\//.test(a.url)) title = '<a href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">' + title + '</a>';
      return '<li class="bub" style="' + gStyle(a.group || 'default') + '"><span class="bub-face">' + faceImg(a.group) + '</span><div class="bub-body">' +
        '<div class="bub-h"><span class="typ">' + esc((L().T[a.type]) || 'Info') + '</span><span>' + esc(a.group_name || '') + '</span><time datetime="' + esc(a.when) + '">' + esc(t('ago', { n: agoTxt(now() - Date.parse(a.when)) })) + '</time></div>' +
        '<p class="bub-t">' + title + '</p><p class="bub-b">' + esc(a.body || '') + '</p></div></li>';
    }).join('');
  }
  function renderSources() {
    $('#sources').innerHTML = (data.sources || []).map(function (s) {
      return /^https?:\/\//.test(s.url) ? '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name) + '</a></li>' : '';
    }).join('');
    $('#moonChibis').innerHTML = data.groups.map(function (g, i) { return '<img src="' + esc(face(g.id).src) + '" alt="" style="--r:' + ((i % 2 ? 1 : -1) * (6 + i * 2)) + 'deg" decoding="async">'; }).join('');
  }
  function renderMeta() {
    var u = new Date(data.updated_at || Date.now());
    var when = lang === 'en' ? L().months[u.getMonth()] + ' ' + u.getDate() + ', ' + String(u.getHours()).padStart(2, '0') + ':' + String(u.getMinutes()).padStart(2, '0')
      : u.getDate() + ' ' + L().months[u.getMonth()] + ', ' + String(u.getHours()).padStart(2, '0') + ':' + String(u.getMinutes()).padStart(2, '0');
    var el = $('#meta');
    el.className = feedOk ? '' : 'off';
    el.textContent = feedOk ? t('agendaOf', { when: when }) + ' · ' + t('checkedAgo', { ago: agoTxt(Date.now() - lastCheck) }) : t('offline', { when: when });
  }
  function renderOrigins() {
    var s = $('#origin');
    s.innerHTML = (geoOrigin ? '<option value="-1">' + esc(t('myLocation') + (geoOrigin.near ? ' (' + t('geoNear', { city: place(geoOrigin.near) }) + ')' : '')) + '</option>' : '') +
      ORIGINS.map(function (c, i) { return '<option value="' + i + '">' + esc(place(c[0])) + (c[1] ? ', ' + esc(place(c[1])) : '') + '</option>'; }).join('');
    s.value = String(originIdx);
  }
  var sigNow = '';
  function renderAll() {
    computeStates();
    sigNow = modeSig();
    applyStatic();
    renderOrigins();
    renderRail();
    renderFocus();
    renderNear();
    renderCards();
    renderFeed();
    renderSources();
    renderMeta();
    if (globe) { var gd = buildGeo(); globe.setData(gd.markers, gd.routes); globe.setSel(sel); var o = origin(); globe.me = { lat: o.lat, lon: o.lon, label: t('you2') }; }
    if (view === 'sonar') renderSonar();
    renderForm();
    renderSights();
    renderChanges();
  }

  /* cuenta regresiva: solo cambia el dígito que cambió, rodando hacia abajo */
  function setDigit(cell, v, instant) {
    var cur = cell.querySelector('span:not(.out)');
    if (cur && cur.textContent === v) return;
    if (!cur || reduce || instant) { cell.innerHTML = '<span>' + v + '</span>'; return; }
    $$('span.out', cell).forEach(function (o) { o.remove(); });
    cur.className = 'out';
    var n = document.createElement('span'); n.className = 'in'; n.textContent = v; cell.appendChild(n);
    setTimeout(function () { if (cur.parentNode) cur.remove(); }, 460);
  }
  var lastTick = 0;
  function tick(force) {
    var ms = now();
    $$('[data-cd]').forEach(function (el) {
      var tt = Date.parse(el.getAttribute('data-cd')), d = Math.max(0, tt - ms);
      var v = [Math.floor(d / 864e5), Math.floor(d / 36e5) % 24, Math.floor(d / 6e4) % 60, Math.floor(d / 1e3) % 60];
      var cells = $$('.cd-n', el);
      v.forEach(function (x, i) { setDigit(cells[i], String(x).padStart(2, '0'), force); });
    });
    if (!force && Date.now() - lastTick > 900) {
      lastTick = Date.now();
      renderMeta();
      if (modeSig() !== sigNow) renderAll();
    }
  }

  /* ================= selección ================= */
  function pick(id, opts) {
    opts = opts || {};
    var st = stOf(id); if (!st) return;
    if (sel === id && !opts.force) { unselect(); return; }
    sel = id;
    Sound.play('select');
    renderRail(); renderFocus(); renderSonarLine();
    $$('.blip').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pick') === id)); });
    $$('.card').forEach(function (c) { c.classList.toggle('is-sel', c.getAttribute('data-g') === id); });
    if (globe) {
      globe.setSel(id);
      var pe = globe.pinEls[id]; if (pe && !reduce) { pe.classList.remove('hop'); void pe.offsetWidth; pe.classList.add('hop'); }
      var big = globe.w < 600 ? 1.55 : 1.45;
      globe.flyTo(st.pos.lon, st.pos.lat - (globe.w < 600 ? 6 : 3), big, 1500);
      if (!reduce) setTimeout(function () { Sound.play('whoosh'); }, 60);
    }
    hideHint();
    var r = $('.r-item[data-pick="' + id + '"]');
    if (r && r.scrollIntoView) { var rail = $('#rail'); rail.scrollTo({ left: r.offsetLeft - 16, behavior: reduce ? 'auto' : 'smooth' }); }
    if (opts.top) document.getElementById('mundo').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    else if (window.innerWidth >= 1024) {
      var card = document.getElementById('card-' + id);
      if (card) { card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); flash(card); }
    }
  }
  function unselect() {
    sel = null; Sound.play('toggle');
    renderRail(); renderFocus(); renderSonarLine();
    $$('.blip').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    $$('.card').forEach(function (c) { c.classList.remove('is-sel'); });
    if (globe) { globe.setSel(null); globe.flyTo(globe.lon + 12, 8, 1, 1100); globe.idleUntil = performance.now() + 1500; }
  }
  function flash(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); var f = el.querySelector('.c-face'); if (f) { f.classList.remove('cheer'); void f.offsetWidth; f.classList.add('cheer'); } }
  var hintGone = false;
  function hideHint() { if (hintGone) return; hintGone = true; var h = $('#dragHint'); if (h) h.classList.add('gone'); }

  /* ================= tarjeta para compartir (PNG 1080x1920) ================= */
  function loadImg(src) { return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; }); }
  function roundRect(x, X, y, w, h, r) { x.beginPath(); x.moveTo(X + r, y); x.arcTo(X + w, y, X + w, y + h, r); x.arcTo(X + w, y + h, X, y + h, r); x.arcTo(X, y + h, X, y, r); x.arcTo(X, y, X + w, y, r); x.closePath(); }
  function fitFont(x, text, weight, family, max, width) { var s = max; do { x.font = weight + ' ' + s + 'px ' + family; s -= 4; } while (x.measureText(text).width > width && s > 20); return s + 4; }
  function star4(x, cx, cy, r, fill) {
    var k = r * .32; x.beginPath(); x.moveTo(cx, cy - r); x.quadraticCurveTo(cx + k, cy - k, cx + r, cy); x.quadraticCurveTo(cx + k, cy + k, cx, cy + r);
    x.quadraticCurveTo(cx - k, cy + k, cx - r, cy); x.quadraticCurveTo(cx - k, cy - k, cx, cy - r); x.fillStyle = fill; x.fill(); x.lineWidth = 4; x.strokeStyle = '#2E2150'; x.stroke();
  }
  function shareCard(id) {
    var st = stOf(id); if (!st) return Promise.reject();
    var o = origin(), col = gColor(id), m = META[id] || {}, W = 1080, H = 1920;
    var fonts = ['400 120px Jua', '700 60px Gaegu', '700 50px "Baloo 2"', '600 40px "Baloo 2"'].map(function (f) { return document.fonts ? document.fonts.load(f) : null; });
    var ph = photoOf(id);
    return Promise.all(fonts).catch(function () { }).then(function () {
      return Promise.all([loadImg(face(id).src), ph ? loadImg(ph.src).catch(function () { return null; }) : null]);
    }).then(function (ims) {
      var im = ims[0], pim = ims[1];
      var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d');
      x.fillStyle = '#F4EEFF'; x.fillRect(0, 0, W, H);
      x.strokeStyle = '#E7DDFB'; x.lineWidth = 2;
      for (var i = 0; i <= W; i += 48) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
      for (i = 0; i <= H; i += 48) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
      var rg = x.createRadialGradient(W / 2, 560, 40, W / 2, 560, 620); rg.addColorStop(0, 'rgba(255,214,234,.95)'); rg.addColorStop(1, 'rgba(255,214,234,0)');
      x.fillStyle = rg; x.fillRect(0, 0, W, H);
      // logo
      x.save(); x.translate(W / 2, 128); x.rotate(-.03);
      roundRect(x, -250, -52, 500, 104, 52); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 6; x.strokeStyle = '#2E2150'; x.stroke();
      x.font = '400 58px Jua, "Baloo 2"'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#2E2150'; x.fillText('Radar ', -60, 4); x.fillStyle = '#FF5FA8'; x.fillText('K-pop', 110, 4);
      x.restore();
      x.font = '700 44px Gaegu'; x.textAlign = 'center'; x.fillStyle = '#5A4B82'; x.fillText('케이팝 레이더', W / 2, 228);
      // tarjeta
      var cy0 = 560, ch = 1150;
      x.save(); x.translate(W / 2, cy0 + ch / 2); x.rotate(-.012);
      roundRect(x, -450 + 18, -ch / 2 + 24, 900, ch, 64); x.fillStyle = col; x.fill();
      roundRect(x, -450, -ch / 2, 900, ch, 64); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 7; x.strokeStyle = '#2E2150'; x.stroke();
      x.restore();
      // foto oficial completa (sin recortar) como polaroid, y el grupo en chibi delante
      function contain(img, bx, by, bw, bh) { var k = Math.min(bw / img.width, bh / img.height); return [bx + (bw - img.width * k) / 2, by + (bh - img.height * k) / 2, img.width * k, img.height * k]; }
      if (pim) {
        var r = contain(pim, 150, 250, 780, 470);
        x.save(); x.translate(r[0] + r[2] / 2, r[1] + r[3] / 2); x.rotate(.025);
        roundRect(x, -r[2] / 2 - 18, -r[3] / 2 - 18, r[2] + 36, r[3] + 60, 14); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#2E2150'; x.stroke();
        x.drawImage(pim, -r[2] / 2, -r[3] / 2, r[2], r[3]); x.restore();
        var cr = contain(im, 300, 600, 480, 250); x.drawImage(im, cr[0], cr[1], cr[2], cr[3]);
      } else {
        var cr2 = contain(im, 170, 260, 740, 560); x.drawImage(im, cr2[0], cr2[1], cr2[2], cr2[3]);
      }
      star4(x, 210, 340, 46, '#FFD84D'); star4(x, 880, 300, 34, '#FFB3D4'); star4(x, 900, 690, 28, '#FFD84D'); star4(x, 170, 720, 24, '#B9E8FF');
      // textos
      x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      if (m.ko) { x.font = '700 52px Gaegu'; x.fillStyle = col; x.fillText(m.ko, W / 2, 880); }
      fitFont(x, st.g.name, '400', 'Jua, "Baloo 2"', 150, 800);
      x.lineJoin = 'round'; x.lineWidth = 14; x.strokeStyle = '#2E2150'; x.strokeText(st.g.name, W / 2, 1020); x.fillStyle = col; x.fillText(st.g.name, W / 2, 1020);
      var chip, city, sub, big, sub2;
      if (st.mode === 'rest') {
        chip = '쉬는 중 · ' + t('rest'); city = lang === 'en' ? 'Waiting for dates' : 'Esperando fechas'; sub = (m.cheer ? m.cheer + ' · ' : '') + (m.hint ? m.hint[lang] : '');
        big = 'D-?'; sub2 = st.last ? t('lastStop') + ': ' + place(st.last.city) + ', ' + fmtShort(st.last.local_date) + ' ' + parts(st.last.local_date).y : '';
      } else {
        var e = st.cur, km = hav(o.lat, o.lon, e.lat, e.lon);
        chip = (st.mode === 'live' ? '공연 중 · ' + t('live') : '다음 공연 · ' + t('next'));
        city = place(e.city).split(' (')[0]; sub = place(e.country) + ' · ' + fmtDate(e.local_date);
        big = st.mode === 'live' ? 'LIVE' : dday(e); sub2 = fmtKm(km) + ' ' + t('kmFrom', { city: originRef() });
      }
      x.font = '400 42px Jua, "Baloo 2"'; var cw = x.measureText(chip).width + 60;
      x.save(); x.translate(W / 2, 1090); x.rotate(-.03); roundRect(x, -cw / 2, -38, cw, 76, 24); x.fillStyle = st.mode === 'live' ? '#FF3D8B' : '#FFF1A8'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#2E2150'; x.stroke();
      x.fillStyle = st.mode === 'live' ? '#fff' : '#2E2150'; x.textBaseline = 'middle'; x.fillText(chip, 0, 3); x.restore(); x.textBaseline = 'alphabetic';
      fitFont(x, city, '400', 'Jua, "Baloo 2"', 104, 820); x.fillStyle = '#2E2150'; x.fillText(city, W / 2, 1230);
      fitFont(x, sub, '600', '"Baloo 2"', 46, 820); x.fillStyle = '#5A4B82'; x.fillText(sub, W / 2, 1300);
      fitFont(x, big, '400', 'Jua, "Baloo 2"', 250, 820); x.lineWidth = 18; x.strokeStyle = '#2E2150'; x.strokeText(big, W / 2 + 8, 1555); x.fillStyle = col; x.strokeText(big, W / 2, 1545); x.fillText(big, W / 2, 1545);
      if (sub2) { fitFont(x, sub2, '700', '"Baloo 2"', 50, 820); x.fillStyle = '#2E2150'; x.fillText(sub2, W / 2, 1640); }
      // pie
      x.font = '700 48px "Baloo 2"'; x.fillStyle = '#2E2150'; x.fillText(st.mode === 'rest' ? (lang === 'en' ? 'Waiting together' : 'Esperando juntos') : t('vOutro'), W / 2, 1790);
      var url = (CFG.siteUrl || location.host + location.pathname).replace(/^https?:\/\//, '').replace(/index\.html$/, '').replace(/\/$/, '');
      x.font = '600 36px "Baloo 2"'; x.fillStyle = '#5A4B82'; x.fillText(url || 'radar-kpop', W / 2, 1852);
      return new Promise(function (res) { c.toBlob(function (b) { res(b); }, 'image/png'); });
    });
  }
  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function doShare(id) {
    var st = stOf(id); if (!st) return;
    Sound.play('shutter');
    shareCard(id).then(function (blob) {
      if (!blob) return;
      var name = 'radar-kpop-' + id + '.png';
      var text = st.mode === 'rest' ? t('shareRest', { g: st.g.name }) : t('shareText', { g: st.g.name, city: place(st.cur.city), d: st.mode === 'live' ? 'LIVE' : dday(st.cur) });
      var file = null;
      try { file = new File([blob], name, { type: 'image/png' }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && !finePointer) {
        navigator.share({ files: [file], title: 'Radar K-pop', text: text }).then(function () { toast(t('shared')); }).catch(function () { });
      } else { download(blob, name); toast(t('saved')); }
    }).catch(function () { toast('PNG error'); });
  }

  /* ================= calendario .ics ================= */
  function icsDate(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function icsEsc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, function (c) { return '\\' + c; }).replace(/\n/g, '\\n'); }
  function doIcs(id) {
    var st = stOf(id); if (!st || !st.cur) return;
    var e = st.cur, tt = Date.parse(e.start);
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Radar K-pop//ES', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + e.id + '@radar-kpop', 'DTSTAMP:' + icsDate(Date.now()), 'DTSTART:' + icsDate(tt), 'DTEND:' + icsDate(tt + 3 * 3600e3),
      'SUMMARY:' + icsEsc(st.g.name + ' · ' + place(e.city) + (st.g.tour ? ' (' + tourName(st.g.tour) + ')' : '')),
      'LOCATION:' + icsEsc((e.venue ? e.venue + ', ' : '') + place(e.city) + ', ' + place(e.country)),
      'DESCRIPTION:' + icsEsc(lang === 'en' ? 'Approximate time. Check with the ticket office. Radar K-pop.' : 'Hora aproximada, confirma en la boletería. Radar K-pop.'),
      'BEGIN:VALARM', 'TRIGGER:-PT24H', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(st.g.name + ' D-1'), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    download(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), id + '-' + e.local_date + '.ics');
    Sound.play('pop'); toast(t('icsSaved'));
  }

  /* ================= toast ================= */
  var toastT = 0;
  function toast(msg) { var el = $('#toast'); el.textContent = msg; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 2600); }

  /* ================= alertas: formulario ================= */
  var TYPE_GROUPS = [
    ['typesNear', ['prox', 'prox_new'], true], ['typesLive', ['live', 'stop_today'], true], ['typesDates', ['new_date', 'changed', 'removed'], true],
    ['typesNext', ['next_stop'], false], ['typesArrival', ['arrival_official', 'arrival'], true], ['typesLatam', ['latam'], true],
    ['typesNews', ['comeback', 'tour'], false], ['typesVideo', ['video'], false]
  ];
  var form = { ch: 'discord' };
  function loadForm() { try { return JSON.parse(store('radar-sub') || 'null'); } catch (e) { return null; } }
  function renderForm() {
    var saved = loadForm() || {};
    var gs = saved.groups || ['*'];
    if (renderForm.done && $('#fGroups input')) {
      gs = $$('#fGroups input:checked').map(function (i) { return i.value; });
      saved = Object.assign({}, saved, { types: [] });
      $$('#fTypes input:checked').forEach(function (i) { saved.types = saved.types.concat(TYPE_GROUPS[+i.value][1]); });
    }
    $('#fGroups').innerHTML = data.groups.map(function (g) {
      var on = gs.indexOf('*') >= 0 || gs.indexOf(g.id) >= 0;
      return '<label class="chip" style="' + gStyle(g.id) + '"><input type="checkbox" name="g" value="' + esc(g.id) + '"' + (on ? ' checked' : '') + '><span>' + esc(g.name) + '</span></label>';
    }).join('');
    var ts = saved.types || null;
    $('#fTypes').innerHTML = TYPE_GROUPS.map(function (tg, i) {
      var on = ts ? tg[1].some(function (x) { return ts.indexOf(x) >= 0 || ts.indexOf('*') >= 0; }) : tg[2];
      return '<label class="chip"><input type="checkbox" name="t" value="' + i + '"' + (on ? ' checked' : '') + '><span>' + esc(t(tg[0])) + '</span></label>';
    }).join('');
    if (!renderForm.done) {
      renderForm.done = true;
      if (saved.name) $('#fName').value = saved.name;
      if (saved.discord_user_id) $('#fDiscord').value = saved.discord_user_id;
      if (saved.whatsapp) $('#fWa').value = saved.whatsapp;
      if (saved.whatsapp_opt_in) $('#fOptIn').checked = true;
      if (saved.consent_v) $('#fConsent').checked = true;
      if (saved.radius_km) $('#fRadius').value = saved.radius_km;
      if (saved.channel) setChannel(saved.channel, true);
    }
    updatePreview();
  }
  function setChannel(ch, silent) {
    form.ch = ch;
    $('.tabs').setAttribute('data-ch', ch);
    $$('.tabs [role="tab"]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-ch') === ch)); });
    $$('[data-for]').forEach(function (f) { f.hidden = f.getAttribute('data-for') !== ch; });
    if (!silent) Sound.play('toggle');
    updatePreview();
  }
  function updatePreview() {
    var r = $('#fRadius'); $('#fRadiusOut').textContent = fmtKm(+r.value) + ' km';
    var o = origin(), best = null;
    states.forEach(function (st) { if (st.cur) { var d = hav(o.lat, o.lon, st.cur.lat, st.cur.lon); if (!best || d < best.d) best = { d: d, st: st }; } });
    var g = best ? best.st.g.name : 'BTS', city = best ? place(best.st.cur.city) : 'Santiago', km = best ? fmtKm(best.d) : '4.000';
    var name = $('#fName').value.trim(), pv = $('#preview');
    pv.className = 'preview-bubble ' + form.ch;
    var hhmm = new Date().toTimeString().slice(0, 5);
    if (form.ch === 'discord') pv.innerHTML = '<b>Radar K-pop</b> <span class="pv-meta" style="display:inline">' + esc(t('pvNow')) + '</span><br>' + (name ? '@' + esc(name) + ' ' : '') + t('pvDiscord', { g: esc(g), city: esc(city) }).replace(/\*\*(.+?)\*\*/, '<b>$1</b>');
    else if (form.ch === 'push') pv.innerHTML = '<span class="pv-app"><img src="assets/icons/icon-192.png" alt="" width="20" height="20"> Radar K-pop · ' + esc(t('pvNow')) + '</span><b>' + esc(g) + '</b> · ' + esc(city) + '<br>' + esc(t('pvWa', { g: g, city: city, km: km }).replace(/^Radar K-pop: /, ''));
    else pv.innerHTML = (name ? esc(name) + ', ' : '') + esc(t('pvWa', { g: g, city: city, km: km })) + '<span class="pv-meta">' + hhmm + ' ✓✓</span>';
  }
  function slug(s) { return (s || 'fan').normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 24) || 'fan'; }
  function subscriberJson() {
    var o = origin(), groups = $$('#fGroups input:checked').map(function (i) { return i.value; });
    if (groups.length === data.groups.length) groups = ['*'];
    var types = []; $$('#fTypes input:checked').forEach(function (i) { types = types.concat(TYPE_GROUPS[+i.value][1]); });
    var saved = loadForm() || {};
    var sub = {
      id: saved.id || slug($('#fName').value) + '-' + Math.random().toString(36).slice(2, 6),
      name: $('#fName').value.trim(), city: o.geo ? (o.near || 'Mi ubicación') : o.name, lat: +o.lat.toFixed(2), lon: +o.lon.toFixed(2), radius_km: +$('#fRadius').value,
      groups: groups.length ? groups : ['*'], channel: form.ch,
      consent_v: '2026-10-15'  // versión del texto de autorización que aceptó (prueba de la autorización, Ley 1581)
    };
    if (form.ch === 'discord') { sub.discord_user_id = $('#fDiscord').value.replace(/\D/g, ''); sub.types = types; }
    else if (form.ch === 'push') { sub.types = types; }
    else { sub.whatsapp = $('#fWa').value.trim(); sub.whatsapp_opt_in = $('#fOptIn').checked; sub.whatsapp_types = types; }
    return sub;
  }
  function validate(field) {
    var ok = true;
    function check(inputSel, errSel, good) { var i = $(inputSel), e = $(errSel); i && i.setAttribute('aria-invalid', String(!good)); e.hidden = good; if (!good) ok = false; }
    if (form.ch === 'discord' && (!field || field === 'discord')) check('#fDiscord', '#eDiscord', /^\d{17,20}$/.test($('#fDiscord').value.replace(/\s/g, '')));
    if (form.ch === 'whatsapp') {
      if (!field || field === 'wa') check('#fWa', '#eWa', /^\+\d[\d\s-]{7,17}$/.test($('#fWa').value.trim()));
      if (!field || field === 'opt') { var e = $('#eOpt'); e.hidden = $('#fOptIn').checked; if (!$('#fOptIn').checked) ok = false; }
    }
    if (!field || field === 'consent') { var c = $('#eConsent'); c.hidden = $('#fConsent').checked; if (!$('#fConsent').checked) ok = false; }
    return ok;
  }
  function submitForm(ev) {
    ev.preventDefault();
    if (!validate()) { Sound.play('boing'); var bad = $('.sub-form [aria-invalid="true"]') || (!$('#fConsent').checked && $('#fConsent')); if (bad) bad.focus(); return; }
    var sub = subscriberJson();
    store('radar-sub', JSON.stringify(sub));
    if (form.ch === 'push') { subscribePush(sub); return; }
    var out = $('#subResult'), btn = $('#subSubmit'), clean = Object.assign({}, sub); delete clean.channel;
    var endpoint = apiBase() ? apiBase() + '/subscribe' : '';
    function showJson(msg) {
      out.hidden = false;
      out.innerHTML = '<p><b>' + esc(t('subSaved')) + '</b> ' + esc(msg) + '</p><pre id="subJson">' + esc(JSON.stringify(clean, null, 2)) + '</pre><button type="button" class="btn small" id="copyJson">' + esc(t('copy')) + '</button>';
    }
    if (!endpoint) { showJson(t('subNoEndpoint')); Sound.play('heart'); return; }
    btn.disabled = true; btn.firstChild.textContent = '...';
    fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Delete-Token': store('radar-sub-token') || '' }, body: JSON.stringify(clean) }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json().catch(function () { return {}; });
    }).then(function (j) {
      if (j && j.token) store('radar-sub-token', j.token);
      out.hidden = false; out.innerHTML = '<p><b>' + esc(t('subSent')) + '</b></p>'; Sound.play('fanfare');
    }).catch(function () { showJson(t('subFail')); Sound.play('boing'); })
      .then(function () { btn.disabled = false; btn.firstChild.textContent = t('subSubmit'); });
  }

  /* ================= celebración de alerta nueva ================= */
  var confetti = { parts: [], running: false };
  function confettiBurst(x, y, n, colors, power, angle, spread) {
    var shapes = ['heart', 'star', 'dot', 'ribbon', 'star', 'heart'];
    for (var i = 0; i < n; i++) {
      var a = (angle != null ? angle : -Math.PI / 2) + (Math.random() - .5) * (spread || Math.PI * 2), v = power * (.45 + Math.random() * .75);
      confetti.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 7 + Math.random() * 10, rot: Math.random() * 6, vr: (Math.random() - .5) * .3,
        c: colors[i % colors.length], s: shapes[i % shapes.length], life: 0, max: 120 + Math.random() * 90 });
    }
    if (!confetti.running) { confetti.running = true; requestAnimationFrame(confettiFrame); }
  }
  function confettiFrame() {
    var cv = $('#confetti'), x = cv.getContext('2d'), d = Math.min(window.devicePixelRatio || 1, 1.5);
    if (cv.width !== Math.round(innerWidth * d)) { cv.width = Math.round(innerWidth * d); cv.height = Math.round(innerHeight * d); }
    x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, innerWidth, innerHeight);
    confetti.parts = confetti.parts.filter(function (p) { return p.life < p.max && p.y < innerHeight + 60; });
    confetti.parts.forEach(function (p) {
      p.life++; p.vy += .32; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.globalAlpha = Math.min(1, (p.max - p.life) / 30);
      x.fillStyle = p.c; x.strokeStyle = '#2E2150'; x.lineWidth = 2;
      var r = p.r;
      if (p.s === 'heart') { x.beginPath(); x.moveTo(0, r * .6); x.bezierCurveTo(-r * 1.2, -r * .2, -r * .5, -r, 0, -r * .35); x.bezierCurveTo(r * .5, -r, r * 1.2, -r * .2, 0, r * .6); x.fill(); x.stroke(); }
      else if (p.s === 'star') { var k = r * .3; x.beginPath(); x.moveTo(0, -r); x.quadraticCurveTo(k, -k, r, 0); x.quadraticCurveTo(k, k, 0, r); x.quadraticCurveTo(-k, k, -r, 0); x.quadraticCurveTo(-k, -k, 0, -r); x.fill(); x.stroke(); }
      else if (p.s === 'ribbon') { x.fillRect(-r * .9, -r * .3, r * 1.8, r * .6); x.strokeRect(-r * .9, -r * .3, r * 1.8, r * .6); }
      else { x.beginPath(); x.arc(0, 0, r * .5, 0, Math.PI * 2); x.fill(); x.stroke(); }
      x.restore();
    });
    if (confetti.parts.length) requestAnimationFrame(confettiFrame);
    else { confetti.running = false; x.clearRect(0, 0, innerWidth, innerHeight); }
  }
  var partyTimer = 0, partyFocus = null;
  function celebrate(a, count) {
    var p = $('#party'), card = $('#partyCard'), gid = a.group || 'default', col = gColor(gid);
    partyFocus = document.activeElement;
    card.setAttribute('style', gStyle(gid));
    var f = face(gid);
    card.innerHTML = '<span class="tape" aria-hidden="true"></span><img class="p-chibi' + (f.photo ? ' photo' : '') + '" src="' + esc(f.src) + '" alt="">' +
      '<p class="p-ko" lang="ko">새 소식!</p><h2 id="partyTitle">' + esc(t('newAlert')) + '</h2><span class="p-type">' + esc(L().T[a.type] || 'Info') + '</span>' +
      '<p class="p-t">' + esc(a.title) + '</p><p class="p-b">' + esc(a.body || '') + '</p>' +
      (count > 1 ? '<p class="p-more">' + esc(t('moreAlerts', { n: count - 1 })) + '</p>' : '') +
      '<div class="p-acts">' + (stOf(gid) ? '<button type="button" class="btn primary" data-party-see="' + esc(gid) + '">' + esc(t('seeGlobe')) + '</button>' : '') +
      '<button type="button" class="btn" data-party-close>' + esc(t('close')) + '</button></div>';
    p.classList.remove('out'); p.hidden = false;
    var btn = card.querySelector('[data-party-see]') || card.querySelector('[data-party-close]'); if (btn) btn.focus({ preventScroll: true });
    Sound.play('fanfare');
    if (navigator.vibrate) try { navigator.vibrate([40, 60, 40, 60, 120]); } catch (e) { /* nada */ }
    if (!reduce) {
      var colors = [col, '#FFD84D', '#FF9CC6', '#A8DDF2', '#C6F3DA', '#B48CFF', '#fff'];
      var r = card.getBoundingClientRect();
      confettiBurst(r.left + r.width / 2, r.top + 40, 70, colors, 15, null, Math.PI * 2);
      setTimeout(function () { confettiBurst(0, innerHeight, 45, colors, 24, -Math.PI / 3.2, .7); confettiBurst(innerWidth, innerHeight, 45, colors, 24, -Math.PI + Math.PI / 3.2, .7); }, 180);
      setTimeout(function () { confettiBurst(innerWidth / 2, -20, 40, colors, 6, Math.PI / 2, 2.4); }, 650);
      if (globe) Object.keys(globe.pinEls).forEach(function (k, i) { var el = globe.pinEls[k]; setTimeout(function () { el.classList.remove('cheer'); void el.offsetWidth; el.classList.add('cheer'); }, i * 90); });
    }
    clearTimeout(partyTimer); partyTimer = setTimeout(closeParty, 9000);
  }
  function closeParty() {
    var p = $('#party'); if (p.hidden) return;
    clearTimeout(partyTimer);
    p.classList.add('out');
    setTimeout(function () { p.hidden = true; p.classList.remove('out'); }, reduce ? 0 : 340);
    if (partyFocus && partyFocus.focus && lastKeyboard) partyFocus.focus({ preventScroll: true });
  }

  /* ================= datos: sondeo cada minuto ================= */
  function poll() {
    return fetch('events.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
      if (!j || !Array.isArray(j.groups)) throw new Error('formato');
      feedOk = true; lastCheck = Date.now();
      if (JSON.stringify(j) !== JSON.stringify(data)) { data = j; renderAll(); } else renderMeta();
    }).catch(function () { feedOk = false; renderMeta(); });
  }
  var seenRaw = store('radar-seen-alerts'), seen = {};
  try { (JSON.parse(seenRaw || '[]') || []).forEach(function (k) { seen[k] = 1; }); } catch (e) { seen = {}; }
  var firstFeed = seenRaw == null;
  function pollFeed() {
    return fetch('alerts.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
      if (!j || !Array.isArray(j.alerts)) return;
      feed = j.alerts.slice().sort(function (a, b) { return Date.parse(b.when) - Date.parse(a.when); });
      var fresh = feed.filter(function (a) { return !seen[feedKey(a)] && now() - Date.parse(a.when) < 36 * 3600e3; });
      feed.forEach(function (a) { seen[feedKey(a)] = 1; });
      store('radar-seen-alerts', JSON.stringify(Object.keys(seen).slice(-300)));
      renderFeed();
      if (!firstFeed && fresh.length) celebrate(fresh[0], fresh.length);
      firstFeed = false;
    }).catch(function () { renderFeed(); });
  }


  /* ================= avistamientos cercanos (sightings.json, conector de X) ================= */
  var sights = [], sightsMeta = { sample: false }, seenS = {}, seenSRaw = store('radar-seen-sightings');
  try { (JSON.parse(seenSRaw || '[]') || []).forEach(function (k) { seenS[k] = 1; }); } catch (e) { seenS = {}; }
  var firstSight = seenSRaw == null, freshS = {};
  function sightKey(a) { return String(a.id || [a.group, a.city, a.when].join('|')); }
  function okUrl(u) { return /^https:\/\/(x|twitter)\.com\//.test(u || '') ? u : ''; }
  function pollSights() {
    return fetch('sightings.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
      if (!j || !Array.isArray(j.items)) return;
      sightsMeta = { sample: !!j.sample, updated: j.updated_at };
      sights = j.items.filter(function (a) { return a && isFinite(a.lat) && isFinite(a.lon) && a.city && a.group; });
      var fresh = sights.filter(function (a) { return !seenS[sightKey(a)]; });
      sights.forEach(function (a) { seenS[sightKey(a)] = 1; });
      store('radar-seen-sightings', JSON.stringify(Object.keys(seenS).slice(-300)));
      if (!firstSight) fresh.forEach(function (a) { freshS[sightKey(a)] = 1; });
      renderSights();
      if (!firstSight && fresh.length) announceSights(fresh.length);
      firstSight = false;
    }).catch(function () { renderSights(); });
  }
  function sightList() {
    var o = origin();
    return sights.map(function (a) { return { a: a, km: hav(o.lat, o.lon, a.lat, a.lon), key: sightKey(a) }; })
      .sort(function (x, y) { return x.km - y.km; });
  }
  function gName(id) { var g = (data.groups || []).filter(function (x) { return x.id === id; })[0]; return g ? g.name : (id || ''); }
  function renderSights() {
    var el = $('#sightList'); if (!el) return;
    var list = sightList();
    $('#sightSample').hidden = !sightsMeta.sample;
    if (!list.length) { el.innerHTML = '<li class="bub empty"><span class="bub-face">' + faceImg('default') + '</span><div class="bub-body"><p class="bub-b">' + esc(t('sightEmpty')) + '</p></div></li>'; }
    else el.innerHTML = list.slice(0, innerWidth < 600 ? 4 : 6).map(function (x) {
      var a = x.a, url = okUrl(a.url);
      return '<li class="bub sighting' + (freshS[x.key] ? ' fresh' : '') + '" id="s-' + esc(x.key.replace(/[^\w-]/g, '')) + '" style="' + gStyle(a.group) + '"><span class="bub-face">' + faceImg(a.group) + '</span><div class="bub-body">' +
        '<div class="bub-h"><span class="typ">' + esc(gName(a.group)) + '</span><span>' + esc(place(a.city)) + (a.country ? ', ' + esc(place(a.country)) : '') + '</span>' + (a.when ? '<time datetime="' + esc(a.when) + '">' + esc(t('ago', { n: agoTxt(now() - Date.parse(a.when)) })) + '</time>' : '') + '</div>' +
        '<p class="bub-t">' + esc(t('sightAway', { km: fmtKm(x.km) })) + '</p>' + (a.text ? '<p class="bub-b">' + esc(a.text) + '</p>' : '') +
        (url ? '<a class="s-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(t('sightSee')) + (a.account ? ' · @' + esc(a.account) : '') + '</a>' : '') + '</div></li>';
    }).join('');
    // cinta tipo noticiero (inspirada en el tracker de Spidey): de lo más cerca a lo más lejos
    var tk = $('#tickerTrack');
    if (tk) {
      var items = list.slice(0, 10).map(function (x) { return '<span class="tk-i" style="' + gStyle(x.a.group) + '"><b>' + esc(gName(x.a.group)) + '</b> ' + esc(place(x.a.city)) + ' · ' + fmtKm(x.km) + ' km</span>'; }).join('');
      if (!items) items = '<span class="tk-i">' + esc(t('sightEmpty')) + '</span>';
      tk.innerHTML = '<span class="tk-run">' + items + '</span><span class="tk-run" aria-hidden="true">' + items + '</span>';
      tk.style.setProperty('--tk', Math.max(18, list.slice(0, 10).length * 5) + 's');
    }
    if (globe) {
      var byCity = {};
      globe.setSights(list.slice(0, 14).map(function (x) {
        var ck = x.a.city + x.a.lat.toFixed(1), n = byCity[ck] = (byCity[ck] || 0) + 1;
        return { sid: x.key, group: x.a.group, lat: x.a.lat, lon: x.a.lon, dx: (n - 1) * 22, fresh: !!freshS[x.key],
          aria: gName(x.a.group) + ', ' + place(x.a.city) + ', ' + t('sightAway', { km: fmtKm(x.km) }) };
      }));
    }
  }
  var bubbleT = 0;
  function announceSights(n) {
    var b = $('#sightBubble');
    b.textContent = n === 1 ? t('sightNew1') : t('sightNew', { n: n });
    b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    Sound.play('ping');
    if (navigator.vibrate) try { navigator.vibrate([30, 40, 30]); } catch (e) { /* nada */ }
    clearTimeout(bubbleT); bubbleT = setTimeout(function () { b.hidden = true; }, 7000);
  }
  function showSight(key) {
    var x = sightList().filter(function (y) { return y.key === key; })[0]; if (!x) return;
    Sound.play('ping');
    toast(gName(x.a.group) + ' · ' + place(x.a.city) + ' · ' + t('sightAway', { km: fmtKm(x.km) }));
    var li = document.getElementById('s-' + key.replace(/[^\w-]/g, ''));
    if (li) { li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash'); }
  }

  /* ================= novedades (changelog.json, lo embebe build.py) ================= */
  function renderChanges() {
    var el = $('#changes'); if (!el) return;
    el.innerHTML = CHANGES.map(function (v) {
      var items = (lang === 'en' ? v.en : v.es) || [];
      return '<li><p class="ch-v"><b>' + esc(v.version) + '</b> · <time datetime="' + esc(v.date) + '">' + esc(v.date) + '</time> · ' + esc(lang === 'en' ? v.title_en : v.title_es) + '</p><ul>' +
        items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></li>';
    }).join('');
  }

  /* ================= notificaciones push (opcional, necesita servidor) ================= */
  function b64ToU8(b) { var p = '='.repeat((4 - b.length % 4) % 4), raw = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')), out = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; }
  /* subscribeEndpoint = la URL del servidor de backend/ (también sirve si termina en /subscribe) */
  function apiBase() { return (CFG.subscribeEndpoint || '').trim().replace(/\/+$/, '').replace(/\/subscribe$/, ''); }
  function pushEndpoint() { return apiBase() ? apiBase() + '/push' : ''; }
  function subscribePush(sub) {
    var out = $('#subResult');
    function say(msg, ok) { out.hidden = false; out.innerHTML = '<p><b>' + esc(msg) + '</b></p>'; Sound.play(ok ? 'fanfare' : 'boing'); }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return say(t('pushUnsupported'));
    if (!pushEndpoint() || !CFG.vapidPublicKey) return say(t('pushNeedCfg'));
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('denied');
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CFG.vapidPublicKey) });
    }).then(function (ps) {
      var body = Object.assign({}, sub, { push: ps.toJSON() }); delete body.channel;
      return fetch(pushEndpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Delete-Token': store('radar-sub-token') || '' }, body: JSON.stringify(body) });
    }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json().catch(function () { return {}; }); })
      .then(function (j) { if (j && j.token) store('radar-sub-token', j.token); say(t('pushOn'), true); })
      .catch(function (e) { say(e && e.message === 'denied' ? t('pushDenied') : t('subFail')); });
  }

  /* ================= modo video (9:16, ~15 s) ================= */
  var Video = { globe: null, timers: [], running: false };
  function vClear() { Video.timers.forEach(clearTimeout); Video.timers = []; }
  function vAt(ms, fn) { Video.timers.push(setTimeout(fn, ms)); }
  function openVideo() {
    var v = $('#video'); v.hidden = false; document.documentElement.style.overflow = 'hidden';
    if (v.requestFullscreen && !finePointer) v.requestFullscreen().catch(function () { });
    if (!Video.globe) {
      Video.globe = new Globe($('#vglobe'), $('#vpins'), { passive: true, fit: .44, cy: .47, spin: 10, lon: -70, lat: 10 });
      Video.globe.pinTarget = Math.max(74, Math.min(110, innerWidth * .22));
    } else Video.globe.resize();
    Video.globe.pinTarget = Math.max(70, Math.min(108, $('#vframe').clientWidth * .22));
    Video.globe.inView = true;
    var gd = buildGeo(); Video.globe.setData(gd.markers, gd.routes); Video.globe.setSel(null);
    if (globe) globe.inView = false;
    showVideoUi();
    runVideo();
  }
  function runVideo() {
    vClear();
    var L2 = $('#vlayer'), vg = Video.globe;
    L2.innerHTML = ''; vg.starId = null; vg.setSel(null); vg.zoom = .55; vg.lon = -100; vg.lat = 12; vg.tween = null;
    vg.flyTo(-70, 10, 1, reduce ? 0 : 1500);
    var o = origin();
    var tourGroups = states.filter(function (s) { return s.mode !== 'rest'; });
    var rest = states.filter(function (s) { return s.mode === 'rest'; });
    var steps = tourGroups.map(function (s) { return { st: s }; });
    if (rest.length) steps.push({ rest: rest });
    var intro = 1700, outro = 2300, per = clamp((15000 - intro - outro) / Math.max(1, steps.length), 1800, 3200);
    L2.innerHTML = '<div id="vtop"><div class="v-title"><b>Radar <em>K-pop</em></b><span>' + esc(t('vTitle')) + '</span></div></div><div id="vcap"></div>';
    var vtop = $('#vtop'), vcap = $('#vcap');
    Sound.play('fanfare');
    steps.forEach(function (step, i) {
      vAt(intro + i * per, function () {
        var pos, html, gid;
        if (step.st) {
          var s = step.st, km = hav(o.lat, o.lon, s.cur.lat, s.cur.lon); gid = s.id; pos = s.pos;
          html = '<div class="v-cap ' + (s.mode === 'live' ? 'live' : '') + '" style="' + gStyle(s.id) + '"><span class="tape"></span><span class="vc-d">' + esc(s.mode === 'live' ? 'LIVE' : dday(s.cur)) + '</span>' +
            '<p class="vc-ko" lang="ko">' + esc((META[s.id] || {}).ko || '') + ' · ' + (s.mode === 'live' ? '공연 중' : '다음 공연') + '</p>' +
            '<p class="vc-n">' + esc(s.g.name) + '</p><p class="vc-w">' + esc(place(s.cur.city).split(' (')[0]) + ', ' + esc(place(s.cur.country)) + ' · ' + esc(fmtShort(s.cur.local_date)) + '<br>' + fmtKm(km) + ' ' + esc(t('kmFrom', { city: originRef() })) + '</p></div>';
        } else {
          gid = step.rest[0].id; pos = step.rest[0].pos;
          html = '<div class="v-cap" style="' + gStyle(gid) + '"><span class="tape"></span><span class="vc-d">D-?</span><p class="vc-ko" lang="ko">쉬는 중</p>' +
            '<p class="vc-n">' + esc(step.rest.map(function (r) { return r.g.name; }).join(' · ')) + '</p><p class="vc-w">' + esc(t('vRest')) + '</p></div>';
        }
        vg.starId = gid; vg.setSel(gid);
        vg.flyTo(pos.lon, pos.lat - 4, 1.6, reduce ? 0 : Math.min(1300, per * .55));
        Sound.play('whoosh'); vAt(500, function () { Sound.play('select'); });
        vcap.innerHTML = html;
        var pin = vg.pinEls[gid]; if (pin) { pin.classList.remove('cheer'); void pin.offsetWidth; pin.classList.add('cheer'); }
      });
    });
    vAt(intro + steps.length * per, function () {
      vg.starId = null; vg.setSel(null); vg.idleUntil = 0; vg.flyTo(vg.lon + 40, 8, .9, reduce ? 0 : 1400);
      vtop.innerHTML = '<div class="v-title"><b>Radar <em>K-pop</em></b><span lang="ko">다음에 또 봐요</span></div>';
      vcap.innerHTML = '<div class="v-outro"><b>' + esc(t('vOutro')) + '</b><span>' +
        esc((CFG.siteUrl || location.host + location.pathname).replace(/^https?:\/\//, '').replace(/index\.html$/, '').replace(/\/$/, '')) + '</span></div>';
      Sound.play('heart');
    });
    vAt(intro + steps.length * per + outro + 400, function () {
      var end = document.createElement('div'); end.className = 'v-end';
      end.innerHTML = '<button type="button" class="btn primary" data-vreplay>' + esc(t('replay')) + '</button><button type="button" class="btn" data-vclose>' + esc(t('closeVideo')) + '</button>';
      L2.appendChild(end);
      $('#video').classList.add('show-ui');
    });
  }
  var uiT = 0;
  function showVideoUi() { var v = $('#video'); v.classList.add('show-ui'); clearTimeout(uiT); uiT = setTimeout(function () { if (!v.querySelector('.v-end')) v.classList.remove('show-ui'); }, 1800); }
  function closeVideo() {
    vClear();
    var v = $('#video'); if (v.hidden) return;
    v.hidden = true; v.classList.remove('show-ui'); document.documentElement.style.overflow = '';
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () { });
    if (Video.globe) Video.globe.inView = false;
    if (globe) { globe.inView = true; globe.kick(); }
  }

  /* ================= PWA ================= */
  var deferredInstall = null;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; $('#installBtn').hidden = false; });
  window.addEventListener('appinstalled', function () { $('#installBtn').hidden = true; toast(t('installed')); });
  if (isIOS && !standalone) $('#installBtn').hidden = false;
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
  }

  /* ================= eventos ================= */
  var lastKeyboard = false;
  window.addEventListener('keydown', function (e) { lastKeyboard = true; if (e.key === 'Escape') { if (!$('#video').hidden) closeVideo(); else if (!$('#party').hidden) closeParty(); else if (!$('#iosSheet').hidden) $('#iosSheet').hidden = true; else if (sel) unselect(); } });
  window.addEventListener('pointerdown', function () { lastKeyboard = false; }, true);

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-pick],[data-unsel],[data-share],[data-ics],[data-goto],[data-bias],[data-video],[data-view],[data-lang],[data-ch],[data-party-see],[data-party-close],[data-vreplay],[data-vclose],[data-close-sheet],[data-open-privacy],[data-mem],[data-trivia],[data-geo-retry],[data-zoom],[data-center-me],#sightBubble,#muteBtn,#installBtn,#geoBtn,#refresh,#testParty,#subDelete,#copyJson,.dock a') : null;
    if (!el) { if (ev.target === $('#party')) closeParty(); return; }
    if (el.hasAttribute('data-pick')) { if (view !== 'globe' && el.hasAttribute('data-top')) setView('globe'); pick(el.getAttribute('data-pick'), { top: el.hasAttribute('data-top') }); return; }
    if (el.hasAttribute('data-unsel')) { unselect(); return; }
    if (el.hasAttribute('data-mem')) { memberTap(el); return; }
    if (el.hasAttribute('data-trivia')) { triviaTap(el); return; }
    if (el.hasAttribute('data-geo-retry')) { locate(true); return; }
    if (el.hasAttribute('data-zoom')) { if (globe) { globe.zoomBy(el.getAttribute('data-zoom') === 'in' ? 1.45 : 1 / 1.45); globe.idleUntil = performance.now() + 10000; } Sound.play('tap'); hideHint(); return; }
    if (el.hasAttribute('data-center-me')) { var me = origin(); if (globe) { if (sel) unselect(); globe.flyTo(me.lon, me.lat, Math.max(1.6, globe.zoom), 1200); globe.idleUntil = performance.now() + 12000; } Sound.play('whoosh'); return; }
    if (el.id === 'sightBubble') { el.hidden = true; var sa = document.getElementById('avistamientos'); if (sa) sa.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); Sound.play('tap'); return; }
    if (el.hasAttribute('data-open-privacy')) { var pv = $('#privacidad'); pv.open = true; Sound.play('tap'); return; }
    if (el.hasAttribute('data-share')) { doShare(el.getAttribute('data-share')); return; }
    if (el.hasAttribute('data-ics')) { doIcs(el.getAttribute('data-ics')); return; }
    if (el.hasAttribute('data-goto')) { ev.preventDefault(); var c = document.getElementById('card-' + el.getAttribute('data-goto')); if (c) { c.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); setTimeout(function () { flash(c); }, reduce ? 0 : 450); } Sound.play('tap'); return; }
    if (el.hasAttribute('data-bias')) {
      var id = el.getAttribute('data-bias'); bias = bias === id ? '' : id; store('radar-bias', bias || null);
      Sound.play(bias ? 'heart' : 'toggle'); renderAll();
      var nc = document.getElementById('card-' + id); if (bias && nc) { nc.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' }); flash(nc); }
      return;
    }
    if (el.hasAttribute('data-video')) { Sound.play('pop'); openVideo(); return; }
    if (el.hasAttribute('data-view')) { setView(el.getAttribute('data-view')); return; }
    if (el.hasAttribute('data-lang')) { lang = el.getAttribute('data-lang'); store('radar-lang', lang); Sound.play('tap'); renderAll(); return; }
    if (el.hasAttribute('data-ch')) { setChannel(el.getAttribute('data-ch')); return; }
    if (el.hasAttribute('data-party-see')) { var g = el.getAttribute('data-party-see'); closeParty(); setView('globe'); document.getElementById('mundo').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); pick(g, { force: true }); return; }
    if (el.hasAttribute('data-party-close')) { closeParty(); return; }
    if (el.hasAttribute('data-vreplay')) { $('#video').classList.remove('show-ui'); runVideo(); return; }
    if (el.hasAttribute('data-vclose')) { closeVideo(); return; }
    if (el.hasAttribute('data-close-sheet')) { $('#iosSheet').hidden = true; return; }
    if (el.closest('.dock')) {
      var target = document.getElementById((el.getAttribute('href') || '').slice(1));
      if (target) { ev.preventDefault(); target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }
      Sound.play('tap'); return;
    }
    switch (el.id) {
      case 'muteBtn':
        Sound.muted = !Sound.muted; store('radar-muted', Sound.muted ? '1' : '0'); el.setAttribute('aria-pressed', String(Sound.muted));
        el.setAttribute('aria-label', Sound.muted ? t('unmute') : t('mute')); toast(Sound.muted ? t('mute') : t('unmute')); if (!Sound.muted) { Sound.unlock(); setTimeout(function () { Sound.play('heart'); }, 30); }
        break;
      case 'installBtn':
        if (deferredInstall) { deferredInstall.prompt(); deferredInstall.userChoice.then(function () { deferredInstall = null; }); }
        else if (isIOS) $('#iosSheet').hidden = false;
        break;
      case 'geoBtn': locate(true); break;
      case 'refresh': Sound.play('tap'); poll(); pollFeed(); break;
      case 'testParty':
        var any = states[0] || { id: 'default', g: { name: 'K-pop' } };
        var a = feed[0] || { type: 'new_date', group: any.id, group_name: any.g.name, title: lang === 'en' ? any.g.name + ' added new dates' : any.g.name + ' agregó fechas nuevas', body: lang === 'en' ? 'This is a test: this is how a real alert celebrates.' : 'Esto es una prueba: así se celebra una alerta de verdad.', when: new Date().toISOString() };
        celebrate(a, 1); break;
      case 'subDelete':
        var old = loadForm(), tok = store('radar-sub-token');
        if (old && old.id && tok && apiBase()) fetch(apiBase() + '/subscribe/' + encodeURIComponent(old.id), { method: 'DELETE', headers: { 'X-Delete-Token': tok } }).catch(function () { });
        store('radar-sub-token', null);
        store('radar-sub', null); $('#subForm').reset(); renderForm.done = false; renderForm(); $('#subResult').hidden = true; toast(t('deleted')); Sound.play('toggle'); break;
      case 'copyJson':
        var txt = $('#subJson').textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(t('copied')); Sound.play('pop'); }).catch(function () {
          var r = document.createRange(); r.selectNodeContents($('#subJson')); var s = getSelection(); s.removeAllRanges(); s.addRange(r);
        });
        break;
    }
  });
  /* tocar a un miembro: salta, dice su nombre en hangul y suena una nota distinta por miembro */
  function memberTap(el) {
    var i = +el.getAttribute('data-i') || 0;
    Sound.play('boop', i);
    el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) { /* nada */ }
  }
  var triviaScore = {};
  function triviaTap(el) {
    var p = el.getAttribute('data-trivia').split(':'), gid = p[0], qi = +p[1], oi = +p[2], q = TRIVIA[gid] && TRIVIA[gid][qi];
    if (!q) return;
    var li = el.closest('li'); if (li.classList.contains('done')) return;
    li.classList.add('done');
    var ok = oi === q[3];
    $$('[data-trivia]', li).forEach(function (b, j) { b.disabled = true; b.classList.toggle('right', j === q[3]); b.classList.toggle('wrong', j === oi && !ok); });
    $('.tq-r', li).textContent = ok ? t('triviaOk') : t('triviaNo', { a: q[2][q[3]] });
    var sc = triviaScore[gid] = triviaScore[gid] || { n: 0, done: 0 }; sc.done++; if (ok) sc.n++;
    var box = el.closest('.trivia'); $('.tq-score', box).textContent = t('triviaScore', { n: sc.n, t: sc.done });
    Sound.play(ok ? 'right' : 'boing');
    if (ok && !reduce) { var r = el.getBoundingClientRect(); confettiBurst(r.left + r.width / 2, r.top, 18, [gColor(gid), '#FFD84D', '#FF9CC6', '#fff'], 7, null, Math.PI * 2); }
  }
  function setView(v) {
    if (view === v) return;
    view = v; Sound.play('toggle');
    $('.view-toggle').setAttribute('data-v', v);
    $$('.view-toggle button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === v)); });
    $('#globeView').hidden = v !== 'globe'; $('#sonarView').hidden = v !== 'sonar';
    if (globe) { globe.inView = v === 'globe' && stageVisible; if (v === 'globe') { globe.resize(); globe.kick(); } }
    if (v === 'sonar') renderSonar();
    renderFocus();
  }
  $('#origin').addEventListener('change', function (e) {
    originIdx = parseInt(e.target.value, 10);
    store('radar-origin', originIdx === -1 ? 'geo' : String(originIdx));
    Sound.play('pop'); renderAll();
  });
  document.addEventListener('toggle', function (e) { if (e.target.tagName === 'DETAILS') Sound.play(e.target.open ? 'open' : 'close'); }, true);
  $('#subForm').addEventListener('submit', submitForm);
  $('#subForm').addEventListener('input', function (e) { if (e.target.name !== 'g' && e.target.name !== 't') updatePreview(); else updatePreview(); });
  $('#subForm').addEventListener('change', function (e) { if (e.target.type === 'checkbox') Sound.play('tap'); });
  $('#fDiscord').addEventListener('blur', function () { if (this.value) validate('discord'); });
  $('#fWa').addEventListener('blur', function () { if (this.value) validate('wa'); });
  $('#fOptIn').addEventListener('change', function () { validate('opt'); });
  $('#fConsent').addEventListener('change', function () { validate('consent'); });
  $('#video').addEventListener('pointermove', showVideoUi);
  $('#video').addEventListener('click', function (e) { if (!e.target.closest('button')) showVideoUi(); });
  $('#videoX').addEventListener('click', closeVideo);
  document.addEventListener('fullscreenchange', function () { if (Video.globe && !$('#video').hidden) setTimeout(function () { Video.globe.resize(); }, 60); });

  /* ================= visibilidad, bucles y dock ================= */
  var stageVisible = true;
  function observe() {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        en.target.classList.toggle('is-paused', !en.isIntersecting);
        if (en.target.id === 'stage') { stageVisible = en.isIntersecting; if (globe) { globe.inView = stageVisible && view === 'globe'; globe.kick(); } }
      });
    }, { rootMargin: '80px' });
    [$('#stage'), $('.moon-scene')].forEach(function (el) { if (el) io.observe(el); });
    var dockT = 0, lastDock = '';
    function dockSync() {
      var current = 'mundo', lim = innerHeight * .45;
      ['grupos', 'avisos', 'alertas'].forEach(function (id) { var el = document.getElementById(id); if (el && el.getBoundingClientRect().top < lim) current = id; });
      if (current === lastDock) return; lastDock = current;
      $$('.dock [data-dock]').forEach(function (a) { a.setAttribute('aria-current', String(a.getAttribute('data-dock') === current)); });
    }
    window.addEventListener('scroll', function () { if (!dockT) dockT = setTimeout(function () { dockT = 0; dockSync(); }, 120); }, { passive: true });
    dockSync();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { if (globe) globe.kick(); if (Video.globe && !$('#video').hidden) Video.globe.kick(); poll(); pollFeed(); pollSights(); } });
  mqReduce.addEventListener && mqReduce.addEventListener('change', function (e) { reduce = e.matches; });
  var rz = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rz); rz = setTimeout(function () {
      if (globe) { globe.pinTarget = pinWidth(); globe.resize(); }
      if (Video.globe && !$('#video').hidden) Video.globe.resize();
      if (view === 'sonar') sizeSonar();
    }, 120);
  });
  function pinWidth() { return innerWidth < 600 ? 80 : innerWidth < 1024 ? 96 : 112; }

  /* ================= firma ================= */
  function zw(s) {
    return '⁠' + Array.prototype.map.call(new TextEncoder().encode(s), function (b) { return b.toString(2).padStart(8, '0'); }).join('').replace(/0/g, '​').replace(/1/g, '‌') + '⁠';
  }
  $('#zw').textContent = zw('Cristian Pérez · https://cristianperez.me');
  console.info('%cRadar K-pop%c · hecho con amor de fan · diseño y desarrollo: Cristian Pérez · https://cristianperez.me', 'font-weight:700;color:#FF5FA8', '');

  /* ================= arranque ================= */
  $('#muteBtn').setAttribute('aria-pressed', String(Sound.muted));
  computeStates();
  globe = new Globe($('#globe'), $('#pins'), {
    fit: .4, cy: .47, spin: 5,
    lon: (states[0] && states[0].pos ? states[0].pos.lon : -60) + 25, lat: 8,
    onPick: function (id) { pick(id); },
    onSight: function (sid) { showSight(sid); },
    onZoom: function (z) {
      $('#stage').classList.toggle('zoomed-in', z > 1.08);
      var zi = $('[data-zoom="in"]'), zo = $('[data-zoom="out"]');
      if (zi) zi.disabled = z >= ZMAX - .01; if (zo) zo.disabled = z <= ZMIN + .01;
    },
    onDragStart: hideHint,
    onResize: function (g) { var ring = Math.round(g.R0 * 2 * 1.3); $('.ring').style.setProperty('--ring', ring + 'px'); $('.ring').style.top = (g.cy) + 'px'; }
  });
  globe.pinTarget = pinWidth();
  // solo para pruebas automáticas (?debug): lectura del estado del globo, sin efectos
  if (params.has('debug')) window.__radarDebug = function () { return { lon: globe.lon, lat: globe.lat, zoom: globe.zoom, origin: origin(), geoState: geoState }; };
  globe.idleUntil = performance.now() + (reduce ? 0 : 400);
  renderAll();
  setChannel(form.ch, true);
  observe();
  setInterval(function () { tick(false); }, 1000);
  poll(); pollFeed(); pollSights();
  setInterval(poll, 60000);
  setInterval(pollFeed, 60000);
  setInterval(pollSights, 60000);
  // ubicación real: se pide al entrar, salvo que hayas elegido una ciudad a mano
  if (savedOrigin == null || savedOrigin === 'geo') locate(false);
  if (params.get('demo') === 'alert') setTimeout(function () { $('#testParty').click(); }, 1200);
  if (params.get('demo') === 'video') setTimeout(openVideo, 600);
  if (params.get('pick')) setTimeout(function () { pick(params.get('pick'), { force: true }); }, 500);
  if (params.get('view') === 'sonar') setView('sonar');
})();

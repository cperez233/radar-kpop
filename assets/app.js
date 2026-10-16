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
    newjeans: { ko: '뉴진스', fan: 'Bunnies', cheer: '뉴진스 사랑해!', hint: { es: '¡te queremos, NewJeans!', en: 'we love you, NewJeans!' } },
    cortis: { ko: '코르티스', fan: 'COER', cheer: '코르티스 화이팅!', hint: { es: '¡ánimo, CORTIS!', en: 'go CORTIS!' } },
    ateez: { ko: '에이티즈', fan: 'ATINY', cheer: '에이티즈 화이팅!', hint: { es: '¡ánimo, ATEEZ!', en: 'go ATEEZ!' } }
  };
  /* perfil: debut, agencia y dónde escucharlos (ids verificados: Spotify oEmbed, iTunes lookup, canal oficial de YouTube; Weverse solo si el grupo tiene comunidad) */
  var PROFILE = {
    bts: { debut: '2013-06-13', agency: 'BIGHIT MUSIC', spotify: '3Nrfpe0tUJi4K4DXYWgMUX', apple: 883131348, youtube: 'UCLkAepWjdylmXSltofFvsYQ', weverse: 'bts' },
    skz: { debut: '2018-03-25', agency: 'JYP Entertainment', spotify: '2dIgFjalVxs4ThymZ67YCE', apple: 1304823362, youtube: 'UC9rMiEjNaCSsebs31MRDCRA', fan: [['fans', 'FANS', 'https://app.fans/community/StrayKids'], ['bubble', 'bubble', 'https://www.dearu.com/en/pages/business_bubble.php']] },
    twice: { debut: '2015-10-20', agency: 'JYP Entertainment', spotify: '7n2Ycct7Beij7Dj7meI4X0', apple: 1203816887, youtube: 'UCzgxx_DM2Dcb9Y1spb9mUJA', fan: [['fans', 'FANS', 'https://app.fans/community/TWICE'], ['bubble', 'bubble', 'https://www.dearu.com/en/pages/business_bubble.php']] },
    blackpink: { debut: '2016-08-08', agency: 'YG Entertainment', spotify: '41MozSoPIsD1dJM0CLPjZF', apple: 1141774019, youtube: 'UCOmHUn--16B90oW2L6FRR3A', weverse: 'blackpink' },
    lngshot: { debut: '2026-01-13', agency: 'MORE VISION', spotify: '2F4oTJOWkcD1JaTeKEa9h6', apple: 1862022916, youtube: 'UC8PPjyqCQJtNfEwHBcq_uxw', weverse: 'lngshot' },
    seventeen: { debut: '2015-05-26', agency: 'PLEDIS Entertainment', spotify: '7nqOGRxlXj7N2JYbgNEjYH', apple: 999644772, youtube: 'UCfkXDY7vwkcJ8ddFGz8KusA', weverse: 'seventeen' },
    enhypen: { debut: '2020-11-30', agency: 'BELIFT LAB', spotify: '5t5FqBwTcgKTaWmfEbwQY9', apple: 1541011620, youtube: 'UCArLZtok93cO5R9RI4_Y5Jw', weverse: 'enhypen' },
    newjeans: { debut: '2022-07-22', agency: 'ADOR', spotify: '6HvZYsbFfjnjFrWF950C9d', apple: 1635469693, youtube: 'UCMki_UkHb4qSc0qyEcOHHJw', weverse: 'newjeansofficial' },
    cortis: { debut: '2025-08-18', agency: 'BIGHIT MUSIC', spotify: '1ebt9HnXdyYA6KgLXr1n4P', apple: 1831651635, youtube: 'UCZMYvSPulDSUdx7bdtTFdrg', weverse: 'cortis' },
    ateez: { debut: '2018-10-24', agency: 'KQ Entertainment', spotify: '68KmkJeZGfwe1OUaivBa2L', apple: 1439301205, youtube: 'UC2e4Ukj5Pfr7cb3KpJAFBdQ', fan: [['fromm', 'fromm', 'https://apps.apple.com/app/id1641293296'], ['toktoq', 'TOKTOQ', 'https://apps.apple.com/app/id6448908646']] }
  };
  /* mini trivia: [pregunta es, pregunta en, opciones ('es|en' si cambian), índice correcto]. Datos verificados (Wikipedia, Soompi). */
  var TRIVIA = {
    bts: [['¿En qué año debutó BTS?', 'What year did BTS debut?', ['2011', '2013', '2015'], 1], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['ARMY', 'ONCE', 'BLINK'], 0], ['¿Quién es el líder?', 'Who is the leader?', ['Jin', 'SUGA', 'RM'], 2], ['¿Qué significa BTS en coreano?', 'What does BTS stand for in Korean?', ['Bangtan Sonyeondan', 'Beyond The Scene', 'Big Top Stars'], 0], ['¿A quién le dicen "Worldwide Handsome"?', 'Who is called "Worldwide Handsome"?', ['Jin', 'V', 'Jimin'], 0], ['¿Cuál es el nombre real de SUGA?', 'What is SUGA\'s real name?', ['Min Yoongi', 'Jung Hoseok', 'Kim Namjoon'], 0]],
    skz: [['¿En qué año debutó Stray Kids?', 'What year did Stray Kids debut?', ['2016', '2018', '2020'], 1], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['STAY', 'CARAT', 'ENGENE'], 0], ['¿Cuál es su agencia?', 'Which agency are they with?', ['HYBE', 'JYP Entertainment', 'YG Entertainment'], 1], ['¿Quién es el líder?', 'Who is the leader?', ['Bang Chan', 'Changbin', 'Hyunjin'], 0], ['¿Cómo se llama su unidad de producción?', 'What is their producing unit called?', ['3RACHA', 'BSS', 'MISAMO'], 0], ['¿De qué país son Bang Chan y Felix?', 'Which country are Bang Chan and Felix from?', ['Canadá|Canada', 'Australia', 'Nueva Zelanda|New Zealand'], 1]],
    twice: [['¿En qué año debutó TWICE?', 'What year did TWICE debut?', ['2015', '2017', '2019'], 0], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['ONCE', 'STAY', 'Bunnies'], 0], ['¿En qué programa se formó TWICE?', 'Which survival show formed TWICE?', ['I-LAND', 'SIXTEEN', 'Produce 101'], 1], ['¿Quién es la líder?', 'Who is the leader?', ['Nayeon', 'Jihyo', 'Jeongyeon'], 1], ['¿De dónde es Tzuyu?', 'Where is Tzuyu from?', ['Taiwán|Taiwan', 'Japón|Japan', 'Tailandia|Thailand'], 0], ['¿Quiénes forman la subunidad MISAMO?', 'Who is in the sub-unit MISAMO?', ['Mina, Sana y Momo|Mina, Sana & Momo', 'Nayeon, Jihyo y Dahyun|Nayeon, Jihyo & Dahyun', 'Mina, Tzuyu y Chaeyoung|Mina, Tzuyu & Chaeyoung'], 0]],
    blackpink: [['¿En qué año debutó BLACKPINK?', 'What year did BLACKPINK debut?', ['2014', '2016', '2018'], 1], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['BLINK', 'ARMY', 'ONCE'], 0], ['¿Cuál es su agencia?', 'Which agency are they with?', ['SM', 'JYP', 'YG Entertainment'], 2], ['¿De qué país es Lisa?', 'Which country is Lisa from?', ['Tailandia|Thailand', 'Japón|Japan', 'Australia'], 0], ['¿Cuál es el nombre real de Rosé?', 'What is Rosé\'s real name?', ['Park Chaeyoung', 'Son Chaeyoung', 'Kim Chaewon'], 0], ['¿Con qué dos canciones debutaron?', 'Which two songs did they debut with?', ['Whistle y Boombayah|Whistle & Boombayah', 'DDU-DU DDU-DU y Forever Young|DDU-DU DDU-DU & Forever Young', 'Kill This Love y Don\'t Know What To Do|Kill This Love & Don\'t Know What To Do'], 0]],
    lngshot: [['¿En qué año debutó LNGSHOT?', 'What year did LNGSHOT debut?', ['2024', '2025', '2026'], 2], ['¿Quién fundó su sello MORE VISION?', 'Who founded their label MORE VISION?', ['Jay Park', 'PSY', 'Zico'], 0], ['¿Cuál fue su canción de debut?', 'What was their debut song?', ["Moonwalkin'", '4SHO 4SHO', 'Shot Callers'], 0], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['SHOTTIES', 'STAY', 'ENGENE'], 0], ['¿Cómo se llama su EP de debut?', 'What is their debut EP called?', ['SHOT CALLERS', 'LONG WAY', 'MOONLIGHT'], 0], ['¿Cómo se pronuncia LNGSHOT?', 'How do you pronounce LNGSHOT?', ['Longshot', 'Lingshot', 'Long Shoot'], 0]],
    seventeen: [['¿En qué año debutó SEVENTEEN?', 'What year did SEVENTEEN debut?', ['2013', '2015', '2017'], 1], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['CARAT', 'BLINK', 'ARMY'], 0], ['¿Quién es el líder?', 'Who is the leader?', ['S.Coups', 'Jeonghan', 'Mingyu'], 0], ['¿Cuáles son sus tres unidades?', 'What are their three units?', ['Hip-hop, Vocal y Performance|Hip-hop, Vocal & Performance', 'Rap, Dance y Ballad|Rap, Dance & Ballad', 'Sun, Moon y Star|Sun, Moon & Star'], 0], ['¿Qué miembro es el "tigre" del grupo (Horanghae)?', 'Which member is the group\'s "tiger" (Horanghae)?', ['Hoshi', 'Dino', 'Jun'], 0], ['¿Quiénes forman BSS (BooSeokSoon)?', 'Who is in BSS (BooSeokSoon)?', ['Seungkwan, DK y Hoshi|Seungkwan, DK & Hoshi', 'Woozi, Vernon y Dino|Woozi, Vernon & Dino', 'Jun, The8 y Mingyu|Jun, The8 & Mingyu'], 0]],
    enhypen: [['¿En qué año debutó ENHYPEN?', 'What year did ENHYPEN debut?', ['2019', '2020', '2022'], 1], ['¿En qué programa se formó?', 'Which survival show formed them?', ['I-LAND', 'SIXTEEN', 'Boys Planet'], 0], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['ENGENE', 'MOA', 'CARAT'], 0], ['¿Quién es el líder?', 'Who is the leader?', ['Jungwon', 'Jay', 'Sunghoon'], 0], ['¿De qué país es Ni-ki?', 'Which country is Ni-ki from?', ['Japón|Japan', 'Estados Unidos|United States', 'Australia'], 0], ['¿Cuál fue su canción de debut?', 'What was their debut song?', ['Given-Taken', 'Drunk-Dazed', 'Polaroid Love'], 0]],
    newjeans: [['¿En qué año debutó NewJeans?', 'What year did NewJeans debut?', ['2020', '2022', '2024'], 1], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['Bunnies', 'ONCE', 'STAY'], 0], ['¿Cuál fue su canción de debut?', 'What was their debut song?', ['Attention', 'Ditto', 'OMG'], 0], ['¿Quién es la menor del grupo?', 'Who is the youngest member?', ['Hyein', 'Minji', 'Haerin'], 0], ['¿Qué miembro es vietnamita-australiana?', 'Which member is Vietnamese-Australian?', ['Hanni', 'Minji', 'Haerin'], 0], ['¿Cuál es su agencia?', 'Which agency are they with?', ['ADOR', 'Pledis', 'JYP'], 0]],
    cortis: [['¿En qué año debutó CORTIS?', 'What year did CORTIS debut?', ['2023', '2025', '2026'], 1], ['¿Qué significa CORTIS?', 'What does CORTIS stand for?', ['Color Outside the Lines', 'Crew Of Real Talents', 'Cool On The Inside'], 0], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['COER', 'MOA', 'ENGENE'], 0], ['¿Cuál es su agencia?', 'Which agency are they with?', ['BIGHIT MUSIC', 'BELIFT LAB', 'KOZ'], 0], ['¿Qué miembro jugaba hockey?', 'Which member used to play hockey?', ['James', 'Martin', 'Keonho'], 0], ['¿Qué perro es el emoji de Martin?', 'Which dog is Martin\'s emoji?', ['Galgo italiano|Italian Greyhound', 'Chihuahua', 'Corgi'], 0]],
    ateez: [['¿En qué año debutó ATEEZ?', 'What year did ATEEZ debut?', ['2016', '2018', '2020'], 1], ['¿Cómo se llama su fandom?', 'What is their fandom called?', ['ATINY', 'STAY', 'MOA'], 0], ['¿Quién es el líder?', 'Who is the leader?', ['Hongjoong', 'Seonghwa', 'San'], 0], ['¿Cuál es su agencia?', 'Which agency are they with?', ['KQ Entertainment', 'JYP Entertainment', 'Cube Entertainment'], 0], ['¿Con qué canción debutaron?', 'What was their debut song?', ['Pirate King', 'Wonderland', 'BOUNCY'], 0], ['¿Quién es el menor del grupo?', 'Who is the youngest member?', ['Jongho', 'Wooyoung', 'Yeosang'], 0]]
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
  // los chibis van en WebP (tools/chibis_webp.js): pesan menos y el navegador no redibuja un SVG cada vez que uno se mueve
  // big = la versión grande (modo video, tarjeta para compartir); el resto usa la chica (-s.webp), que es la que se ve en pantalla
  function face(id, big) { return { src: 'assets/chibis/' + (ROSTER[id] ? id + (big ? '.webp' : '-s.webp') : 'default.svg'), photo: false }; }
  function faceImg(id, cls, alt) {
    return '<img src="' + esc(face(id).src) + '" alt="' + esc(alt || '') + '" class="' + (cls || '') + '" decoding="async" draggable="false">';
  }
  function members(id) { return ROSTER[id] || []; }
  function memberSrc(gid, mid, big) { return 'assets/chibis/' + gid + '/' + mid + (big ? '.webp' : '-s.webp'); }
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
  /* multitud de chibis: misma geometría que tools/chibis.py */
  function crowdLayout(n, target) {
    var rows = n <= 5 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
    // sprites de 132 x 174 (con el borde de sticker); paso y fila iguales a tools/chibis.py
    var k = rows[0], mw = Math.min(target * .66, target / (1 + (k - 1) * .545)), mh = mw * 174 / 132, step = mw * .545, row = mw * .5;
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
      sonarNote: 'Distancia en escala de raíz: lo cercano se ve más separado.', myCity: 'Tu ubicación', useLocation: 'Usar mi ubicación', checkNow: 'Revisar ahora',
      groupsTitle: '¿Cuándo y dónde?', feedTitle: 'Últimas alertas', testParty: 'Probar la celebración', subTitle: 'Recibir alertas', dcUseNtfy: 'Usar el celular (ntfy)', dcSoon: 'Mientras tanto, las alertas al celular con ntfy ya funcionan y te dejan elegir grupo y tipo.', dcSoonT: 'El servidor de Discord viene pronto.', dcNote: 'Para elegir también el tipo de alerta (solo estrenos, solo fechas...), usa el celular con ntfy.', dcYours: 'tus grupos', dcFollow: 'Entra a la publicación de {g} y toca "Seguir". Discord te avisará solo de esas.', dcForum: 'Abre el canal #alertas: es un foro con una publicación por grupo.', dcJoin: 'Entrar al servidor de Discord', ntfyMany: 'Son {n} temas: si te parecen muchos, quita tipos o grupos.', ntfyCopyAll: 'Copiar los {n} temas', ntfyOpen: 'Abrir en ntfy', ntfyHowIos: 'En la app toca "+", pega el nombre del tema y toca Subscribe. Repite con cada uno (el botón Copiar te lo deja listo).', ntfyHow: 'Toca "Abrir en ntfy" en cada uno y confirma en la app. Cada tema es un tipo de alerta de un grupo.', ntfyPick: 'Elige al menos un grupo y un tipo de alerta, o tu país.', ntfyOff: 'Las alertas por ntfy están apagadas en este radar.', topicWeekly: 'Resumen de los lunes', topicCountry: '{c}: fechas nuevas y día del show', catMembers: 'Integrantes y cumpleaños', catNews: 'Noticias de prensa', catMusic: 'Estrenos', catShows: 'Fechas y conciertos', ntfySubTitle: 'Suscríbete a tus temas', ntfyWhy: 'Es gratis y no pide cuenta, número ni correo. Te llegan notificaciones aunque la web esté cerrada.', storeAndroid: 'Disponible en', storeIos: 'Descárgala en', ntfyInstall: 'Instala ntfy, la app que recibe las alertas', fWeekly: 'El resumen de los lunes: shows, estrenos y cumpleaños de la semana', fCountryAria: 'País', fCountry: 'Fechas nuevas de cualquier grupo en',
      subLead: 'Elige tus grupos y qué quieres saber. Gratis, sin cuenta y sin darnos tu número ni tu correo.',
      fGroups: 'Tus grupos', fTypes: 'Qué quieres que te avisemos',
      preview: 'Así te llegaría',
      privacy: 'No guardamos nada tuyo: tus elecciones quedan solo en este navegador y la suscripción vive en tu app.',
      privacyLink: 'Cómo usamos tus datos', privacyTitle: 'Privacidad',
      privacy1: 'El radar no tiene cuentas, ni cookies de rastreo, ni analítica. En tu navegador (localStorage) se guardan tu ciudad, tu idioma, si silenciaste los sonidos, tu grupo favorito, qué alertas ya viste y lo que elegiste en "Recibir alertas" (grupos, tipos y país). Nada de eso sale de tu equipo.',
      privacy2: 'Al entrar, el radar le pide tu ubicación al navegador. Si aceptas, la posición se redondea (unos 1 km) y se guarda solo en tu equipo para medir distancias; si no, usamos Bucaramanga o la ciudad que elijas. Tu ubicación nunca sale de tu equipo.',
      privacy3: 'Las fuentes se cargan desde Google Fonts. Las portadas de los estrenos vienen de Apple Music y YouTube, y el mapa de ciudad (solo si lo abres) de OpenFreeMap. Cada uno de esos servicios ve tu dirección IP, como en cualquier sitio que los use. Para borrar todo, usa "Borrar mis datos" o limpia los datos del sitio en tu navegador.',
      subDelete: 'Borrar mis elecciones', bye: 'Nos vemos en la próxima parada', footLead: 'El robot revisa giras, estrenos, avisos y redes cada 15 minutos. Tú solo vuelve cuando quieras.', howTitle: 'Cómo funciona',
      disclaimer1: 'Esto muestra la agenda oficial y pública de cada grupo. No rastrea a nadie en tiempo real: el chibi está en la próxima fecha confirmada, no donde están en este momento.',
      disclaimer2: 'Las horas son aproximadas (20:00 hora local cuando la fuente no la trae) y las coordenadas de los recintos también. Las fechas marcadas como anunciadas vienen de un solo anuncio y pueden cambiar.',
      sources: 'Fuentes', credit: 'Hecho con amor de fan por', dockWorld: 'Mundo', dockGroups: 'Grupos', dockFeed: 'Avisos', dockAlerts: 'Alertas', dockVideo: 'Video',
      iosTitle: 'Instálala en tu iPhone', ios1: 'Toca el botón Compartir de Safari.', ios2: 'Elige "Añadir a pantalla de inicio".', ios3: 'Abre Radar K-pop desde tu pantalla, como una app.', gotIt: 'Listo',
      live: 'En vivo ahora', liveKo: '공연 중', next: 'Próxima parada', nextKo: '다음 공연', rest: 'Sin fechas anunciadas', restKo: '쉬는 중',
      restWhere: 'En pausa', lastStop: 'Última parada', kmFrom: 'km de {city}', flight: '~{h} h de vuelo directo', localTime: 'hora local', yourTime: 'en tu hora',
      days: 'días', hours: 'horas', mins: 'min', secs: 'seg', share: 'Compartir', calendar: 'Agregar al calendario', calShort: 'Agendar', seeCard: 'Ver ficha', seeGlobe: 'Ver en el globo',
      tour: 'Ver gira ({n} ciudades)', pastTour: 'Última gira ({n} ciudades)', tour1: 'Ver gira (1 ciudad)', pastTour1: 'Última gira (1 ciudad)', restShows1: 'shows en 1 ciudad', announced: 'anunciado', toConfirm: 'por confirmar', timeTbd: 'hora por confirmar', seeNotice: 'Ver el anuncio oficial', seeNews: 'Ver la noticia', bias: 'Mi grupo favorito', nearest: 'Lo más cerca de ti', nothingNear: 'Ningún grupo tiene fechas por ahora.',
      agendaOf: 'Agenda del {when}', checkedAgo: 'revisada hace {ago}', offline: 'Sin conexión con la agenda, mostrando la última copia ({when})', loading: 'Cargando agenda',
      emptyFeed: 'Todavía no hay alertas. Aparecen aquí cuando cambia la agenda, un grupo pasa a la siguiente ciudad, hay un show por empezar o sale una noticia de gira o comeback.',
      ago: 'hace {n}', newAlert: '¡Alerta nueva!', moreAlerts: 'y {n} alertas más en el feed', close: 'Cerrar', closeVideo: 'Salir', replay: 'Repetir', see: 'Ver',
      shareText: '{g} en {city} en {d}. ¿Y tú, cuándo los ves?', shareRest: '{g} está en pausa, sin fechas anunciadas. Esperando juntos.', shared: 'Tarjeta lista', saved: 'Imagen descargada',
      icsSaved: 'Evento descargado, ábrelo para guardarlo', geoAsk: 'Buscando tu ubicación...', geoFail: 'No pudimos leer tu ubicación', myLocation: 'Mi ubicación',
      copy: 'Copiar', copied: 'Copiado', deleted: 'Elecciones borradas',
      pvNow: 'ahora',
      vTitle: '¿Dónde están hoy?', vRest: 'en pausa, esperando fechas', vOutro: '¿Y tú, cuándo los ves?', dday: 'D-DAY', unmute: 'Sonidos activados', mute: 'Sonidos en silencio',
      installed: 'Radar instalado', tapToStart: 'Toca para empezar',
      zoomIn: 'Acercar', zoomOut: 'Alejar', centerMe: 'Centrar en mí', geoLooking: 'Buscando tu ubicación...', geoDenied: 'No pudimos leer tu ubicación. Usamos Bucaramanga, puedes cambiarla en "Tu ciudad".',
      geoOk: 'Usando tu ubicación, cerca de {city}', geoNear: 'cerca de {city}', geoNote: 'Sin permiso de ubicación: estamos midiendo desde Bucaramanga.', retry: 'Reintentar', youRef: 'ti',
      sightTitle: 'Avistamientos cercanos', sightRecent: 'Más recientes', sightNear: 'Más cerca de mí', sightLead: 'Publicaciones oficiales de los grupos que mencionan una ciudad: primero lo más reciente (o lo más cerca, si prefieres). Solo la ciudad, nunca hoteles, aeropuertos ni lugares exactos.',
      sightSample: 'Datos de ejemplo: todavía no hay conexión con las cuentas oficiales.', sightAway: 'a {km} km de ti', sightNew: '¡{n} avistamientos nuevos!', sightNew1: '¡Un avistamiento nuevo!', sightSee: 'Ver post oficial',
      sightEmpty: 'Todavía no hay avistamientos. Aparecen cuando una cuenta oficial menciona una ciudad.', tickerK: 'AVISTAMIENTOS CERCANOS', sightSource: 'Fuente: cuentas oficiales en X',
      squad: 'Toca a cada miembro', notOnTour: 'no va en esta gira', photoAlt: 'Foto oficial de {g}', withUnit: 'con {names}',
      gpOpen: 'Ver todo', swipeHint: 'Desliza para ver los demás grupos', feedMore: 'Ver {n} más', groupsPick: 'Grupos', gpHome: 'Inicio', gpMembers: 'Miembros', gpTour: 'Gira', gpMusic: 'Música', gpSocial: 'Redes', gpSeeTour: 'Ver la gira', gpTapMember: 'Toca a un miembro para ver su perfil, su cumpleaños y sus redes.', gpAllMembers: 'Todos los miembros', gpNoPersonal: 'No tiene cuentas personales públicas; sigue al grupo en Redes.', gpLatestPosts: 'Lo último que publicaron', gpPlayHere: 'Ver aquí', gpOpenPost: 'Abrir el post', gpSource: 'fuente', gpUpcoming: 'Próximas fechas ({n} ciudades)', gpPast: 'Últimas paradas ({n})', gpNoDates: 'Sin fechas anunciadas por ahora.', gpNoPosts: 'Todavía no hay posts guardados; el robot los trae solo.', gpMemberAccounts: 'Cuentas de los miembros', bdayToday: 'Hoy cumple {name}', bdayIsToday: '¡cumple hoy!', bdayIn: 'cumple en {n} días', bdayTurnsToday: '¡hoy cumple {n}!', bdayAgeIn: '{age} años · cumple en {n} días', regCo: 'Colombia', regLatam: 'Latinoamérica y el Caribe', regNa: 'Estados Unidos y Canadá', regEu: 'Europa', regAsia: 'Asia, Oceanía y Medio Oriente', listen: 'Escúchalos en', nextRelease: 'Próximo estreno', relToday: '¡Sale hoy!', relNew: 'Nuevo', relAnn: 'anuncio oficial', noticesTitle: 'Avisos oficiales', statsTitle: 'Datos y números', stDebut: 'debut · {d}', stYears: '{n} años', stYear: '1 año', stRookie: 'novatos', stCareer: 'de carrera',
      stMembers: 'miembros', stDebutK: 'debut', stListeners: 'oyentes mensuales en Spotify', stPeak: 'récord de oyentes mensuales', stStreams: 'reproducciones en Spotify',
      stTopSong: 'su canción más escuchada · {n} reproducciones', stTopSongK: 'su canción más escuchada', stSubs: 'suscriptores en YouTube', stAgency: 'Agencia',
      stSource: 'Números de Spotify vía kworb.net, se actualizan solos una vez al día.',
      triviaTitle: 'Mini trivia', triviaOk: '¡Correcto!', triviaNo: 'Casi... era {a}', triviaScore: '{n} de {t} correctas',
      onsaleToday: '¡HOY VENDEN BOLETAS!', onsaleIn: 'Venta de boletas {d} · {when}', pushTab: 'Celular',
      msMil: 'en servicio militar', msSoon: 'se enlista el {d}', msBack: '¡volvió!', msBackOn: 'volvió el {d}', msPending: 'regreso sin anunciar', msUntil: 'vuelve el {d}', msUntilEst: 'vuelve hacia {d} (estimado)',
      msLeft: 'faltan {n} días', msSince: 'se enlistó el {d}', msTitle: 'En servicio militar ({n})', msNote: 'Las fechas de regreso marcadas como estimadas salen de la duración del servicio (18 meses activo, 21 alternativo); cambian solas cuando hay aviso oficial.',
      fmTitle: 'Exintegrantes', fmLeft: 'salió del grupo', fmSolo: 'ahora es solista', fmContract: 'contrato terminado', fmBack: '¡volvió al grupo!', fmSince: 'desde {d}',
      rwNews: 'Hay noticias sobre esto', rwOfficial: 'Aviso oficial', rwSee: 'Ver la noticia',
      homeAria: 'Radar K-pop, inicio', langAria: 'Idioma', navAria: 'Secciones', navCity: 'Tú', navSight: 'Avistamientos', navMedia: 'Estrenos', viewAria: 'Vista',
      globeAria: 'Globo con la próxima parada de cada grupo', autoSpin: 'Girar solo', channelAria: 'Canal', sortAria: 'Orden', filterAria: 'Filtrar',
      mediaTitle: 'Estrenos y videos', mediaLead: 'Primero la música: canciones, álbumes y MV. Los vlogs, teasers y shorts están en Videos.', mediaAll: 'Todo', mediaMusic: 'Música y MV', mediaVideo: 'Videos', vkMv: 'MV', vkTeaser: 'Teaser', vkShort: 'Short', vkVlog: 'Vlog', vkBehind: 'Detrás de cámaras', vkShow: 'Programa',
      mediaSrc: 'Fuentes: catálogo de Apple Music (iTunes Search API) y canales oficiales de YouTube. Se actualiza solo.', mediaEmpty: 'Todavía no hay estrenos guardados.',
      mediaListen: 'Escuchar', mediaWatch: 'Ver video', mediaSample: 'Datos de ejemplo', released: 'salió {when}',
      cityOpen: 'Mapa de la ciudad', cityShort: 'Mapa', restShows: 'shows en {n} ciudades', cityLoading: 'Dibujando la ciudad...', cityTilt: 'Vista 3D', cityVenue: 'Volver al recinto', cityFail: 'No pudimos cargar el mapa. Revisa tu conexión.',
      cityK: 'Próxima parada', cityLast: 'Última parada', cityYou: 'Tú', cityAttr: 'Mapa: OpenFreeMap · datos © OpenStreetMap',
      locReal: 'Ubicación real', locNear: 'cerca de {city}', locAcc: '±{km} km', locDefault: 'Ciudad por defecto: Bucaramanga', locChosen: 'Ciudad elegida por ti',
      locAsking: 'Esperando el permiso de ubicación...', locWhy: 'Motivo: {why}', locFix: 'Cómo activarla', locAgain: 'Intentar de nuevo',
      whyDenied: 'el permiso está bloqueado', whyTimeout: 'el GPS tardó demasiado', whyUnavailable: 'el equipo no encontró tu posición', whyInsecure: 'la página no está en HTTPS',
      whyUnsupported: 'este navegador no da ubicación', whyPending: 'todavía no has dado permiso',
      locAskTitle: '¿Medimos desde donde estás?', locAskBody: 'Toca el botón y tu navegador te preguntará. Tu ubicación se queda en tu equipo, redondeada a 1 km.',
      locAskBtn: 'Usar mi ubicación real', locAskNo: 'Ahora no',
      helpIOS: 'En iPhone: Ajustes, Privacidad y seguridad, Localización (activa), Sitios web de Safari: "Mientras se usa". Luego en Safari toca "aA", Ajustes del sitio web, Ubicación: Permitir.',
      helpAndroid: 'En Android: toca el candado junto a la dirección, Permisos, Ubicación: Permitir. Revisa también que la ubicación del teléfono esté encendida.',
      helpDesktop: 'Haz clic en el candado o el ícono de ajustes junto a la dirección y permite la ubicación para este sitio. Luego toca "Intentar de nuevo".',
      langHello: '¡Hola!', vNext: 'próxima parada', vAll: '{n} grupos de gira', vWaiting: 'esperando fechas',
      changesTitle: 'Novedades', you2: 'Tú',
      privacy4: 'Responsable: Cristian Pérez (cristianperez.me). Las alertas llegan por ntfy (ntfy.sh) o Discord: el radar publica en temas y canales públicos y tú decides a cuáles suscribirte desde tu app, así que el radar nunca conoce tu número, tu correo ni tu ubicación. Puedes borrar tus elecciones con "Borrar mis elecciones", cancelar la suscripción en la app cuando quieras, o escribir a crisperezm879@gmail.com.',
      T: { new_date: 'Fecha nueva', changed: 'Cambio', removed: 'Quitada', stop_today: 'Hoy', live: 'En vivo', next_stop: 'Siguiente parada', arrival_official: 'Llegada oficial', arrival: 'Llegada', latam: 'Latam', comeback: 'Comeback', tour: 'Gira', official: 'Oficial', video: 'Video', prox: 'Cerca de ti', prox_new: 'Cerca de ti', roster: 'Miembros', birthday: 'Cumpleaños', weekly: 'Tu semana' },
      months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], wdays: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
      cardinal: ['N', 'E', 'S', 'O'], locale: 'es-CO'
    },
    en: {
      skip: 'Skip to the groups', install: 'Install', globe: 'Globe', sonar: 'Sonar', videoMode: 'Video mode', dragHint: 'drag me', you: 'You',
      sonarNote: 'Square-root distance scale: nearby stops look more spread out.', myCity: 'Your location', useLocation: 'Use my location', checkNow: 'Check now',
      groupsTitle: 'When and where?', feedTitle: 'Latest alerts', testParty: 'Try the celebration', subTitle: 'Get alerts', dcUseNtfy: 'Use the phone (ntfy)', dcSoon: 'Meanwhile, phone alerts with ntfy already work and let you pick group and type.', dcSoonT: 'The Discord server is coming soon.', dcNote: 'To also pick the alert type (only releases, only dates...), use the phone tab with ntfy.', dcYours: 'your groups', dcFollow: 'Open the post for {g} and tap "Follow". Discord will only ping you about those.', dcForum: 'Open the #alertas channel: it is a forum with one post per group.', dcJoin: 'Join the Discord server', ntfyMany: 'That is {n} topics: if it feels like a lot, remove some types or groups.', ntfyCopyAll: 'Copy all {n} topics', ntfyOpen: 'Open in ntfy', ntfyHowIos: 'In the app tap "+", paste the topic name and tap Subscribe. Repeat for each one (the Copy button gets it ready).', ntfyHow: 'Tap "Open in ntfy" on each one and confirm in the app. Each topic is one alert type from one group.', ntfyPick: 'Pick at least one group and one alert type, or your country.', ntfyOff: 'ntfy alerts are turned off on this radar.', topicWeekly: 'Monday recap', topicCountry: '{c}: new dates and show day', catMembers: 'Members and birthdays', catNews: 'Press news', catMusic: 'Releases', catShows: 'Dates and concerts', ntfySubTitle: 'Subscribe to your topics', ntfyWhy: 'It is free and asks for no account, number or email. Notifications arrive even when the site is closed.', storeAndroid: 'Get it on', storeIos: 'Download on the', ntfyInstall: 'Install ntfy, the app that gets the alerts', fWeekly: 'The Monday recap: shows, releases and birthdays of the week', fCountryAria: 'Country', fCountry: 'New dates from any group in',
      subLead: 'Pick your groups and what you want to know. Free, no account, and no phone number or email.',
      fGroups: 'Your groups', fTypes: 'What should we tell you about',
      preview: 'This is how it arrives',
      privacy: 'We keep nothing of yours: your choices stay in this browser and the subscription lives in your app.',
      privacyLink: 'How we use your data', privacyTitle: 'Privacy',
      privacy1: 'The radar has no accounts, no tracking cookies and no analytics. Your browser (localStorage) keeps your city, your language, whether you muted sounds, your favorite group, which alerts you already saw and what you picked in "Get alerts" (groups, types and country). None of it leaves your device.',
      privacy2: 'When you open it, the radar asks your browser for your location. If you allow it, the position is rounded (about 1 km) and stored only on your device to measure distances; if not, we use Bucaramanga or the city you choose. Your location never leaves your device.',
      privacy3: 'Fonts load from Google Fonts. Release covers come from Apple Music and YouTube, and the city map (only if you open it) from OpenFreeMap. Each of those services sees your IP address, like on any site that uses them. To erase everything, use "Delete my data" or clear this site\'s data in your browser.',
      subDelete: 'Delete my choices', bye: 'See you at the next stop', footLead: 'The robot checks tours, releases, notices and socials every 15 minutes. Just come back whenever you like.', howTitle: 'How it works',
      disclaimer1: 'This shows each group\'s official, public schedule. It does not track anyone in real time: the chibi stands on the next confirmed date, not where they are right now.',
      disclaimer2: 'Times are approximate (8 pm local time when the source has none) and so are venue coordinates. Dates marked as announced come from a single announcement and may change.',
      sources: 'Sources', credit: 'Made with fan love by', dockWorld: 'World', dockGroups: 'Groups', dockFeed: 'News', dockAlerts: 'Alerts', dockVideo: 'Video',
      iosTitle: 'Install it on your iPhone', ios1: 'Tap Safari\'s Share button.', ios2: 'Choose "Add to Home Screen".', ios3: 'Open Radar K-pop from your home screen, like an app.', gotIt: 'Got it',
      live: 'Live now', liveKo: '공연 중', next: 'Next stop', nextKo: '다음 공연', rest: 'No dates announced', restKo: '쉬는 중',
      restWhere: 'On a break', lastStop: 'Last stop', kmFrom: 'km from {city}', flight: '~{h} h direct flight', localTime: 'local time', yourTime: 'your time',
      days: 'days', hours: 'hours', mins: 'min', secs: 'sec', share: 'Share', calendar: 'Add to calendar', calShort: 'Save date', seeCard: 'Details', seeGlobe: 'See on the globe',
      tour: 'See tour ({n} cities)', pastTour: 'Last tour ({n} cities)', tour1: 'See tour (1 city)', pastTour1: 'Last tour (1 city)', restShows1: 'shows in 1 city', announced: 'announced', toConfirm: 'to be confirmed', timeTbd: 'time to be confirmed', seeNotice: 'See the official announcement', seeNews: 'See the news', bias: 'My favorite group', nearest: 'Closest to you', nothingNear: 'No group has dates right now.',
      agendaOf: 'Schedule from {when}', checkedAgo: 'checked {ago} ago', offline: 'Can\'t reach the schedule, showing the last copy ({when})', loading: 'Loading schedule',
      emptyFeed: 'No alerts yet. They show up here when the schedule changes, a group moves to the next city, a show is about to start or there is tour or comeback news.',
      ago: '{n} ago', newAlert: 'New alert!', moreAlerts: 'and {n} more alerts in the feed', close: 'Close', closeVideo: 'Exit', replay: 'Replay', see: 'See',
      shareText: '{g} in {city} in {d}. When are you seeing them?', shareRest: '{g} is on a break, no dates yet. Waiting together.', shared: 'Card ready', saved: 'Image downloaded',
      icsSaved: 'Event downloaded, open it to save it', geoAsk: 'Finding you...', geoFail: 'We could not read your location', myLocation: 'My location',
      copy: 'Copy', copied: 'Copied', deleted: 'Choices deleted',
      pvNow: 'now',
      vTitle: 'Where are they today?', vRest: 'on a break, waiting for dates', vOutro: 'When are you seeing them?', dday: 'D-DAY', unmute: 'Sounds on', mute: 'Sounds muted',
      installed: 'Radar installed', tapToStart: 'Tap to start',
      zoomIn: 'Zoom in', zoomOut: 'Zoom out', centerMe: 'Center on me', geoLooking: 'Finding you...', geoDenied: 'We could not read your location. Using Bucaramanga, you can change it in "Your city".',
      geoOk: 'Using your location, near {city}', geoNear: 'near {city}', geoNote: 'No location permission: measuring from Bucaramanga.', retry: 'Try again', youRef: 'you',
      sightTitle: 'Sightings near you', sightRecent: 'Newest', sightNear: 'Nearest to me', sightLead: 'Official group posts that mention a city: newest first (or nearest, if you prefer). City level only, never hotels, airports or exact places.',
      sightSample: 'Sample data: not connected to the official accounts yet.', sightAway: '{km} km from you', sightNew: '{n} new sightings!', sightNew1: 'A new sighting!', sightSee: 'See official post',
      sightEmpty: 'No sightings yet. They show up when an official account mentions a city.', tickerK: 'SIGHTINGS NEAR YOU', sightSource: 'Source: official accounts on X',
      squad: 'Tap each member', notOnTour: 'not on this tour', photoAlt: 'Official photo of {g}', withUnit: 'with {names}',
      gpOpen: 'See all', swipeHint: 'Swipe to see the other groups', feedMore: 'See {n} more', groupsPick: 'Groups', gpHome: 'Home', gpMembers: 'Members', gpTour: 'Tour', gpMusic: 'Music', gpSocial: 'Social', gpSeeTour: 'See the tour', gpTapMember: 'Tap a member to see their profile, birthday and accounts.', gpAllMembers: 'All members', gpNoPersonal: 'No public personal accounts; follow the group under Social.', gpLatestPosts: 'Latest posts', gpPlayHere: 'Watch here', gpOpenPost: 'Open the post', gpSource: 'source', gpUpcoming: 'Upcoming dates ({n} cities)', gpPast: 'Last stops ({n})', gpNoDates: 'No dates announced for now.', gpNoPosts: 'No posts saved yet; the robot brings them on its own.', gpMemberAccounts: 'Members\' accounts', bdayToday: "It's {name}'s birthday", bdayIsToday: 'birthday today!', bdayIn: 'birthday in {n} days', bdayTurnsToday: 'turns {n} today!', bdayAgeIn: '{age} years old · birthday in {n} days', regCo: 'Colombia', regLatam: 'Latin America and the Caribbean', regNa: 'United States and Canada', regEu: 'Europe', regAsia: 'Asia, Oceania and Middle East', listen: 'Listen on', nextRelease: 'Next release', relToday: 'Out today!', relNew: 'New', relAnn: 'official announcement', noticesTitle: 'Official notices', statsTitle: 'Facts and numbers', stDebut: 'debut · {d}', stYears: '{n} years', stYear: '1 year', stRookie: 'rookies', stCareer: 'since debut',
      stMembers: 'members', stDebutK: 'debut', stListeners: 'Spotify monthly listeners', stPeak: 'monthly listeners record', stStreams: 'Spotify streams',
      stTopSong: 'their most streamed song · {n} streams', stTopSongK: 'their most streamed song', stSubs: 'YouTube subscribers', stAgency: 'Agency',
      stSource: 'Spotify numbers via kworb.net, updated automatically once a day.',
      triviaTitle: 'Mini trivia', triviaOk: 'Correct!', triviaNo: 'So close... it was {a}', triviaScore: '{n} of {t} right',
      onsaleToday: 'TICKETS ON SALE TODAY!', onsaleIn: 'Tickets on sale {d} · {when}', pushTab: 'Phone',
      msMil: 'in military service', msSoon: 'enlists on {d}', msBack: 'back!', msBackOn: 'back since {d}', msPending: 'return not announced', msUntil: 'back on {d}', msUntilEst: 'back around {d} (estimate)',
      msLeft: '{n} days to go', msSince: 'enlisted on {d}', msTitle: 'In military service ({n})', msNote: 'Return dates marked as estimates come from the length of service (18 months active, 21 alternative); they update on their own when there is an official notice.',
      fmTitle: 'Former members', fmLeft: 'left the group', fmSolo: 'now a soloist', fmContract: 'contract ended', fmBack: 'back in the group!', fmSince: 'since {d}',
      rwNews: 'There is news about this', rwOfficial: 'Official notice', rwSee: 'See the news',
      homeAria: 'Radar K-pop, home', langAria: 'Language', navAria: 'Sections', navCity: 'You', navSight: 'Sightings', navMedia: 'Releases', viewAria: 'View',
      globeAria: 'Globe with each group\'s next stop', autoSpin: 'Auto-rotate', channelAria: 'Channel', sortAria: 'Order', filterAria: 'Filter',
      mediaTitle: 'Releases and videos', mediaLead: 'Music first: songs, albums and MVs. Vlogs, teasers and shorts are under Videos.', mediaAll: 'All', mediaMusic: 'Music & MVs', mediaVideo: 'Videos', vkMv: 'MV', vkTeaser: 'Teaser', vkShort: 'Short', vkVlog: 'Vlog', vkBehind: 'Behind the scenes', vkShow: 'Show',
      mediaSrc: 'Sources: Apple Music catalog (iTunes Search API) and official YouTube channels. Updates on its own.', mediaEmpty: 'No releases saved yet.',
      mediaListen: 'Listen', mediaWatch: 'Watch video', mediaSample: 'Sample data', released: 'out {when}',
      cityOpen: 'City map', cityShort: 'Map', restShows: 'shows in {n} cities', cityLoading: 'Drawing the city...', cityTilt: '3D view', cityVenue: 'Back to the venue', cityFail: 'We could not load the map. Check your connection.',
      cityK: 'Next stop', cityLast: 'Last stop', cityYou: 'You', cityAttr: 'Map: OpenFreeMap · data © OpenStreetMap',
      locReal: 'Real location', locNear: 'near {city}', locAcc: '±{km} km', locDefault: 'Default city: Bucaramanga', locChosen: 'City you picked',
      locAsking: 'Waiting for location permission...', locWhy: 'Why: {why}', locFix: 'How to turn it on', locAgain: 'Try again',
      whyDenied: 'permission is blocked', whyTimeout: 'GPS took too long', whyUnavailable: 'your device could not find a position', whyInsecure: 'the page is not on HTTPS',
      whyUnsupported: 'this browser does not share location', whyPending: 'you have not allowed it yet',
      locAskTitle: 'Measure from where you are?', locAskBody: 'Tap the button and your browser will ask. Your location stays on your device, rounded to 1 km.',
      locAskBtn: 'Use my real location', locAskNo: 'Not now',
      helpIOS: 'On iPhone: Settings, Privacy & Security, Location Services (on), Safari Websites: "While Using". Then in Safari tap "aA", Website Settings, Location: Allow.',
      helpAndroid: 'On Android: tap the lock next to the address, Permissions, Location: Allow. Also check that the phone\'s location is on.',
      helpDesktop: 'Click the lock or settings icon next to the address and allow location for this site. Then tap "Try again".',
      langHello: 'Hello!', vNext: 'next stop', vAll: '{n} groups on tour', vWaiting: 'waiting for dates',
      changesTitle: 'What\'s new', you2: 'You',
      privacy4: 'Data controller: Cristian Pérez (cristianperez.me). Alerts arrive through ntfy (ntfy.sh) or Discord: the radar posts to public topics and channels and you choose which to subscribe to from your app, so the radar never knows your number, email or location. You can delete your choices with "Delete my choices", unsubscribe in the app anytime, or write to crisperezm879@gmail.com.',
      T: { new_date: 'New date', changed: 'Changed', removed: 'Removed', stop_today: 'Today', live: 'Live', next_stop: 'Next stop', arrival_official: 'Official arrival', arrival: 'Arrival', latam: 'Latam', comeback: 'Comeback', tour: 'Tour', official: 'Official', video: 'Video', prox: 'Near you', prox_new: 'Near you', roster: 'Members', birthday: 'Birthday', weekly: 'Your week' },
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
  Object.keys(window.RADAR_PLACES || {}).forEach(function (k) { EN_PLACES[k] = window.RADAR_PLACES[k]; });
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
    if (EN_PLACES[s]) return EN_PLACES[s];
    var keys = Object.keys(EN_PLACES);
    for (var i = 0; i < keys.length; i++) if (s === keys[i] || s.indexOf(keys[i] + ' ') === 0) return EN_PLACES[keys[i]] + s.slice(keys[i].length);
    return s;
  }
  function tourName(g) { return (lang === 'en' && g.tour_en) ? g.tour_en : (g.tour || ''); }
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
    ['Tokio', 'Japón', 35.6762, 139.6503], ['Manila', 'Filipinas', 14.5995, 120.9842], ['Sídney', 'Australia', -33.8688, 151.2093],
    ['Pereira', 'Colombia', 4.8133, -75.6961], ['Manizales', 'Colombia', 5.0703, -75.5138], ['Cúcuta', 'Colombia', 7.8939, -72.5078],
    ['Santa Marta', 'Colombia', 11.2408, -74.199], ['Ibagué', 'Colombia', 4.4389, -75.2322], ['Villavicencio', 'Colombia', 4.142, -73.6266],
    ['Armenia', 'Colombia', 4.5339, -75.6811], ['Pasto', 'Colombia', 1.2136, -77.2811], ['Neiva', 'Colombia', 2.9273, -75.2819],
    ['Montería', 'Colombia', 8.7479, -75.8814], ['Tunja', 'Colombia', 5.5353, -73.3678], ['Popayán', 'Colombia', 2.4448, -76.6147],
    ['Valledupar', 'Colombia', 10.4631, -73.2532], ['Sincelejo', 'Colombia', 9.3047, -75.3978], ['Puebla', 'México', 19.0414, -98.2063],
    ['Tijuana', 'México', 32.5149, -117.0382], ['León', 'México', 21.125, -101.686], ['Querétaro', 'México', 20.5888, -100.3899],
    ['Mérida', 'México', 20.9674, -89.5926], ['Cancún', 'México', 21.1619, -86.8515], ['Toluca', 'México', 19.2826, -99.6557],
    ['San Luis Potosí', 'México', 22.1565, -100.9855], ['Aguascalientes', 'México', 21.8853, -102.2916], ['Chihuahua', 'México', 28.632, -106.0691],
    ['Hermosillo', 'México', 29.0729, -110.9559], ['Culiacán', 'México', 24.8091, -107.394], ['Mexicali', 'México', 32.6245, -115.4523],
    ['Veracruz', 'México', 19.1738, -96.1342], ['Morelia', 'México', 19.706, -101.195], ['Torreón', 'México', 25.5428, -103.4068],
    ['Saltillo', 'México', 25.4232, -101.0053], ['Oaxaca', 'México', 17.0732, -96.7266], ['Villahermosa', 'México', 17.9892, -92.9475],
    ['Tuxtla Gutiérrez', 'México', 16.7516, -93.1029], ['Brasília', 'Brasil', -15.7939, -47.8828], ['Belo Horizonte', 'Brasil', -19.9167, -43.9345],
    ['Salvador', 'Brasil', -12.9777, -38.5016], ['Fortaleza', 'Brasil', -3.7319, -38.5267], ['Recife', 'Brasil', -8.0476, -34.877],
    ['Porto Alegre', 'Brasil', -30.0346, -51.2177], ['Curitiba', 'Brasil', -25.4284, -49.2733], ['Manaos', 'Brasil', -3.119, -60.0217],
    ['Belém', 'Brasil', -1.4558, -48.4902], ['Goiânia', 'Brasil', -16.6869, -49.2648], ['Florianópolis', 'Brasil', -27.5949, -48.5482],
    ['Campinas', 'Brasil', -22.9099, -47.0626], ['Natal', 'Brasil', -5.7945, -35.211], ['Río de Janeiro', 'Brasil', -22.9068, -43.1729],
    ['Córdoba', 'Argentina', -31.4201, -64.1888], ['Rosario', 'Argentina', -32.9442, -60.6505], ['Mendoza', 'Argentina', -32.8895, -68.8458],
    ['La Plata', 'Argentina', -34.9205, -57.9536], ['Mar del Plata', 'Argentina', -38.0055, -57.5426], ['Tucumán', 'Argentina', -26.8083, -65.2176],
    ['Salta', 'Argentina', -24.7821, -65.4232], ['Neuquén', 'Argentina', -38.9516, -68.0591], ['Valparaíso', 'Chile', -33.0472, -71.6127],
    ['Concepción', 'Chile', -36.827, -73.0503], ['Antofagasta', 'Chile', -23.6509, -70.3975], ['Arequipa', 'Perú', -16.409, -71.5375],
    ['Trujillo', 'Perú', -8.1091, -79.0215], ['Cusco', 'Perú', -13.532, -71.9675], ['Cuenca', 'Ecuador', -2.9001, -79.0059],
    ['Maracaibo', 'Venezuela', 10.6545, -71.6406], ['Valencia (Venezuela)', 'Venezuela', 10.162, -68.0077], ['Santa Cruz de la Sierra', 'Bolivia', -17.8146, -63.1561],
    ['Cochabamba', 'Bolivia', -17.3895, -66.1568], ['Ciudad del Este', 'Paraguay', -25.5097, -54.6111], ['Ciudad de Guatemala', 'Guatemala', 14.6349, -90.5069],
    ['San Salvador', 'El Salvador', 13.6929, -89.2182], ['Tegucigalpa', 'Honduras', 14.0723, -87.1921], ['San Pedro Sula', 'Honduras', 15.5042, -88.025],
    ['Managua', 'Nicaragua', 12.115, -86.2362], ['La Habana', 'Cuba', 23.1136, -82.3666], ['Santiago de los Caballeros', 'Rep. Dominicana', 19.4517, -70.697],
    ['Houston', 'EE. UU.', 29.7604, -95.3698], ['Dallas', 'EE. UU.', 32.7767, -96.797], ['San Antonio', 'EE. UU.', 29.4241, -98.4936],
    ['Austin', 'EE. UU.', 30.2672, -97.7431], ['Chicago', 'EE. UU.', 41.8781, -87.6298], ['Atlanta', 'EE. UU.', 33.749, -84.388],
    ['Washington D. C.', 'EE. UU.', 38.9072, -77.0369], ['Boston', 'EE. UU.', 42.3601, -71.0589], ['Filadelfia', 'EE. UU.', 39.9526, -75.1652],
    ['San Francisco', 'EE. UU.', 37.7749, -122.4194], ['San José (California)', 'EE. UU.', 37.3382, -121.8863], ['Seattle', 'EE. UU.', 47.6062, -122.3321],
    ['Las Vegas', 'EE. UU.', 36.1699, -115.1398], ['Phoenix', 'EE. UU.', 33.4484, -112.074], ['Denver', 'EE. UU.', 39.7392, -104.9903],
    ['Orlando', 'EE. UU.', 28.5383, -81.3792], ['Tampa', 'EE. UU.', 27.9506, -82.4572], ['San Diego', 'EE. UU.', 32.7157, -117.1611],
    ['Charlotte', 'EE. UU.', 35.2271, -80.8431], ['Minneapolis', 'EE. UU.', 44.9778, -93.265], ['Detroit', 'EE. UU.', 42.3314, -83.0458],
    ['Nashville', 'EE. UU.', 36.1627, -86.7816], ['Honolulu', 'EE. UU.', 21.3069, -157.8583], ['Sacramento', 'EE. UU.', 38.5816, -121.4944],
    ['Portland', 'EE. UU.', 45.5152, -122.6784], ['Salt Lake City', 'EE. UU.', 40.7608, -111.891], ['El Paso', 'EE. UU.', 31.7619, -106.485],
    ['McAllen', 'EE. UU.', 26.2034, -98.23], ['Toronto', 'Canadá', 43.6532, -79.3832], ['Vancouver', 'Canadá', 49.2827, -123.1207],
    ['Montreal', 'Canadá', 45.5017, -73.5673], ['Calgary', 'Canadá', 51.0447, -114.0719], ['Barcelona', 'España', 41.3874, 2.1686],
    ['Valencia', 'España', 39.4699, -0.3763], ['Sevilla', 'España', 37.3891, -5.9845], ['Bilbao', 'España', 43.263, -2.935],
    ['Málaga', 'España', 36.7213, -4.4214], ['Lisboa', 'Portugal', 38.7223, -9.1393], ['Oporto', 'Portugal', 41.1579, -8.6291],
    ['Roma', 'Italia', 41.9028, 12.4964], ['Milán', 'Italia', 45.4642, 9.19], ['Berlín', 'Alemania', 52.52, 13.405],
    ['Múnich', 'Alemania', 48.1351, 11.582], ['Fráncfort', 'Alemania', 50.1109, 8.6821], ['Hamburgo', 'Alemania', 53.5511, 9.9937],
    ['Colonia', 'Alemania', 50.9375, 6.9603], ['Düsseldorf', 'Alemania', 51.2277, 6.7735], ['Ámsterdam', 'Países Bajos', 52.3676, 4.9041],
    ['Bruselas', 'Bélgica', 50.8503, 4.3517], ['Viena', 'Austria', 48.2082, 16.3738], ['Zúrich', 'Suiza', 47.3769, 8.5417],
    ['Varsovia', 'Polonia', 52.2297, 21.0122], ['Praga', 'Chequia', 50.0755, 14.4378], ['Budapest', 'Hungría', 47.4979, 19.0402],
    ['Estocolmo', 'Suecia', 59.3293, 18.0686], ['Copenhague', 'Dinamarca', 55.6761, 12.5683], ['Oslo', 'Noruega', 59.9139, 10.7522],
    ['Helsinki', 'Finlandia', 60.1699, 24.9384], ['Dublín', 'Irlanda', 53.3498, -6.2603], ['Mánchester', 'Reino Unido', 53.4808, -2.2426],
    ['Glasgow', 'Reino Unido', 55.8642, -4.2518], ['Lyon', 'Francia', 45.764, 4.8357], ['Estambul', 'Turquía', 41.0082, 28.9784],
    ['Atenas', 'Grecia', 37.9838, 23.7275], ['Busan', 'Corea del Sur', 35.1796, 129.0756], ['Osaka', 'Japón', 34.6937, 135.5023],
    ['Nagoya', 'Japón', 35.1815, 136.9066], ['Fukuoka', 'Japón', 33.5904, 130.4017], ['Sapporo', 'Japón', 43.0618, 141.3545],
    ['Hiroshima', 'Japón', 34.3853, 132.4553], ['Sendai', 'Japón', 38.2682, 140.8694], ['Daejeon', 'Corea del Sur', 36.3504, 127.3845],
    ['Suwon', 'Corea del Sur', 37.2636, 127.0286], ['Ulsan', 'Corea del Sur', 35.5384, 129.3114], ['Jeju', 'Corea del Sur', 33.4996, 126.5312],
    ['Taipéi', 'Taiwán', 25.033, 121.5654], ['Taichung', 'Taiwán', 24.1477, 120.6736], ['Hong Kong', 'China', 22.3193, 114.1694],
    ['Macao', 'Macao', 22.1987, 113.5439], ['Shenzhen', 'China', 22.5431, 114.0579], ['Cantón', 'China', 23.1291, 113.2644],
    ['Bangkok', 'Tailandia', 13.7563, 100.5018], ['Singapur', 'Singapur', 1.3521, 103.8198], ['Kuala Lumpur', 'Malasia', 3.139, 101.6869],
    ['Yakarta', 'Indonesia', -6.2088, 106.8456], ['Ho Chi Minh', 'Vietnam', 10.8231, 106.6297], ['Hanói', 'Vietnam', 21.0278, 105.8342],
    ['Cebú', 'Filipinas', 10.3157, 123.8854], ['Bombay', 'India', 19.076, 72.8777], ['Nueva Delhi', 'India', 28.6139, 77.209],
    ['Dubái', 'Emiratos Árabes Unidos', 25.2048, 55.2708], ['Riad', 'Arabia Saudita', 24.7136, 46.6753], ['Shanghái', 'China', 31.2304, 121.4737],
    ['Melbourne', 'Australia', -37.8136, 144.9631], ['Brisbane', 'Australia', -27.4698, 153.0251], ['Perth', 'Australia', -31.9505, 115.8605],
    ['Auckland', 'Nueva Zelanda', -36.8485, 174.7633]
  ];
  /* el selector agrupa por región (orden alfabético dentro de cada una); el índice de ORIGINS es lo que se guarda, así que solo se agregan ciudades al final */
  var LATAM = ['México', 'Perú', 'Ecuador', 'Venezuela', 'Panamá', 'Costa Rica', 'Rep. Dominicana', 'Puerto Rico', 'Bolivia', 'Paraguay', 'Uruguay', 'Chile', 'Argentina', 'Brasil', 'Guatemala', 'El Salvador', 'Honduras', 'Nicaragua', 'Cuba'];
  var EUROPE = ['España', 'Reino Unido', 'Francia', 'Portugal', 'Italia', 'Alemania', 'Países Bajos', 'Bélgica', 'Austria', 'Suiza', 'Polonia', 'Chequia', 'Hungría', 'Suecia', 'Dinamarca', 'Noruega', 'Finlandia', 'Irlanda', 'Turquía', 'Grecia'];
  var ORIGIN_REGIONS = [['co', 'regCo'], ['latam', 'regLatam'], ['na', 'regNa'], ['eu', 'regEu'], ['asia', 'regAsia']];
  function regionOf(country) { return country === 'Colombia' ? 'co' : LATAM.indexOf(country) >= 0 ? 'latam' : (country === 'EE. UU.' || country === 'Canadá') ? 'na' : EUROPE.indexOf(country) >= 0 ? 'eu' : 'asia'; }
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
  /* Ubicación. Estados: idle, asking, ok, pending (falta tu permiso), denied, timeout, unavailable, insecure, unsupported.
     Se pide con un toque (así los navegadores muestran el aviso siempre); si ya diste permiso, se lee sola al entrar. */
  var geoAcc = 0, askDismissed = false;
  try { askDismissed = sessionStorage.getItem('radar-ask-no') === '1'; } catch (e) { askDismissed = false; }
  var UA = navigator.userAgent || '', IS_IOS = /iphone|ipad|ipod/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1), IS_ANDROID = /android/i.test(UA);
  function geoBlocker() { if (!window.isSecureContext) return 'insecure'; if (!navigator.geolocation) return 'unsupported'; return ''; }
  function setGeo(state, manual) {
    geoState = state;
    if (state !== 'ok' && state !== 'asking' && originIdx === -1 && !(savedOrigin === 'geo' && geoOrigin)) originIdx = 0;
    renderAll();
    if (manual && state !== 'ok' && state !== 'asking') toast(t('locDefault') + ' · ' + t('locWhy', { why: t(WHY[state] || 'whyUnavailable') }));
  }
  var WHY = { denied: 'whyDenied', timeout: 'whyTimeout', unavailable: 'whyUnavailable', insecure: 'whyInsecure', unsupported: 'whyUnsupported', pending: 'whyPending' };
  function locate(manual, precise) {
    var bad = geoBlocker(); if (bad) { setGeo(bad, manual); return; }
    geoState = 'asking'; renderLoc();
    navigator.geolocation.getCurrentPosition(function (p) {
      var lat = +p.coords.latitude.toFixed(2), lon = +p.coords.longitude.toFixed(2);
      geoAcc = p.coords.accuracy || 0;
      geoOrigin = { lat: lat, lon: lon, near: nearestPlace(lat, lon) };
      store('radar-geo', JSON.stringify(geoOrigin));
      originIdx = -1; savedOrigin = 'geo'; store('radar-origin', 'geo'); geoState = 'ok';
      Sound.play('pop'); renderAll();
      if (manual) toast(t('locReal') + (geoOrigin.near ? ' · ' + t('locNear', { city: place(geoOrigin.near) }) : ''));
    }, function (err) {
      var code = err && err.code;
      // sin señal o tardó: un segundo intento con GPS de alta precisión antes de rendirse
      if ((code === 2 || code === 3) && !precise) { locate(manual, true); return; }
      setGeo(code === 1 ? 'denied' : code === 3 ? 'timeout' : 'unavailable', manual);
    }, { enableHighAccuracy: !!precise, timeout: precise ? 20000 : 10000, maximumAge: 600000 });
  }
  function startGeo() {
    if (savedOrigin != null && savedOrigin !== 'geo') { renderLoc(); return; }  // elegiste una ciudad: se respeta
    var bad = geoBlocker(); if (bad) { setGeo(bad); return; }
    var q = navigator.permissions && navigator.permissions.query ? navigator.permissions.query({ name: 'geolocation' }) : Promise.reject();
    q.then(function (st) {
      st.onchange = function () { if (st.state === 'granted') locate(false); else if (st.state === 'denied') setGeo('denied'); };
      if (st.state === 'granted') locate(false);
      else if (st.state === 'denied') setGeo('denied');
      else setGeo(savedOrigin === 'geo' && geoOrigin ? 'ok' : 'pending');
    }).catch(function () { setGeo(savedOrigin === 'geo' && geoOrigin ? 'ok' : 'pending'); });
  }
  function renderLoc() {
    var chip = $('#locChip'), ask = $('#locAsk'); if (!chip) return;
    var o = origin(), pin = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>';
    var kind, html;
    if (geoState === 'asking') { kind = 'asking'; html = '<span class="geo-dot" aria-hidden="true"></span>' + esc(t('locAsking')); }
    else if (o.geo) { kind = 'real'; html = pin + '<b>' + esc(t('locReal')) + '</b>' + (o.near ? ' · ' + esc(t('locNear', { city: place(o.near) })) : '') + (geoAcc ? ' · ' + esc(t('locAcc', { km: Math.max(1, Math.round(geoAcc / 1000)) })) : ''); }
    else if (savedOrigin != null && savedOrigin !== 'geo') { kind = 'chosen'; html = pin + '<b>' + esc(t('locChosen')) + '</b> · ' + esc(place(o.name)); }
    else {
      kind = 'default';
      html = pin + '<b>' + esc(t('locDefault')) + '</b>' + (WHY[geoState] ? ' · ' + esc(t('locWhy', { why: t(WHY[geoState]) })) : '') +
        (geoState === 'pending' && !askDismissed ? '' : ' <span class="loc-acts"><button type="button" class="link-btn" data-geo-retry>' + esc(geoState === 'pending' ? t('locAskBtn') : t('locAgain')) + '</button>') +
        (geoState === 'denied' || geoState === 'timeout' || geoState === 'unavailable' ? '<button type="button" class="link-btn" data-geo-help>' + esc(t('locFix')) + '</button>' : '') + (geoState === 'pending' && !askDismissed ? '' : '</span>') +
        '<span class="loc-help" hidden>' + esc(t(IS_IOS ? 'helpIOS' : IS_ANDROID ? 'helpAndroid' : 'helpDesktop')) + '</span>';
    }
    chip.className = 'loc-chip ' + kind; chip.innerHTML = html;
    var showAsk = geoState === 'pending' && !askDismissed && !o.geo && !(savedOrigin != null && savedOrigin !== 'geo');
    ask.hidden = !showAsk;
    if (showAsk) ask.innerHTML = '<div class="la-ico" aria-hidden="true">' + pin + '</div><div><p class="la-t">' + esc(t('locAskTitle')) + '</p><p class="la-b">' + esc(t('locAskBody')) + '</p>' +
      '<div class="la-acts"><button type="button" class="btn primary small" data-geo-retry>' + esc(t('locAskBtn')) + '</button><button type="button" class="link-btn" data-geo-later>' + esc(t('locAskNo')) + '</button></div></div>';
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
    this.spin = this.opt.spin || 5; this.autoSpin = true; this.vlon = 0; this.vlat = 0; this.idleUntil = 0; this.tween = null; this.drag = null;
    this.markers = []; this.routes = []; this.sel = null; this.running = false; this.inView = true;
    this.proj = d3.geoOrthographic().clipAngle(90).precision(1.8);
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
    x.fillStyle = '#C6F3DA'; x.fillRect(0, 0, 8, 8);  // el verde de la tierra va dentro de la trama: una pasada de pintura menos por cuadro
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
        hideHintOnce(self); self.userMoved();
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
      if (!dr.moved && Math.abs(dx) + Math.abs(dy) > 6) { dr.moved = true; c.classList.add('grabbing'); hideHintOnce(self); self.userMoved(); }
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
      self.vlat = 0;  // sin inercia vertical: el globo se queda a la altura donde lo soltaste
      if (performance.now() - dr.lt > 90 || reduce) self.vlon = 0;
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
    // Safari en iPhone: además de touch-action, cancelar el touchmove evita que la página rebote mientras giras
    host.addEventListener('touchmove', function (e) { if (!e.target.closest || !e.target.closest('.zoom-ctrl')) e.preventDefault(); }, { passive: false });
    host.addEventListener('lostpointercapture', function (e) { if (ptrs[e.pointerId]) end(e); });
    // trackpad: pellizco llega como ctrl + rueda. La rueda sola sigue bajando la página.
    host.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault(); self.setZoom(self.zoom * Math.exp(-e.deltaY * .01)); self.idleUntil = performance.now() + 10000; self.userMoved();
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
      if (used) { e.preventDefault(); self.idleUntil = performance.now() + 10000; self.userMoved(); }
    });
  };
  function hideHintOnce(g) { if (g.opt.onDragStart) g.opt.onDragStart(); }
  Globe.prototype.userMoved = function () {
    if (!this.autoSpin) return;
    this.autoSpin = false;
    if (this.opt.onSpin) this.opt.onSpin(false);
  };
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
    // girando solo (sin que lo toques) basta con ~30 cuadros por segundo: se ve igual de suave y gasta la mitad
    var busy = this.tween || this.drag || Math.abs(this.vlon) + Math.abs(this.vlat) > .0004;
    if (!busy && this.last && ts - this.last < 30) { requestAnimationFrame(this.frameFn); return; }
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
      } else if (!reduce && this.autoSpin && !this.sel && this.zoom < 1.3 && performance.now() > this.idleUntil && this.spin) {
        this.lon += this.spin * dt / 1000;  // solo gira de lado: la latitud se queda donde la dejaste
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
    // la tierra y la cuadrícula se proyectan directo a Path2D (sin armar texto SVG) y solo cuando el globo se movió
    var key = this.lon.toFixed(3) + ',' + this.lat.toFixed(3) + ',' + R.toFixed(2) + ',' + cx + ',' + cy + (landFeature ? 'L' : '');
    if (key !== this.landKey) {
      this.landKey = key;
      this.gratPath = new Path2D(); this.path.context(this.gratPath)(this.grat);
      this.landPath = null;
      if (landFeature) { this.landPath = new Path2D(); this.path.context(this.landPath)(landFeature); }
      this.path.context(null);
    }
    ctx.setLineDash([2, 6]); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.stroke(this.gratPath); ctx.setLineDash([]);
    if (this.landPath) {
      var lp = this.landPath;
      ctx.save(); ctx.translate(R * .006, R * .022); ctx.fillStyle = 'rgba(123,93,206,.38)'; ctx.fill(lp); ctx.restore();
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
      // nunca fuera de la pantalla: si el grupo está en el borde del globo, la foto grupal se corre hacia adentro
      var half = m.pw * sc / 2, cx = clamp(s.x, half + 4, Math.max(half + 4, self.w - half - 4));
      var x = cx - m.pw / 2, y = s.y - m.ph * .95;
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
    $$('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    document.title = 'Radar K-pop · 케이팝 레이더';
    $$('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
    $('.lang').setAttribute('data-l', lang);
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
    map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5L3.5 20z"/><path d="M9 4v13.5M15 6.5V20"/></svg>',
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
      (cityTarget(st) ? '<button type="button" class="act ico" data-city="' + esc(st.id) + '" aria-label="' + esc(t('cityOpen')) + '">' + ICON.map + '</button>' : '') +
      (st.cur ? '<button type="button" class="act ico" data-ics="' + esc(st.id) + '" aria-label="' + esc(t('calendar')) + '">' + ICON.cal + '</button>' : '') + '</div>' +
      '<button type="button" class="f-x" data-unsel aria-label="' + esc(t('close')) + '">' + ICON.x + '</button>';
  }
  function renderNear() {
    var o = origin(), best = null, ms = now();
    states.forEach(function (st) {
      st.up.forEach(function (e) { var d = hav(o.lat, o.lon, e.lat, e.lon); if (!best || d < best.d) best = { d: d, e: e, st: st }; });
    });
    var el = $('#nearCard');
    renderLoc();
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
      var off = unit && on.indexOf(m.id) < 0, ms = memStatus(st.id, m.id), away = ms && ms.k === 'mil';
      return '<li><button type="button" class="mem' + (off && !away ? ' off' : '') + (away ? ' away' : '') + (ms ? ' st-' + ms.k : '') + '" data-mem="' + esc(st.id + ':' + m.id) + '" data-i="' + i + '" aria-label="' + esc(m.name + (ms ? ', ' + msShort(ms) : off ? ', ' + t('notOnTour') : '')) + '" style="--dl:-' + (i * .37 % 2.6).toFixed(2) + 's">' + msBadge(ms) +
        (function () { var b = bdayInfo(person(st.id, m.id)); return b && b.today ? '<span class="gp-hat" aria-hidden="true">🎂</span>' : ''; })() + '<span class="mem-say" lang="ko" aria-hidden="true">' + esc(m.ko) + '!</span><img src="' + esc(memberSrc(st.id, m.id)) + '" alt="" loading="lazy" decoding="async" draggable="false"><span class="mem-n">' + esc(m.name) + '</span></button></li>';
    }).join('') + formerList(st.id).map(function (x) {
      var back = x.ret && x.ret.official;  // si un aviso oficial dice que volvió, sale a color
      return '<li><button type="button" class="mem fm-mem' + (back ? ' fm-back' : ' away') + '" data-gp-open="' + esc(st.id) + '" data-gp-t="members" aria-label="' + esc(x.f.name + ', ' + (back ? t('fmBack') : t('fmTitle'))) + '"><span class="fm-tag">' + (back ? '✨' : 'ex') + '</span><img src="' + esc(formerSrc(st.id, x)) + '" alt="" loading="lazy" decoding="async" draggable="false"><span class="mem-n">' + esc(x.f.name) + '</span></button></li>';
    }).join('') + '</ul></div>';
  }
  /* orden de opciones fijo por pregunta (no cambia al redibujar) pero sin que la correcta quede siempre primero */
  function mixOrder(seed, n) {
    var h = 7, idx = [];
    for (var k = 0; k < seed.length; k++) h = (h * 31 + seed.charCodeAt(k)) >>> 0;
    for (var j = 0; j < n; j++) idx.push(j);
    for (var i = n - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; var r = h % (i + 1), tmp = idx[i]; idx[i] = idx[r]; idx[r] = tmp; }
    return idx;
  }
  /* logos de plataformas en versión sticker (borde blanco, contorno de tinta), mismo trazo que los chibis */
  var BACK = '<rect x="1.5" y="1.5" width="33" height="33" rx="11" fill="#fff" stroke="currentColor" stroke-width="2.2"/>';
  var PLAT = {
    spotify: BACK + '<circle cx="18" cy="18" r="12" fill="#1ED760" stroke="currentColor" stroke-width="1.8"/><path d="M11.2 14.6c4.6-1.4 9.4-1 13.4 1.2M12 18.5c3.7-1 7.6-.7 10.8 1M12.9 22.2c2.9-.8 5.9-.6 8.4.8" fill="none" stroke="#191414" stroke-width="2.2" stroke-linecap="round"/>',
    apple: BACK + '<rect x="6" y="6" width="24" height="24" rx="7.5" fill="#FA2D48" stroke="currentColor" stroke-width="1.8"/><path d="M21.6 10.6v10.6a2.7 2.7 0 1 1-1.9-2.6v-5.4l-5.6 1.3v7.6a2.7 2.7 0 1 1-1.9-2.6v-7.6z" fill="#fff"/>',
    ytm: BACK + '<circle cx="18" cy="18" r="12" fill="#FF0033" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="18" r="6.6" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M16.3 15.3v5.4l4.4-2.7z" fill="#fff"/>',
    yt: BACK + '<rect x="5.5" y="9.5" width="25" height="17" rx="5.5" fill="#FF0033" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 14.2v7.6l6.4-3.8z" fill="#fff"/>',
    wv: BACK + '<rect x="6" y="6" width="24" height="24" rx="7.5" fill="#1CC8D8" stroke="currentColor" stroke-width="1.8"/><path d="M10.6 13.4l3 9.2 4.4-7.2 4.4 7.2 3-9.2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    fans: BACK + '<rect x="6" y="6" width="24" height="24" rx="7.5" fill="#111" stroke="currentColor" stroke-width="1.8"/><path d="M13.6 24.5v-13h8.4M13.6 17.6h6.6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23.4" cy="23.4" r="1.9" fill="#FF4F8B"/>',
    bubble: BACK + '<path d="M18 7.5c6.1 0 10.8 4 10.8 9s-4.7 9-10.8 9c-1.2 0-2.3-.1-3.4-.4L9.3 27.5l1.4-4.6C8.5 21.3 7.2 19 7.2 16.5c0-5 4.7-9 10.8-9z" fill="#8C6CFF" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="14" cy="16.6" r="1.6" fill="#fff"/><circle cx="18" cy="16.6" r="1.6" fill="#fff"/><circle cx="22" cy="16.6" r="1.6" fill="#fff"/>',
    fromm: BACK + '<rect x="6" y="6" width="24" height="24" rx="7.5" fill="#FF7A59" stroke="currentColor" stroke-width="1.8"/><path d="M20.6 11.2c-2.3-.4-4 .7-4 3.2V25M13.4 16.6h6.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
    toktoq: BACK + '<rect x="6" y="6" width="24" height="24" rx="7.5" fill="#2E6BFF" stroke="currentColor" stroke-width="1.8"/><path d="M11 13.2h7.6M14.8 13.2V24M19 18.6h6.4M22.2 18.6V26" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
  };
  function platIcon(k) { return '<svg class="ln-ico" viewBox="0 0 36 36" aria-hidden="true">' + PLAT[k] + '</svg>'; }
  /* dónde escucharlos: enlaces a perfiles oficiales */
  function listenHtml(g) {
    var p = PROFILE[g.id]; if (!p) return '';
    var q = encodeURIComponent(g.name), links = [];
    if (p.spotify) links.push(['spotify', 'Spotify', 'https://open.spotify.com/artist/' + p.spotify]);
    if (p.apple) links.push(['apple', 'Apple Music', 'https://music.apple.com/artist/' + p.apple, 'Apple']);
    links.push(['ytm', 'YouTube Music', 'https://music.youtube.com/search?q=' + q, 'YT Music']);
    if (p.youtube) links.push(['yt', 'YouTube', 'https://www.youtube.com/channel/' + p.youtube]);
    if (p.weverse) links.push(['wv', 'Weverse', 'https://weverse.io/' + p.weverse]);
    (p.fan || []).forEach(function (f) { if (/^https:\/\//.test(f[2])) links.push(f); });  // la app de fans que usan si no están en Weverse (FANS y bubble en JYP, fromm y TOKTOQ en KQ)
    return '<div class="listen"><p class="squad-k">' + esc(t('listen')) + '</p><ul>' + links.map(function (l) {
      return '<li><a class="ln ln-' + l[0] + '" href="' + esc(l[2]) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(l[1]) + '">' + platIcon(l[0]) + '<span class="ln-l">' + esc(l[1]) + '</span><span class="ln-s" aria-hidden="true">' + esc(l[3] || l[1]) + '</span></a></li>';
    }).join('') + '</ul></div>';
  }
  /* datos y números: perfil + lo que sale de events.json + stats.json (iTunes y YouTube, si el robot los trajo) */
  var groupStats = {};
  function fmtBig(n) {
    var en = lang === 'en', f = function (x) { return x.toLocaleString(L().locale, { maximumFractionDigits: 1 }); };
    if (n >= 1e9) return f(n / 1e9) + (en ? ' B' : ' mil M');
    if (n >= 1e6) return f(n / 1e6) + ' M';
    if (n >= 1e4) return Math.round(n / 1e3).toLocaleString(L().locale) + (en ? ' K' : ' mil');
    return Math.round(n).toLocaleString(L().locale);
  }
  function statsHtml(g) {
    var p = PROFILE[g.id] || {}, s = groupStats[g.id] || {}, tiles = [];
    function tile(v, k, cls) { tiles.push('<li' + (cls ? ' class="' + cls + '"' : '') + '><b>' + (v == null ? '—' : v) + '</b><span>' + esc(k) + '</span></li>'); }
    // las mismas categorías para todos los grupos; si falta un dato se ve "—"
    var d = p.debut ? parts(p.debut) : null, yrs = d ? Math.floor((now() - Date.UTC(d.y, d.m - 1, d.d)) / (365.2425 * 864e5)) : null;
    tile(d ? esc(String(d.y)) : null, d ? t('stDebut', { d: fmtShort(p.debut) }) : t('stDebutK'));
    tile(yrs == null ? null : esc(yrs > 1 ? t('stYears', { n: yrs }) : yrs === 1 ? t('stYear') : t('stRookie')), t('stCareer'));
    tile(members(g.id).length ? esc(String(members(g.id).length)) : null, t('stMembers'));
    tile(s.listeners ? esc(fmtBig(s.listeners)) : null, t('stListeners'));
    tile(s.listeners_peak ? esc(fmtBig(s.listeners_peak)) : null, t('stPeak'));
    tile(s.streams ? esc(fmtBig(s.streams)) : null, t('stStreams'));
    if (Object.keys(groupStats).length && Object.keys(groupStats).every(function (k) { return groupStats[k].yt_subs; })) tile(esc(fmtBig(s.yt_subs)), t('stSubs'));
    var ts = s.top_song, songOk = ts && /^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+$/.test(ts.url || '');
    tile(ts ? (songOk ? '<a href="' + esc(ts.url) + '" target="_blank" rel="noopener noreferrer">' + esc(ts.title) + '</a>' : esc(ts.title)) : null,
      ts ? t('stTopSong', { n: fmtBig(ts.streams) }) : t('stTopSongK'), 'wide');
    return '<details class="agenda stats"><summary>' + esc(t('statsTitle')) + ' <span class="ko" lang="ko">숫자</span></summary>' +
      (p.agency ? '<p class="st-ag">' + esc(t('stAgency')) + ': <b>' + esc(p.agency) + '</b></p>' : '') +
      '<ul class="st-grid">' + tiles.join('') + '</ul><p class="st-src">' + esc(t('stSource')) + '</p></details>';
  }
  /* avisos oficiales (notices.json): posts [NOTICE]/[공지] de las cuentas oficiales, casi siempre con enlace a Weverse */
  var notices = {};
  function noticesHtml(gid) {
    var list = (notices[gid] || []).filter(function (n) { return /^https:\/\/(weverse\.io|x\.com|twitter\.com)\//.test(n.url || ''); }).slice(0, 4);
    if (!list.length) return '';
    return '<details class="agenda notices"><summary>' + esc(t('noticesTitle')) + ' <span class="ko" lang="ko">공지</span></summary><ul class="nt-list">' + list.map(function (n) {
      return '<li><a href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer"><span class="nt-src">' + (n.weverse ? 'Weverse' : 'X') + '</span>' + esc(n.title) + '</a><small>' + esc(t('ago', { n: agoTxt(now() - Date.parse(n.when)) })) + '</small></li>';
    }).join('') + '</ul></details>';
  }
  function pollNotices() {
    return fetch('notices.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (j && j.groups) { notices = j.groups; if (data && data.groups) renderCards(); } }).catch(function () { /* sin avisos */ });
  }
  function pollStats() {
    return fetch('stats.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (j && j.groups) { groupStats = j.groups; if (data && data.groups) renderCards(); } }).catch(function () { /* sin stats: solo los datos locales */ });
  }
  function optTxt(o) { var p = o.split('|'); return p.length > 1 && lang === 'en' ? p[1] : p[0]; }
  function triviaHtml(gid) {
    var q = TRIVIA[gid]; if (!q) return '';
    return '<details class="agenda trivia"><summary>' + esc(t('triviaTitle')) + ' <span class="ko" lang="ko">퀴즈</span></summary><ol class="tq">' + q.map(function (x, i) {
      return '<li data-q="' + i + '"><p>' + esc(lang === 'en' ? x[1] : x[0]) + '</p><div class="tq-o">' + mixOrder(gid + i, x[2].length).map(function (j) {
        return '<button type="button" class="chip-btn" data-trivia="' + esc(gid + ':' + i + ':' + j) + '">' + esc(optTxt(x[2][j])) + '</button>';
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
  /* próximo estreno: sale solo del catálogo de Apple Music (media.json trae los lanzamientos con fecha futura) */
  /* próximo estreno: Apple Music (media.json) o, antes de que salga ahí, el anuncio oficial (releases.json). Cambia solo con la fecha:
     antes "Próximo estreno · D-n", el día "¡Sale hoy!", y hasta 10 días después "Nuevo"; luego desaparece. */
  var announced = [];
  function pollReleases() {
    return fetch('releases.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (j && Array.isArray(j.items)) { announced = j.items; if (data && data.groups) renderCards(); } }).catch(function () { /* sin anuncios */ });
  }
  var NEW_DAYS = 10;
  function releaseOf(gid) {
    var today = new Date(now()).toISOString().slice(0, 10), cut = new Date(now() - NEW_DAYS * 864e5).toISOString().slice(0, 10);
    var mus = (media || []).filter(function (m) { return m.group === gid && m.type === 'music' && m.date && okLink(m.url); });
    var up = mus.filter(function (m) { return m.date >= today; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
    var ann = announced.filter(function (a) { return a.group === gid && a.date >= today && /^https:\/\//.test(a.url || ''); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
    if (ann && (!up || ann.date < up.date)) up = { title: ann.title, date: ann.date, url: ann.url, ann: true };
    if (up) return { m: up, k: up.date === today ? 'today' : 'next' };
    var fresh = mus.filter(function (m) { return m.date < today && m.date >= cut; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
    return fresh ? { m: fresh, k: 'new' } : null;
  }
  function nextReleaseHtml(gid) {
    var r = releaseOf(gid); if (!r) return '';
    var m = r.m, today = new Date(now()).toISOString().slice(0, 10), n = daysBetween(today, m.date);
    var lab = r.k === 'today' ? t('relToday') : r.k === 'new' ? t('relNew') : t('nextRelease');
    var when = r.k === 'today' ? '' : r.k === 'new' ? t('ago', { n: agoTxt(now() - Date.parse(m.date + 'T12:00:00Z')) }) : fmtShort(m.date) + ' · D-' + n;
    return '<p class="next-rel rel-' + r.k + '"><span class="ko" lang="ko">' + (r.k === 'new' ? '신곡' : '컴백') + '</span> ' + esc(lab) + ': <a href="' + esc(m.url) + '" target="_blank" rel="noopener noreferrer"><b>' + esc(m.title) + '</b></a>' +
      (when ? ' · ' + esc(when) : '') + (m.ann ? ' <span class="tag">' + esc(t('relAnn')) + '</span>' : '') + '</p>';
  }
  function cardHtml(st) {
    var g = st.g, o = origin(), m = META[g.id] || {}, h = '';
    h += '<article class="card ' + (sel === g.id ? 'is-sel' : '') + '" id="card-' + esc(g.id) + '" data-g="' + esc(g.id) + '" style="' + gStyle(g.id) + '">';
    h += '<span class="tape" aria-hidden="true"></span>';
    h += '<div class="c-top"><div class="c-face">' + faceImg(g.id, '', '') + '</div><div class="c-id">' +
      (m.ko ? '<p class="c-ko" lang="ko">' + esc(m.ko) + '</p>' : '') + '<h3 class="c-name' + (g.name.length >= 9 && /^\S+$/.test(g.name) ? ' xlong' : g.name.length >= 7 ? ' long' : '') + '">' + esc(g.name) + '</h3>' +
      '<p class="c-tour">' + esc(tourName(g)) + '</p></div>' +
      '<button type="button" class="bias" data-bias="' + esc(g.id) + '" aria-pressed="' + (bias === g.id) + '" aria-label="' + esc(t('bias')) + ': ' + esc(g.name) + '">' + ICON.heart + '</button></div>';
    if (st.mode === 'rest') {
      h += '<span class="c-state rest"><span class="ko" lang="ko">' + t('restKo') + '</span> ' + esc(t('rest')) + '</span>';
      if (st.last) h += '<p class="c-when">' + esc(t('lastStop')) + ': <b>' + esc(place(st.last.city)) + ', ' + esc(place(st.last.country)) + '</b> · ' + esc(fmtDate(st.last.local_date, true)) + (st.last.venue ? ' · ' + esc(st.last.venue) : '') + '</p>';
      h += '<div class="cd-rest"><b>D-?</b><span>' + (m.cheer ? '<span lang="ko" class="ko">' + esc(m.cheer) + '</span> ' + esc(m.hint[lang]) + (/[.!?]$/.test(m.hint[lang]) ? ' ' : '. ') : '') + esc(lang === 'en' ? 'The chibi waits in Seoul until there are new dates.' : 'El chibi espera en Seúl hasta que haya fechas nuevas.') + '</span></div>';
      // la gira que terminó, en números (mismo renglón que los km de las tarjetas con gira)
      if (st.last) h += '<div class="facts"><span class="km">' + st.past.length + ' <small>' + esc(t(stops(st.past).length === 1 ? 'restShows1' : 'restShows', { n: stops(st.past).length })) + '</small></span><span class="dday">' + esc(t('ago', { n: agoTxt(now() - Date.parse(st.last.start)) })) + '</span></div>';
    } else {
      var e = st.cur, km = hav(o.lat, o.lon, e.lat, e.lon), live = st.mode === 'live';
      h += '<span class="c-state ' + (live ? 'live' : '') + '"><span class="ko" lang="ko">' + (live ? t('liveKo') : t('nextKo')) + '</span> ' + esc(live ? t('live') : t('next')) + '</span>';
      h += '<p class="c-where">' + esc(place(e.city)) + '<small>' + esc(place(e.country)) + (e.venue ? ' · ' + esc(e.venue) : '') + '</small></p>';
      var srcOk = e.src && /^https:\/\//.test(e.src);
      h += '<p class="c-when"><b>' + esc(fmtDate(e.local_date)) + (e.time_tbd ? '' : ', ' + esc(e.start.slice(11, 16))) + '</b> ' + esc(e.time_tbd ? t('timeTbd') : t('localTime')) +
        (e.source === 'auto' ? ' <span class="tag">' + esc(t('toConfirm')) + '</span>' : e.status === 'anunciado' ? ' <span class="tag">' + esc(t('announced')) + '</span>' : '') +
        (e.time_tbd ? '' : '<br>' + esc(t('yourTime')) + ': ' + esc(myTime(e.t))) +
        (srcOk ? '<br><a class="src-link" href="' + esc(e.src) + '" target="_blank" rel="noopener noreferrer">' + esc(t(e.src_kind === 'news' ? 'seeNews' : 'seeNotice')) + '</a>' : '') + '</p>';
      h += onsaleHtml(st);
      h += live ? '<div class="cd-live"><span class="ko" lang="ko">지금 무대 위!</span>' + esc(lang === 'en' ? 'On stage right now' : 'En el escenario ahora mismo') + '</div>' : cdTiles(e.start);
      h += '<div class="facts"><span class="km">' + fmtKm(km) + ' <small>' + esc(t('kmFrom', { city: originRef() })) + '</small></span><span class="fly">' + esc(t('flight', { h: flightH(km) })) + '</span><span class="dday">' + esc(live ? 'LIVE' : dday(e)) + '</span></div>';
    }
    h += '<div class="acts"><button type="button" class="act solid" data-share="' + esc(g.id) + '">' + ICON.share + esc(t('share')) + '</button>' +
      '<button type="button" class="act" data-pick="' + esc(g.id) + '" data-top="1" aria-label="' + esc(t('seeGlobe')) + '">' + ICON.globe + esc(t('globe')) + '</button>' +
      (st.cur ? '<button type="button" class="act" data-ics="' + esc(g.id) + '" aria-label="' + esc(t('calendar')) + '">' + ICON.cal + esc(t('calShort')) + '</button>' : '') +
      (cityTarget(st) ? '<button type="button" class="act" data-city="' + esc(g.id) + '" aria-label="' + esc(t('cityOpen')) + '">' + ICON.map + esc(t('cityShort')) + '</button>' : '') +
      '<button type="button" class="act gp-open" data-gp-open="' + esc(g.id) + '">' + ICON.card + esc(t('gpOpen')) + '</button></div>';
    var watch = lang === 'en' && g.watch_en && g.watch_en.length ? g.watch_en : g.watch;
    if (watch && watch.length) h += '<ul class="watch" lang="' + (watch === g.watch_en ? 'en' : 'es') + '">' + watch.map(function (w) { return '<li><span>' + esc(w) + '</span></li>'; }).join('') + '</ul>';
    h += nextReleaseHtml(g.id);
    birthdaysToday(g.id).forEach(function (mm) { h += '<button type="button" class="gp-bday" data-gp-open="' + esc(g.id) + '" data-gp-t="members" data-gp-m="' + esc(mm.id) + '"><span>🎂</span>' + esc(t('bdayToday', { name: mm.name })) + ' <b lang="ko">생일 축하해!</b></button>'; });
    h += squadHtml(st);
    // abajo, alineado entre tarjetas: la foto, dónde escucharlos y lo plegable (avisos, números, trivia, gira)
    h += '<div class="c-foot">';
    var ph = photoOf(g.id);
    if (ph) h += '<figure class="polaroid"><span class="ph"><i class="ph-bg" aria-hidden="true" style="background-image:url(\'' + esc(ph.src) + '\')"></i><img src="' + esc(ph.src) + '"' + (ph.w ? ' width="' + ph.w + '" height="' + ph.h + '"' : '') + ' alt="' + esc(t('photoAlt', { g: g.name })) + '" loading="lazy" decoding="async"></span><figcaption>' + esc(g.name) + (m.fan ? ' · ' + esc(m.fan) : '') + '</figcaption></figure>';
    h += listenHtml(g);
    h += statsHtml(g);
    h += triviaHtml(g.id);
    var rows = st.upStops;
    if (rows.length > 1 || (st.mode === 'rest' && st.past.length)) {
      var list = rows.length ? rows : stops(st.past).slice(-6);
      var isPast = !rows.length;
      h += '<details class="agenda"><summary>' + esc(t((isPast ? 'pastTour' : 'tour') + (list.length === 1 ? '1' : ''), { n: list.length })) + '</summary><ul class="stubs">' + list.map(function (r) {
        var e0 = r[0], d = hav(o.lat, o.lon, e0.lat, e0.lon);
        var dates = r.map(function (x) { return parts(x.local_date).d; }).join(' · ') + ' ' + L().months[parts(e0.local_date).m - 1];
        return '<li class="stub' + (isPast ? ' past' : '') + '"><span class="s-d">' + esc(dates) + '</span><span class="s-c">' + esc(place(e0.city)) + ', ' + esc(place(e0.country)) +
          (e0.venue ? '<span>' + esc(e0.venue) + '</span>' : '') + '</span><span class="s-k">' + fmtKm(d) + ' km</span></li>';
      }).join('') + '</ul></details>';
    }
    return h + '</div></article>';
  }
  function renderCards() {
    var open = {};
    $$('#cards details[open]').forEach(function (d) { open[d.closest('.card').getAttribute('data-g')] = 1; });
    var box = $('#cards'), sx = box.scrollLeft;
    box.innerHTML = states.map(cardHtml).join('');
    box.scrollLeft = sx;  // en el celular las tarjetas son un carrusel: redibujar no te devuelve al primer grupo
    renderPick();
    evenCards();  // con todo plegado; luego se reabre lo que estaba abierto
    Object.keys(open).forEach(function (id) { var d = $('#card-' + id + ' details'); if (d) d.open = true; });
    tick(true);
  }
  /* en el carrusel todas las tarjetas miden lo mismo (la más alta, con todo plegado); abrir algo solo alarga esa tarjeta */
  function evenCards() {
    var box = $('#cards'); if (!box) return;
    box.style.removeProperty('--card-h');
    if (innerWidth >= 700 || !box.children.length) return;
    var opened = $$('#cards details[open]');
    opened.forEach(function (d) { d.open = false; });
    var mx = 0;
    for (var i = 0; i < box.children.length; i++) mx = Math.max(mx, box.children[i].offsetHeight);
    opened.forEach(function (d) { d.open = true; });
    box.style.setProperty('--card-h', mx + 'px');
  }
  /* tira de grupos sobre el carrusel (celular): toca uno para ir a su tarjeta; se marca el que estás viendo */
  function renderPick() {
    var el = $('#gPick'); if (!el) return;
    el.innerHTML = states.map(function (st) {
      return '<button type="button" role="tab" data-gpick="' + esc(st.id) + '" style="' + gStyle(st.id) + '" aria-selected="false"><span class="gpk-face">' + faceImg(st.id) + '</span><span class="gpk-n">' + esc(st.g.name) + '</span>' +
        (st.mode === 'live' ? '<i class="gpk-live" aria-hidden="true"></i>' : '') + '</button>';
    }).join('');
    syncPick();
  }
  function syncPick() {
    var box = $('#cards'), cards = box ? box.children : [], best = 0, bd = Infinity;
    if (!cards.length) return;
    var mid = box.scrollLeft + box.clientWidth / 2;
    for (var i = 0; i < cards.length; i++) { var c = cards[i], d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } }
    var id = cards[best].getAttribute('data-g');
    $$('#gPick [data-gpick]').forEach(function (b) {
      var on = b.getAttribute('data-gpick') === id;
      if (on && b.getAttribute('aria-selected') !== 'true') { var strip = $('#gPick'); strip.scrollTo({ left: b.offsetLeft - strip.clientWidth / 2 + b.offsetWidth / 2, behavior: reduce ? 'auto' : 'smooth' }); }
      b.setAttribute('aria-selected', String(on));
    });
  }
  var pickT = 0;
  function onCardsScroll() { cancelAnimationFrame(pickT); pickT = requestAnimationFrame(syncPick); }
  function feedKey(a) { return [a.type, a.group, a.title, a.when].join('|'); }
  function renderFeed() {
    var el = $('#feed');
    if (!feed.length) {
      el.innerHTML = '<li class="bub empty"><span class="bub-face">' + faceImg('default') + '</span><div class="bub-body"><p class="bub-b">' + esc(t('emptyFeed')) + '</p></div></li>';
      return;
    }
    var lim = feedAll ? 12 : innerWidth < 700 ? 5 : 8;
    el.innerHTML = feed.slice(0, lim).map(function (a) {
      var title = esc(lang === 'en' && a.title_en ? a.title_en : a.title);
      if (a.url && /^https?:\/\//.test(a.url)) title = '<a href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">' + title + '</a>';
      return '<li class="bub" style="' + gStyle(a.group || 'default') + '"><span class="bub-face">' + faceImg(a.group) + '</span><div class="bub-body">' +
        '<div class="bub-h"><span class="typ">' + esc((L().T[a.type]) || 'Info') + '</span><span>' + esc(a.group_name || '') + '</span><time datetime="' + esc(a.when) + '">' + esc(t('ago', { n: agoTxt(now() - Date.parse(a.when)) })) + '</time></div>' +
        '<p class="bub-t">' + title + '</p><p class="bub-b">' + esc((lang === 'en' && a.body_en) || a.body || '') + '</p></div></li>';
    }).join('') + (feed.length > lim ? '<li class="feed-more"><button type="button" class="btn" data-feedall>' + esc(t('feedMore', { n: Math.min(12, feed.length) - lim })) + '</button></li>' : '');
  }
  var feedAll = false;
  function renderSources() {
    $('#sources').innerHTML = (data.sources || []).map(function (s) {
      return /^https?:\/\//.test(s.url) ? '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc((lang === 'en' && s.name_en) || s.name) + '</a></li>' : '';
    }).join('');
    var srcN = $('#srcN'); if (srcN) srcN.textContent = '(' + (data.sources || []).length + ')';
    // un miembro de cada grupo duerme sobre la luna; cambia cada día
    var day = Math.floor(now() / 864e5);
    $('#moonChibis').innerHTML = data.groups.map(function (g, i) {
      var ms = members(g.id).filter(function (m) { var st = memStatus(g.id, m.id); return !st || st.k !== 'mil'; }), m = ms[(day + i * 3) % (ms.length || 1)];
      return '<img src="' + esc(m ? memberSrc(g.id, m.id) : face(g.id).src) + '" alt="" loading="lazy" decoding="async" style="--r:' + ((i % 2 ? 1 : -1) * (4 + (i * 3) % 9)) + 'deg;--y:' + ((i * 7) % 5) + 'px">';
    }).join('');
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
      ORIGIN_REGIONS.map(function (r) {
        var list = ORIGINS.map(function (c, i) { return { c: c, i: i }; }).filter(function (x) { return regionOf(x.c[1]) === r[0]; })
          .sort(function (a, b) { return a.i === 0 ? -1 : b.i === 0 ? 1 : place(a.c[0]).localeCompare(place(b.c[0]), L().locale); });
        return list.length ? '<optgroup label="' + esc(t(r[1])) + '">' + list.map(function (x) { return '<option value="' + x.i + '">' + esc(place(x.c[0])) + (x.c[1] && r[0] !== 'co' ? ', ' + esc(place(x.c[1])) : '') + '</option>'; }).join('') + '</optgroup>' : '';
      }).join('');
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
    if (globe) { var gd = buildGeo(); globe.setData(gd.markers, gd.routes); globe.setSel(sel); var o = origin(); globe.me = { lat: o.lat, lon: o.lon, label: o.geo ? t('you2') : place(o.name) }; }
    if (view === 'sonar') renderSonar();
    renderForm();
    renderSights();
    renderMedia();
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
    if (globe) { globe.setSel(null); globe.flyTo(globe.lon, globe.lat, Math.min(globe.zoom, 1), 700, true); }
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
      return Promise.all([loadImg(face(id, true).src), ph ? loadImg(ph.src).catch(function () { return null; }) : null]);
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
      'SUMMARY:' + icsEsc(st.g.name + ' · ' + place(e.city) + (st.g.tour ? ' (' + tourName(st.g) + ')' : '')),
      'LOCATION:' + icsEsc((e.venue ? e.venue + ', ' : '') + place(e.city) + ', ' + place(e.country)),
      'DESCRIPTION:' + icsEsc(lang === 'en' ? 'Approximate time. Check with the ticket office. Radar K-pop.' : 'Hora aproximada, confirma en la boletería. Radar K-pop.'),
      'BEGIN:VALARM', 'TRIGGER:-PT24H', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(st.g.name + ' D-1'), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    download(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), id + '-' + e.local_date + '.ics');
    Sound.play('pop'); toast(t('icsSaved'));
  }

  /* ================= página de cada grupo (pestañas) y perfil de cada miembro ================= */
  var PEOPLE = window.RADAR_PEOPLE || {};
  var socialFeed = {};
  var GP = { id: null, tab: 'home', mem: null };
  var GP_TABS = [['home', 'gpHome', '홈'], ['members', 'gpMembers', '멤버'], ['tour', 'gpTour', '투어'], ['music', 'gpMusic', '음악'], ['social', 'gpSocial', 'SNS']];
  function pollSocial() {
    return fetch('socialfeed.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (j && j.groups) { socialFeed = j.groups; if (GP.id) renderGP(); } }).catch(function () { /* sin redes todavía */ });
  }
  function person(gid, mid) { var g = PEOPLE[gid]; return (g && g.members && g.members[mid]) || {}; }
  /* estado de cada miembro: servicio militar, regreso, contrato pendiente (assets/people.json) + lo que el robot vio en avisos y noticias (rosterwatch.json).
     Todo se calcula con la fecha de hoy: nadie tiene que editar nada el día que alguien se enlista o vuelve. */
  var rosterWatch = [];
  var BACK_DAYS = 45;
  function pollRoster() {
    return fetch('rosterwatch.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (j && Array.isArray(j.items)) { rosterWatch = j.items; if (data && data.groups) renderCards(); if (GP.id) renderGP(); } }).catch(function () { /* sin vigilancia todavía */ });
  }
  function isoDay(ms) { return new Date(ms + 9 * 36e5).toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
  function addMonths(d, n) { var x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); }
  function watchFor(gid, mid, kind) {
    return rosterWatch.filter(function (x) { return x.group === gid && x.member === mid && (!kind || x.kind === kind) && /^https:\/\//.test(x.url || ''); })
      .sort(function (a, b) { return (b.official ? 1 : 0) - (a.official ? 1 : 0) || (a.when < b.when ? 1 : -1); });
  }
  function memStatus(gid, mid) {
    var s = person(gid, mid).status, today = isoDay(now()), en;
    if (!s && (en = watchFor(gid, mid, 'enlist').filter(function (x) { return x.official && x.date; })[0]))
      s = { kind: 'military', since: en.date, until: addMonths(en.date, 18), est: true, auto: en };
    if (!s) return null;
    if (s.kind === 'military') {
      var dis = watchFor(gid, mid, 'discharge').filter(function (x) { return (x.date || x.when.slice(0, 10)) >= s.since; })[0];
      if (today < s.since) return { k: 'soon', s: s, days: daysBetween(today, s.since) };
      var back = dis && dis.official ? (dis.date || dis.when.slice(0, 10)) : (s.until && today >= s.until ? s.until : '');
      if (back) return daysBetween(back, today) <= BACK_DAYS ? { k: 'back', s: s, date: back, src: dis } : null;
      return { k: 'mil', s: s, days: s.until ? daysBetween(today, s.until) : null, news: dis || s.auto };
    }
    if (s.kind === 'back') return daysBetween(s.since, today) <= BACK_DAYS ? { k: 'back', s: s, date: s.since } : null;
    if (s.kind === 'pending') {
      var ret = watchFor(gid, mid, 'return')[0];
      if (ret && ret.official) return daysBetween(ret.date || ret.when.slice(0, 10), today) <= BACK_DAYS ? { k: 'back', s: s, date: ret.date || ret.when.slice(0, 10), src: ret } : null;
      return { k: 'pending', s: s, news: ret };
    }
    return null;
  }
  var MS_ICON = { mil: '🪖', soon: '📅', back: '✨', pending: '⏳' };
  function msShort(ms) {
    if (!ms) return '';
    if (ms.k === 'mil') return ms.s.until ? t(ms.s.est ? 'msUntilEst' : 'msUntil', { d: ms.s.est ? fmtMonth(ms.s.until) : fmtShort(ms.s.until) + ' ' + parts(ms.s.until).y }) : t('msMil');
    if (ms.k === 'soon') return t('msSoon', { d: fmtShort(ms.s.since) });
    if (ms.k === 'back') return t('msBack');
    return t('msPending');
  }
  function fmtMonth(d) { var p = parts(d); return L().months[p.m - 1] + ' ' + p.y; }
  function msBadge(ms) { return ms ? '<span class="ms-badge ms-' + ms.k + '" aria-hidden="true">' + MS_ICON[ms.k] + '</span>' : ''; }
  function newsLink(x) {
    if (!x || !/^https:\/\//.test(x.url || '')) return '';
    return '<a class="src-link" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">' + esc(x.official ? t('rwOfficial') : t('rwNews')) + '</a>';
  }
  function msLong(gid, mid) {
    var ms = memStatus(gid, mid); if (!ms) return '';
    var s = ms.s, note = lang === 'en' ? s.en : s.es, h = '<div class="ms-note ms-' + ms.k + '"><b>' + MS_ICON[ms.k] + ' ' + esc(ms.k === 'mil' ? t('msMil') : ms.k === 'back' ? t('msBackOn', { d: fmtDate(ms.date, true) }) : ms.k === 'soon' ? t('msSoon', { d: fmtDate(s.since, true) }) : t('msPending')) + '</b>';
    if (ms.k === 'mil') h += '<span>' + esc([note, t('msSince', { d: fmtDate(s.since, true) }), msShort(ms), ms.days > 0 ? t('msLeft', { n: ms.days }) : ''].filter(Boolean).join(' · ')) + '</span>';
    else if (note) h += '<span>' + esc(note) + '</span>';
    return h + newsLink(ms.news || ms.src) + '</div>';
  }
  function milHtml(gid) {
    var list = members(gid).map(function (m) { return { m: m, ms: memStatus(gid, m.id) }; }).filter(function (x) { return x.ms && (x.ms.k === 'mil' || x.ms.k === 'soon'); });
    if (!list.length) return '';
    return '<details class="ms-list"><summary>' + MS_ICON.mil + ' ' + esc(t('msTitle', { n: list.length })) + '</summary><ul>' + list.map(function (x) {
      var pct = x.ms.k === 'mil' && x.ms.s.until ? Math.max(3, Math.min(100, Math.round(100 * daysBetween(x.ms.s.since, isoDay(now())) / Math.max(1, daysBetween(x.ms.s.since, x.ms.s.until))))) : 0;
      return '<li><img src="' + esc(memberSrc(gid, x.m.id)) + '" alt="" loading="lazy" class="' + (x.ms.k === 'mil' ? 'gray' : '') + '"><div><b>' + esc(x.m.name) + '</b><small>' + esc(msShort(x.ms)) + (x.ms.k === 'mil' && x.ms.days > 0 ? ' · ' + esc(t('msLeft', { n: x.ms.days })) : '') + '</small>' +
        (pct ? '<span class="ms-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' : '') + '</div></li>';
    }).join('') + '</ul><p class="ms-foot">' + esc(t('msNote')) + '</p></details>';
  }
  function formerList(gid) {
    var f = (PEOPLE[gid] || {}).former || {};
    return Object.keys(f).map(function (id) { var x = f[id]; return { id: id, f: x, ret: watchFor(gid, id, 'return')[0] }; });
  }
  function formerSrc(gid, x) { return x.f.chibi ? memberSrc(gid, x.id) : face('default').src; }
  function formerHtml(gid) {
    var list = formerList(gid); if (!list.length) return '';
    return '<div class="former"><p class="squad-k">' + esc(t('fmTitle')) + '</p><ul>' + list.map(function (x) {
      var back = x.ret && x.ret.official, kind = back ? t('fmBack') : t(x.f.kind === 'solo' ? 'fmSolo' : x.f.kind === 'contract' ? 'fmContract' : 'fmLeft');
      return '<li class="fm' + (back ? ' fm-back' : '') + '"><span class="fm-pic"><img src="' + esc(formerSrc(gid, x)) + '" alt="" loading="lazy" decoding="async"></span><div><p class="fm-n"><b>' + esc(x.f.name) + '</b> <span class="ko" lang="ko">' + esc(x.f.ko || '') + '</span> <span class="fm-tag">' + esc(kind) + '</span></p>' +
        '<p class="fm-t">' + esc(lang === 'en' ? x.f.en : x.f.es) + '</p>' + (x.ret ? newsLink(x.ret) : '') + '</div></li>';
    }).join('') + '</ul></div>';
  }
  function okHandle(h) { return /^[A-Za-z0-9._]{1,40}$/.test(h || '') ? h : ''; }
  function socialLinks(p, cls) {
    var out = [];
    if (okHandle(p.instagram)) out.push(['ig', 'Instagram', 'https://www.instagram.com/' + p.instagram + '/']);
    if (okHandle(p.tiktok)) out.push(['tt', 'TikTok', 'https://www.tiktok.com/@' + p.tiktok]);
    if (okHandle(p.x)) out.push(['x', 'X', 'https://x.com/' + p.x]);
    return out.map(function (l) { return '<a class="' + (cls || 'soc') + ' soc-' + l[0] + '" href="' + esc(l[2]) + '" target="_blank" rel="noopener noreferrer">' + SOC_ICON[l[0]] + '<span>' + esc(l[1]) + ' · @' + esc(l[2].replace(/\/$/, '').split(/[/@]/).pop()) + '</span></a>'; }).join('');
  }
  var SOC_ICON = {
    ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" class="dot"/></svg>',
    tt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5M14 4c.6 2.6 2.3 4 5 4.3"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5l14 15M19 4.5 5 19.5"/></svg>'
  };
  function bdayInfo(p) {
    var b = p.birthday || ''; if (!/^\d{4}-\d\d-\d\d$/.test(b)) return null;
    var y = +b.slice(0, 4), mo = +b.slice(5, 7), d = +b.slice(8, 10);
    var kst = new Date(now() + 9 * 36e5), ty = kst.getUTCFullYear(), today = Date.UTC(ty, kst.getUTCMonth(), kst.getUTCDate());
    var next = Date.UTC(ty, mo - 1, d); if (next < today) next = Date.UTC(ty + 1, mo - 1, d);
    var days = Math.round((next - today) / 864e5);
    return { date: b, age: new Date(next).getUTCFullYear() - y - (days === 0 ? 0 : 1), turning: new Date(next).getUTCFullYear() - y, days: days, today: days === 0 };
  }
  function birthdaysToday(gid) {
    return members(gid).filter(function (m) { var b = bdayInfo(person(gid, m.id)); return b && b.today; });
  }
  function openGP(id, tab, mem, noPush) {
    if (!stOf(id)) return;
    GP.id = id; GP.tab = tab || 'home'; GP.mem = mem || null;
    var box = $('#gp'); box.setAttribute('style', gStyle(id));
    renderGP(); box.hidden = false; document.documentElement.style.overflow = 'hidden';
    if (!noPush) try { history.pushState({ gp: id }, '', '#g=' + id + (GP.tab !== 'home' ? '&t=' + GP.tab : '') + (GP.mem ? '&m=' + GP.mem : '')); } catch (e) { /* nada */ }
    Sound.play('open');
    var x = $('#gp .gp-x'); if (x) x.focus({ preventScroll: true });
    if (GP.mem) celebrateIfBday();
  }
  function closeGP(fromPop) {
    var box = $('#gp'); if (box.hidden) return;
    box.hidden = true; box.innerHTML = ''; GP.id = null; document.documentElement.style.overflow = '';
    if (!fromPop && history.state && history.state.gp) try { history.back(); } catch (e) { /* nada */ }
  }
  function gpSet(tab, mem) {
    GP.tab = tab; GP.mem = mem || null; renderGP();
    try { history.replaceState({ gp: GP.id }, '', '#g=' + GP.id + (tab !== 'home' ? '&t=' + tab : '') + (GP.mem ? '&m=' + GP.mem : '')); } catch (e) { /* nada */ }
    var body = $('#gp .gp-body'); if (body) body.scrollTop = 0;
    if (GP.mem) celebrateIfBday();
  }
  function celebrateIfBday() {
    var b = bdayInfo(person(GP.id, GP.mem)); if (!b || !b.today || reduce) return;
    setTimeout(function () { confettiBurst(innerWidth / 2, innerHeight * .3, 60, [gColor(GP.id), '#FFD84D', '#FF9CC6', '#fff'], 10, null, Math.PI * 2); Sound.play('fanfare'); }, 250);
  }
  function renderGP() {
    var id = GP.id, st = stOf(id); if (!st) return;
    var g = st.g, m = META[id] || {}, h = '';
    h += '<div class="gp-card"><header class="gp-head"><span class="gp-face">' + faceImg(id) + '</span><div class="gp-id">' +
      (m.ko ? '<p class="gp-ko" lang="ko">' + esc(m.ko) + '</p>' : '') + '<h2 id="gpTitle">' + esc(g.name) + '</h2><p class="gp-sub">' + esc([m.fan, (PROFILE[id] || {}).agency].filter(Boolean).join(' · ')) + '</p></div>' +
      '<button class="gp-x" type="button" data-gp-close aria-label="' + esc(t('close')) + '">' + ICON.x + '</button></header>';
    h += '<nav class="gp-tabs" role="tablist">' + GP_TABS.map(function (tb) {
      return '<button type="button" role="tab" data-gp-tab="' + tb[0] + '" aria-selected="' + (GP.tab === tb[0]) + '"><span class="ko" lang="ko">' + tb[2] + '</span>' + esc(t(tb[1])) + '</button>';
    }).join('') + '</nav><div class="gp-body">';
    if (GP.tab === 'home') h += gpHome(st);
    else if (GP.tab === 'members') h += GP.mem ? gpMember(st, GP.mem) : gpMembers(st);
    else if (GP.tab === 'tour') h += gpTour(st);
    else if (GP.tab === 'music') h += gpMusic(id);
    else h += gpSocial(id);
    h += '</div></div>';
    $('#gp').innerHTML = h;
  }
  function gpHome(st) {
    var id = st.id, h = '', bd = birthdaysToday(id);
    bd.forEach(function (mm) { h += '<button type="button" class="gp-bday" data-gp-mem="' + esc(mm.id) + '"><span>🎂</span>' + esc(t('bdayToday', { name: mm.name })) + ' <b lang="ko">생일 축하해!</b></button>'; });
    var e = st.cur;
    if (e) {
      var o = origin(), km = hav(o.lat, o.lon, e.lat, e.lon);
      h += '<section class="gp-sec gp-next"><p class="gp-k">' + esc(st.mode === 'live' ? t('live') : t('next')) + '</p><p class="gp-big">' + esc(place(e.city)) + '</p><p>' + esc(fmtDate(e.local_date, true)) + (e.venue ? ' · ' + esc(e.venue) : '') + '</p><p class="gp-muted">' + esc(fmtKm(km)) + ' ' + esc(t('kmFrom', { city: originRef() })) + ' · ' + esc(dday(e)) + '</p>' +
        '<button type="button" class="act" data-gp-tab="tour">' + ICON.map + esc(t('gpSeeTour')) + '</button></section>';
    } else if (st.last) {
      h += '<section class="gp-sec gp-next"><p class="gp-k">' + esc(t('rest')) + '</p><p class="gp-big">' + esc(t('lastStop')) + ': ' + esc(place(st.last.city)) + '</p><p class="gp-muted">' + esc(fmtDate(st.last.local_date, true)) + '</p></section>';
    }
    h += nextReleaseHtml(id);
    var p = PEOPLE[id] || {};
    h += listenHtml(st.g).replace('</ul></div>', (okHandle(p.tiktok) ? '<li><a class="ln ln-tt" href="https://www.tiktok.com/@' + esc(p.tiktok) + '" target="_blank" rel="noopener noreferrer">' + SOC_ICON.tt + '<span>TikTok</span></a></li>' : '') +
      (okHandle(p.instagram) ? '<li><a class="ln ln-ig" href="https://www.instagram.com/' + esc(p.instagram) + '/" target="_blank" rel="noopener noreferrer">' + SOC_ICON.ig + '<span>Instagram</span></a></li>' : '') + '</ul></div>');
    h += noticesHtml(id).replace('<details class="agenda notices">', '<details class="agenda notices" open>');
    h += statsHtml(st.g).replace('<details class="agenda stats">', '<details class="agenda stats" open>');
    var wt = lang === 'en' && st.g.watch_en && st.g.watch_en.length ? st.g.watch_en : st.g.watch;
    if (wt && wt.length) h += '<ul class="watch">' + wt.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
    h += triviaHtml(id);
    return h;
  }
  function gpMembers(st) {
    var id = st.id, list = members(id);
    return '<p class="gp-hint">' + esc(t('gpTapMember')) + '</p><ul class="gp-mems">' + list.map(function (mm, i) {
      var b = bdayInfo(person(id, mm.id)), ms = memStatus(id, mm.id);
      return '<li><button type="button" class="' + (ms ? 'st-' + ms.k + (ms.k === 'mil' ? ' away' : '') : '') + '" data-gp-mem="' + esc(mm.id) + '" style="--dl:-' + (i * .41 % 2.6).toFixed(2) + 's">' + (b && b.today ? '<span class="gp-hat" aria-hidden="true">🎂</span>' : '') + msBadge(ms) +
        '<img src="' + esc(memberSrc(id, mm.id)) + '" alt="" loading="lazy" decoding="async"><b>' + esc(mm.name) + '</b><span lang="ko">' + esc(mm.ko || '') + '</span>' +
        (ms ? '<small class="ms-s">' + esc(msShort(ms)) + '</small>' : b ? '<small>' + esc(b.today ? t('bdayIsToday') : t('bdayIn', { n: b.days })) + '</small>' : '') + '</button></li>';
    }).join('') + '</ul>' + milHtml(id) + formerHtml(id);
  }
  function gpMember(st, mid) {
    var id = st.id, mm = members(id).filter(function (x) { return x.id === mid; })[0]; if (!mm) return gpMembers(st);
    var p = person(id, mid), b = bdayInfo(p), feed = ((socialFeed[id] || {}).members || {})[mid] || {}, h = '';
    h += '<button type="button" class="gp-back" data-gp-tab="members">‹ ' + esc(t('gpAllMembers')) + '</button>';
    h += '<section class="gp-prof"><button type="button" class="gp-big-chibi' + ((memStatus(id, mid) || {}).k === 'mil' ? ' away' : '') + '" data-gp-hop aria-label="' + esc(mm.name) + '"><img src="' + esc(memberSrc(id, mid, true)) + '" alt=""></button>' +
      '<div><h3>' + esc(mm.name) + ' <span lang="ko">' + esc(mm.ko || '') + '</span></h3>' +
      (b ? '<p class="gp-bd' + (b.today ? ' today' : '') + '">🎂 ' + esc(fmtDate(b.date.replace(/^\d{4}/, String(new Date(now()).getFullYear())), false).replace(/,? \d{4}$/, '')) + ' · ' +
        esc(b.today ? t('bdayTurnsToday', { n: b.turning }) : t('bdayAgeIn', { age: b.age, n: b.days })) + '</p>' : '') +
      msLong(id, mid) + '<div class="soc-row">' + (socialLinks(p) || '<p class="gp-muted">' + esc(t('gpNoPersonal')) + '</p>') + '</div></div></section>';
    var posts = [].concat((feed.tiktok || []).map(function (x) { return Object.assign({ k: 'tt' }, x); }), (feed.instagram || []).map(function (x) { return Object.assign({ k: 'ig' }, x); }))
      .sort(function (a, c) { return a.when < c.when ? 1 : -1; }).slice(0, 6);
    if (posts.length) h += '<section class="gp-sec"><h4>' + esc(t('gpLatestPosts')) + '</h4>' + postList(posts) + '</section>';
    var others = members(id).filter(function (x) { return x.id !== mid; });
    h += '<div class="gp-others">' + others.map(function (x) { return '<button type="button" data-gp-mem="' + esc(x.id) + '" aria-label="' + esc(x.name) + '"><img src="' + esc(memberSrc(id, x.id)) + '" alt="" loading="lazy"></button>'; }).join('') + '</div>';
    return h;
  }
  function postList(posts) {
    return '<ul class="gp-posts">' + posts.map(function (x) {
      var vid = x.k === 'tt' && /\/video\/(\d+)/.exec(x.url || '');
      var ok = /^https:\/\/(www\.)?(tiktok\.com|instagram\.com|x\.com|twitter\.com)\//.test(x.url || '');
      if (!ok) return '';
      return '<li class="gp-post p-' + x.k + '"><div class="gp-post-h"><span class="soc-mini soc-' + x.k + '">' + SOC_ICON[x.k] + '</span><time>' + esc(t('ago', { n: agoTxt(now() - Date.parse(x.when)) })) + '</time></div>' +
        '<p>' + esc(x.title || '') + '</p>' + (vid ? '<button type="button" class="chip-btn" data-tt="' + esc(vid[1]) + '">▶ ' + esc(t('gpPlayHere')) + '</button> ' : '') +
        '<a class="src-link" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">' + esc(t('gpOpenPost')) + '</a></li>';
    }).join('') + '</ul>';
  }
  function gpTour(st) {
    var o = origin(), h = '', up = st.upStops, past = stops(st.past).slice(-8).reverse();
    function row(r, isPast) {
      var e0 = r[0], d = hav(o.lat, o.lon, e0.lat, e0.lon);
      var dates = r.map(function (x) { return parts(x.local_date).d; }).join(' · ') + ' ' + L().months[parts(e0.local_date).m - 1] + ' ' + parts(e0.local_date).y;
      var src = e0.src && /^https:\/\//.test(e0.src) ? ' <a class="src-link" href="' + esc(e0.src) + '" target="_blank" rel="noopener noreferrer">' + esc(t('gpSource')) + '</a>' : '';
      return '<li class="stub' + (isPast ? ' past' : '') + '"><span class="s-d">' + esc(dates) + '</span><span class="s-c">' + esc(place(e0.city)) + ', ' + esc(place(e0.country)) +
        (e0.venue ? '<span>' + esc(e0.venue) + '</span>' : '') + (e0.source === 'auto' ? '<span class="tag">' + esc(t('toConfirm')) + '</span>' + src : '') + '</span><span class="s-k">' + fmtKm(d) + ' km</span></li>';
    }
    h += '<p class="gp-tourname">' + esc(tourName(st.g)) + '</p>';
    if (up.length) h += '<section class="gp-sec"><h4>' + esc(t('gpUpcoming', { n: up.length })) + '</h4><ul class="stubs">' + up.map(function (r) { return row(r, false); }).join('') + '</ul></section>';
    else h += '<p class="gp-muted">' + esc(t('gpNoDates')) + '</p>';
    if (past.length) h += '<details class="agenda"><summary>' + esc(t('gpPast', { n: past.length })) + '</summary><ul class="stubs">' + past.map(function (r) { return row(r, true); }).join('') + '</ul></details>';
    if (st.cur && cityTarget(st)) h += '<div class="acts"><button type="button" class="act" data-city="' + esc(st.id) + '">' + ICON.map + esc(t('cityOpen')) + '</button>' + (st.cur ? '<button type="button" class="act" data-ics="' + esc(st.id) + '">' + ICON.cal + esc(t('calShort')) + '</button>' : '') + '</div>';
    return h;
  }
  function gpMusic(id) {
    var list = (media || []).filter(function (m) { return m.group === id && okLink(m.url); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    if (!list.length) return '<p class="gp-muted">' + esc(t('mediaEmpty')) + '</p>';
    return '<ul class="gp-media">' + list.map(function (m) {
      var img = okImg(m.image), yt = m.type === 'video' && /[?&]v=([\w-]{6,})/.exec(m.url);
      return '<li class="m-' + esc(m.type) + '"><div class="gp-thumb"' + (yt ? ' data-yt="' + esc(yt[1]) + '" role="button" tabindex="0" aria-label="' + esc(t('gpPlayHere') + ': ' + m.title) + '"' : '') + '><img src="' + esc(img || face(id).src) + '" alt="" loading="lazy">' + (yt ? '<span class="gp-play">▶</span>' : '') + '</div>' +
        '<div><b>' + esc(m.title) + '</b><small>' + esc(m.date ? fmtDate(m.date, true) : '') + (m.kind ? ' · ' + esc(m.kind) : '') + '</small><a class="src-link" href="' + esc(okLink(m.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(m.type === 'music' ? t('mediaListen') : t('mediaWatch')) + '</a></div></li>';
    }).join('') + '</ul>';
  }
  function gpSocial(id) {
    var f = socialFeed[id] || {}, h = '', p = PEOPLE[id] || {};
    var posts = [].concat((f.x || []).map(function (x) { return Object.assign({ k: 'x' }, x); }), (f.tiktok || []).map(function (x) { return Object.assign({ k: 'tt' }, x); }), (f.instagram || []).map(function (x) { return Object.assign({ k: 'ig' }, x); }))
      .sort(function (a, c) { return a.when < c.when ? 1 : -1; }).slice(0, 12);
    var groupLinks = socialLinks({ instagram: p.instagram, tiktok: p.tiktok }, 'soc');
    if (groupLinks) h += '<div class="soc-row">' + groupLinks + '</div>';
    h += noticesHtml(id).replace('<details class="agenda notices">', '<details class="agenda notices" open>');
    h += posts.length ? '<section class="gp-sec"><h4>' + esc(t('gpLatestPosts')) + '</h4>' + postList(posts) + '</section>' : '<p class="gp-muted">' + esc(t('gpNoPosts')) + '</p>';
    var withSoc = members(id).filter(function (mm) { var q = person(id, mm.id); return okHandle(q.instagram) || okHandle(q.tiktok) || okHandle(q.x); });
    if (withSoc.length) h += '<section class="gp-sec"><h4>' + esc(t('gpMemberAccounts')) + '</h4><ul class="gp-socmem">' + withSoc.map(function (mm) {
      return '<li><button type="button" data-gp-mem="' + esc(mm.id) + '"><img src="' + esc(memberSrc(id, mm.id)) + '" alt="" loading="lazy"><b>' + esc(mm.name) + '</b></button><div class="soc-row">' + socialLinks(person(id, mm.id), 'soc small') + '</div></li>';
    }).join('') + '</ul></section>';
    return h;
  }
  function playEmbed(el, src, ratio) {
    var wrap = document.createElement('div'); wrap.className = 'gp-embed' + (ratio === 'tall' ? ' tall' : '');
    var f = document.createElement('iframe'); f.src = src; f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen'); f.setAttribute('allowfullscreen', ''); f.setAttribute('loading', 'lazy'); f.title = 'video';
    wrap.appendChild(f); el.replaceWith(wrap);
  }
  function gpClick(el) {
    if (el.hasAttribute('data-gp-close')) { closeGP(); return true; }
    if (el.hasAttribute('data-gp-tab')) { gpSet(el.getAttribute('data-gp-tab')); Sound.play('tick'); return true; }
    if (el.hasAttribute('data-gp-mem')) { GP.tab = 'members'; gpSet('members', el.getAttribute('data-gp-mem')); Sound.play('pop'); return true; }
    if (el.hasAttribute('data-gp-hop')) { var im = el.querySelector('img'); im.classList.remove('hop'); void im.offsetWidth; im.classList.add('hop'); Sound.play('hop'); return true; }
    if (el.hasAttribute('data-yt')) { playEmbed(el, 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(el.getAttribute('data-yt')) + '?autoplay=1&rel=0'); return true; }
    if (el.hasAttribute('data-tt')) { playEmbed(el, 'https://www.tiktok.com/embed/v2/' + encodeURIComponent(el.getAttribute('data-tt')), 'tall'); return true; }
    if (el.hasAttribute('data-gp-open')) { openGP(el.getAttribute('data-gp-open'), el.getAttribute('data-gp-t') || 'home', el.getAttribute('data-gp-m')); return true; }
    return false;
  }
  window.addEventListener('popstate', function () { if (!$('#gp').hidden) closeGP(true); });
  (function () { /* abrir desde un enlace: #g=bts&t=members&m=jimin */
    var m = /#g=([a-z0-9]+)(?:&t=(\w+))?(?:&m=([a-z0-9]+))?/.exec(location.hash || '');
    if (m) setTimeout(function () { openGP(m[1], m[2], m[3], true); }, 400);
  })();

  /* ================= toast ================= */
  var toastT = 0;
  function toast(msg) { var el = $('#toast'); el.textContent = msg; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 2600); }

  /* ================= alertas: ntfy por temas y Discord por grupo =================
     Sin servidor ni datos personales: el robot publica cada alerta en temas públicos de ntfy
     ("<prefijo>-<grupo>-<tipo>", "<prefijo>-pais-<país>", "<prefijo>-semana"; ver alerts/engine.py, public_topics)
     y en el foro de Discord (una publicación por grupo). Aquí el fan elige y se lleva la lista de temas a la app. */
  var NTFY_CATS = [['shows', 'catShows', true], ['music', 'catMusic', true], ['news', 'catNews', false], ['members', 'catMembers', false]];
  var form = { ch: 'ntfy' };
  function loadForm() { try { var f = JSON.parse(store('radar-sub') || 'null'); return f && f.v === 2 ? f : null; } catch (e) { return null; } }
  function saveForm() {
    store('radar-sub', JSON.stringify({ v: 2, ch: form.ch, groups: $$('#fGroups input:checked').map(function (i) { return i.value; }),
      cats: $$('#fTypes input:checked').map(function (i) { return i.value; }), countryOn: $('#fCountryOn').checked, country: $('#fCountry').value, weekly: $('#fWeekly').checked }));
  }
  function slugTopic(x) { return String(x || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); }
  function topicPrefix() { return /^[A-Za-z0-9_-]{1,40}$/.test(CFG.ntfyTopicPrefix || '') ? CFG.ntfyTopicPrefix : ''; }
  function myCountry() {
    var o = origin();
    if (o.country) return o.country;
    var best = null; ORIGINS.forEach(function (c) { var d = hav(o.lat, o.lon, c[2], c[3]); if (!best || d < best.d) best = { d: d, c: c[1] }; });
    return best && best.d < 600 ? best.c : 'Colombia';
  }
  function countryList() {
    var seen = {}, out = [];
    ORIGINS.forEach(function (c) { if (!seen[c[1]]) { seen[c[1]] = 1; out.push(c[1]); } });
    (data.groups || []).forEach(function (g) { (g.events || []).forEach(function (e) { if (e.country && !seen[e.country]) { seen[e.country] = 1; out.push(e.country); } }); });
    return out.sort(function (x, y) { return place(x).localeCompare(place(y), L().locale); });
  }
  function renderForm() {
    var saved = loadForm() || {};
    if (renderForm.done) saved = { groups: $$('#fGroups input:checked').map(function (i) { return i.value; }), cats: $$('#fTypes input:checked').map(function (i) { return i.value; }),
      countryOn: $('#fCountryOn').checked, country: $('#fCountry').value, weekly: $('#fWeekly').checked, ch: form.ch };
    var gs = saved.groups || (bias ? [bias] : []);
    $('#fGroups').innerHTML = data.groups.map(function (g) {
      return '<label class="chip" style="' + gStyle(g.id) + '"><input type="checkbox" name="g" value="' + esc(g.id) + '"' + (gs.indexOf(g.id) >= 0 ? ' checked' : '') + '><span>' + esc(g.name) + '</span></label>';
    }).join('');
    $('#fTypes').innerHTML = NTFY_CATS.map(function (c) {
      var on = saved.cats ? saved.cats.indexOf(c[0]) >= 0 : c[2];
      return '<label class="chip"><input type="checkbox" name="t" value="' + c[0] + '"' + (on ? ' checked' : '') + '><span>' + esc(t(c[1])) + '</span></label>';
    }).join('');
    var cc = saved.country || myCountry();
    $('#fCountry').innerHTML = countryList().map(function (c) { return '<option value="' + esc(c) + '"' + (c === cc ? ' selected' : '') + '>' + esc(place(c)) + '</option>'; }).join('');
    $('#fCountryOn').checked = saved.countryOn !== false;
    $('#fWeekly').checked = !!saved.weekly;
    if (!renderForm.done) { renderForm.done = true; if (saved.ch === 'discord') form.ch = 'discord'; }
    setChannel(form.ch, true);
  }
  function setChannel(ch, silent) {
    form.ch = ch;
    $('.tabs').setAttribute('data-ch', ch);
    $$('.tabs [role="tab"]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-ch') === ch)); });
    $$('[data-for]').forEach(function (f) { f.hidden = f.getAttribute('data-for') !== ch; });
    if (!silent) { Sound.play('toggle'); saveForm(); }
    updateSub();
  }
  function myTopics() {
    var p = topicPrefix(), out = []; if (!p) return out;
    var gs = $$('#fGroups input:checked').map(function (i) { return i.value; }), cs = $$('#fTypes input:checked').map(function (i) { return i.value; });
    gs.forEach(function (g) { cs.forEach(function (c) { out.push({ id: p + '-' + g + '-' + c, g: g, label: gName(g) + ' · ' + t(NTFY_CATS.filter(function (x) { return x[0] === c; })[0][1]) }); }); });
    if ($('#fCountryOn').checked && $('#fCountry').value) out.push({ id: p + '-pais-' + slugTopic($('#fCountry').value), g: 'default', label: t('topicCountry', { c: place($('#fCountry').value) }) });
    if ($('#fWeekly').checked) out.push({ id: p + '-semana', g: 'default', label: t('topicWeekly') });
    return out;
  }
  var ntfyDone = (function () { try { return JSON.parse(store('radar-ntfy-done') || '{}') || {}; } catch (e) { return {}; } })();
  function topicHref(id) {
    var ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'ntfy://ntfy.sh/' + id;  // abre la app y suscribe (deep link de ntfy en Android)
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return '';  // en iPhone se pega el nombre en la app
    return 'https://ntfy.sh/' + id;  // en el computador, la web de ntfy también avisa
  }
  function updateSub() {
    var list = $('#ntfyList');
    if (list) {
      var tps = myTopics(), ios = !topicHref('x');
      if (!topicPrefix()) list.innerHTML = '<p class="hint">' + esc(t('ntfyOff')) + '</p>';
      else if (!tps.length) list.innerHTML = '<p class="hint">' + esc(t('ntfyPick')) + '</p>';
      else list.innerHTML = '<p class="hint">' + esc(t(ios ? 'ntfyHowIos' : 'ntfyHow')) + '</p><ul class="topics">' + tps.map(function (x) {
        var href = topicHref(x.id);
        return '<li class="' + (ntfyDone[x.id] ? 'done' : '') + '" style="' + gStyle(x.g) + '"><div class="tp-txt"><span class="tp-l">' + esc(x.label) + '</span><code>' + esc(x.id) + '</code></div>' +
          '<div class="tp-acts">' + (href ? '<a class="act solid" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" data-topic="' + esc(x.id) + '">' + esc(t('ntfyOpen')) + '</a>' : '') +
          '<button type="button" class="act" data-copy="' + esc(x.id) + '">' + esc(t('copy')) + '</button></div></li>';
      }).join('') + '</ul>' + (tps.length > 1 ? '<button type="button" class="link-btn" data-copy="' + esc(tps.map(function (x) { return x.id; }).join('\n')) + '">' + esc(t('ntfyCopyAll', { n: tps.length })) + '</button>' : '') +
        (tps.length > 8 ? '<p class="hint warn">' + esc(t('ntfyMany', { n: tps.length })) + '</p>' : '');
    }
    var dc = $('#dcBox');
    if (dc) {
      var inv = /^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+$/.test(CFG.discordInvite || '') ? CFG.discordInvite : '';
      var names = $$('#fGroups input:checked').map(function (i) { return gName(i.value); });
      dc.innerHTML = inv ? '<ol class="dc-steps"><li><a class="btn primary" href="' + esc(inv) + '" target="_blank" rel="noopener noreferrer">' + esc(t('dcJoin')) + '</a></li><li>' + esc(t('dcForum')) + '</li><li>' + esc(t('dcFollow', { g: names.length ? names.join(', ') : t('dcYours') })) + '</li></ol><p class="hint">' + esc(t('dcNote')) + '</p>'
        : '<p class="dc-soon"><b>' + esc(t('dcSoonT')) + '</b> ' + esc(t('dcSoon')) + '</p><button type="button" class="btn small" data-ch="ntfy">' + esc(t('dcUseNtfy')) + '</button>';
    }
    updatePreview();
  }
  function updatePreview() {
    var g0 = ($$('#fGroups input:checked')[0] || {}).value, st = states.filter(function (x) { return x.id === g0; })[0] || states.filter(function (x) { return x.cur; })[0] || states[0];
    var pv = $('#preview'); if (!pv || !st) return;
    var city = st.cur ? place(st.cur.city) : 'Seúl', title = lang === 'en' ? 'Today ' + st.g.name + ' opens in ' + city : 'Hoy ' + st.g.name + ' abre en ' + city;
    var body = st.cur && st.cur.venue ? st.cur.venue + ', ' + city : city;
    pv.className = 'preview-bubble ' + (form.ch === 'discord' ? 'discord' : 'push');
    if (form.ch === 'discord') pv.innerHTML = '<b>Radar K-pop</b> <span class="pv-meta" style="display:inline">' + esc(t('pvNow')) + '</span><br><span class="pv-thread"># ' + esc(st.g.name) + ' · alertas</span><br><b>' + esc(title) + '</b><br>' + esc(body);
    else pv.innerHTML = '<span class="pv-app"><img src="assets/icons/icon-192.png" alt="" width="20" height="20"> ntfy · ' + esc(t('pvNow')) + '</span><b>' + esc(title) + '</b><br>' + esc(body);
  }
  function copyText(txt) {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(t('copied')); Sound.play('pop'); }).catch(function () { window.prompt(t('copy'), txt); });
  }
  function markTopic(id) { if (!id || id.indexOf('\n') >= 0) return; ntfyDone[id] = 1; store('radar-ntfy-done', JSON.stringify(ntfyDone)); updateSub(); }

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
      '<p class="p-t">' + esc((lang === 'en' && a.title_en) || a.title) + '</p><p class="p-b">' + esc((lang === 'en' && a.body_en) || a.body || '') + '</p>' +
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
  /* orden de los avistamientos: lo más reciente primero (por defecto) o lo más cerca */
  var sightSort = store('radar-sight-sort') === 'near' ? 'near' : 'recent';
  function sightList() {
    var o = origin();
    return sights.map(function (a) { return { a: a, km: hav(o.lat, o.lon, a.lat, a.lon), key: sightKey(a), w: Date.parse(a.when || '') || 0 }; })
      .sort(function (x, y) { return sightSort === 'near' ? x.km - y.km : (y.w - x.w) || (x.km - y.km); });
  }
  function gName(id) { var g = (data.groups || []).filter(function (x) { return x.id === id; })[0]; return g ? g.name : (id || ''); }
  function renderSights() {
    var el = $('#sightList'); if (!el) return;
    var list = sightList();
    $('#sightSample').hidden = !sightsMeta.sample;
    var sf = $('#sightSort');
    if (sf) sf.innerHTML = [['recent', 'sightRecent'], ['near', 'sightNear']].map(function (f) { return '<button type="button" class="chip-btn" data-ssort="' + f[0] + '" aria-pressed="' + (sightSort === f[0]) + '">' + esc(t(f[1])) + '</button>'; }).join('');
    if (!list.length) { el.innerHTML = '<li class="bub empty"><span class="bub-face">' + faceImg('default') + '</span><div class="bub-body"><p class="bub-b">' + esc(t('sightEmpty')) + '</p></div></li>'; }
    else el.innerHTML = list.slice(0, innerWidth < 600 ? 4 : 6).map(function (x) {
      var a = x.a, url = okUrl(a.url);
      return '<li class="bub sighting' + (freshS[x.key] ? ' fresh' : '') + '" id="s-' + esc(x.key.replace(/[^\w-]/g, '')) + '" style="' + gStyle(a.group) + '"><span class="bub-face">' + faceImg(a.group) + '</span><div class="bub-body">' +
        '<div class="bub-h"><span class="typ">' + esc(gName(a.group)) + '</span><span>' + esc(place(a.city)) + (a.country ? ', ' + esc(place(a.country)) : '') + '</span>' + (a.when ? '<time datetime="' + esc(a.when) + '">' + esc(t('ago', { n: agoTxt(now() - Date.parse(a.when)) })) + '</time>' : '') + '</div>' +
        '<p class="bub-t">' + esc(t('sightAway', { km: fmtKm(x.km) })) + '</p>' + (a.text ? '<p class="bub-b">' + esc((lang === 'en' && a.text_en) || a.text) + '</p>' : '') +
        (url ? '<a class="s-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(t('sightSee')) + (a.account ? ' · @' + esc(a.account) : '') + '</a>' : '') + '</div></li>';
    }).join('');
    // cinta tipo noticiero (inspirada en el tracker de Spidey): en el mismo orden que la lista
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


  /* ================= estrenos y videos (media.json: iTunes + YouTube RSS) ================= */
  var media = [], mediaType = store('radar-media') || 'music';
  if (['music', 'video', 'all'].indexOf(mediaType) < 0) mediaType = 'music';
  /* qué tipo de video es, por el título: un MV va con la música; vlogs, teasers y shorts van en Videos */
  function vkind(title) {
    var x = title || '';
    if (/비하인드|behind|making|reaction|리액션/i.test(x)) return 'behind';
    if (/\bM\/?V\b|music video|뮤직비디오|performance (?:video|film)|dance practice|안무 영상|special (?:clip|video)|official (?:video|audio|visualizer)|visualizer|lyric video/i.test(x)) return 'mv';
    if (/vlog|브이로그|log_logbook|relay cam|릴레이/i.test(x)) return 'vlog';
    if (/teaser|trailer|티저|예고|preview|highlight medley|D-\d/i.test(x)) return 'teaser';
    if (/\b(?:ep\.?|episode)\s*\d|run\s?bts|달려라|skz-talker|inside seventeen|going seventeen|en-o'clock|light jeans|talk|라이브|live/i.test(x)) return 'show';
    if (/#\S/.test(x) && x.replace(/#\S+/g, '').trim().length < 40) return 'short';
    return 'video';
  }
  function inMusic(m) { return m.type === 'music' || (m.type === 'video' && vkind(m.title) === 'mv'); }
  function okImg(u) { return /^https:\/\/([a-z0-9-]+\.)*(mzstatic\.com|ytimg\.com)\//.test(u || '') ? u : ''; }
  function okLink(u) { return /^https:\/\/(music\.apple\.com|www\.youtube\.com)\//.test(u || '') ? u : ''; }
  function pollMedia() {
    return fetch('media.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (j && Array.isArray(j.items)) { media = j.items; renderMedia(); if (data && data.groups) renderCards(); } }).catch(function () { renderMedia(); });
  }
  function renderMedia() {
    var el = $('#media'); if (!el) return;
    $('#mediaFilter').innerHTML = [['music', 'mediaMusic'], ['video', 'mediaVideo'], ['all', 'mediaAll']].map(function (f) {
      return '<button type="button" class="chip-btn" data-mfilter="' + f[0] + '" aria-pressed="' + (mediaType === f[0]) + '">' + esc(t(f[1])) + '</button>';
    }).join('');
    $('#mediaSrc').textContent = t('mediaSrc');
    var list = media.filter(function (m) { return (mediaType === 'all' || (mediaType === 'music' ? inMusic(m) : !inMusic(m))) && okLink(m.url); })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, innerWidth < 600 ? 6 : 9);
    if (!list.length) { el.innerHTML = '<li class="m-empty">' + esc(t('mediaEmpty')) + '</li>'; return; }
    el.innerHTML = list.map(function (m, i) {
      var img = okImg(m.image), d = m.date ? fmtDate(m.date, true) : '';
      return '<li class="m-item m-' + esc(m.type) + '" style="' + gStyle(m.group) + ';--i:' + i + '"><a href="' + esc(okLink(m.url)) + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="m-img">' + '<img src="' + esc(img || face(m.group).src) + '" alt="" loading="lazy" decoding="async" data-fb="' + esc(face(m.group).src) + '"' + (img ? '' : ' class="m-fb"') + '>' + '<span class="m-badge">' + esc(m.type === 'music' ? t('mediaListen') : t('mediaWatch')) + '</span>' + (m.type === 'video' && vkind(m.title) !== 'video' ? '<span class="m-kind">' + esc(t('vk' + { mv: 'Mv', teaser: 'Teaser', short: 'Short', vlog: 'Vlog', behind: 'Behind', show: 'Show' }[vkind(m.title)])) + '</span>' : '') + '</span>' +
        '<span class="m-txt"><b class="m-g">' + esc(gName(m.group)) + '</b><span class="m-t">' + esc(m.title) + '</span><span class="m-d">' + esc(t('released', { when: d })) + '</span></span></a></li>';
    }).join('');
    el.querySelectorAll('img[data-fb]').forEach(function (im) {
      im.addEventListener('error', function () { if (im.classList.contains('m-fb')) return; im.classList.add('m-fb'); im.src = im.getAttribute('data-fb'); }, { once: true });
    });
  }

  /* ================= vista de ciudad: MapLibre + OpenFreeMap (gratis, sin clave), con colores pastel ================= */
  var City = { map: null, lib: null, style: null, st: null, marks: [], tilt: true, ev: null };
  var STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
  function loadMapLib() {
    if (window.maplibregl) return Promise.resolve();
    if (City.lib) return City.lib;
    City.lib = new Promise(function (res, rej) {
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'assets/vendor/maplibre-gl.css'; document.head.appendChild(css);
      var sc = document.createElement('script'); sc.src = 'assets/vendor/maplibre-gl.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc);
    });
    return City.lib;
  }
  function kawaiiStyle(style) {
    var K = { bg: '#F7F2FF', water: '#A8DDF2', park: '#C6F3DA', grass: '#DDF7E8', home: '#F1E9FF', bldg: '#FFDDEA', bldgLine: '#EBB7CC', road: '#FFFFFF', casing: '#D6C8F4',
      major: '#FFF0B3', majorCasing: '#F2C766', rail: '#C9B6F0', label: '#5A4B82' };
    style.layers = style.layers.filter(function (l) { return l.id !== 'natural_earth' && !/shield|one_way|poi_r7|poi_r1$/.test(l.id); });
    style.layers.forEach(function (l) {
      var p = l.paint = l.paint || {}, id = l.id;
      if (l.type === 'background') p['background-color'] = K.bg;
      else if (l.type === 'fill') {
        if (/water/.test(id)) p['fill-color'] = K.water;
        else if (/park|wood/.test(id)) p['fill-color'] = K.park;
        else if (/grass|pitch|track|cemetery|wetland/.test(id)) p['fill-color'] = K.grass;
        else if (/residential|school|hospital/.test(id)) p['fill-color'] = K.home;
        else if (/building/.test(id)) { p['fill-color'] = K.bldg; p['fill-outline-color'] = K.bldgLine; }
        else if (/aeroway|sand/.test(id)) p['fill-color'] = '#EFE7FB';
      } else if (l.type === 'fill-extrusion') { p['fill-extrusion-color'] = '#FFE6F1'; p['fill-extrusion-opacity'] = .92; }
      else if (l.type === 'line') {
        if (/waterway/.test(id)) p['line-color'] = K.water;
        else if (/rail/.test(id)) p['line-color'] = K.rail;
        else if (/boundary/.test(id)) p['line-color'] = '#C9B6F0';
        else if (/park_outline/.test(id)) p['line-color'] = '#9EDDB9';
        else if (/casing/.test(id)) p['line-color'] = /motorway|trunk|primary/.test(id) ? K.majorCasing : K.casing;
        else if (/motorway|trunk|primary/.test(id)) p['line-color'] = K.major;
        else if (/road|bridge|tunnel|path/.test(id)) p['line-color'] = K.road;
      } else if (l.type === 'symbol') {
        p['text-color'] = K.label; p['text-halo-color'] = '#FFFFFF'; p['text-halo-width'] = 1.8;
        // nombres en el idioma de la página cuando OpenStreetMap los tiene
        if (l.layout && l.layout['text-field'] && /name/.test(JSON.stringify(l.layout['text-field'])) && !/shield|ref/.test(id))
          l.layout['text-field'] = ['coalesce', ['get', 'name:' + lang], ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
      }
    });
    return style;
  }
  function cityTarget(st) { return st.cur ? { e: st.cur, next: true } : st.last ? { e: st.last, next: false } : null; }
  function openCity(id) {
    var st = stOf(id), tg = st && cityTarget(st); if (!tg) return;
    var e = tg.e, o = origin(), km = hav(o.lat, o.lon, e.lat, e.lon), box = $('#city');
    City.st = st; City.ev = e;
    box.setAttribute('style', gStyle(id));
    $('#cityFace').innerHTML = faceImg(id);
    $('#cityK').textContent = (tg.next ? t('cityK') : t('cityLast')) + ' · ' + st.g.name;
    $('#cityTitle').textContent = e.venue || place(e.city);
    $('#citySub').textContent = place(e.city) + ', ' + place(e.country) + ' · ' + fmtDate(e.local_date, true) + ' · ' + fmtKm(km) + ' ' + t('kmFrom', { city: originRef() });
    var msg = $('#cityMsg'); msg.hidden = false; msg.textContent = t('cityLoading');
    box.hidden = false; document.documentElement.style.overflow = 'hidden';
    Sound.play('open'); $('[data-city-close]').focus({ preventScroll: true });
    loadMapLib().then(function () {
      if (City.style && City.styleLang === lang) return City.style;
      return (City.raw ? Promise.resolve(City.raw) : fetch(STYLE_URL).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }))
        .then(function (j) { City.raw = j; City.styleLang = lang; City.style = kawaiiStyle(JSON.parse(JSON.stringify(j))); if (City.map) City.map.setStyle(City.style); return City.style; });
    }).then(function (style) {
      var view = { center: [e.lon, e.lat], zoom: 15.2, pitch: City.tilt ? 52 : 0, bearing: -18 };
      if (!City.map) {
        City.map = new maplibregl.Map(Object.assign({ container: 'cityMap', style: style, attributionControl: { compact: true }, maxPitch: 70 }, view));
        City.map.on('load', function () { msg.hidden = true; });
        City.map.on('error', function () { if (!City.map.loaded()) { msg.hidden = false; msg.textContent = t('cityFail'); } });
      } else { City.map.resize(); City.map.jumpTo(view); msg.hidden = true; }
      City.marks.forEach(function (m) { m.remove(); }); City.marks = [];
      var pin = document.createElement('div'); pin.className = 'city-pin'; pin.setAttribute('style', gStyle(id));
      pin.innerHTML = '<span class="cp-ring"></span><img src="' + esc(face(id).src) + '" alt=""><span class="cp-tag">' + esc(e.venue || place(e.city)) + '</span>';
      pin.addEventListener('click', function () { var im = pin.querySelector('img'); im.classList.remove('hop'); void im.offsetWidth; im.classList.add('hop'); Sound.play('hop'); });
      City.marks.push(new maplibregl.Marker({ element: pin, anchor: 'bottom' }).setLngLat([e.lon, e.lat]).addTo(City.map));
      if (km < 300) {
        var me = document.createElement('div'); me.className = 'city-me'; me.innerHTML = '<span></span><b>' + esc(t('cityYou')) + '</b>';
        City.marks.push(new maplibregl.Marker({ element: me, anchor: 'center' }).setLngLat([o.lon, o.lat]).addTo(City.map));
      }
    }).catch(function (err) { msg.hidden = false; msg.textContent = t('cityFail'); if (params.has('debug')) console.warn('city map', err); });
  }
  function closeCity() {
    var box = $('#city'); if (box.hidden) return;
    box.hidden = true; document.documentElement.style.overflow = ''; Sound.play('close');
  }
  function cityTool(k) {
    var m = City.map; if (!m) return;
    var d = reduce ? 0 : 600;
    if (k === 'in') m.zoomIn({ duration: d }); else if (k === 'out') m.zoomOut({ duration: d });
    else if (k === 'tilt') { City.tilt = !City.tilt; m.easeTo({ pitch: City.tilt ? 52 : 0, duration: d }); }
    else if (k === 'venue' && City.ev) m.flyTo({ center: [City.ev.lon, City.ev.lat], zoom: 15.2, pitch: City.tilt ? 52 : 0, bearing: -18, duration: reduce ? 0 : 1200 });
    Sound.play('tap');
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

  /* ================= modo video (9:16, ~15 s) =================
     Tres zonas fijas que nunca se pisan: título arriba, globo al centro, tarjeta abajo.
     En el globo solo aparece el grupo en foco, para que se vea limpio en TikTok. */
  var Video = { globe: null, timers: [], running: false };
  function vClear() { Video.timers.forEach(clearTimeout); Video.timers = []; }
  function vAt(ms, fn) { Video.timers.push(setTimeout(fn, ms)); }
  function siteHost() { return (CFG.siteUrl || location.host + location.pathname).replace(/^https?:\/\//, '').replace(/index\.html$/, '').replace(/\/$/, ''); }
  function openVideo() {
    var v = $('#video'); v.hidden = false; document.documentElement.style.overflow = 'hidden';
    if (v.requestFullscreen && !finePointer) v.requestFullscreen().catch(function () { });
    if (!Video.globe) Video.globe = new Globe($('#vglobe'), $('#vpins'), { passive: true, fit: .42, hfit: .4, cy: .54, spin: 9, lon: -70, lat: 10 });
    else Video.globe.resize();
    Video.globe.pinTarget = Math.max(84, Math.min(130, $('#vzone').clientWidth * .3));
    Video.globe.inView = true; Video.globe.autoSpin = true;
    if (globe) globe.inView = false;
    showVideoUi();
    runVideo();
  }
  function vShow(list, routes, star) {
    var vg = Video.globe, gd = buildGeo();
    var ms = gd.markers.filter(function (m) { return list.indexOf(m.id) >= 0; });
    ms.forEach(function (m) { m.dx = m.dy = 0; m.alat = m.alon = null; m.low = false; });
    if (ms.length > 1) { var tot = ms.length; ms.forEach(function (m, i) { m.alat = ms[0].lat; m.alon = ms[0].lon; m.dx = (i - (tot - 1) / 2) * m.cw * .8; }); }
    vg.setData(ms, routes ? gd.routes.filter(function (r) { return list.indexOf(r.id) >= 0; }) : []);
    vg.starId = star || null; vg.setSel(star || null);
  }
  function runVideo() {
    vClear();
    var vg = Video.globe, top = $('#vtop'), cap = $('#vcap'), end = $('#vend');
    end.innerHTML = ''; $('#video').classList.remove('ended');
    vg.zoom = .7; vg.lon = -100; vg.lat = 12; vg.tween = null;
    vShow([], false); vg.flyTo(-70, 10, 1, reduce ? 0 : 1400);
    var o = origin();
    var tour = states.filter(function (s) { return s.mode !== 'rest'; });
    var rest = states.filter(function (s) { return s.mode === 'rest'; });
    var steps = tour.map(function (s) { return { st: s }; });
    if (rest.length) steps.push({ rest: rest });
    var intro = 1600, outro = 2400, per = clamp((15000 - intro - outro) / Math.max(1, steps.length), 1500, 3000);
    top.innerHTML = '<div class="v-title"><b>Radar <em>K-pop</em></b><span>' + esc(t('vTitle')) + '</span></div>';
    cap.innerHTML = '<div class="v-cap v-intro"><div class="vc-faces">' + states.map(function (s) { return '<img src="' + esc(face(s.id).src) + '" alt="">'; }).join('') + '</div><p>' + esc(t('vAll', { n: tour.length })) + '</p></div>';
    Sound.play('fanfare');
    steps.forEach(function (step, i) {
      vAt(intro + i * per, function () {
        var html, gid, pos, ids;
        if (step.st) {
          var s = step.st, km = hav(o.lat, o.lon, s.cur.lat, s.cur.lon); gid = s.id; pos = s.pos; ids = [s.id];
          html = '<div class="v-cap ' + (s.mode === 'live' ? 'live' : '') + '" style="' + gStyle(s.id) + '"><span class="tape"></span>' +
            '<img class="vc-face" src="' + esc(face(s.id, true).src) + '" alt=""><div class="vc-txt"><p class="vc-ko" lang="ko">' + esc((META[s.id] || {}).ko || '') + '</p>' +
            '<p class="vc-n">' + esc(s.g.name) + '</p><p class="vc-w">' + esc(place(s.cur.city).split(' (')[0]) + ' · ' + esc(fmtShort(s.cur.local_date)) + '</p>' +
            '<p class="vc-k">' + fmtKm(km) + ' ' + esc(t('kmFrom', { city: originRef() })) + '</p></div><span class="vc-d">' + esc(s.mode === 'live' ? 'LIVE' : dday(s.cur)) + '</span></div>';
        } else {
          gid = step.rest[0].id; pos = step.rest[0].pos; ids = step.rest.map(function (r) { return r.id; });
          html = '<div class="v-cap" style="' + gStyle(gid) + '"><span class="tape"></span><div class="vc-faces">' + step.rest.map(function (r) { return '<img src="' + esc(face(r.id).src) + '" alt="">'; }).join('') + '</div>' +
            '<div class="vc-txt"><p class="vc-ko" lang="ko">쉬는 중</p><p class="vc-n small">' + esc(step.rest.map(function (r) { return r.g.name; }).join(' · ')) + '</p><p class="vc-w">' + esc(t('vWaiting')) + '</p></div><span class="vc-d">D-?</span></div>';
        }
        top.innerHTML = '<div class="v-title small"><b>Radar <em>K-pop</em></b><span>' + (i + 1) + ' / ' + steps.length + ' · ' + esc(step.st ? t('vNext') : t('vRest')) + '</span></div>';
        vShow(ids, !!step.st, gid);
        vg.flyTo(pos.lon, pos.lat - 6, 1.1, reduce ? 0 : Math.min(1200, per * .5));
        Sound.play('whoosh'); vAt(450, function () { Sound.play('select'); });
        cap.innerHTML = html;
        var pin = vg.pinEls[gid]; if (pin) { pin.classList.remove('hop'); void pin.offsetWidth; pin.classList.add('hop'); }
      });
    });
    vAt(intro + steps.length * per, function () {
      vShow(states.map(function (s) { return s.id; }), false); vg.starId = null; vg.setSel(null);
      $('#vzone').classList.add('dots-only');
      vg.idleUntil = 0; vg.flyTo(vg.lon + 40, 10, .95, reduce ? 0 : 1300);
      top.innerHTML = '<div class="v-title"><b>Radar <em>K-pop</em></b><span lang="ko">다음에 또 봐요</span></div>';
      cap.innerHTML = '<div class="v-outro"><b>' + esc(t('vOutro')) + '</b><span>' + esc(siteHost()) + '</span></div>';
      Sound.play('heart');
    });
    vAt(intro + steps.length * per + outro, function () {
      end.innerHTML = '<button type="button" class="btn primary" data-vreplay>' + esc(t('replay')) + '</button><button type="button" class="btn" data-vclose>' + esc(t('closeVideo')) + '</button>';
      $('#video').classList.add('show-ui', 'ended');
    });
    $('#vzone').classList.remove('dots-only');
  }
  var uiT = 0;
  function showVideoUi() { var v = $('#video'); v.classList.add('show-ui'); clearTimeout(uiT); uiT = setTimeout(function () { if (!v.classList.contains('ended')) v.classList.remove('show-ui'); }, 1800); }
  function closeVideo() {
    vClear();
    var v = $('#video'); if (v.hidden) return;
    v.hidden = true; v.classList.remove('show-ui', 'ended'); document.documentElement.style.overflow = '';
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
    // si llega una versión nueva mientras la página está abierta, recarga una sola vez para no mezclar versiones
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (r) { r.update().catch(function () { }); }).catch(function () { }); });
  }

  /* ================= eventos ================= */
  var lastKeyboard = false;
  window.addEventListener('keydown', function (e) { lastKeyboard = true; if (e.key === 'Escape') { if (!$('#city').hidden) closeCity(); else if (!$('#gp').hidden) closeGP(); else if (!$('#video').hidden) closeVideo(); else if (!$('#party').hidden) closeParty(); else if (!$('#iosSheet').hidden) $('#iosSheet').hidden = true; else if (sel) unselect(); } });
  window.addEventListener('pointerdown', function () { lastKeyboard = false; }, true);

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-pick],[data-unsel],[data-share],[data-ics],[data-goto],[data-bias],[data-video],[data-view],[data-lang],[data-ch],[data-party-see],[data-party-close],[data-vreplay],[data-vclose],[data-close-sheet],[data-open-privacy],[data-mem],[data-trivia],[data-geo-retry],[data-geo-help],[data-geo-later],[data-zoom],[data-spin],[data-center-me],[data-city],[data-city-close],[data-cmap],[data-mfilter],[data-ssort],[data-gpick],[data-feedall],[data-copy],[data-topic],[data-gp-close],[data-gp-tab],[data-gp-mem],[data-gp-hop],[data-yt],[data-tt],[data-gp-open],#sightBubble,#muteBtn,#installBtn,#geoBtn,#refresh,#testParty,#subDelete,.topnav a') : null;
    if (!el) { if (ev.target === $('#party')) closeParty(); return; }
    if (el.hasAttribute('data-pick')) { if (view !== 'globe' && el.hasAttribute('data-top')) setView('globe'); pick(el.getAttribute('data-pick'), { top: el.hasAttribute('data-top') }); return; }
    if (el.hasAttribute('data-unsel')) { unselect(); return; }
    if (gpClick(el)) return;
    if (el.hasAttribute('data-mem')) { memberTap(el); return; }
    if (el.hasAttribute('data-city')) { openCity(el.getAttribute('data-city')); return; }
    if (el.hasAttribute('data-city-close')) { closeCity(); return; }
    if (el.hasAttribute('data-cmap')) { cityTool(el.getAttribute('data-cmap')); return; }
    if (el.hasAttribute('data-feedall')) { feedAll = true; renderFeed(); Sound.play('toggle'); return; }
    if (el.hasAttribute('data-copy')) { copyText(el.getAttribute('data-copy')); markTopic(el.getAttribute('data-copy')); return; }
    if (el.hasAttribute('data-topic')) { var tid = el.getAttribute('data-topic'); setTimeout(function () { markTopic(tid); }, 300); return; }
    if (el.hasAttribute('data-gpick')) {
      var pc = document.getElementById('card-' + el.getAttribute('data-gpick'));
      if (pc) { var bx = $('#cards'); bx.scrollTo({ left: pc.offsetLeft - (bx.clientWidth - pc.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' }); }
      Sound.play('tap'); return;
    }
    if (el.hasAttribute('data-ssort')) { sightSort = el.getAttribute('data-ssort'); store('radar-sight-sort', sightSort); renderSights(); Sound.play('toggle'); return; }
    if (el.hasAttribute('data-mfilter')) { mediaType = el.getAttribute('data-mfilter'); store('radar-media', mediaType); renderMedia(); Sound.play('toggle'); return; }
    if (el.hasAttribute('data-trivia')) { triviaTap(el); return; }
    if (el.hasAttribute('data-geo-retry')) { locate(true); return; }
    if (el.hasAttribute('data-geo-help')) { var hp = el.closest('.loc-chip').querySelector('.loc-help'); hp.hidden = !hp.hidden; Sound.play(hp.hidden ? 'close' : 'open'); return; }
    if (el.hasAttribute('data-geo-later')) { askDismissed = true; try { sessionStorage.setItem('radar-ask-no', '1'); } catch (e2) { /* nada */ } renderLoc(); Sound.play('close'); return; }
    if (el.hasAttribute('data-zoom')) { if (globe) { globe.zoomBy(el.getAttribute('data-zoom') === 'in' ? 1.45 : 1 / 1.45); globe.idleUntil = performance.now() + 10000; globe.userMoved(); } Sound.play('tap'); hideHint(); return; }
    if (el.hasAttribute('data-spin')) { if (globe) { globe.autoSpin = !globe.autoSpin; globe.idleUntil = 0; syncSpin(); globe.kick(); } Sound.play('toggle'); return; }
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
    if (el.hasAttribute('data-lang')) { switchLang(el.getAttribute('data-lang')); return; }
    if (el.hasAttribute('data-ch')) { setChannel(el.getAttribute('data-ch')); return; }
    if (el.hasAttribute('data-party-see')) { var g = el.getAttribute('data-party-see'); closeParty(); setView('globe'); document.getElementById('mundo').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); pick(g, { force: true }); return; }
    if (el.hasAttribute('data-party-close')) { closeParty(); return; }
    if (el.hasAttribute('data-vreplay')) { $('#video').classList.remove('show-ui'); runVideo(); return; }
    if (el.hasAttribute('data-vclose')) { closeVideo(); return; }
    if (el.hasAttribute('data-close-sheet')) { $('#iosSheet').hidden = true; return; }
    if (el.closest('.topnav')) {
      var target = document.getElementById((el.getAttribute('href') || '').slice(1));
      if (target) { ev.preventDefault(); navLock = Date.now() + 900; navSet(target.id); target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }
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
        store('radar-sub', null); store('radar-ntfy-done', null); ntfyDone = {}; renderForm.done = false; form.ch = 'ntfy'; renderForm(); toast(t('deleted')); Sound.play('toggle'); break;
    }
  });
  /* tocar a un miembro: salta, dice su nombre en hangul y suena una nota distinta por miembro */
  /* cambiar de idioma: la píldora se desliza, sale un sticker y el contenido cambia con una transición suave */
  function switchLang(nl) {
    if (nl === lang) return;
    Sound.play('pop');
    var swap = function () { lang = nl; store('radar-lang', lang); renderAll(); if (navCur) navSet(navCur, true); };
    if (!reduce) {
      var pop = document.createElement('div'); pop.className = 'lang-pop'; pop.setAttribute('aria-hidden', 'true');
      pop.innerHTML = '<span lang="ko">안녕!</span><b>' + esc(I18N[nl].langHello) + '</b>';
      document.body.appendChild(pop); setTimeout(function () { pop.remove(); }, 1300);
      setTimeout(function () { Sound.play('heart'); }, 160);
    }
    $('.lang').setAttribute('data-l', nl);
    if (document.startViewTransition && !reduce) document.startViewTransition(swap);
    else swap();
  }
  function syncSpin() { var b = $('[data-spin]'); if (b && globe) b.setAttribute('aria-pressed', String(globe.autoSpin)); }
  function memberTap(el) {
    var i = +el.getAttribute('data-i') || 0;
    Sound.play('boop', i);
    el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) { /* nada */ }
    var gm = (el.getAttribute('data-mem') || '').split(':');
    if (gm[1]) setTimeout(function () { openGP(gm[0], 'members', gm[1]); }, 420);  /* después del saltito, su perfil */
  }
  var triviaScore = {};
  function triviaTap(el) {
    var p = el.getAttribute('data-trivia').split(':'), gid = p[0], qi = +p[1], oi = +p[2], q = TRIVIA[gid] && TRIVIA[gid][qi];
    if (!q) return;
    var li = el.closest('li'); if (li.classList.contains('done')) return;
    li.classList.add('done');
    var ok = oi === q[3];
    $$('[data-trivia]', li).forEach(function (b) { var j = +b.getAttribute('data-trivia').split(':')[2]; b.disabled = true; b.classList.toggle('right', j === q[3]); b.classList.toggle('wrong', j === oi && !ok); });
    $('.tq-r', li).textContent = ok ? t('triviaOk') : t('triviaNo', { a: optTxt(q[2][q[3]]) });
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
    savedOrigin = originIdx === -1 ? 'geo' : String(originIdx);
    store('radar-origin', savedOrigin);
    Sound.play('pop'); renderAll();
  });
  document.addEventListener('toggle', function (e) { if (e.target.tagName === 'DETAILS') Sound.play(e.target.open ? 'open' : 'close'); }, true);
  $('#subForm').addEventListener('submit', function (e) { e.preventDefault(); });
  $('#subForm').addEventListener('change', function (e) { if (e.target.type === 'checkbox') Sound.play('tap'); saveForm(); updateSub(); });
  $('#video').addEventListener('pointermove', showVideoUi);
  $('#video').addEventListener('click', function (e) { if (!e.target.closest('button')) showVideoUi(); });
  $('#videoX').addEventListener('click', closeVideo);
  document.addEventListener('fullscreenchange', function () { if (Video.globe && !$('#video').hidden) setTimeout(function () { Video.globe.resize(); }, 60); });

  /* ================= visibilidad, bucles y menú ================= */
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
    // cada sección entra con un pequeño salto cuando llega a la pantalla
    if (!reduce) {
      var rv = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); rv.unobserve(en.target); } }); }, { rootMargin: '0px 0px -6% 0px' });
      $$('.sec').forEach(function (el) { if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('reveal'); rv.observe(el); } });
    }
    var navT = 0;
    function navSync() {
      if (Date.now() < navLock) return;
      var current = 'mundo', lim = innerHeight * .4;
      if (scrollY > 40) NAV.forEach(function (id) { var el = document.getElementById(id); if (id !== 'mundo' && el && el.getBoundingClientRect().top < lim) current = id; });
      navSet(current);
    }
    window.addEventListener('scroll', function () { if (!navT) navT = setTimeout(function () { navT = 0; navSync(); }, 100); }, { passive: true });
    $('#bar').classList.toggle('stuck', scrollY > 30);
    window.addEventListener('scroll', function () { $('#bar').classList.toggle('stuck', scrollY > 30); }, { passive: true });
    navSync();
  }
  /* menú de arriba: la píldora se desliza hasta la sección en la que estás */
  var NAV = ['mundo', 'cerca', 'avistamientos', 'grupos', 'estrenos', 'avisos', 'alertas'], navCur = '', navLock = 0;
  function navSet(id, force) {
    var nav = $('#topnav'), a = nav && nav.querySelector('[data-nav="' + id + '"]'); if (!a) return;
    if (id === navCur && !force) return;
    var first = !navCur; navCur = id;
    $$('#topnav [data-nav]').forEach(function (x) { x.setAttribute('aria-current', String(x === a)); });
    var pill = nav.querySelector('.tn-pill');
    pill.style.width = a.offsetWidth + 'px'; pill.style.transform = 'translateX(' + a.offsetLeft + 'px)';
    if (first) { pill.style.transition = 'none'; void pill.offsetWidth; pill.style.transition = ''; }
    else if (!reduce) { a.classList.remove('pop'); void a.offsetWidth; a.classList.add('pop'); }
    if (nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: a.offsetLeft - nav.clientWidth / 2 + a.offsetWidth / 2, behavior: reduce || first ? 'auto' : 'smooth' });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { if (globe) globe.kick(); if (Video.globe && !$('#video').hidden) Video.globe.kick(); poll(); pollFeed(); pollSights(); } });
  mqReduce.addEventListener && mqReduce.addEventListener('change', function (e) { reduce = e.matches; });
  var rz = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rz); rz = setTimeout(function () {
      if (globe) { globe.pinTarget = pinWidth(); globe.resize(); }
      if (Video.globe && !$('#video').hidden) { Video.globe.resize(); Video.globe.pinTarget = Math.max(84, Math.min(130, $('#vzone').clientWidth * .3)); }
      if (view === 'sonar') sizeSonar();
      if (navCur) navSet(navCur, true);
      evenCards();
    }, 120);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { evenCards(); });
  function pinWidth() { return innerWidth < 600 ? 80 : innerWidth < 1024 ? 96 : 112; }

  /* ================= firma ================= */
  function zw(s) {
    return '⁠' + Array.prototype.map.call(new TextEncoder().encode(s), function (b) { return b.toString(2).padStart(8, '0'); }).join('').replace(/0/g, '​').replace(/1/g, '‌') + '⁠';
  }
  $('#zw').textContent = zw('Cristian Pérez · https://cristianperez.me');
  console.info('%cRadar K-pop%c · made with fan love · design and code: Cristian Pérez · https://cristianperez.me', 'font-weight:700;color:#FF5FA8', '');

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
    onSpin: function () { syncSpin(); },
    onResize: function (g) { var ring = Math.round(g.R0 * 2 * 1.3); $('.ring').style.setProperty('--ring', ring + 'px'); $('.ring').style.top = (g.cy) + 'px'; }
  });
  globe.pinTarget = pinWidth();
  // solo para pruebas automáticas (?debug): lectura del estado del globo, sin efectos
  if (params.has('debug')) window.__radarDebug = function () { return { lon: globe.lon, lat: globe.lat, zoom: globe.zoom, origin: origin(), geoState: geoState }; };
  globe.idleUntil = performance.now() + (reduce ? 0 : 400);
  renderAll();
  observe();
  var cardsBox = $('#cards'); if (cardsBox) cardsBox.addEventListener('scroll', onCardsScroll, { passive: true });
  setInterval(function () { tick(false); }, 1000);
  poll(); pollFeed(); pollSights(); pollMedia(); pollStats(); pollNotices(); pollSocial(); pollRoster(); pollReleases();
  setInterval(poll, 60000);
  setInterval(pollFeed, 60000);
  setInterval(pollSights, 60000);
  setInterval(pollMedia, 15 * 60000);
  setInterval(pollStats, 60 * 60000);
  setInterval(pollNotices, 15 * 60000);
  setInterval(pollSocial, 30 * 60000);
  setInterval(pollRoster, 60 * 60000);
  setInterval(pollReleases, 30 * 60000);
  // ubicación real: se pide al entrar, salvo que hayas elegido una ciudad a mano
  startGeo();
  if (params.get('demo') === 'alert') setTimeout(function () { $('#testParty').click(); }, 1200);
  if (params.get('demo') === 'video') setTimeout(openVideo, 600);
  if (params.get('pick')) setTimeout(function () { pick(params.get('pick'), { force: true }); }, 500);
  if (params.get('view') === 'sonar') setView('sonar');
})();

/* Servidor de suscripciones del Radar K-pop (Cloudflare Worker + KV).
   Rutas:
     POST   /subscribe        guarda un suscriptor de Discord o WhatsApp (mismo formato de alerts/subscribers.example.json)
     POST   /push             guarda un suscriptor de notificaciones push (trae "push": {endpoint, keys})
     DELETE /subscribe/:id    borra un suscriptor; pide el header X-Delete-Token que se devolvió al guardar
     GET    /subscribers      lista para el motor de alertas; pide Authorization: Bearer ADMIN_TOKEN
   Variables: ALLOWED_ORIGIN (dominios de la web, separados por coma), ADMIN_TOKEN (secreto). KV: SUBS.
   Guarda lo mínimo para mandar alertas: nada de IP, ni ubicación exacta (lat/lon redondeadas a 2 decimales). */

const MAX_BODY = 4096;
const SLUG = /^[a-z0-9-]{1,40}$/;

function cors(env, req) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || 'null'),
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Delete-Token',
    'Vary': 'Origin'
  };
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', ...headers } });
}
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function list(v, max) { return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && (x === '*' || SLUG.test(x))).slice(0, max) : []; }

/* valida y limpia; devuelve [suscriptor, error] */
export function clean(body, kind) {
  if (!body || typeof body !== 'object') return [null, 'json'];
  const id = str(body.id, 40);
  if (!SLUG.test(id)) return [null, 'id'];
  const lat = Number(body.lat), lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return [null, 'lat/lon'];
  const sub = {
    id, name: str(body.name, 40), city: str(body.city, 60),
    lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100,
    radius_km: Math.min(5000, Math.max(50, Number(body.radius_km) || 800)),
    groups: list(body.groups, 20).length ? list(body.groups, 20) : ['*'],
    // prueba de la autorización (Ley 1581): versión del texto aceptado y fecha, la pone el servidor
    consent_v: str(body.consent_v, 20), consent_at: new Date().toISOString()
  };
  if (!sub.consent_v) return [null, 'consent'];
  if (kind === 'push') {
    const p = body.push || {};
    if (!/^https:\/\//.test(p.endpoint || '') || !p.keys || !p.keys.p256dh || !p.keys.auth) return [null, 'push'];
    sub.push = { endpoint: String(p.endpoint).slice(0, 600), keys: { p256dh: String(p.keys.p256dh).slice(0, 200), auth: String(p.keys.auth).slice(0, 100) } };
    sub.types = list(body.types, 30);
    return [sub, null];
  }
  if (body.discord_user_id) {
    const d = String(body.discord_user_id).replace(/\D/g, '');
    if (!/^\d{17,20}$/.test(d)) return [null, 'discord_user_id'];
    sub.discord_user_id = d; sub.types = list(body.types, 30);
    return [sub, null];
  }
  if (body.whatsapp) {
    const w = str(body.whatsapp, 20);
    if (!/^\+\d[\d\s-]{7,17}$/.test(w)) return [null, 'whatsapp'];
    if (body.whatsapp_opt_in !== true) return [null, 'whatsapp_opt_in'];
    sub.whatsapp = w; sub.whatsapp_opt_in = true; sub.whatsapp_types = list(body.whatsapp_types, 30);
    return [sub, null];
  }
  return [null, 'canal'];
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    if (req.method === 'GET' && url.pathname === '/subscribers') {
      if (!env.ADMIN_TOKEN || req.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_TOKEN) return json({ error: 'no' }, 401);
      const out = [];
      let cursor;
      do {
        const page = await env.SUBS.list({ prefix: 'sub:', cursor });
        for (const k of page.keys) { const v = await env.SUBS.get(k.name, 'json'); if (v) { delete v.token; out.push(v); } }
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor);
      return json({ subscribers: out });
    }

    if (req.method === 'POST' && (url.pathname === '/subscribe' || url.pathname === '/push')) {
      // freno contra spam: 10 escrituras por hora por IP; la IP solo se usa como hash y la clave expira sola
      const ip = req.headers.get('CF-Connecting-IP') || '';
      if (ip) {
        const rk = 'rate:' + (await sha256(ip + (env.ADMIN_TOKEN || ''))).slice(0, 24);
        const n = Number(await env.SUBS.get(rk)) || 0;
        if (n >= 10) return json({ error: 'espera un rato' }, 429, h);
        await env.SUBS.put(rk, String(n + 1), { expirationTtl: 3600 });
      }
      const raw = await req.text();
      if (raw.length > MAX_BODY) return json({ error: 'grande' }, 413, h);
      let body; try { body = JSON.parse(raw); } catch (e) { return json({ error: 'json' }, 400, h); }
      const [sub, err] = clean(body, url.pathname === '/push' ? 'push' : 'chat');
      if (err) return json({ error: err }, 400, h);
      const old = await env.SUBS.get('sub:' + sub.id, 'json');
      if (old && old.token && old.token !== await sha256(req.headers.get('X-Delete-Token') || '')) return json({ error: 'id ocupado' }, 409, h);
      const token = crypto.randomUUID();
      sub.token = await sha256(token);
      await env.SUBS.put('sub:' + sub.id, JSON.stringify(sub));
      return json({ ok: true, id: sub.id, token }, 200, h);
    }

    const m = url.pathname.match(/^\/subscribe\/([a-z0-9-]{1,40})$/);
    if (req.method === 'DELETE' && m) {
      const old = await env.SUBS.get('sub:' + m[1], 'json');
      if (!old) return json({ ok: true }, 200, h);
      if (old.token !== await sha256(req.headers.get('X-Delete-Token') || '')) return json({ error: 'token' }, 403, h);
      await env.SUBS.delete('sub:' + m[1]);
      return json({ ok: true }, 200, h);
    }
    return json({ error: 'ruta' }, 404, h);
  }
};

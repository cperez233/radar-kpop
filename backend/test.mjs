// Prueba local del Worker con un KV de mentira: node backend/test.mjs
import worker, { clean } from './worker.js';
const mem = new Map();
const env = { ALLOWED_ORIGIN: 'https://radar.test', ADMIN_TOKEN: 'secreto', SUBS: {
  get: async (k, t) => (mem.has(k) ? (t === 'json' ? JSON.parse(mem.get(k)) : mem.get(k)) : null),
  put: async (k, v) => { mem.set(k, v); }, delete: async (k) => { mem.delete(k); },
  list: async ({ prefix }) => ({ keys: [...mem.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true })
} };
const call = (method, path, body, headers = {}) => worker.fetch(new Request('https://w.test' + path, { method, body: body && JSON.stringify(body), headers: { Origin: 'https://radar.test', ...headers } }), env);
let ok = 0, bad = 0;
const check = (name, cond) => { if (cond) ok++; else { bad++; console.log('FALLA', name); } };
const base = { id: 'cris-ab12', name: 'Cris', city: 'Bucaramanga', lat: 7.1254, lon: -73.1198, radius_km: 800, groups: ['*'], consent_v: '2026-10-15' };
let r = await call('POST', '/subscribe', { ...base, discord_user_id: '123456789012345678', types: ['*'] });
const saved = await r.json(); check('guarda discord', r.status === 200 && saved.token);
check('cors', r.headers.get('Access-Control-Allow-Origin') === 'https://radar.test');
r = await call('POST', '/subscribe', { ...base, whatsapp: '+57 300 000 0000' }); check('whatsapp sin opt-in falla', r.status === 400);
r = await call('POST', '/subscribe', { ...base, id: 'otro-1', discord_user_id: '12' }); check('discord corto falla', r.status === 400);
r = await call('POST', '/subscribe', { ...base, discord_user_id: '123456789012345678' }); check('id ajeno sin token = 409', r.status === 409);
r = await call('POST', '/push', { ...base, id: 'push-1', push: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } } }); check('guarda push', r.status === 200);
r = await call('GET', '/subscribers'); check('lista sin token = 401', r.status === 401);
r = await call('GET', '/subscribers', null, { Authorization: 'Bearer secreto' }); const l = await r.json();
check('lista con token', l.subscribers.length === 2 && !l.subscribers[0].token && l.subscribers[0].lat === 7.13);
r = await call('DELETE', '/subscribe/cris-ab12', null, { 'X-Delete-Token': 'malo' }); check('borrar con token malo = 403', r.status === 403);
r = await call('DELETE', '/subscribe/cris-ab12', null, { 'X-Delete-Token': saved.token }); check('borrar', r.status === 200 && !mem.has('sub:cris-ab12'));
check('clean descarta canal vacío', clean({ ...base }, 'chat')[1] === 'canal');
check('sin autorización no guarda', clean({ ...base, consent_v: '', discord_user_id: '123456789012345678' }, 'chat')[1] === 'consent');
check('guarda fecha de autorización', JSON.parse(mem.get('sub:push-1')).consent_at.length > 10);
let last = 0; for (let i = 0; i < 12; i++) last = (await call('POST', '/subscribe', { ...base, id: 'spam-' + i, discord_user_id: '123456789012345678' }, { 'CF-Connecting-IP': '203.0.113.9' })).status;
check('freno contra spam (429)', last === 429);
console.log(`${ok} pruebas bien, ${bad} mal`); process.exit(bad ? 1 : 0);

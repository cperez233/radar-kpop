// Renderiza tools/og/og.html a la imagen para compartir el link (1200x630, JPEG liviano para WhatsApp).
// Uso: node tools/og/render.mjs   (necesita Playwright). Si cambias el diseño, cambia también el nombre del archivo
// (aquí y en build.py) para que WhatsApp, X y Discord no sigan mostrando la copia vieja.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, '..', '..', 'assets', 'icons', 'og-2026.jpg');
const b = await chromium.launch(process.env.HTTPS_PROXY ? { args: ['--proxy-server=' + process.env.HTTPS_PROXY] } : {});
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto('file://' + path.join(dir, 'og.html'));
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
await p.screenshot({ path: out, type: 'jpeg', quality: 86 });
await b.close();
console.log(out);

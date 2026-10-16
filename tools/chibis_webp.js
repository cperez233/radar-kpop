/* Convierte los chibis (SVG con la imagen adentro) a WebP para la web: pesan menos de la mitad y el navegador no tiene que
   volver a dibujar el SVG cada vez que un chibi se mueve o cambia de tamaño (eso era lo que hacía lagear el globo en el celular).

   Uso: node tools/chibis_webp.js            (después de python tools/chibis_images.py)
   Necesita Playwright con Chromium (en el entorno de Claude ya está). Python con Pillow pasa los PNG a WebP.
   Cada SVG se dibuja a la resolución de la imagen que trae adentro, así no se pierde nitidez:
   miembros ~2,3x su tamaño (como la lámina recortada) y grupos 1,5x. default.svg es dibujo vectorial y se queda en SVG. */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const ROOT = path.resolve(__dirname, '..'), DIR = path.join(ROOT, 'assets', 'chibis');
const exe = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;

function list() {
  const out = [];
  for (const f of fs.readdirSync(DIR)) {
    const p = path.join(DIR, f);
    if (fs.statSync(p).isDirectory()) fs.readdirSync(p).filter(x => x.endsWith('.svg')).forEach(x => out.push({ file: path.join(p, x), scale: 2.35 }));
    else if (f.endsWith('.svg') && f !== 'default.svg') out.push({ file: p, scale: 1.5 });
  }
  return out;
}

(async () => {
  const b = await pw.chromium.launch(exe ? { executablePath: exe } : {});
  const items = list(), tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'chibis-'));
  let before = 0, after = 0;
  for (const it of items) {
    const svg = fs.readFileSync(it.file, 'utf8');
    const m = /<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/.exec(svg);
    const w = Math.ceil(+m[1]), h = Math.ceil(+m[2]);
    const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: it.scale });
    await page.setContent('<style>html,body{margin:0;background:transparent}img{display:block}</style><img src="data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '" width="' + w + '" height="' + h + '">');
    await page.waitForFunction(() => document.images[0].complete);
    const png = path.join(tmp, path.basename(it.file) + '.png');
    await page.screenshot({ path: png, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    await page.close();
    const out = it.file.replace(/\.svg$/, '.webp');
    // además una versión chica (-s.webp) para los usos diminutos: chibis sobre el globo, filas de miembros, tiras de grupos
    execFileSync('python3', ['-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]);im.save(sys.argv[2],"WEBP",quality=90,method=6);w=int(sys.argv[4]);im.resize((w,round(im.height*w/im.width)),Image.LANCZOS).save(sys.argv[3],"WEBP",quality=82,alpha_quality=80,method=6)',
      png, out, out.replace(/\.webp$/, '-s.webp'), String(it.scale > 2 ? 180 : 300)]);
    before += fs.statSync(it.file).size; after += fs.statSync(out).size;
  }
  await b.close();
  console.log(items.length + ' chibis a WebP: ' + (before / 1048576).toFixed(2) + ' MB en SVG -> ' + (after / 1048576).toFixed(2) + ' MB en WebP');
})();

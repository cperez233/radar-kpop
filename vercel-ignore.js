// Vercel ignoreCommand: sale con 0 (saltar el deploy) si el commit solo toca archivos internos del robot;
// con 1 (desplegar) si toca algo del sitio o si no se pudo comprobar. Vercel no siempre trae .git, así que
// si falta se pregunta a la API pública de GitHub.
const { execSync } = require('child_process');
const INTERNO = /^(state\/|tools\/|updater\/|alerts\/|sightings\/|backend\/|src\/|\.github\/|build\.py$|vercel-ignore\.js$|\.vercelignore$|.*\.md$)/;

async function archivos() {
  try {
    return execSync('git diff --name-only HEAD^ HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean);
  } catch (e) { /* sin .git: API de GitHub */ }
  const { VERCEL_GIT_REPO_OWNER: o, VERCEL_GIT_REPO_SLUG: r, VERCEL_GIT_COMMIT_SHA: s } = process.env;
  const res = await fetch(`https://api.github.com/repos/${o}/${r}/commits/${s}`, { headers: { 'User-Agent': 'vercel-ignore' } });
  if (!res.ok) throw new Error('GitHub ' + res.status);
  const j = await res.json();
  if (!j.files || j.files.length >= 300) throw new Error('lista incompleta');
  return j.files.flatMap(f => [f.filename, f.previous_filename]).filter(Boolean);
}

archivos().then(fs => {
  const sitio = fs.filter(f => !INTERNO.test(f));
  console.log(sitio.length ? 'Cambia el sitio: ' + sitio.join(', ') : 'Solo archivos internos: se salta el deploy');
  process.exit(sitio.length ? 1 : 0);
}).catch(e => { console.log('No se pudo comprobar (' + e.message + '): se despliega'); process.exit(1); });

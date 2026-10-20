// Build the offline Android edition from the same API routes and UI as the web app.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'android/app/src/main/assets');
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'public'), path.join(out, 'web'), { recursive: true });
const seedPath = path.join(out, 'demo.db');
fs.rmSync(seedPath, { force: true });
const db = new DatabaseSync(seedPath);
db.exec(fs.readFileSync(path.join(root, 'db/schema.sql'), 'utf8'));
require('../db/seed')(db);
for (const p of db.prepare('SELECT id FROM personas WHERE password_hash IS NOT NULL').all()) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync('demo', salt, 120000, 32, 'sha256').toString('hex');
  db.prepare('UPDATE personas SET password_hash = ? WHERE id = ?').run(`${salt}:${hash}`, p.id);
}
db.close();
let source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
source = source.slice(source.indexOf('const all ='), source.indexOf('const MIME ='));
source = source.replace(/function guardarImagen\(dataUrl\) \{[\s\S]*?\n\}/, `function guardarImagen(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  if (!/^data:image\\/(jpeg|png|webp);base64,/.test(dataUrl)) throw new HttpError(400, 'Imagen no válida');
  if (dataUrl.length > 12 * 1024 * 1024) throw new HttpError(413, 'Imagen demasiado grande');
  return dataUrl;
}`);
source = source.replace(/function ipLocal\(\) \{[\s\S]*?const PUBLIC_URL = [^\n]+;/, "const PUBLIC_URL = location.origin;");
source = source.replace("const DEMO = process.env.DEMO !== '0';", 'const DEMO = true;');
const adapter = fs.readFileSync(path.join(__dirname, 'offline-adapter.js'), 'utf8');
fs.writeFileSync(path.join(out, 'web/offline.js'), '(() => {\n' + adapter + '\n' + source + '\n' + `
window.fetch = async (input, options = {}) => {
  const url = new URL(input, location.href);
  const method = options.method || 'GET';
  const route = rutas.find(r => r.metodo === method && r.re.test(url.pathname));
  try {
    if (!route) throw new HttpError(404, 'Ruta no encontrada');
    const headers = new Headers(options.headers);
    const req = { headers: { authorization: headers.get('Authorization') || '' } };
    const user = usuarioDeSesion(req);
    if (!user && !RUTAS_PUBLICAS.has(url.pathname)) throw new HttpError(401, 'Inicia sesión para continuar');
    const match = route.re.exec(url.pathname);
    const params = Object.fromEntries(route.claves.map((key, i) => [key, match[i + 1]]));
    const result = route.fn(Object.fromEntries(url.searchParams), params, JSON.parse(options.body || '{}'), user, req);
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 400 });
  }
};
window.print = () => Android.print(document.querySelector('#label-format')?.value || 'a4-mediana');
})();\n`);
const htmlPath = path.join(out, 'web/index.html');
fs.writeFileSync(htmlPath, fs.readFileSync(htmlPath, 'utf8').replace('<script src="app.js">', '<script src="offline.js"></script>\n  <script src="app.js">'));
console.log('Android assets ready: offline UI, API and fresh demo database.');

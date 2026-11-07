// APK conectada: interfaz servida desde otro origen (como en Android), API por CORS,
// trabajo sin conexión con cola y reenvío sin duplicados.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'inventario-nube-'));
const API = 'http://localhost:3108', UI = 'http://localhost:3109';
const server = spawn(process.execPath, ['server.js'], {
  cwd: root, env: { ...process.env, PORT: '3108', DB_FILE: path.join(folder, 'nube.db'), CORS_ORIGENES: UI }, stdio: 'ignore', windowsHide: true,
});
// Hace de los recursos de la APK: public/ + nube.js apuntando al servidor
const ui = http.createServer((req, res) => {
  const p = new URL(req.url, UI).pathname;
  if (p === '/nube.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(fs.readFileSync(path.join(__dirname, 'nube-cliente.js'), 'utf8').replace("'__SERVIDOR__'", JSON.stringify(API)));
  }
  if (p === '/' || p === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(fs.readFileSync(path.join(root, 'public/index.html'), 'utf8').replace('<script src="app.js">', '<script src="nube.js"></script>\n  <script src="app.js">'));
  }
  const f = path.join(root, 'public', path.normalize(p));
  if (!f.startsWith(path.join(root, 'public')) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const tipos = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  res.writeHead(200, { 'Content-Type': tipos[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
}).listen(3109);

(async () => {
  let browser;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(API + '/api/config')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(UI);
    await page.locator('[data-email="carlos.perez@reformas-ejemplo.es"]').click();
    await page.locator('.stat').first().waitFor();
    await page.waitForFunction(() => localStorage.getItem('c:/api/ubicaciones') && localStorage.getItem('c:/api/herramientas?retiradas=1'));
    const token = await page.evaluate(() => SES.token);
    const api = async (url, opts = {}) => (await fetch(API + url, { ...opts, headers: { Authorization: 'Bearer ' + token, ...opts.headers } })).json();
    const antes = (await api('/api/movimientos')).length;

    // Sin cobertura
    await page.route(API + '/**', r => r.abort());
    await page.evaluate(() => location.hash = '#/herramienta/RAD-001');          // ficha nunca abierta: sale de la lista guardada
    await page.locator('.hero h1').waitFor();
    await page.evaluate(() => location.hash = '#/movimiento/RAD-001');
    await page.locator('#f-mov').waitFor();
    await page.check('input[value="Traslado"]', { force: true });
    const destino = await page.evaluate(() => [...document.querySelector('[name=destino_id]').options].find(o => o.value && o.text.startsWith('Furgoneta')).value);
    await page.selectOption('[name=destino_id]', destino);
    await page.click('.sticky-cta .btn');
    await page.locator('#toast', { hasText: 'Sin conexión' }).waitFor();
    await page.locator('#estado-red', { hasText: '1 pendiente' }).waitFor();
    await page.evaluate(() => location.hash = '#/incidencia/RAD-001');
    await page.locator('#f-inc').waitFor();
    await page.fill('[name=descripcion]', 'Disco roto (sin cobertura)');
    await page.click('.sticky-cta .btn');
    await page.locator('#estado-red', { hasText: '2 pendientes' }).waitFor();
    await page.screenshot({ path: path.join(folder, 'sin-conexion.png') });

    // Vuelve la cobertura
    await page.unroute(API + '/**');
    await page.evaluate(() => sincronizarPendientes());
    await page.waitForFunction(() => document.querySelector('#estado-red').hidden);
    const movs = await api('/api/movimientos');
    assert.equal(movs.length, antes + 1);
    const m = movs.find(x => x.codigo === 'RAD-001' && String(x.destino_id) === destino);
    assert(m?.uuid, 'movimiento sincronizado con uuid');
    assert.equal(m.realizado_por_nombre.startsWith('Carlos'), true);
    const h = await api('/api/herramientas/RAD-001');
    assert.equal(String(h.ubicacion_actual_id), destino);
    assert(h.incidencias.some(i => i.descripcion === 'Disco roto (sin cobertura)' && i.uuid));

    // Reenvío del mismo registro (respuesta perdida): no se duplica
    const repetido = await api('/api/movimientos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: m.uuid, herramienta_id: h.id, destino_id: 1, tipo: 'Devolución' }) });
    assert.equal(repetido.id, m.id);
    assert.equal((await api('/api/movimientos')).length, antes + 1);

    // Un empleado no puede fechar a su gusto: más de 7 días atrás pasa a la hora actual
    const viejo = await api('/api/movimientos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: 'prueba-antigua-0001', herramienta_id: h.id, destino_id: 1, tipo: 'Devolución', fecha_hora: '2020-01-01T08:00' }) });
    assert.doesNotMatch(viejo.fecha_hora, /^2020/);
    assert.deepEqual(errors, []);
    console.log('PASS: API por CORS, lectura sin conexión, cola de movimientos e incidencias, sincronización y reenvío sin duplicados.');
  } finally {
    await browser?.close();
    server.kill();
    ui.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

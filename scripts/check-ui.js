// Visual smoke check. Set PLAYWRIGHT_MODULE if Playwright lives outside this project.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'inventario-ui-'));
const out = path.resolve('dist/ui-preview');
fs.mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: '3100', DB_FILE: path.join(folder, 'demo.db') }, stdio: 'ignore', windowsHide: true,
});
(async () => {
  let browser;
  try {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch('http://localhost:3100/api/config')).ok) break; } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'light' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const snap = async name => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(350);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow: ' + name);
      await page.screenshot({ path: path.join(out, name + '.png'), fullPage: false });
    };
    await page.goto('http://localhost:3100');
    await page.locator('.demo-user').first().waitFor();
    await snap('01-login');
    await page.locator('[data-email="laura.gomez@reformas-ejemplo.es"]').click();
    await page.locator('.stat').first().waitFor();
    await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('show'));
    await snap('02-inicio');
    await page.locator('.tabbar [data-nav="buscar"]').click();
    await page.locator('.tool').first().waitFor();
    await snap('02-inventario');
    await page.locator('input[name="q"]').fill('Bosch');
    await page.waitForTimeout(450);
    assert((await page.locator('.tool').count()) > 0, 'Search failed');
    await page.locator('#btn-filtros').click();
    await page.locator('dialog[open]').waitFor();
    await snap('03-filtros');
    await page.locator('dialog button[value="ok"]').click();
    await page.locator('.tool').first().click();
    await page.locator('.hero').waitFor();
    await snap('04-ficha');
    await page.locator('.quick a.primary').click();
    await page.locator('.form-sec').first().waitFor();
    await snap('05-movimiento');
    await page.evaluate(() => location.hash = '#/incidencia/TAL-001');
    await page.locator('.btn.alarm').waitFor();
    await snap('05b-incidencia');
    await page.evaluate(() => {
      if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
      navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
    });
    await page.locator('#btn-scan-tab').click();
    await page.locator('dialog.scan-sheet').waitFor();
    await snap('05c-escaner');
    await page.locator('dialog[open] [data-cerrar]').click();
    await page.evaluate(() => location.hash = '#/panel');
    await page.locator('.hero-kpi').waitFor();
    await snap('06-panel');
    await page.emulateMedia({ colorScheme: 'dark' });
    await snap('07-panel-oscuro');
    await page.locator('.tabbar [data-nav="inicio"]').click();
    await page.locator('.stat').first().waitFor();
    await snap('07b-inicio-oscuro');
    await page.locator('.tabbar [data-nav="buscar"]').click();
    await page.locator('.tool').first().waitFor();
    await snap('08-inventario-oscuro');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 320, height: 740 });
    await snap('09-inventario-320');
    await page.locator('#btn-filtros').click();
    await snap('10-filtros-320');
    // Dar de baja y reactivar una herramienta desde el menú de la ficha.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => location.hash = '#/herramienta/TAL-001');
    await page.locator('#btn-mas-ficha').click();
    await page.locator('#op-baja').click();
    await page.locator('#f-baja').waitFor();
    await page.selectOption('#f-baja select[name="motivo"]', 'Pérdida o robo');
    await page.fill('#f-baja textarea', 'No apareció al cerrar la obra');
    await snap('11-baja');
    await page.locator('#f-baja button.alarm').click();
    await page.locator('.hero .banner').waitFor();
    await snap('12-ficha-baja');
    const baja = await page.evaluate(async () => {
      const h = await GET('/api/herramientas/TAL-001');
      const activas = await GET('/api/herramientas');
      return { estado: h.estado, obs: h.observaciones, programados: h.mantenimientos.filter(m => m.estado === 'Programado').length,
        listada: activas.some(x => x.codigo === 'TAL-001'), primaria: !!document.querySelector('.quick a.primary') };
    });
    assert.equal(baja.estado, 'Retirada');
    assert.match(baja.obs, /Baja \d{2}\/\d{2}\/\d{4}: Pérdida o robo \(Laura Gómez Sánchez\)\. No apareció/);
    assert.equal(baja.programados, 0);
    assert.equal(baja.listada, false);
    assert.equal(baja.primaria, false);
    await page.locator('#btn-mas-ficha').click();
    await page.locator('#op-reactivar').click();
    await page.waitForFunction(() => !document.querySelector('.hero .banner'));
    assert.notEqual(await page.evaluate(async () => (await GET('/api/herramientas/TAL-001')).estado), 'Retirada');
    assert.deepEqual(errors, [], 'Browser JavaScript errors');
    console.log('PASS: login, home, search, scanner, incident form, filters, detail, movement form, dashboard, light/dark, 320px layout, retire and reactivate. Screenshots: ' + out);
  } finally {
    if (browser) await browser.close();
    server.kill();
    await new Promise(r => server.exitCode !== null ? r() : server.once('exit', r));
    for (const name of fs.readdirSync(folder)) fs.unlinkSync(path.join(folder, name));
    fs.rmdirSync(folder);
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

const { chromium, webkit, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'inventario-platforms-'));
const out = path.resolve('dist/platform-preview');
fs.mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: '3102', DB_FILE: path.join(folder, 'demo.db') },
  stdio: 'ignore', windowsHide: true,
});
(async () => {
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch('http://localhost:3102/api/config')).ok) break; } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    for (const [name, engine, options] of [
      ['desktop', chromium, { viewport: { width: 1440, height: 1000 } }],
      ['iphone', webkit, { ...devices['iPhone 13'] }],
      ['ipad', webkit, { ...devices['iPad (gen 7) landscape'] }],
    ]) {
      const browser = await engine.launch({ headless: true });
      try {
        const context = await browser.newContext(options);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://localhost:3102');
        const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
        for (const icon of manifest.icons) {
          const response = await context.request.get('http://localhost:3102' + icon.src);
          assert(response.ok());
          assert.equal(response.headers()['content-type'], 'image/png');
        }
        assert.equal(await page.locator('link[rel="apple-touch-icon"]').count(), 1);
        await page.locator('[data-email="laura.gomez@reformas-ejemplo.es"]').click();
        await page.locator('.stat').first().waitFor();
        await page.evaluate(() => location.hash = '#/herramientas');
        await page.locator('.tool').first().waitFor();
        await page.waitForTimeout(400);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ': overflow');
        if (name === 'desktop') assert(await page.locator('.app-shell').evaluate(el => el.clientWidth > 1000));
        await page.screenshot({ path: path.join(out, name + '-inventario.png') });
        await page.click('#btn-mas');
        await page.click('#btn-install');
        await page.locator('dialog[open]').waitFor();
        if (name !== 'desktop') assert.match(await page.locator('dialog[open]').textContent(), /Safari/);
        await page.locator('dialog[open] [data-cerrar]').click();
        await page.evaluate(() => {
          // Playwright's Windows WebKit has no camera implementation.
          if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
          navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
          escanearQR();
        });
        await page.waitForFunction(() => document.querySelector('.scanner-status')?.textContent.includes('denegado'));
        await page.locator('#scan-manual input').fill('TAL-001');
        await page.locator('#scan-manual button').click();
        await page.locator('.hero').waitFor();
        // Real generator/decoder round-trip in each engine (WebKit included).
        assert.equal(await page.evaluate(async () => {
          const expected = 'https://inventario.example/h/123abc';
          const img = new Image();
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgQR(expected));
          await img.decode();
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 400;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 400, 400);
          ctx.drawImage(img, 0, 0, 400, 400);
          return jsQR(ctx.getImageData(0, 0, 400, 400).data, 400, 400)?.data === expected;
        }), true);
        await page.evaluate(() => location.hash = '#/etiquetas?ids=1');
        await page.locator('#label-format').waitFor();
        await page.selectOption('#label-format', 'a4-pequena');
        await page.fill('#label-copies', '2');
        assert.equal(await page.locator('.label-qr').count(), 2);
        await page.evaluate(() => { window.print = () => window.printCalled = true; });
        await page.click('#label-print');
        assert.equal(await page.evaluate(() => window.printCalled), true);
        await page.screenshot({ path: path.join(out, name + '-etiquetas.png') });
        await page.emulateMedia({ media: 'print' });
        const width = await page.locator('.label-qr').first().evaluate(el => el.getBoundingClientRect().width * 25.4 / 96);
        assert(Math.abs(width - 48) < .1, name + ': incorrect print size');
        await page.emulateMedia({ media: 'screen' });
        if (name === 'desktop') {
          await page.evaluate(() => navigator.serviceWorker.ready);
          await page.reload();
          await page.waitForFunction(() => !!navigator.serviceWorker.controller);
          const cached = await page.evaluate(async () => {
            const keys = await caches.keys();
            return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(r => r.url)))).flat();
          });
          assert(!cached.some(url => /\/api\/|\/uploads\//.test(url)), 'Private data cached');
          await context.setOffline(true);
          await page.reload();
          await page.getByRole('heading', { name: 'No se puede conectar' }).waitFor();
          await context.setOffline(false);
          await page.getByRole('button', { name: 'Volver a intentar' }).click();
          await page.locator('#label-format').waitFor();
        }
        assert.deepEqual(errors, []);
        console.log('PASS: ' + name + ' login, layout, installation guide, scanner fallback, QR decoding and A4 print.');
      } finally { await browser.close(); }
    }
  } finally { server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

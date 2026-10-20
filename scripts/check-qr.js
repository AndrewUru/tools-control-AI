// QR round-trip, camera lifecycle and print layout regression checks.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'inventario-qr-'));
const out = path.resolve('dist/qr-preview');
fs.mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: '3101', DB_FILE: path.join(folder, 'demo.db') },
  stdio: 'ignore', windowsHide: true,
});
(async () => {
  let browser;
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch('http://localhost:3101/api/config')).ok) break; } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:3101');
    await page.locator('[data-email="laura.gomez@reformas-ejemplo.es"]').click();
    await page.locator('.stat').first().waitFor();
    await page.evaluate(() => location.hash = '#/etiquetas?ids=1');
    await page.locator('#label-format').waitFor();
    const formats = ['a4-pequena', 'a4-mediana', 'a4-grande', 'rollo50', 'rollo100'];
    for (const format of formats) {
      await page.selectOption('#label-format', format);
      await page.emulateMedia({ media: 'print' });
      const result = await page.evaluate(async () => {
        const svg = document.querySelector('.label-qr svg');
        const rect = svg.getBoundingClientRect();
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(rect.width * 300 / 96);
        canvas.height = canvas.width;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const decoded = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        const label = svg.parentElement.getBoundingClientRect();
        return { decoded: decoded?.data, w: label.width * 25.4 / 96, h: label.height * 25.4 / 96 };
      });
      assert.match(result.decoded, /\/h\/[a-f0-9]+$/);
      const dimensions = { 'a4-pequena': [48, 25], 'a4-mediana': [60, 40], 'a4-grande': [90, 60], rollo50: [50, 30], rollo100: [100, 50] }[format];
      assert(Math.abs(result.w - dimensions[0]) < .1 && Math.abs(result.h - dimensions[1]) < .1);
      const pdf = await page.pdf({ path: path.join(out, format + '.pdf'), preferCSSPageSize: true, displayHeaderFooter: false });
      assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1, 'Unexpected printed page count: ' + format);
      await page.emulateMedia({ media: 'screen' });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    // QR-only labels: the code fills the short side and still decodes at 300 dpi.
    await page.selectOption('#label-content', 'qr');
    for (const format of formats) {
      await page.selectOption('#label-format', format);
      await page.emulateMedia({ media: 'print' });
      const r = await page.evaluate(async () => {
        const label = document.querySelector('.label-qr');
        const svg = label.querySelector('svg');
        const rect = svg.getBoundingClientRect();
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = Math.round(rect.width * 300 / 96);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const decoded = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        const box = label.getBoundingClientRect();
        return { decoded: decoded?.data, text: !!label.querySelector('.label-text'), qr: rect.width * 25.4 / 96, w: box.width * 25.4 / 96, h: box.height * 25.4 / 96 };
      });
      const [w, h] = { 'a4-pequena': [48, 25], 'a4-mediana': [60, 40], 'a4-grande': [90, 60], rollo50: [50, 30], rollo100: [100, 50] }[format];
      assert.match(r.decoded, /\/h\/[a-f0-9]+$/, 'QR-only does not decode: ' + format);
      assert.equal(r.text, false);
      assert(Math.abs(r.qr - (Math.min(w, h) - 2)) < .1, 'QR-only size: ' + format);
      assert(Math.abs(r.w - w) < .1 && Math.abs(r.h - h) < .1, 'QR-only label size: ' + format);
      await page.pdf({ path: path.join(out, 'solo-qr-' + format + '.pdf'), preferCSSPageSize: true });
      await page.emulateMedia({ media: 'screen' });
    }
    await page.screenshot({ path: path.join(out, 'etiquetas-solo-qr.png'), fullPage: false });
    await page.selectOption('#label-content', 'completa');
    await page.selectOption('#label-format', 'a4-mediana');
    await page.fill('#label-copies', '19');
    assert.equal(await page.locator('.label-sheet').count(), 2);
    await page.emulateMedia({ media: 'print' });
    const multipage = await page.pdf({ path: path.join(out, 'a4-19-etiquetas.pdf'), preferCSSPageSize: true });
    assert.equal((multipage.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 2);
    await page.emulateMedia({ media: 'screen' });
    await page.fill('#label-copies', '1');
    await page.locator('summary').click();
    await page.click('#label-none');
    assert(await page.locator('#label-print').isDisabled());
    await page.click('#label-all');
    assert(!(await page.locator('#label-print').isDisabled()));
    await page.screenshot({ path: path.join(out, 'etiquetas.png'), fullPage: false });

    // Feed the actual scanner a generated QR video stream, without a real camera.
    await page.evaluate(async () => {
      const h = (await GET('/api/herramientas'))[0];
      window.expectedQR = h.qr_token;
      const image = new Image();
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgQR(urlQR(h)));
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 480;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 480, 480);
      ctx.drawImage(image, 40, 40, 400, 400);
      window.testStream = canvas.captureStream(10);
      navigator.mediaDevices.getUserMedia = async () => window.testStream;
      escanearQR();
    });
    await page.waitForFunction(() => location.hash.includes(window.expectedQR));
    await page.waitForFunction(() => window.testStream.getTracks().every(t => t.readyState === 'ended'));
    await page.locator('.hero').waitFor();
    // Permission denial retains manual fallback; no external navigation for an unrelated QR.
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); };
      escanearQR();
    });
    await page.waitForFunction(() => document.querySelector('.scanner-status')?.textContent.includes('denegado'));
    assert(await page.locator('#scan-manual').isVisible());
    assert.equal(await page.evaluate(() => abrirDesdeQR('https://example.com/unrelated')), false);
    await page.locator('dialog[open] [data-cerrar]').click();
    // Closing while permission/camera acquisition is pending must stop late streams.
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      window.lateStream = canvas.captureStream();
      navigator.mediaDevices.getUserMedia = () => new Promise(resolve => window.resolveCamera = resolve);
      escanearQR();
      document.querySelector('dialog[open]').close();
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => window.resolveCamera(window.lateStream));
    await page.waitForFunction(() => window.lateStream.getTracks().every(t => t.readyState === 'ended'));
    assert.deepEqual(errors, []);
    console.log('PASS: five printable sizes decode at 300 dpi, with text and QR-only; PDF pagination; selection/copies; scanner video round-trip, denial and late-stream cleanup.');
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

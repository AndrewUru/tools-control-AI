// Rasterize the existing vector icon; requires Playwright only for asset builds.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const out = path.resolve('public/icons');
  fs.mkdirSync(out, { recursive: true });
  const svg = fs.readFileSync('public/icon.svg', 'utf8');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const [name, size, maskable] of [
      ['icon-192.png', 192, false], ['icon-512.png', 512, false],
      ['apple-touch-icon.png', 180, false], ['icon-maskable-512.png', 512, true],
    ]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<style>body{margin:0;background:#f5b301;display:grid;place-items:center;width:100vw;height:100vh}svg{width:${maskable ? 76 : 100}%;height:${maskable ? 76 : 100}%}</style>${svg}`);
      await page.screenshot({ path: path.join(out, name) });
    }
  } finally { await browser.close(); }
  console.log('Generated web and iOS icons from public/icon.svg.');
})().catch(e => { console.error(e); process.exitCode = 1; });

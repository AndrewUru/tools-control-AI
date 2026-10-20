// Genera public/vendor/icons.js (solo los iconos Lucide que usa la app) y copia la fuente Inter.
// Uso: npm run vendor   (requiere haber ejecutado npm install)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'vendor');
fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(require.resolve('jsqr'), path.join(OUT, 'jsQR.js'));
fs.copyFileSync(path.join(ROOT, 'node_modules/jsqr/LICENSE'), path.join(OUT, 'jsQR-LICENSE.txt'));
const lucide = require(path.join(ROOT, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.js'));

const USADOS = `search scan-qr-code qr-code layout-dashboard arrow-left-right triangle-alert menu log-out
  chevron-right chevron-left arrow-left calendar-clock calendar-check calendar-plus history users tags
  circle-check plus pencil camera printer copy lock user mail phone key-round x map-pin building-2
  warehouse truck construction hard-hat drill disc-3 hammer ruler wrench package send inbox list-filter
  image-plus check info euro hash clipboard-list arrow-up-right arrow-down-left undo-2 party-popper
  circle-alert shield-alert layers flag tag ellipsis save trash-2 house circle-dot zap zap-off image
  user-plus ellipsis-vertical chevron-down lock-keyhole bell settings chart-column eye`.split(/\s+/).filter(Boolean);

// Iconos propios en el mismo estilo (24x24, trazo 2) para los que Lucide no tiene
const PROPIOS = {
  ladder: [['path', { d: 'M7 2 5 22' }], ['path', { d: 'M17 2l2 20' }], ['path', { d: 'M6.6 7h10.8' }],
    ['path', { d: 'M6 12h12' }], ['path', { d: 'M5.5 17h13' }]],
  screwdriver: [['path', { d: 'M13.5 10.5 21 3' }], ['path', { d: 'm8 13 3 3' }],
    ['path', { d: 'M9.5 14.5 4 20a1.4 1.4 0 0 1-2-2l5.5-5.5' }], ['path', { d: 'm10 12 2-2 2 2-2 2z' }]],
};

const pascal = s => s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
const attrs = o => Object.entries(o).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
const interior = nodos => nodos.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('');

const iconos = {};
for (const n of USADOS) {
  const def = lucide.icons[pascal(n)];
  if (!def) throw new Error(`Icono no encontrado en Lucide: ${n}`);
  iconos[n] = interior(def[2]);
}
for (const [n, nodos] of Object.entries(PROPIOS)) iconos[n] = interior(nodos);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icons.js'),
  `/* Iconos Lucide (ISC License, https://lucide.dev) generados por scripts/build-vendor.js */\n` +
  `window.ICONS=${JSON.stringify(iconos)};\n`);

const fuentes = path.join(ROOT, 'node_modules', '@fontsource-variable', 'inter', 'files');
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
for (const f of ['inter-latin-wght-normal.woff2', 'inter-latin-ext-wght-normal.woff2']) {
  fs.copyFileSync(path.join(fuentes, f), path.join(OUT, 'fonts', f));
}
console.log(`icons.js: ${Object.keys(iconos).length} iconos · fuente Inter copiada`);

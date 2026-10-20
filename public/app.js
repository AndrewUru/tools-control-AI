/* Inventario de herramientas - aplicación móvil (JavaScript sin frameworks) */
'use strict';

// ------------------------------------------------------------- catálogos
const ESTADOS_H = ['Disponible', 'En uso', 'Averiada', 'En reparación', 'Retirada'];
const ESTADOS_I = ['Abierta', 'En revisión', 'En reparación', 'Resuelta'];
const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Urgente'];
const TIPOS_INC = ['Avería', 'Daño', 'Pérdida o robo', 'Falta accesorio', 'Desgaste', 'Seguridad', 'Otro'];
const TIPOS_UBI = ['Almacén', 'Obra', 'Vehículo', 'Oficina', 'Otra'];
const TIPOS_MAN = ['Revisión', 'Engrase', 'Calibración', 'Inspección de seguridad', 'Cambio de filtro', 'Reparación', 'Otro'];
const ESTADOS_MAN = ['Programado', 'Realizado', 'Cancelado'];

// Tono + icono de cada estado (el color nunca va solo: siempre icono y texto)
const TONO = {
  'Disponible': ['ok', 'circle-check'], 'En uso': ['use', 'hard-hat'], 'Averiada': ['bad', 'triangle-alert'],
  'En reparación': ['rep', 'wrench'], 'Retirada': ['off', 'lock'],
  'Abierta': ['bad', 'circle-alert'], 'En revisión': ['use', 'search'], 'Resuelta': ['ok', 'circle-check'],
  'Urgente': ['bad', 'shield-alert'], 'Alta': ['bad', 'flag'], 'Media': ['rep', 'flag'], 'Baja': ['off', 'flag'],
  'Programado': ['use', 'calendar-clock'], 'Realizado': ['ok', 'calendar-check'], 'Cancelado': ['off', 'x'], 'Vencido': ['bad', 'circle-alert'],
  'Activa': ['ok', 'circle-check'], 'Cerrada': ['off', 'lock'], 'Activo': ['ok', 'circle-check'], 'Inactivo': ['off', 'lock'],
};
const ICON_CAT = { Taladros: 'drill', Radiales: 'disc-3', Escaleras: 'ladder', Atornilladores: 'screwdriver', Maquinaria: 'construction', 'Medición': 'ruler', Andamios: 'layers', Otros: 'package' };
const ICON_UBI = { 'Almacén': 'warehouse', Obra: 'hard-hat', 'Vehículo': 'truck', Oficina: 'building-2', Otra: 'map-pin' };
const ICON_MOV = { Entrega: ['use', 'arrow-up-right'], Traslado: ['rep', 'arrow-left-right'], 'Devolución': ['ok', 'undo-2'] };

const TITULOS = {
  inicio: 'Inicio', buscar: 'Herramientas', panel: 'Panel', 'por-ubicacion': 'Por ubicación', 'por-estado': 'Por estado',
  movimiento: 'Registrar movimiento', incidencia: 'Comunicar incidencia', incidencias: 'Incidencias',
  mantenimientos: 'Mantenimientos', movimientos: 'Historial', ubicaciones: 'Ubicaciones', personas: 'Personas',
  etiquetas: 'Etiquetas QR', 'herramienta-editar': 'Herramienta', herramienta: 'Herramienta',
};
// Pantallas "de detalle": muestran flecha atrás en lugar del menú
const DETALLE = new Set(['herramienta', 'herramienta-editar', 'movimiento', 'incidencia']);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
let CONFIG = { publicUrl: location.origin, prefijos: {}, demo: true };

// ---------------------------------------------------------------- sesión
const SES = {
  token: null, usuario: null,
  cargar() {
    try {
      const s = JSON.parse(localStorage.getItem('sesion') || sessionStorage.getItem('sesion') || 'null');
      if (s) Object.assign(this, s);
    } catch { /* sin almacenamiento */ }
  },
  guardar(token, usuario, recordar = true) {
    Object.assign(this, { token, usuario });
    try {
      localStorage.removeItem('sesion'); sessionStorage.removeItem('sesion');
      (recordar ? localStorage : sessionStorage).setItem('sesion', JSON.stringify({ token, usuario }));
    } catch { /* solo en memoria */ }
  },
  borrar() {
    this.token = null; this.usuario = null;
    try { localStorage.removeItem('sesion'); sessionStorage.removeItem('sesion'); } catch { /* nada */ }
  },
};

// ---------------------------------------------------------------- utilidades
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const enc = encodeURIComponent;
const persona = p => p ? `${p.nombre} ${p.apellidos || ''}`.trim() : '';
const iniciales = p => p ? (((p.nombre || '')[0] || '') + ((p.apellidos || '')[0] || '')).toUpperCase() : '';
const euros = n => n == null ? '—' : Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

function I(nombre, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(window.ICONS || {})[nombre] || ''}</svg>`;
}
const tono = t => (TONO[t] || ['off'])[0];
function pill(t, { icono = true } = {}) {
  if (!t) return '';
  const [c, ic] = TONO[t] || ['off', null];
  return `<span class="pill t-${c}">${icono && ic ? I(ic) : '<i class="dot"></i>'}${esc(t)}</span>`;
}
function avatar(p, cls = '') {
  const nombre = persona(p);
  let h = 0; for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="avatar ${cls}" style="--h:${h}" aria-hidden="true">${esc(iniciales(p))}</span>`;
}
function tileHerr(h, cls = '') {
  return `<span class="tile ${cls} t-${tono(h.estado)}">${h.foto ? `<img src="${esc(h.foto)}" alt="" loading="lazy">` : I(ICON_CAT[h.categoria] || 'package')}</span>`;
}

function fmtFecha(s) {
  if (!s) return '—';
  const [d, t] = s.split(' ');
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}${t ? ' · ' + t.slice(0, 5) : ''}`;
}
function fechaCorta(s) {
  if (!s) return '—';
  const d = new Date(s.slice(0, 10) + 'T00:00');
  const txt = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
  return s.length > 10 ? `${txt}, ${s.slice(11, 16)}` : txt;
}
function hoyISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function ahoraLocal() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
function diasHasta(f) { return Math.round((new Date(f + 'T00:00') - new Date(hoyISO() + 'T00:00')) / 86400000); }
function cuando(f) {
  const d = diasHasta(f);
  if (d < 0) return `hace ${-d} día${d === -1 ? '' : 's'}`;
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  return `en ${d} días`;
}
function saludo() { const h = new Date().getHours(); return h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'; }

async function api(metodo, url, body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (SES.token) headers.Authorization = 'Bearer ' + SES.token;
  let r;
  try {
    r = await fetch(url, { method: metodo, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Comprueba la conexión antes de volver a intentarlo.');
  }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') { SES.borrar(); setTimeout(router); }
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}
const GET = url => api('GET', url);

function toast(msg, error = false) {
  const t = $('#toast');
  t.innerHTML = `${I(error ? 'circle-alert' : 'circle-check')}<span>${esc(msg)}</span>`;
  t.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = 'toast' + (error ? ' error' : '')), 3200);
  if (navigator.vibrate) try { navigator.vibrate(error ? [30, 40, 30] : 15); } catch { /* sin vibración */ }
}

function leerImagen(file, max = 1280) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => ko(new Error('No se pudo leer la imagen'));
    img.src = URL.createObjectURL(file);
  });
}

// QR ------------------------------------------------------------------------------
function baseQR() {
  const local = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  return local ? CONFIG.publicUrl : location.origin;
}
function urlQR(h, tipo = 'h') { return `${baseQR()}/${tipo}/${enc(h.qr_token)}`; }
function svgQR(texto) {
  if (typeof qrcode !== 'function') return '<p class="muted small">Librería QR no disponible</p>';
  const q = qrcode(0, 'M'); q.addData(texto); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
}
function abrirDesdeQR(texto) {
  texto = String(texto || '').trim();
  const m = /^(?:https?:\/\/[^/?#\s]+)?\/([hmi])\/([a-zA-Z0-9_-]+)\/?$/.exec(texto);
  const destino = { h: 'herramienta', m: 'movimiento', i: 'incidencia' };
  if (!m && !/^[a-zA-Z0-9_-]{1,80}$/.test(texto)) {
    toast('Este QR no es una etiqueta de herramienta válida.', true); return false;
  }
  location.hash = m ? `#/${destino[m[1]]}/${enc(m[2])}` : `#/herramienta/${enc(texto)}`;
  return true;
}
const puedeEscanear = () => true;
async function escanearQR() {
  const dlg = hoja(`<div class="sheet-head"><h3>Escanear QR</h3><button class="icon-btn" value="cancel" data-cerrar aria-label="Cerrar">${I('x')}</button></div>
    <div class="scanner"><video playsinline muted></video><div class="scan-frame" aria-hidden="true"><i></i></div><div class="scan-line" aria-hidden="true"></div></div>
    <p class="small scanner-status" role="status">Alinea el código QR dentro del marco</p>
    <div class="scan-tools">
      <button type="button" class="scan-tool" id="scan-torch" hidden aria-pressed="false"><span class="c">${I('zap')}</span>Linterna</button>
      <label class="scan-tool"><span class="c">${I('image')}</span>Desde imagen<input type="file" id="scan-file" accept="image/*"></label>
    </div>
    <form id="scan-manual"><label>Código de herramienta<input name="codigo" required maxlength="80" placeholder="Ej. TAL-001" autocomplete="off"></label>
    <button class="btn tonal" type="submit">${I('search')}Abrir por código</button></form>`);
  dlg.classList.add('scan-sheet');
  const video = $('video', dlg);
  let stream = null, activo = true, timer;
  const stop = () => { activo = false; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); video.srcObject = null; };
  const visibility = () => { if (document.hidden && stream) dlg.close(); };
  document.addEventListener('visibilitychange', visibility);
  dlg.addEventListener('close', () => { stop(); document.removeEventListener('visibilitychange', visibility); });
  $('#scan-manual', dlg).addEventListener('submit', e => {
    e.preventDefault();
    if (abrirDesdeQR(new FormData(e.target).get('codigo'))) dlg.close();
  });
  $('#scan-file', dlg).addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await img.decode();
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      const code = jsQR(cx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (!code) return toast('No se encontró ningún código QR en la imagen.', true);
      if (abrirDesdeQR(code.data)) dlg.close();
    } catch { toast('No se pudo leer la imagen.', true); }
  });
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Usa la aplicación Android o abre la web mediante HTTPS. También puedes introducir el código.');
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    if (!activo) { stream.getTracks().forEach(t => t.stop()); return; }
    video.srcObject = stream; await video.play();
    const track = stream.getVideoTracks()[0];
    if (track?.getCapabilities?.().torch) {
      const torch = $('#scan-torch', dlg);
      torch.hidden = false;
      torch.addEventListener('click', async () => {
        const on = torch.getAttribute('aria-pressed') !== 'true';
        try {
          await track.applyConstraints({ advanced: [{ torch: on }] });
          torch.setAttribute('aria-pressed', String(on)); torch.classList.toggle('on', on);
        } catch { toast('No se pudo encender la linterna.', true); }
      });
    }
    const buscar = () => {
      if (!activo) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, 960 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(pixels.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
        if (code && abrirDesdeQR(code.data)) { dlg.close(); return; }
      }
      timer = setTimeout(buscar, 180);
    };
    buscar();
  } catch (err) {
    stop();
    if (!dlg.open) return;
    $('.scanner', dlg).hidden = true;
    $('.scanner-status', dlg).textContent = err.name === 'NotAllowedError'
      ? 'Permiso de cámara denegado. Actívalo en los ajustes de la aplicación y vuelve a abrir el lector, o introduce el código.'
      : 'No se pudo usar la cámara. ' + err.message;
  }
}

// ------------------------------------------------------------ componentes
const vacio = (icono, titulo, texto = '') => `<div class="empty"><span class="tile t-pri">${I(icono)}</span><strong>${esc(titulo)}</strong>${texto ? `<span class="small">${esc(texto)}</span>` : ''}</div>`;
const skeleton = (n = 5) => `<div class="stack">${Array.from({ length: n }, () => '<div class="sk" style="height:76px"></div>').join('')}</div>`;

function toolCard(h) {
  const marca = [h.marca, h.modelo].filter(Boolean).join(' ');
  return `<a class="tool" href="#/herramienta/${enc(h.codigo)}">
    ${tileHerr(h)}
    <div class="body">
      <div class="name">${esc(h.nombre)}</div>
      <span class="code">${esc(h.codigo)}${marca ? ` · ${esc(marca)}` : ''}</span>
      <div class="line">${pill(h.estado)}${h.incidencias_abiertas
        ? `<span class="meta warn">${I('triangle-alert')}${h.incidencias_abiertas} incidencia${h.incidencias_abiertas > 1 ? 's' : ''}</span>`
        : `<span class="meta">${I('map-pin')}<span>${esc(h.ubicacion_nombre || 'Sin ubicación')}</span></span>`}</div>
    </div>
    ${I('chevron-right', 'chev')}
  </a>`;
}
const stack = items => `<div class="stack">${items.join('')}</div>`;

function opciones(arr, sel, { vacio: v = null, valor = x => x, texto = x => x } = {}) {
  return (v !== null ? `<option value="">${esc(v)}</option>` : '') +
    arr.map(x => `<option value="${esc(valor(x))}" ${String(valor(x)) === String(sel ?? '') ? 'selected' : ''}>${esc(texto(x))}</option>`).join('');
}
const optPersonas = (personas, sel, v = 'Nadie') =>
  opciones(personas.filter(p => p.estado === 'Activo' || String(p.id) === String(sel)), sel, { vacio: v, valor: p => p.id, texto: p => persona(p) + (p.cargo ? ` · ${p.cargo}` : '') });
const optUbicaciones = (ubis, sel, v = 'Selecciona…') =>
  opciones(ubis.filter(u => u.estado === 'Activa' || String(u.id) === String(sel)), sel, { vacio: v, valor: u => u.id, texto: u => u.nombre });
const optHerramientas = (arr, sel) =>
  opciones(arr, sel, { vacio: 'Selecciona herramienta…', valor: h => h.id, texto: h => `${h.codigo} · ${h.nombre}` });

function datosForm(form) {
  const d = {};
  for (const el of form.elements) {
    if (!el.name || el.type === 'file') continue;
    if (el.type === 'checkbox') d[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) d[el.name] = el.value; }
    else d[el.name] = el.value.trim();
  }
  return d;
}

// Hoja inferior genérica
function hoja(html) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.innerHTML = `<div class="grabber" tabindex="-1" autofocus></div>${html}`;
  document.body.appendChild(dlg);
  dlg.addEventListener('click', e => {
    if (e.target === dlg) dlg.close();                       // toque fuera
    if (e.target.closest('[data-cerrar]')) { e.preventDefault(); dlg.close(); }
  });
  dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 50));
  dlg.showModal();
  return dlg;
}

// Formulario en hoja inferior. campos: [{name,label,type,options,required}]
function dialogo(titulo, campos, valores = {}) {
  return new Promise(resolve => {
    const campo = c => {
      const v = valores[c.name] ?? c.default ?? '';
      const req = c.required ? 'required' : '';
      let input;
      if (c.type === 'select') input = `<select name="${c.name}" ${req}>${c.options}</select>`;
      else if (c.type === 'textarea') input = `<textarea name="${c.name}" ${req}>${esc(v)}</textarea>`;
      else input = `<input name="${c.name}" type="${c.type || 'text'}" value="${esc(v)}" ${c.step ? `step="${c.step}" inputmode="decimal"` : ''} ${c.placeholder ? `placeholder="${esc(c.placeholder)}"` : ''} ${req}>`;
      return `<label>${esc(c.label)}${input}</label>`;
    };
    const dlg = hoja(`<form method="dialog" class="form">
      <div class="sheet-head"><h3>${esc(titulo)}</h3><button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">${I('x')}</button></div>
      ${campos.map(campo).join('')}
      <button class="btn primary block" value="ok">${I('check')}Guardar</button>
    </form>`);
    const form = $('form', dlg);
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok' ? datosForm(form) : null));
  });
}

function setTitulo(t) { $('#titulo').textContent = t; document.title = `${t} · Inventario`; }

function pintarUsuario() {
  const u = SES.usuario;
  const b = $('#btn-user');
  b.textContent = iniciales(u);
  if (u) { let h = 0; for (const ch of persona(u)) h = (h * 31 + ch.charCodeAt(0)) % 360; b.style.setProperty('--h', h); }
  $('#drawer-user').innerHTML = u ? `${avatar(u, 'lg')}<div><strong>${esc(persona(u))}</strong><div class="small muted">${esc(u.cargo || '')}</div></div>` : '';
}

// ------------------------------------------------------------------ vistas
const VISTAS = {};

// LOGIN -------------------------------------------------------------------------
VISTAS.login = async () => {
  document.body.classList.add('sin-sesion');
  document.title = 'Iniciar sesión · Inventario';
  const demo = CONFIG.demo ? await GET('/api/demo-usuarios').catch(() => []) : [];
  app.innerHTML = `
    <div class="login">
      <div class="login-top">
        <div class="login-mark">${I('wrench')}</div>
        <h1>Herramientas</h1>
        <p>Control de inventario de forma simple y rápida</p>
      </div>
      <form class="login-form" id="f-login" autocomplete="on">
        <label class="field-ic"><span class="sr-only">Usuario</span>${I('user')}<input type="email" name="email" required autocomplete="username" inputmode="email" placeholder="Usuario (email)"></label>
        <label class="field-ic"><span class="sr-only">Contraseña</span>${I('lock-keyhole')}<input type="password" name="password" required autocomplete="current-password" placeholder="Contraseña"></label>
        <div id="login-error"></div>
        <button class="btn primary block">Entrar</button>
        <label class="remember"><input type="checkbox" name="recordar" checked>Recordar sesión</label>
      </form>
      ${demo.length ? `
        <div class="login-demo">
          <h2><span>Accesos de demostración</span><span class="tag-demo">Datos de ejemplo</span></h2>
          <div class="group demo-users">${demo.map(u => `
            <button type="button" class="demo-user" data-email="${esc(u.email)}">
              ${avatar(u)}
              <span class="who"><strong>${esc(persona(u))}</strong><br><span class="small muted">${esc(u.cargo || '')}</span></span>
              ${I('chevron-right')}
            </button>`).join('')}</div>
          <p class="note">${I('key-round')}<span>Todos los usuarios de demo usan la contraseña <b class="mono">demo</b>.</span></p>
        </div>` : ''}
    </div>`;
  const f = $('#f-login');
  const entrar = async () => {
    const btn = $('button.primary', f); btn.disabled = true;
    try {
      const { recordar, ...credenciales } = datosForm(f);
      const r = await api('POST', '/api/login', credenciales);
      SES.guardar(r.token, r.usuario, recordar);
      pintarUsuario();
      router();
      toast(`Hola, ${r.usuario.nombre}`);
    } catch (err) {
      $('#login-error').innerHTML = `<div class="alert">${I('circle-alert')}${esc(err.message)}</div>`;
      btn.disabled = false;
    }
  };
  f.addEventListener('submit', e => { e.preventDefault(); entrar(); });
  $$('.demo-user').forEach(b => b.addEventListener('click', () => { f.email.value = b.dataset.email; f.password.value = 'demo'; entrar(); }));
};

// INICIO --------------------------------------------------------------------------
VISTAS.inicio = async () => {
  const yo = SES.usuario;
  const [d, mias] = await Promise.all([GET('/api/dashboard'), GET('/api/herramientas?responsable=' + enc(yo.id))]);
  const k = d.indicadores;
  $('#titulo').innerHTML = `<span class="greet">Hola, ${esc(yo.nombre)}</span><span class="greet-sub">${esc(yo.cargo || saludo())}</span>`;
  document.title = 'Inicio · Inventario';
  const stat = (c, icono, n, l, href) => `<a class="stat t-${c}" href="${href}">
    <span class="ico">${I(icono)}</span><div style="min-width:0"><div class="n">${n ?? 0}</div><div class="l">${l}</div></div></a>`;
  const accion = (c, icono, titulo, sub, href, id = '') => {
    const inner = `<span class="tile sm t-${c}">${I(icono)}</span>
      <div class="body"><div class="title">${titulo}</div><div class="sub">${sub}</div></div>${I('chevron-right', 'chev')}`;
    return href ? `<a class="item" href="${href}">${inner}</a>` : `<button type="button" class="item" id="${id}">${inner}</button>`;
  };
  app.innerHTML = `
    <form class="home-search search-box" id="f-home" role="search">
      <div class="search-field">${I('search')}<input type="search" name="q" placeholder="Buscar herramienta…" autocomplete="off" enterkeyhint="search" aria-label="Buscar herramienta"></div>
      <button type="button" class="square-btn scan" id="btn-home-scan" aria-label="Escanear QR">${I('scan-qr-code')}</button>
    </form>
    <div class="stats">
      ${stat('ok', 'circle-check', k.disponibles, 'Disponibles', '#/herramientas?estado=Disponible')}
      ${stat('use', 'arrow-left-right', k.en_uso, 'En uso', '#/herramientas?estado=En%20uso')}
      ${stat('rep', 'wrench', k.en_reparacion, 'En reparación', '#/herramientas?estado=En%20reparaci%C3%B3n')}
      ${stat('bad', 'triangle-alert', k.incidencias_abiertas, 'Incidencias', '#/incidencias')}
    </div>
    ${k.mantenimientos_vencidos ? `<div class="banner t-rep home-banner">${I('calendar-clock')}<span>${k.mantenimientos_vencidos} mantenimiento${k.mantenimientos_vencidos > 1 ? 's' : ''} vencido${k.mantenimientos_vencidos > 1 ? 's' : ''}</span><a href="#/mantenimientos">Revisar</a></div>` : ''}
    <div class="home-grid">
      <div>
        <h2>Acciones rápidas</h2>
        <div class="group actions">
          ${accion('pri', 'scan-qr-code', 'Escanear QR', 'Identifica una herramienta al instante', '', 'act-scan')}
          ${accion('use', 'user-plus', 'Asignar herramienta', 'Entrega a una persona u obra', '#/movimiento?tipo=Entrega')}
          ${accion('ok', 'undo-2', 'Devolver', 'Vuelve al almacén', '#/movimiento?tipo=Devoluci%C3%B3n')}
          ${accion('bad', 'triangle-alert', 'Registrar incidencia', 'Avería, daño o pérdida', '#/incidencia')}
        </div>
      </div>
      <div>
        <div class="section-head"><h2>A tu cargo</h2><a href="#/herramientas?mias=1">Ver todas</a></div>
        ${mias.length ? stack(mias.slice(0, 3).map(toolCard)) : `<div class="card">${vacio('package', 'Nada a tu cargo', 'Las herramientas que te asignen aparecerán aquí.')}</div>`}
        <div class="section-head"><h2>Resumen</h2><a href="#/panel">Ver panel</a></div>
        <div class="kpis"><a class="kpi hero-kpi" href="#/panel">
          <div><div class="l">TU INVENTARIO</div><div class="n">${k.total ?? 0}</div><div class="l">herramientas en total</div></div>
          <span class="tile">${I('chart-column')}</span>
        </a></div>
      </div>
    </div>`;
  const f = $('#f-home');
  f.addEventListener('submit', e => {
    e.preventDefault();
    const q = f.q.value.trim();
    location.hash = '#/herramientas' + (q ? '?q=' + enc(q) : '');
  });
  $('#btn-home-scan').addEventListener('click', escanearQR);
  $('#act-scan').addEventListener('click', escanearQR);
};

// BUSCADOR ------------------------------------------------------------------------
VISTAS.buscar = async (_, q) => {
  const [ubis, todas] = await Promise.all([GET('/api/ubicaciones'), GET('/api/herramientas?retiradas=1')]);
  const cats = Object.keys(CONFIG.prefijos);
  const yo = SES.usuario;
  const f = {
    q: q.q || '', estado: q.estado || '', categoria: q.categoria || '', ubicacion: q.ubicacion || '', mias: q.mias === '1',
    responsable: q.responsable && String(q.responsable) !== String(yo.id) ? q.responsable : '',
  };
  const contar = e => todas.filter(h => e ? h.estado === e : h.estado !== 'Retirada').length;
  const chip = (valor, texto) => `<button type="button" class="chip ${f.estado === valor ? 'on' : ''} ${valor ? 't-' + tono(valor) : ''}" data-estado="${esc(valor)}">
    ${valor ? '<i class="dot"></i>' : ''}${texto} <span class="n">${contar(valor)}</span></button>`;

  app.innerHTML = `
    <div class="search-head">
      <form class="search-box" id="f-buscar" role="search">
        <div class="search-field">
          ${I('search')}
          <input type="search" name="q" value="${esc(f.q)}" placeholder="Código, nombre, marca…" autocomplete="off" enterkeyhint="search" aria-label="Buscar">
        </div>
        ${puedeEscanear() ? `<button type="button" class="square-btn scan" id="btn-scan" aria-label="Escanear QR">${I('scan-qr-code')}</button>` : ''}
        <button type="button" class="square-btn" id="btn-filtros" aria-label="Filtros">${I('list-filter')}<span class="count" id="n-filtros" hidden></span></button>
      </form>
      <div class="chips-scroll" role="tablist" aria-label="Estado">${chip('', 'Activas')}${ESTADOS_H.map(e => chip(e, e)).join('')}</div>
    </div>
    <div class="result-bar"><span class="count" id="n-res" role="status" aria-live="polite">Buscando…</span><a href="#/herramienta-editar/nueva" class="btn tonal sm">${I('plus')}Añadir</a></div>
    <div class="active-filters" id="activos"></div>
    <div id="resultados">${skeleton(4)}</div>`;

  let peticion = 0;
  const nombreUbi = id => ubis.find(u => String(u.id) === String(id))?.nombre || '';
  const pintarActivos = () => {
    const tags = [];
    if (f.categoria) tags.push(['categoria', f.categoria]);
    if (f.ubicacion) tags.push(['ubicacion', nombreUbi(f.ubicacion)]);
    if (f.mias) tags.push(['mias', 'A mi cargo']);
    if (f.responsable) tags.push(['responsable', 'Por responsable']);
    $('#activos').innerHTML = tags.map(([k, t]) => `<button type="button" class="chip" data-quitar="${k}">${esc(t)} ${I('x')}</button>`).join('');
    const n = tags.length;
    const b = $('#n-filtros'); b.hidden = !n; b.textContent = n;
    $('#btn-filtros').classList.toggle('on', n > 0);
    $$('[data-quitar]').forEach(x => x.addEventListener('click', () => {
      const k = x.dataset.quitar; f[k] = k === 'mias' ? false : ''; buscar();
    }));
  };
  const buscar = async () => {
    const params = new URLSearchParams();
    for (const k of ['q', 'estado', 'categoria', 'ubicacion']) if (f[k]) params.set(k, f[k]);
    const enUrl = new URLSearchParams(params);
    if (f.mias) { params.set('responsable', yo.id); enUrl.set('mias', '1'); }
    else if (f.responsable) { params.set('responsable', f.responsable); enUrl.set('responsable', f.responsable); }
    history.replaceState(null, '', '#/herramientas' + (enUrl.toString() ? '?' + enUrl : ''));
    pintarActivos();
    const n = ++peticion;
    const res = await GET('/api/herramientas?' + params);
    if (n !== peticion) return;
    $('#n-res').textContent = `${res.length} herramienta${res.length === 1 ? '' : 's'}`;
    $('#resultados').innerHTML = res.length ? stack(res.map(toolCard))
      : vacio('search', 'Sin resultados', 'Prueba con otro texto o quita algún filtro.');
  };

  const form = $('#f-buscar');
  let t;
  form.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { f.q = form.q.value.trim(); buscar(); }, 220); });
  form.addEventListener('submit', e => { e.preventDefault(); form.q.blur(); f.q = form.q.value.trim(); buscar(); });
  $$('[data-estado]').forEach(b => b.addEventListener('click', () => {
    f.estado = b.dataset.estado;
    $$('[data-estado]').forEach(x => x.classList.toggle('on', x === b));
    b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    buscar();
  }));
  $('#btn-scan')?.addEventListener('click', escanearQR);
  $('#btn-filtros').addEventListener('click', () => {
    const dlg = hoja(`<form method="dialog" class="form">
      <div class="sheet-head"><h3>Filtros</h3><button type="button" class="btn ghost sm" id="limpiar">Limpiar</button></div>
      <label>Categoría<select name="categoria">${opciones(cats, f.categoria, { vacio: 'Todas las categorías' })}</select></label>
      <label>Ubicación<select name="ubicacion">${optUbicaciones(ubis, f.ubicacion, 'Todas las ubicaciones')}</select></label>
      <label class="switch">Solo herramientas a mi cargo<input type="checkbox" name="mias" ${f.mias ? 'checked' : ''}></label>
      <button class="btn primary block" value="ok">Ver resultados</button>
    </form>`);
    const ff = $('form', dlg);
    $('#limpiar', dlg).addEventListener('click', () => { ff.categoria.value = ''; ff.ubicacion.value = ''; ff.mias.checked = false; });
    dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'ok') return;
      const d = datosForm(ff);
      Object.assign(f, { categoria: d.categoria, ubicacion: d.ubicacion, mias: d.mias });
      if (d.mias) f.responsable = '';
      buscar();
    });
  });
  await buscar();
};

// PANEL ---------------------------------------------------------------------------
VISTAS.panel = async () => {
  const d = await GET('/api/dashboard');
  const k = d.indicadores;
  const kpi = (estado, n, l, href, icono) => `<a class="kpi" href="${href}">
    <span class="tile sm t-${estado}">${I(icono)}</span>
    <div><div class="n">${n ?? 0}</div><div class="l">${l}</div></div></a>`;
  const dist = ESTADOS_H.map(e => [e, { Disponible: k.disponibles, 'En uso': k.en_uso, Averiada: k.averiadas, 'En reparación': k.en_reparacion, Retirada: k.retiradas }[e] || 0]);
  const total = k.total || 1;
  app.innerHTML = `
    <div class="page-intro"><div class="eyebrow">VISTA GENERAL</div><h1>Todo bajo control.</h1><p>El pulso de tu equipo, de un vistazo.</p></div>
    <div class="kpis">
      <a class="kpi hero-kpi" href="#/herramientas">
        <div><div class="l">TU INVENTARIO</div><div class="n">${k.total ?? 0}</div><div class="l">herramientas en total</div></div>
        <span class="tile">${I('package')}</span>
      </a>
      ${kpi('ok', k.disponibles, 'Disponibles', '#/herramientas?estado=Disponible', 'circle-check')}
      ${kpi('use', k.en_uso, 'En uso', '#/herramientas?estado=En%20uso', 'hard-hat')}
      ${kpi('bad', k.averiadas, 'Averiadas', '#/herramientas?estado=Averiada', 'triangle-alert')}
      ${kpi('rep', k.en_reparacion, 'En reparación', '#/herramientas?estado=En%20reparaci%C3%B3n', 'wrench')}
      ${kpi('bad', k.incidencias_abiertas, 'Incidencias abiertas', '#/incidencias', 'clipboard-list')}
      ${kpi('rep', k.mantenimientos_vencidos, 'Mant. vencidos', '#/mantenimientos', 'calendar-clock')}
    </div>

    <h2>Distribución por estado</h2>
    <div class="card dist" role="img" aria-label="${esc(dist.map(([e, n]) => `${e}: ${n}`).join(', '))}">
      <div class="dist-bar">${dist.filter(([, n]) => n).map(([e, n]) => `<span class="t-${tono(e)}" style="flex:${n}" title="${esc(e)}: ${n} (${Math.round(n * 100 / total)} %)"></span>`).join('')}</div>
      <div class="legend">${dist.map(([e, n]) => `<div class="t-${tono(e)}">${I(TONO[e][1])}<span>${esc(e)}</span><b>${n}</b></div>`).join('')}</div>
    </div>

    <h2>${I('clipboard-list')} Incidencias pendientes</h2>
    ${d.incidencias.length ? `<div class="group">${d.incidencias.map(i => `
      <a class="item" href="#/herramienta/${enc(i.codigo)}">
        <span class="tile sm t-${tono(i.prioridad)}">${I(TONO[i.prioridad][1])}</span>
        <div class="body"><div class="title">${esc(i.herramienta_nombre)}</div><div class="sub">${esc(i.tipo)} · ${esc(i.estado)} · ${fechaCorta(i.fecha)}</div></div>
        <div class="trail">${pill(i.prioridad, { icono: false })}</div>
      </a>`).join('')}
      <a class="item no-tile" href="#/incidencias"><div class="body" style="color:var(--primary);font-weight:600">Ver todas</div>${I('chevron-right', 'chev')}</a>
    </div>` : `<div class="card">${vacio('party-popper', 'Todo en orden', 'No hay incidencias pendientes')}</div>`}

    <h2>${I('calendar-clock')} Próximos mantenimientos</h2>
    ${d.mantenimientos.length ? `<div class="group">${d.mantenimientos.map(m => {
      const venc = diasHasta(m.fecha_prevista) < 0;
      return `<a class="item" href="#/herramienta/${enc(m.codigo)}">
        <span class="tile sm t-${venc ? 'bad' : 'use'}">${I(venc ? 'circle-alert' : 'calendar-clock')}</span>
        <div class="body"><div class="title">${esc(m.herramienta_nombre)}</div><div class="sub">${esc(m.tipo)} · ${fechaCorta(m.fecha_prevista)}</div></div>
        <div class="trail" ${venc ? 'style="color:var(--bad);font-weight:600"' : ''}>${venc ? 'Vencido' : cuando(m.fecha_prevista)}</div>
      </a>`;
    }).join('')}
      <a class="item no-tile" href="#/mantenimientos"><div class="body" style="color:var(--primary);font-weight:600">Ver todos</div>${I('chevron-right', 'chev')}</a>
    </div>` : `<div class="card">${vacio('calendar-check', 'Sin mantenimientos programados')}</div>`}

    <h2>${I('map-pin')} Por ubicación</h2>
    <div class="group">${d.por_ubicacion.map(u => `
      <a class="item" href="#/herramientas?ubicacion=${u.id}">
        <span class="tile sm">${I(ICON_UBI[u.tipo] || 'map-pin')}</span>
        <div class="body"><div class="title">${esc(u.nombre)}</div><div class="sub">${esc(u.tipo)}</div></div>
        <div class="trail"><b class="num" style="color:var(--text)">${u.n}</b>${I('chevron-right', 'chev')}</div>
      </a>`).join('')}</div>

    <h2>${I('history')} Últimos movimientos</h2>
    <div class="card"><ul class="timeline">${d.ultimos_movimientos.map(m => movNodo(m, true)).join('')}</ul>
      <a href="#/movimientos" class="btn tonal sm block">Historial completo</a></div>`;
};

function movNodo(m, conHerramienta = false) {
  const [c, ic] = ICON_MOV[m.tipo] || ['off', 'arrow-left-right'];
  return `<li>
    <span class="node t-${c}">${I(ic)}</span>
    <div class="row" style="display:flex;justify-content:space-between;gap:.5rem">
      <strong>${conHerramienta ? `<a href="#/herramienta/${enc(m.codigo)}" style="color:inherit">${esc(m.herramienta_nombre)}</a>` : esc(m.tipo)}</strong>
      <span class="xs muted" style="white-space:nowrap">${fechaCorta(m.fecha_hora)}</span>
    </div>
    <div class="route">${conHerramienta ? `<span class="pill plain">${esc(m.tipo)}</span>` : ''}<span>${esc(m.origen_nombre || '—')}</span>${I('chevron-right')}<b>${esc(m.destino_nombre)}</b></div>
    <div class="xs muted">${I('user')} ${esc(m.realizado_por_nombre || '—')} → ${esc(m.receptor_nombre || 'sin responsable')}</div>
    ${m.observaciones ? `<div class="small" style="margin-top:.2rem">${esc(m.observaciones)}</div>` : ''}
  </li>`;
}

// AGRUPACIONES ------------------------------------------------------------------
VISTAS['por-ubicacion'] = async () => {
  const [herr, ubis] = await Promise.all([GET('/api/herramientas'), GET('/api/ubicaciones')]);
  const grupos = ubis.map(u => ({ u, items: herr.filter(h => h.ubicacion_actual_id === u.id) })).filter(g => g.items.length);
  const sin = herr.filter(h => !h.ubicacion_actual_id);
  app.innerHTML = grupos.map(({ u, items }) => `
    <h2>${I(ICON_UBI[u.tipo] || 'map-pin')} ${esc(u.nombre)} <span style="margin-left:auto">${items.length}</span></h2>
    ${stack(items.map(toolCard))}`).join('') +
    (sin.length ? `<h2>${I('map-pin')} Sin ubicación <span style="margin-left:auto">${sin.length}</span></h2>${stack(sin.map(toolCard))}` : '');
};

VISTAS['por-estado'] = async () => {
  const herr = await GET('/api/herramientas?retiradas=1');
  app.innerHTML = ESTADOS_H.map(e => {
    const items = herr.filter(h => h.estado === e);
    return `<h2 class="t-${tono(e)}"><span style="color:var(--c);display:flex">${I(TONO[e][1])}</span> ${esc(e)} <span style="margin-left:auto">${items.length}</span></h2>
      ${items.length ? stack(items.map(toolCard)) : '<p class="small muted" style="margin:0 .25rem">Ninguna</p>'}`;
  }).join('');
};

// FICHA -------------------------------------------------------------------------
VISTAS.herramienta = async ([ref]) => {
  const h = await GET('/api/herramientas/' + enc(ref));
  setTitulo(h.codigo);
  const url = urlQR(h);
  const t = tono(h.estado);
  const seg = (id, titulo, n) => `<button type="button" class="${id === 'mov' ? 'on' : ''}" data-tab="${id}">${titulo}${n != null ? ` <span class="n">${n}</span>` : ''}</button>`;
  $('#appbar-extra').innerHTML = `<a class="icon-btn" href="#/herramienta-editar/${h.id}" aria-label="Editar">${I('pencil')}</a>`;
  app.innerHTML = `
    <section class="hero t-${t}">
      <div class="hero-media">${h.foto ? `<img src="${esc(h.foto)}" alt="Foto de ${esc(h.nombre)}">` : I(ICON_CAT[h.categoria] || 'package')}</div>
      <h1>${esc(h.nombre)}</h1>
      <div class="hero-code">${esc(h.codigo)}</div>
      <div class="hero-tags">${pill(h.estado)}</div>
      <div class="specs">
        <div><div class="k">Categoría</div><div class="v">${esc(h.categoria || '—')}</div></div>
        <div><div class="k">Ubicación</div><div class="v">${esc(h.ubicacion_nombre || 'Sin ubicación')}</div></div>
        <div><div class="k">Responsable</div><div class="v">${esc(h.responsable_nombre || 'Sin responsable')}</div></div>
        <div><div class="k">Próx. mantenimiento</div><div class="v ${h.proximo_mantenimiento && diasHasta(h.proximo_mantenimiento) < 0 ? 'warn' : ''}">${h.proximo_mantenimiento ? `${fmtFecha(h.proximo_mantenimiento)} · ${cuando(h.proximo_mantenimiento)}` : 'No programado'}</div></div>
        <div><div class="k">Marca y modelo</div><div class="v">${esc([h.marca, h.modelo].filter(Boolean).join(' ') || '—')}</div></div>
        <div><div class="k">Nº de serie</div><div class="v mono">${esc(h.numero_serie || '—')}</div></div>
        <button type="button" class="qr-mini" id="btn-qr-mini" aria-label="Ver código QR y datos"><div><div class="k">Código QR</div><div class="v">Ver etiqueta y enlace</div></div>${svgQR(url)}</button>
      </div>
      ${h.estado === 'Retirada' ? `<div class="banner t-off">${I('lock')}<span>Dada de baja. No se puede asignar ni mover.</span></div>` : ''}
      <div class="quick">
        ${h.estado !== 'Retirada' ? `<a class="primary" href="#/movimiento/${enc(h.codigo)}">${I('user-plus')}Asignar</a>` : `<button type="button" class="primary" disabled>${I('lock')}De baja</button>`}
        <a class="incid" href="#/incidencia/${enc(h.codigo)}">${I('triangle-alert')}Incidencia</a>
        <button type="button" id="btn-mant">${I('wrench')}Mantenim.</button>
        <button type="button" class="more" id="btn-mas-ficha" aria-label="Más opciones">${I('ellipsis')}</button>
      </div>
    </section>

    <div class="seg" role="tablist">
      ${seg('mov', 'Historial', h.movimientos.length)}${seg('inc', 'Incidencias', h.incidencias.length)}${seg('man', 'Mant.', h.mantenimientos.length)}${seg('dat', 'Datos')}
    </div>
    <section data-panel="mov">
      ${h.movimientos.length ? `<div class="card"><ul class="timeline">${h.movimientos.map(m => movNodo(m)).join('')}</ul></div>
        <p class="note">${I('lock')}<span>El historial de movimientos es permanente: no se puede editar ni borrar.</span></p>`
      : `<div class="card">${vacio('history', 'Sin movimientos', 'Aún no se ha movido esta herramienta.')}</div>`}
    </section>
    <section data-panel="inc" hidden>
      ${h.incidencias.length ? stack(h.incidencias.map(incidenciaCard)) : `<div class="card">${vacio('circle-check', 'Sin incidencias')}</div>`}
    </section>
    <section data-panel="man" hidden>
      ${h.mantenimientos.length ? `<div class="group">${h.mantenimientos.map(mantItem).join('')}</div>` : `<div class="card">${vacio('calendar-check', 'Sin mantenimientos')}</div>`}
    </section>
    <section data-panel="dat" hidden>
      <div class="group plain">
        ${[['Nº de serie', `<span class="mono">${esc(h.numero_serie || '—')}</span>`], ['Fecha de compra', fmtFecha(h.fecha_compra)],
           ['Precio de compra', euros(h.precio_compra)], ['Alta en el sistema', fmtFecha(h.creado_en)], ['Observaciones', esc(h.observaciones || '—')]]
          .map(([l, v]) => `<div class="item no-tile"><div class="body"><div class="label">${l}</div><div class="value">${v}</div></div></div>`).join('')}
      </div>
      <div class="card qr-box" style="margin-top:.75rem">
        <h3 style="margin-bottom:.75rem">Código QR</h3>
        ${svgQR(url)}
        <div class="xs mono muted" style="word-break:break-all;margin-top:.5rem">${esc(url)}</div>
        <div class="btn-row" style="justify-content:center;margin-top:.75rem">
          <a class="btn sm tonal" href="#/etiquetas?ids=${h.id}">${I('printer')}Etiqueta</a>
          <button type="button" class="btn sm tonal" id="btn-copiar">${I('copy')}Copiar enlace</button>
        </div>
      </div>
    </section>`;

  $$('[data-tab]').forEach(b => b.addEventListener('click', () => {
    $$('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
    $$('[data-panel]').forEach(p => (p.hidden = p.dataset.panel !== b.dataset.tab));
  }));
  $('#btn-copiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch { prompt('Copia el enlace:', url); }
  });
  $('#btn-mant').addEventListener('click', () => nuevoMantenimiento(h.id));
  $('#btn-mas-ficha').addEventListener('click', () => opcionesHerramienta(h));
  $('#btn-qr-mini').addEventListener('click', () => {
    const tab = $('[data-tab="dat"]'); tab.click(); tab.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  enlazarIncidencias(app, () => VISTAS.herramienta([ref]));
};

// Menú «⋯» de la ficha
function opcionesHerramienta(h) {
  const retirada = h.estado === 'Retirada';
  const dlg = hoja(`<div class="sheet-head"><h3>${esc(h.nombre)}</h3><button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">${I('x')}</button></div>
    <div class="group sheet-actions">
      <a class="item" href="#/herramienta-editar/${h.id}"><span class="tile sm">${I('pencil')}</span><div class="body"><div class="title">Editar datos</div></div>${I('chevron-right', 'chev')}</a>
      <a class="item" href="#/etiquetas?ids=${h.id}"><span class="tile sm">${I('printer')}</span><div class="body"><div class="title">Imprimir etiqueta QR</div></div>${I('chevron-right', 'chev')}</a>
      ${retirada
        ? `<button type="button" class="item" id="op-reactivar"><span class="tile sm t-ok">${I('undo-2')}</span><div class="body"><div class="title">Reactivar herramienta</div><div class="sub">Vuelve al inventario activo</div></div></button>`
        : `<button type="button" class="item danger-item" id="op-baja"><span class="tile sm t-bad">${I('trash-2')}</span><div class="body"><div class="title">Dar de baja</div><div class="sub">Rotura, pérdida, desgaste o venta</div></div></button>`}
    </div>`);
  $('#op-baja', dlg)?.addEventListener('click', () => { dlg.close(); darDeBaja(h); });
  $('#op-reactivar', dlg)?.addEventListener('click', async () => {
    dlg.close();
    try { await api('POST', `/api/herramientas/${h.id}/reactivar`); toast(`${h.codigo} reactivada`); router(); }
    catch (err) { toast(err.message, true); }
  });
}

function darDeBaja(h) {
  const motivos = ['Rotura irreparable', 'Pérdida o robo', 'Desgaste u obsoleta', 'Venta o donación', 'Otro'];
  const dlg = hoja(`<form class="form" id="f-baja">
    <div class="sheet-head"><h3>Dar de baja</h3><button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">${I('x')}</button></div>
    <div class="current"><div class="current-head">${tileHerr(h, 'sm')}
      <div class="body"><div style="font-weight:650">${esc(h.nombre)}</div><div class="code">${esc(h.codigo)}</div></div>${pill(h.estado)}</div></div>
    <label>Motivo<select name="motivo" required>${opciones(motivos, '', { vacio: 'Selecciona el motivo…' })}</select></label>
    <label>Fecha de baja<input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}" required></label>
    <label>Observaciones <span class="hint">Opcional</span><textarea name="observaciones" maxlength="500" placeholder="Qué ha pasado, dónde está ahora…"></textarea></label>
    <p class="note" style="margin:0">${I('info')}<span>Dejará de aparecer en el inventario activo y no se podrá asignar. Se cancelan sus mantenimientos programados. El historial se conserva y se puede reactivar.</span></p>
    <button class="btn alarm block">${I('trash-2')}Dar de baja</button>
  </form>`);
  const f = $('#f-baja', dlg);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('button.alarm', f); btn.disabled = true;
    try {
      await api('POST', `/api/herramientas/${h.id}/baja`, datosForm(f));
      dlg.close(); toast(`${h.codigo} dada de baja`); router();
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  });
}

// ALTA / EDICIÓN ------------------------------------------------------------------
VISTAS['herramienta-editar'] = async ([id]) => {
  const nueva = id === 'nueva';
  const [h, ubis, personas] = await Promise.all([
    nueva ? Promise.resolve({ estado: 'Disponible' }) : GET('/api/herramientas/' + id),
    GET('/api/ubicaciones'), GET('/api/personas'),
  ]);
  setTitulo(nueva ? 'Nueva herramienta' : 'Editar ' + h.codigo);
  const cats = Object.keys(CONFIG.prefijos);
  let foto = h.foto || null;
  const almacen = ubis.find(u => u.tipo === 'Almacén' && u.estado === 'Activa');
  app.innerHTML = `
    <form class="form" id="f-herr">
      <div class="form-sec">
        <div class="uploader" id="foto-box">
          <label class="add" title="Añadir foto">${I('camera')}<input type="file" id="foto" accept="image/*"></label>
          <span id="foto-prev">${foto ? `<img src="${esc(foto)}" alt="">` : ''}</span>
          <button type="button" class="btn sm ghost danger" id="quitar-foto" ${foto ? '' : 'hidden'} style="align-self:center">Quitar</button>
        </div>
        <div class="cols">
          <label>Categoría<select name="categoria">${opciones(cats, h.categoria, { vacio: 'Elige…' })}</select></label>
          <label>Código<input name="codigo" value="${esc(h.codigo || '')}" placeholder="TAL-001" required pattern="[A-Za-z]{2,4}-[0-9]{1,5}" style="text-transform:uppercase"></label>
        </div>
        <label>Nombre<input name="nombre" value="${esc(h.nombre || '')}" required placeholder="Taladro percutor"></label>
        <div class="cols">
          <label>Marca<input name="marca" value="${esc(h.marca || '')}"></label>
          <label>Modelo<input name="modelo" value="${esc(h.modelo || '')}"></label>
        </div>
        <label>Nº de serie<input name="numero_serie" value="${esc(h.numero_serie || '')}"></label>
      </div>
      <div class="form-sec">
        <label>Estado<select name="estado">${opciones(ESTADOS_H, h.estado)}</select></label>
        <div class="cols">
          <label>Fecha de compra<input type="date" name="fecha_compra" value="${esc(h.fecha_compra || '')}"></label>
          <label>Precio (€)<input type="number" step="0.01" min="0" name="precio_compra" value="${esc(h.precio_compra ?? '')}" inputmode="decimal"></label>
        </div>
        ${nueva ? `
          <label>Ubicación inicial<select name="ubicacion_actual_id">${optUbicaciones(ubis, almacen?.id)}</select></label>
          <label>Responsable inicial<select name="responsable_actual_id">${optPersonas(personas, almacen?.responsable_id)}</select></label>`
        : `<p class="note" style="margin:0">${I('info')}<span>La ubicación y el responsable cambian registrando un <a href="#/movimiento/${enc(h.codigo)}">movimiento</a>, para conservar el historial.</span></p>`}
        <label>Observaciones<textarea name="observaciones" placeholder="Accesorios, cuidados, notas…">${esc(h.observaciones || '')}</textarea></label>
      </div>
      <div class="sticky-cta"><button class="btn primary">${I('save')}Guardar</button></div>
    </form>`;

  const f = $('#f-herr');
  f.categoria.addEventListener('change', async () => {
    if (!nueva || !f.categoria.value) return;
    f.codigo.value = (await GET('/api/siguiente-codigo?categoria=' + enc(f.categoria.value))).codigo;
  });
  $('#foto').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    foto = await leerImagen(file);
    $('#foto-prev').innerHTML = `<img src="${foto}" alt="">`;
    $('#quitar-foto').hidden = false;
  });
  $('#quitar-foto').addEventListener('click', () => { foto = null; $('#foto-prev').innerHTML = ''; $('#quitar-foto').hidden = true; });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('.sticky-cta .btn', f); btn.disabled = true;
    try {
      const r = nueva ? await api('POST', '/api/herramientas', { ...datosForm(f), foto }) : await api('PUT', '/api/herramientas/' + h.id, { ...datosForm(f), foto });
      toast('Herramienta guardada');
      location.hash = '#/herramienta/' + enc(r.codigo);
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  });
};

// MOVIMIENTO ----------------------------------------------------------------------
VISTAS.movimiento = async ([ref], q = {}) => {
  const [herr, ubis, personas] = await Promise.all([GET('/api/herramientas'), GET('/api/ubicaciones'), GET('/api/personas')]);
  let sel = ref ? await GET('/api/herramientas/' + enc(ref)).catch(() => null) : null;
  const opcion = (v, icono, texto, sub, c) => `<label class="t-${c}"><input type="radio" name="tipo" value="${v}" required>${I(icono)}<span>${texto}</span><small>${sub}</small></label>`;
  app.innerHTML = `
    <form class="form" id="f-mov">
      <div class="form-sec">
        <div class="sec-title"><span class="step">1</span>Herramienta</div>
        <select name="herramienta_id" required aria-label="Herramienta">${optHerramientas(herr, sel?.id)}</select>
        <div id="actual"></div>
      </div>
      <div class="form-sec">
        <div class="sec-title"><span class="step">2</span>Tipo de movimiento</div>
        <div class="choice">
          ${opcion('Entrega', 'arrow-up-right', 'Entrega', 'a una persona', 'use')}
          ${opcion('Traslado', 'arrow-left-right', 'Traslado', 'entre lugares', 'rep')}
          ${opcion('Devolución', 'undo-2', 'Devolución', 'al almacén', 'ok')}
        </div>
      </div>
      <div class="form-sec">
        <div class="sec-title"><span class="step">3</span>Destino</div>
        <label>Ubicación de destino<select name="destino_id" required>${optUbicaciones(ubis)}</select></label>
        <label>Responsable que la recibe<select name="receptor_id">${optPersonas(personas, '')}</select></label>
      </div>
      <div class="form-sec">
        <div class="sec-title"><span class="step">4</span>Detalles</div>
        <label>Realiza el movimiento<select name="realizado_por_id">${optPersonas(personas, SES.usuario.id)}</select></label>
        <label>Fecha y hora<input type="datetime-local" name="fecha_hora" value="${ahoraLocal()}" required></label>
        <label>Observaciones <span class="hint">Opcional</span><textarea name="observaciones" placeholder="Estado en que se entrega, accesorios…"></textarea></label>
      </div>
      <div class="sticky-cta"><button class="btn primary">${I('check')}Registrar movimiento</button></div>
    </form>`;

  const f = $('#f-mov');
  const pintarActual = () => {
    $('#actual').innerHTML = sel ? `<div class="current">
      <div class="current-head">${tileHerr(sel, 'sm')}
        <div class="body"><div style="font-weight:650">${esc(sel.nombre)}</div><div class="code">${esc(sel.codigo)}</div></div>${pill(sel.estado)}</div>
      <div class="line">${I('map-pin')} Origen: <b>${esc(sel.ubicacion_nombre || 'Sin ubicación')}</b></div>
      <div class="line">${I('user')} Ahora la tiene: <b>${esc(sel.responsable_nombre || '—')}</b></div>
    </div>
      ${['Averiada', 'En reparación'].includes(sel.estado) ? `<div class="alert" style="margin-top:.5rem">${I('triangle-alert')}Esta herramienta está ${esc(sel.estado.toLowerCase())}.</div>` : ''}` : '';
  };
  pintarActual();
  f.herramienta_id.addEventListener('change', async () => {
    sel = f.herramienta_id.value ? await GET('/api/herramientas/' + f.herramienta_id.value) : null;
    pintarActual();
  });
  $$('input[name=tipo]', f).forEach(r => r.addEventListener('change', () => {
    if (r.value === 'Devolución' && r.checked) {
      const alm = ubis.find(u => u.tipo === 'Almacén' && u.estado === 'Activa');
      if (alm) { f.destino_id.value = alm.id; f.receptor_id.value = alm.responsable_id || ''; }
    }
  }));
  const tipoInicial = $$('input[name=tipo]', f).find(r => r.value === q.tipo);
  if (tipoInicial) { tipoInicial.checked = true; tipoInicial.dispatchEvent(new Event('change')); }
  f.destino_id.addEventListener('change', () => {
    const u = ubis.find(x => String(x.id) === f.destino_id.value);
    if (u && u.responsable_id && !f.receptor_id.value) f.receptor_id.value = u.responsable_id;
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const d = datosForm(f);
    if (sel && String(sel.ubicacion_actual_id) === d.destino_id && String(sel.responsable_actual_id || '') === d.receptor_id) {
      return toast('El destino y el responsable son los actuales', true);
    }
    const btn = $('.sticky-cta .btn', f); btn.disabled = true;
    try {
      const m = await api('POST', '/api/movimientos', d);
      toast(`${m.tipo} registrada · ${m.destino_nombre}`);
      location.hash = '#/herramienta/' + enc(m.codigo);
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  });
};

// INCIDENCIA ----------------------------------------------------------------------
VISTAS.incidencia = async ([ref]) => {
  const [herr, personas] = await Promise.all([GET('/api/herramientas'), GET('/api/personas')]);
  const sel = ref ? await GET('/api/herramientas/' + enc(ref)).catch(() => null) : null;
  const fotos = [];
  app.innerHTML = `
    <form class="form" id="f-inc">
      <div class="form-sec">
        <div class="sec-title"><span class="step">1</span>¿Qué herramienta?</div>
        <select name="herramienta_id" required aria-label="Herramienta">${optHerramientas(herr, sel?.id)}</select>
      </div>
      <div class="form-sec">
        <div class="sec-title"><span class="step">2</span>¿Qué ha pasado?</div>
        <div class="cols">
          <label>Tipo<select name="tipo">${opciones(TIPOS_INC, 'Avería')}</select></label>
          <label>Fecha<input type="date" name="fecha" value="${hoyISO()}" required></label>
        </div>
        <label>Descripción<textarea name="descripcion" required placeholder="Describe el problema y cuándo ha ocurrido"></textarea></label>
        <div>
          <div class="small" style="font-weight:600;color:var(--text-2);margin-bottom:.35rem">Fotografías <span class="hint muted" style="font-weight:450">· hasta 6</span></div>
          <div class="uploader"><label class="add" title="Añadir fotos">${I('image-plus')}<input type="file" id="fotos" accept="image/*" multiple></label><span id="fotos-prev" style="display:contents"></span></div>
        </div>
      </div>
      <div class="form-sec">
        <div class="sec-title"><span class="step">3</span>Prioridad</div>
        <div class="choice four">
          ${PRIORIDADES.map(p => `<label class="t-${tono(p)}"><input type="radio" name="prioridad" value="${p}" ${p === 'Media' ? 'checked' : ''}>${I(TONO[p][1])}<span>${p}</span></label>`).join('')}
        </div>
        <label>Comunicada por<select name="comunicada_por_id" required>${optPersonas(personas, SES.usuario.id, 'Selecciona…')}</select></label>
        <label class="switch">Marcar la herramienta como averiada<input type="checkbox" name="marcar_averiada" checked></label>
      </div>
      <div class="sticky-cta"><button class="btn alarm">${I('triangle-alert')}Registrar incidencia</button></div>
    </form>`;
  const f = $('#f-inc');
  f.tipo.addEventListener('change', () => { f.marcar_averiada.checked = ['Avería', 'Daño', 'Seguridad'].includes(f.tipo.value); });
  $('#fotos').addEventListener('change', async e => {
    for (const file of [...e.target.files].slice(0, 6 - fotos.length)) fotos.push(await leerImagen(file));
    $('#fotos-prev').innerHTML = fotos.map(src => `<img src="${src}" alt="">`).join('');
    e.target.value = '';
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('.sticky-cta .btn', f); btn.disabled = true;
    try {
      const i = await api('POST', '/api/incidencias', { ...datosForm(f), fotos });
      toast('Incidencia enviada. ¡Gracias!');
      location.hash = '#/herramienta/' + enc(i.codigo);
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  });
};

// INCIDENCIAS ---------------------------------------------------------------------
function incidenciaCard(i) {
  return `<div class="card">
    <div style="display:flex;gap:.75rem;align-items:flex-start">
      <span class="tile sm t-${tono(i.prioridad)}">${I(TONO[i.prioridad][1])}</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;gap:.5rem"><a href="#/herramienta/${enc(i.codigo)}" style="color:var(--text);font-weight:650">${esc(i.herramienta_nombre)}</a>${pill(i.prioridad, { icono: false })}</div>
        <div class="xs muted"><span class="code">${esc(i.codigo)}</span> · ${esc(i.tipo)} · ${fechaCorta(i.fecha)} · ${esc(i.comunicada_por_nombre || '—')}</div>
      </div>
    </div>
    <p style="margin:.6rem 0 0">${esc(i.descripcion)}</p>
    ${i.fotos.length ? `<div class="photos">${i.fotos.map(f => `<a href="${esc(f)}" target="_blank"><img src="${esc(f)}" alt="Foto de la incidencia"></a>`).join('')}</div>` : ''}
    <div class="inline-select">${pill(i.estado)}<select data-inc="${i.id}" aria-label="Cambiar estado">${opciones(ESTADOS_I, i.estado)}</select></div>
    ${i.fecha_resolucion ? `<div class="xs muted" style="margin-top:.4rem">Resuelta el ${fmtFecha(i.fecha_resolucion)}</div>` : ''}
  </div>`;
}
function enlazarIncidencias(root, recargar) {
  $$('select[data-inc]', root).forEach(s => s.addEventListener('change', async () => {
    try { await api('PUT', '/api/incidencias/' + s.dataset.inc, { estado: s.value }); toast(`Incidencia: ${s.value}`); recargar(); }
    catch (err) { toast(err.message, true); }
  }));
}

VISTAS.incidencias = async (_, q) => {
  const todas = q.todas === '1';
  const items = await GET('/api/incidencias' + (todas ? '' : '?pendientes=1'));
  $('#appbar-extra').innerHTML = `<a class="icon-btn" href="#/incidencia" aria-label="Nueva incidencia">${I('plus')}</a>`;
  app.innerHTML = `
    <div class="seg" style="margin-top:.25rem">
      <button type="button" class="${!todas ? 'on' : ''}" onclick="location.hash='#/incidencias'">Pendientes</button>
      <button type="button" class="${todas ? 'on' : ''}" onclick="location.hash='#/incidencias?todas=1'">Todas</button>
    </div>
    ${items.length ? stack(items.map(incidenciaCard)) : `<div class="card">${vacio('party-popper', 'Todo en orden', 'No hay incidencias pendientes.')}</div>`}
    <p class="note">${I('info')}<span>Al pasar a «En reparación» la herramienta también cambia de estado; al resolverse todas, vuelve a estar operativa.</span></p>
    <div class="sticky-cta"><a class="btn primary" href="#/incidencia">${I('triangle-alert')}Comunicar incidencia</a></div>`;
  enlazarIncidencias(app, () => VISTAS.incidencias(_, q));
};

// MANTENIMIENTOS ------------------------------------------------------------------
function mantItem(m) {
  const d = diasHasta(m.fecha_prevista);
  const prog = m.estado === 'Programado';
  const c = prog ? (d < 0 ? 'bad' : d <= 7 ? 'rep' : 'use') : tono(m.estado);
  return `<div class="item top">
    <span class="tile sm t-${c}">${I(prog ? (d < 0 ? 'circle-alert' : 'calendar-clock') : TONO[m.estado][1])}</span>
    <div class="body">
      <div style="display:flex;justify-content:space-between;gap:.5rem"><a href="#/herramienta/${enc(m.codigo)}" class="title" style="color:var(--text)">${esc(m.herramienta_nombre)}</a>
        <span class="xs" style="white-space:nowrap;font-weight:600;color:var(--${c})">${prog ? (d < 0 ? 'Vencido' : cuando(m.fecha_prevista)) : esc(m.estado)}</span></div>
      <div class="sub">${esc(m.tipo)} · ${fmtFecha(m.fecha_prevista)}${m.fecha_realizada ? ' → ' + fmtFecha(m.fecha_realizada) : ''}</div>
      <div class="sub">${esc(m.proveedor || 'Sin proveedor')} · ${euros(m.coste)}</div>
      ${m.observaciones ? `<div class="small" style="margin-top:.2rem">${esc(m.observaciones)}</div>` : ''}
      ${prog ? `<button type="button" class="btn sm tonal" data-hecho="${m.id}" style="margin-top:.5rem">${I('check')}Marcar realizado</button>` : ''}
    </div>
  </div>`;
}

async function nuevoMantenimiento(herramientaId) {
  const herr = await GET('/api/herramientas');
  const d = await dialogo('Programar mantenimiento', [
    { name: 'herramienta_id', label: 'Herramienta', type: 'select', required: true, options: optHerramientas(herr, herramientaId) },
    { name: 'tipo', label: 'Tipo', type: 'select', options: opciones(TIPOS_MAN, 'Revisión') },
    { name: 'fecha_prevista', label: 'Fecha prevista', type: 'date', required: true },
    { name: 'proveedor', label: 'Proveedor' },
    { name: 'coste', label: 'Coste estimado (€)', type: 'number', step: '0.01' },
    { name: 'observaciones', label: 'Observaciones', type: 'textarea' },
  ]);
  if (!d) return;
  try { await api('POST', '/api/mantenimientos', d); toast('Mantenimiento programado'); router(); }
  catch (err) { toast(err.message, true); }
}

VISTAS.mantenimientos = async () => {
  const items = await GET('/api/mantenimientos');
  const prog = items.filter(m => m.estado === 'Programado');
  const grupos = [
    ['circle-alert', 'Vencidos', prog.filter(m => diasHasta(m.fecha_prevista) < 0)],
    ['calendar-clock', 'Próximos 30 días', prog.filter(m => diasHasta(m.fecha_prevista) >= 0 && diasHasta(m.fecha_prevista) <= 30)],
    ['calendar-plus', 'Más adelante', prog.filter(m => diasHasta(m.fecha_prevista) > 30)],
    ['history', 'Historial', items.filter(m => m.estado !== 'Programado')],
  ];
  $('#appbar-extra').innerHTML = `<button class="icon-btn" id="btn-nuevo" aria-label="Programar mantenimiento">${I('plus')}</button>`;
  app.innerHTML = grupos.map(([ic, t, arr]) => arr.length ? `<h2>${I(ic)} ${t} <span style="margin-left:auto">${arr.length}</span></h2>
      <div class="group">${arr.map(mantItem).join('')}</div>` : '').join('') +
    (!prog.length ? `<div class="card">${vacio('calendar-check', 'Nada programado')}</div>` : '');
  $('#btn-nuevo').addEventListener('click', () => nuevoMantenimiento());
  $$('[data-hecho]').forEach(b => b.addEventListener('click', async () => {
    const m = items.find(x => String(x.id) === b.dataset.hecho);
    const d = await dialogo(`Mantenimiento realizado`, [
      { name: 'fecha_realizada', label: 'Fecha realizada', type: 'date', required: true, default: hoyISO() },
      { name: 'proveedor', label: 'Proveedor' },
      { name: 'coste', label: 'Coste final (€)', type: 'number', step: '0.01' },
      { name: 'estado', label: 'Estado', type: 'select', options: opciones(ESTADOS_MAN, 'Realizado') },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea' },
    ], m);
    if (!d) return;
    try { await api('PUT', '/api/mantenimientos/' + m.id, d); toast('Mantenimiento actualizado'); VISTAS.mantenimientos(); }
    catch (err) { toast(err.message, true); }
  }));
};

// HISTORIAL -----------------------------------------------------------------------
VISTAS.movimientos = async () => {
  const items = await GET('/api/movimientos?limite=300');
  app.innerHTML = `
    <p class="note" style="margin-top:0">${I('lock')}<span>Registro permanente: los movimientos no se pueden modificar ni borrar.</span></p>
    <div class="card" style="margin-top:.75rem"><ul class="timeline">${items.map(m => movNodo(m, true)).join('')}</ul></div>`;
};

// UBICACIONES ---------------------------------------------------------------------
VISTAS.ubicaciones = async () => {
  const [ubis, personas] = await Promise.all([GET('/api/ubicaciones'), GET('/api/personas')]);
  $('#appbar-extra').innerHTML = `<button class="icon-btn" data-edit="" aria-label="Nueva ubicación">${I('plus')}</button>`;
  const porTipo = TIPOS_UBI.map(t => [t, ubis.filter(u => u.tipo === t)]).filter(([, a]) => a.length);
  app.innerHTML = porTipo.map(([t, arr]) => `
    <h2>${I(ICON_UBI[t])} ${t}</h2>
    <div class="group">${arr.map(u => `
      <button type="button" class="item" data-edit="${u.id}">
        <span class="tile sm ${u.estado === 'Cerrada' ? 't-off' : 't-pri'}">${I(ICON_UBI[u.tipo] || 'map-pin')}</span>
        <div class="body"><div class="title">${esc(u.nombre)}</div>
          <div class="sub">${esc(u.responsable_nombre || 'Sin responsable')}${u.direccion ? ' · ' + esc(u.direccion) : ''}</div></div>
        <div class="trail">${u.estado === 'Cerrada' ? pill('Cerrada', { icono: false }) : `<b class="num" style="color:var(--text)">${u.num_herramientas}</b>`}${I('chevron-right', 'chev')}</div>
      </button>`).join('')}</div>`).join('');
  $$('[data-edit]').forEach(b => b.addEventListener('click', async () => {
    const u = ubis.find(x => String(x.id) === b.dataset.edit) || { tipo: 'Obra', estado: 'Activa' };
    const d = await dialogo(u.id ? u.nombre : 'Nueva ubicación', [
      { name: 'nombre', label: 'Nombre', required: true },
      { name: 'tipo', label: 'Tipo', type: 'select', options: opciones(TIPOS_UBI, u.tipo) },
      { name: 'direccion', label: 'Dirección' },
      { name: 'responsable_id', label: 'Responsable', type: 'select', options: optPersonas(personas, u.responsable_id) },
      { name: 'estado', label: 'Estado', type: 'select', options: opciones(['Activa', 'Cerrada'], u.estado) },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea' },
    ], u);
    if (!d) return;
    try {
      if (u.id) await api('PUT', '/api/ubicaciones/' + u.id, d); else await api('POST', '/api/ubicaciones', d);
      toast('Ubicación guardada'); VISTAS.ubicaciones();
    } catch (err) { toast(err.message, true); }
  }));
};

// PERSONAS ------------------------------------------------------------------------
VISTAS.personas = async () => {
  const personas = await GET('/api/personas');
  $('#appbar-extra').innerHTML = `<button class="icon-btn" data-edit="" aria-label="Nueva persona">${I('plus')}</button>`;
  app.innerHTML = `<div class="group" style="margin-top:.25rem">${personas.map(p => `
    <div class="item">
      ${avatar(p)}
      <div class="body"><div class="title">${esc(persona(p))}</div>
        <div class="sub">${esc(p.cargo || '—')} · <a href="#/herramientas?responsable=${p.id}">${p.num_herramientas} herramienta${p.num_herramientas === 1 ? '' : 's'}</a></div>
        <div class="xs muted" style="display:flex;gap:.6rem;margin-top:.15rem">${p.tiene_acceso ? `<span>${I('key-round')} Acceso a la app</span>` : `<span>${I('lock')} Sin acceso</span>`}${p.estado === 'Inactivo' ? pill('Inactivo', { icono: false }) : ''}</div></div>
      <div class="trail">
        ${p.telefono ? `<a class="icon-btn" href="tel:${esc(p.telefono.replace(/\s/g, ''))}" aria-label="Llamar">${I('phone')}</a>` : ''}
        <button type="button" class="icon-btn" data-edit="${p.id}" aria-label="Editar">${I('pencil')}</button>
      </div>
    </div>`).join('')}</div>`;
  $$('[data-edit]').forEach(b => b.addEventListener('click', async () => {
    const p = personas.find(x => String(x.id) === b.dataset.edit) || { estado: 'Activo' };
    const d = await dialogo(p.id ? persona(p) : 'Nueva persona', [
      { name: 'nombre', label: 'Nombre', required: true },
      { name: 'apellidos', label: 'Apellidos' },
      { name: 'telefono', label: 'Teléfono', type: 'tel' },
      { name: 'email', label: 'Email (usuario de acceso)', type: 'email' },
      { name: 'cargo', label: 'Cargo' },
      { name: 'estado', label: 'Estado', type: 'select', options: opciones(['Activo', 'Inactivo'], p.estado) },
      { name: 'password', label: p.id ? 'Nueva contraseña (vacío = sin cambios)' : 'Contraseña (opcional)', type: 'password', placeholder: '••••' },
    ], p);
    if (!d) return;
    try {
      if (p.id) await api('PUT', '/api/personas/' + p.id, d); else await api('POST', '/api/personas', d);
      toast('Persona guardada'); VISTAS.personas();
    } catch (err) { toast(err.message, true); }
  }));
};

// ETIQUETAS QR --------------------------------------------------------------------
VISTAS.etiquetas = async (_, q) => {
  const herr = await GET('/api/herramientas');
  const ids = (q.ids || '').split(',').filter(Boolean);
  const formatos = {
    'a4-pequena': { nombre: 'A4 · 48 × 25 mm', w: 48, h: 25, cols: 3, rows: 10 },
    'a4-mediana': { nombre: 'A4 · 60 × 40 mm', w: 60, h: 40, cols: 3, rows: 6 },
    'a4-grande': { nombre: 'A4 · 90 × 60 mm', w: 90, h: 60, cols: 2, rows: 4 },
    'rollo50': { nombre: 'Térmica · 50 × 30 mm', w: 50, h: 30, cols: 1, rows: 1, roll: true },
    'rollo100': { nombre: 'Térmica · 100 × 50 mm', w: 100, h: 50, cols: 1, rows: 1, roll: true },
  };
  app.innerHTML = `
    <div class="no-print card label-settings">
      <h3>Preparar etiquetas QR</h3>
      <label>Formato de impresión<select id="label-format">${Object.entries(formatos).map(([key, f]) => `<option value="${key}" ${key === 'a4-mediana' ? 'selected' : ''}>${f.nombre}</option>`).join('')}</select></label>
      <label>Al escanear<select id="label-action"><option value="h">Abrir ficha</option><option value="m" ${q.tipo === 'm' ? 'selected' : ''}>Registrar movimiento</option><option value="i">Comunicar incidencia</option></select></label>
      <label>Contenido<select id="label-content"><option value="completa">QR, código y nombre</option><option value="qr" ${q.contenido === 'qr' ? 'selected' : ''}>Solo QR (ocupa menos)</option></select></label>
      <label>Copias por herramienta<input id="label-copies" type="number" min="1" max="50" value="1"></label>
      <details><summary>Seleccionar herramientas (<span id="label-selected"></span>)</summary>
        <div class="label-selection-actions"><button type="button" class="btn sm tonal" id="label-all">Todas</button><button type="button" class="btn sm ghost" id="label-none">Ninguna</button></div>
        <div class="label-selection">${herr.map(h => `<label><input type="checkbox" value="${h.id}" ${!ids.length || ids.includes(String(h.id)) ? 'checked' : ''}> <span>${esc(h.codigo)} · ${esc(h.nombre)}</span></label>`).join('')}</div>
      </details>
      <p class="small muted">${window.Android ? 'Escanea estas etiquetas desde el lector de esta app. Los datos de la herramienta deben existir en este dispositivo.' : 'Escanea con el lector de la app. Para abrir el enlace con otra cámara, la dirección de la web debe ser accesible desde el móvil.'}</p>
      <p class="small muted" id="label-help"></p>
    </div>
    <p id="label-summary" class="no-print small muted" role="status"></p>
    <style id="label-page-style"></style><div id="label-preview"></div>
    <div class="sticky-cta no-print"><button type="button" id="label-print" class="btn primary">${I('printer')}Imprimir / Guardar PDF</button></div>`;
  const render = () => {
    const f = formatos[$('#label-format').value];
    const copies = Number($('#label-copies').value);
    const checked = new Set($$('.label-selection input:checked').map(el => el.value));
    const selected = herr.filter(h => checked.has(String(h.id)));
    $('#label-selected').textContent = selected.length;
    const valid = Number.isInteger(copies) && copies >= 1 && copies <= 50;
    $('#label-print').disabled = !valid || !selected.length;
    $('#label-help').textContent = f.roll
      ? 'Una etiqueta por página. Selecciona el mismo tamaño en la impresora térmica, sin márgenes y al 100 %. La impresora debe estar disponible en el servicio de impresión de Android o del ordenador.'
      : 'Hojas A4 con margen exterior de 10 mm y separación de 2 mm. Imprime al 100 %, sin ajustar a página ni encabezados. Comprueba que las medidas coincidan con tu papel adhesivo.';
    $('#label-page-style').textContent = `@media print { @page { size: ${f.roll ? f.w + 'mm ' + f.h + 'mm' : 'A4 portrait'}; margin: 0; } }`;
    if (!valid || !selected.length) {
      $('#label-preview').innerHTML = '';
      $('#label-summary').textContent = !valid ? 'Indica entre 1 y 50 copias.' : 'Selecciona al menos una herramienta.';
      return;
    }
    const labels = selected.flatMap(h => Array.from({ length: copies }, () => h));
    const perPage = f.cols * f.rows;
    const pages = [];
    const tipo = $('#label-action').value;
    const qrCache = new Map(selected.map(h => [h.id, svgQR(urlQR(h, tipo))]));
    const soloQR = $('#label-content').value === 'qr';
    const qrMm = soloQR ? Math.min(f.w, f.h) - 2 : Math.min(f.h - 4, f.w * .48);
    for (let i = 0; i < labels.length; i += perPage) {
      pages.push(`<section class="label-sheet ${f.roll ? 'label-roll' : ''} ${soloQR ? 'label-only-qr' : ''}" style="--label-w:${f.w}mm;--label-h:${f.h}mm;--label-qr:${qrMm}mm;--label-cols:${f.cols}">
        ${labels.slice(i, i + perPage).map(h => soloQR
          ? `<div class="label-qr" title="${esc(h.codigo)} · ${esc(h.nombre)}">${qrCache.get(h.id)}</div>`
          : `<div class="label-qr">${qrCache.get(h.id)}
          <div class="label-text"><div class="c">${esc(h.codigo)}</div><div class="n">${esc(h.nombre)}</div><div class="n">${esc(h.marca || '')}</div></div>
        </div>`).join('')}</section>`);
    }
    $('#label-preview').innerHTML = pages.join('');
    $('#label-summary').textContent = `${labels.length} etiquetas · ${pages.length} ${f.roll ? 'páginas' : 'hojas A4'} · ${f.w} × ${f.h} mm${soloQR ? ` · solo QR de ${qrMm} mm` : ''}`;
  };
  $('.label-settings').addEventListener('change', render);
  $('#label-copies').addEventListener('input', render);
  $('#label-all').onclick = () => { $$('.label-selection input').forEach(el => el.checked = true); render(); };
  $('#label-none').onclick = () => { $$('.label-selection input').forEach(el => el.checked = false); render(); };
  $('#label-print').onclick = () => { render(); if (!$('#label-print').disabled) window.print(); };
  render();
};

// ------------------------------------------------------------------- router
const ALIAS = { '': 'inicio', herramientas: 'buscar', inventario: 'buscar', dashboard: 'panel' };
let navegaciones = 0;

async function router() {
  cerrarMenu();
  $$('dialog[open]').forEach(d => d.close());
  if (!SES.token) return VISTAS.login();
  document.body.classList.remove('sin-sesion');

  const hash = location.hash.replace(/^#\/?/, '');
  const [ruta, qs = ''] = hash.split('?');
  const partes = ruta.split('/').filter(Boolean).map(decodeURIComponent);
  let nombre = ALIAS[partes[0] || ''] ?? partes[0];
  partes.shift();
  if (!VISTAS[nombre] || nombre === 'login') nombre = 'inicio';
  const q = Object.fromEntries(new URLSearchParams(qs));

  // Barra superior: atrás en pantallas de detalle, menú en las principales
  const detalle = DETALLE.has(nombre);
  $('#btn-nav').innerHTML = I(detalle ? 'arrow-left' : 'menu');
  $('#btn-nav').setAttribute('aria-label', detalle ? 'Volver' : 'Abrir menú');
  $('#btn-nav').dataset.modo = detalle ? 'atras' : 'menu';
  $('#appbar-extra').innerHTML = '';
  setTitulo(TITULOS[nombre] || 'Inventario');
  const activo = nombre === 'incidencia' ? 'incidencias' : nombre;
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === activo));

  window.scrollTo(0, 0);
  app.classList.remove('enter');
  app.innerHTML = skeleton();
  try { await VISTAS[nombre](partes, q); }
  catch (err) {
    if (!SES.token) return;
    app.innerHTML = `<div class="card">${vacio('circle-alert', 'No se pudo cargar', err.message)}<a class="btn tonal block" href="#/">Volver al inicio</a></div>`;
  }
  void app.offsetWidth;
  app.classList.add('enter');
}

// Navegación y menú
function abrirMenu() { $('#drawer').classList.add('open'); $('#scrim').hidden = false; }
function cerrarMenu() { $('#drawer').classList.remove('open'); $('#scrim').hidden = true; }
$('#btn-nav').addEventListener('click', () => {
  if ($('#btn-nav').dataset.modo === 'atras') { if (navegaciones > 1) history.back(); else location.hash = '#/'; }
  else abrirMenu();
});
$('#btn-mas').addEventListener('click', abrirMenu);
$('#btn-scan-tab').addEventListener('click', escanearQR);
$('#btn-user').addEventListener('click', abrirMenu);
$('#scrim').addEventListener('click', cerrarMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarMenu(); });
$('#btn-logout').addEventListener('click', async () => {
  await api('POST', '/api/logout').catch(() => {});
  SES.borrar();
  history.replaceState(null, '', '#/');
  router();
});
window.addEventListener('hashchange', () => { navegaciones++; router(); });
window.addEventListener('scroll', () => $('#appbar').classList.toggle('scrolled', window.scrollY > 4), { passive: true });

// Iconos estáticos del HTML
$$('i[data-i]').forEach(el => { el.outerHTML = I(el.dataset.i); });

SES.cargar();
pintarUsuario();
navegaciones = 1;
GET('/api/config').then(c => (CONFIG = c)).catch(() => {}).finally(router);

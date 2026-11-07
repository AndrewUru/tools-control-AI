// APK conectada al servidor común. Se carga antes de app.js y envuelve fetch:
//  - las llamadas /api/ van al servidor (HTTPS, con CORS);
//  - lo consultado se guarda en el móvil para poder verlo sin cobertura;
//  - sin cobertura, los movimientos e incidencias quedan en cola y se envían al volver la señal.
//    Cada registro lleva un uuid: si un envío se repite, el servidor no lo duplica.
(() => {
  const SERVIDOR = '__SERVIDOR__';
  window.SERVIDOR = SERVIDOR;
  const fetchReal = window.fetch.bind(window);
  const COLA = 'cola-envios';
  const ENCOLABLES = new Set(['/api/movimientos', '/api/incidencias']);

  const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
  const guardar = (k, v) => localStorage.setItem(k, JSON.stringify(v));   // puede lanzar si no hay espacio
  const respuesta = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Android.randomHex(16));
  const ahoraLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const token = () => { try { return SES.token; } catch { return null; } };   // SES vive en app.js

  // Fotos: las rutas /uploads/ del servidor pasan a ser absolutas
  const absolutas = v => typeof v === 'string' ? (v.startsWith('/uploads/') ? SERVIDOR + v : v)
    : Array.isArray(v) ? v.map(absolutas)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, absolutas(x)])) : v;

  // Copia local de lo consultado ----------------------------------------------------
  const clave = ruta => 'c:' + ruta;
  function limpiarCache() {
    try { Object.keys(localStorage).filter(k => k.startsWith('c:')).forEach(k => localStorage.removeItem(k)); } catch { /* nada */ }
  }
  const listaHerramientas = () => leer(clave('/api/herramientas?retiradas=1'), null) || leer(clave('/api/herramientas'), []);
  function desdeCache(ruta) {
    const c = leer(clave(ruta), null);
    if (c) return c;
    // Ficha nunca abierta (p. ej. al escanear un QR en la obra): se arma con la lista de herramientas
    const m = /^\/api\/herramientas\/([^/?]+)$/.exec(ruta);
    if (m) {
      const ref = decodeURIComponent(m[1]).toLowerCase();
      const h = listaHerramientas().find(x => x.codigo.toLowerCase() === ref || x.qr_token === ref || String(x.id) === ref);
      if (h) return { ...h, movimientos: [], incidencias: [], mantenimientos: [] };
    }
    return null;
  }
  async function precargar() {
    // Lo necesario para trabajar sin cobertura: lista de herramientas, ubicaciones y personas
    for (const ruta of ['/api/herramientas?retiradas=1', '/api/herramientas', '/api/ubicaciones', '/api/personas']) {
      try { await window.fetch(ruta, { headers: { Authorization: 'Bearer ' + token() } }); } catch { return; }
    }
  }

  // Indicador de estado -------------------------------------------------------------
  let sinConexion = false;
  const aviso = document.createElement('div');
  aviso.id = 'estado-red';
  aviso.setAttribute('role', 'status');
  aviso.hidden = true;
  const estilo = document.createElement('style');
  estilo.textContent = `#estado-red { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(84px + env(safe-area-inset-bottom));
    z-index: 40; background: #3b3f46; color: #fff; font: 600 .78rem/1.2 Inter, system-ui, sans-serif; padding: .45rem .8rem;
    border-radius: 999px; box-shadow: 0 4px 14px rgba(0,0,0,.2); white-space: nowrap; }
    body.sin-sesion #estado-red { bottom: 16px; } @media print { #estado-red { display: none !important; } }`;
  document.head.appendChild(estilo);
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(aviso));
  function pintar() {
    const n = leer(COLA, []).length;
    const partes = [];
    if (sinConexion) partes.push('Sin conexión');
    if (n) partes.push(`${n} pendiente${n === 1 ? '' : 's'} de enviar`);
    aviso.textContent = partes.join(' · ');
    aviso.hidden = !partes.length;
  }
  function marcar(offline) { if (sinConexion !== offline) { sinConexion = offline; pintar(); } }

  // Cola de envíos ------------------------------------------------------------------
  function encolar(path, datos) {
    const cola = leer(COLA, []);
    const item = { path, datos, creado: Date.now() };
    try { guardar(COLA, [...cola, item]); }
    catch {
      if (!datos.fotos?.length) return respuesta({ error: 'No queda espacio en el móvil para guardarlo sin conexión' }, 507);
      try { guardar(COLA, [...cola, { ...item, datos: { ...datos, fotos: [] } }]); }
      catch { return respuesta({ error: 'No queda espacio en el móvil para guardarlo sin conexión' }, 507); }
    }
    pintar();
    // Respuesta provisional con lo que la pantalla necesita para continuar
    const h = listaHerramientas().find(x => String(x.id) === String(datos.herramienta_id));
    const u = leer(clave('/api/ubicaciones'), []).find(x => String(x.id) === String(datos.destino_id));
    return respuesta({ ...datos, pendiente: true, codigo: h?.codigo ?? String(datos.herramienta_id),
      herramienta_nombre: h?.nombre, destino_nombre: u?.nombre || 'destino' });
  }

  let enviando = false;
  async function sincronizar() {
    if (enviando || !leer(COLA, []).length || !token()) return;
    enviando = true;
    const rechazados = [];
    let enviados = 0;
    try {
      while (leer(COLA, []).length) {
        const [item] = leer(COLA, []);
        let r;
        try {
          r = await fetchReal(SERVIDOR + item.path, {
            method: 'POST', body: JSON.stringify(item.datos),
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
          });
        } catch { marcar(true); break; }
        marcar(false);
        if (r.status === 401) break;            // sesión caducada: se reintenta tras volver a entrar
        if (r.ok) enviados++;
        else if (r.status >= 500) break;        // fallo del servidor: se reintenta más tarde
        else rechazados.push((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
        guardar(COLA, leer(COLA, []).slice(1));
      }
    } finally {
      enviando = false;
      pintar();
      if (typeof toast === 'function') {
        if (rechazados.length) toast(`${rechazados.length} registro${rechazados.length === 1 ? '' : 's'} sin conexión no se aceptaron: ${rechazados[0]}`, true);
        else if (enviados) toast(`${enviados} registro${enviados === 1 ? '' : 's'} enviado${enviados === 1 ? '' : 's'}`);
      }
    }
  }
  window.sincronizarPendientes = sincronizar;

  // fetch -----------------------------------------------------------------------------
  window.fetch = async (input, opts = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return fetchReal(input, opts);
    const ruta = url.pathname + url.search;
    const metodo = (opts.method || 'GET').toUpperCase();
    let body = opts.body;
    const encolable = metodo === 'POST' && ENCOLABLES.has(url.pathname);
    let datos;
    if (encolable) {
      datos = JSON.parse(body || '{}');
      datos.uuid = datos.uuid || uuid();
      if (url.pathname === '/api/movimientos' && !datos.fecha_hora) datos.fecha_hora = ahoraLocal();   // hora real del registro
      body = JSON.stringify(datos);
    }
    let r;
    try { r = await fetchReal(SERVIDOR + ruta, { ...opts, body }); }
    catch {
      marcar(true);
      if (encolable) return encolar(url.pathname, datos);
      if (metodo === 'GET') { const c = desdeCache(ruta); if (c) return respuesta(absolutas(c)); }
      throw new TypeError('Sin conexión');
    }
    marcar(false);
    const data = await r.json().catch(() => ({}));
    if (r.ok && metodo === 'GET') { try { guardar(clave(ruta), data); } catch { /* sin espacio: sin copia */ } }
    if (r.ok && (url.pathname === '/api/login' || url.pathname === '/api/logout')) limpiarCache();
    if (r.ok && url.pathname === '/api/login') setTimeout(() => { sincronizar(); precargar(); }, 500);
    if (r.ok && encolable) setTimeout(sincronizar, 0);
    return respuesta(absolutas(data), r.status);
  };

  window.addEventListener('online', () => sincronizar());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
  setInterval(sincronizar, 30000);
  setTimeout(() => { pintar(); sincronizar(); if (token()) precargar(); }, 1500);
  if (window.Android) window.print = () => Android.print(document.querySelector('#label-format')?.value || 'a4-mediana');
})();

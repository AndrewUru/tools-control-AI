// Inventario de herramientas - servidor HTTP sin dependencias externas (Node >= 22.13)
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword, verificarPassword } = require('./db/auth');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'data', 'inventario.db');
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(ROOT, 'uploads');

// ---------------------------------------------------------------------------
// Base de datos
// ---------------------------------------------------------------------------
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
// Migración: bases de datos creadas antes de añadir el login
const colsPersonas = db.prepare(`PRAGMA table_info(personas)`).all().map(c => c.name);
if (colsPersonas.length && !colsPersonas.includes('password_hash')) db.exec(`ALTER TABLE personas ADD COLUMN password_hash TEXT`);
db.exec(fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8'));
db.exec(`DELETE FROM sesiones WHERE expira_en < datetime('now','localtime')`);

const vacia = db.prepare('SELECT COUNT(*) AS n FROM herramientas').get().n === 0;
if (vacia && process.env.NO_SEED !== '1') {
  db.exec('BEGIN');
  try { require('./db/seed')(db); db.exec('COMMIT'); console.log('Datos de ejemplo cargados.'); }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function ahora() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const hoy = () => ahora().slice(0, 10);

// Normaliza un valor de formulario para SQLite
function val(v) {
  if (v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return v;
}

function pick(body, campos) {
  const o = {};
  for (const c of campos) if (Object.prototype.hasOwnProperty.call(body, c)) o[c] = val(body[c]);
  return o;
}

function insertar(tabla, datos) {
  const cols = Object.keys(datos);
  if (!cols.length) throw new HttpError(400, 'Sin datos');
  const r = run(`INSERT INTO ${tabla} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    ...cols.map(c => datos[c]));
  return Number(r.lastInsertRowid);
}

function actualizar(tabla, id, datos) {
  const cols = Object.keys(datos);
  if (!cols.length) return;
  const r = run(`UPDATE ${tabla} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
    ...cols.map(c => datos[c]), id);
  if (!r.changes) throw new HttpError(404, 'No encontrado');
}

// Guarda una imagen enviada como data URL (base64) y devuelve su ruta pública
function guardarImagen(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  if (dataUrl.startsWith('/uploads/')) return dataUrl; // ya guardada
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, 'Formato de imagen no válido');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) throw new HttpError(413, 'Imagen demasiado grande');
  const nombre = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, nombre), buf);
  return `/uploads/${nombre}`;
}

// Busca una herramienta por id, código interno o token QR
function buscarHerramienta(ref) {
  const h = get(`SELECT * FROM v_herramientas WHERE codigo = ? COLLATE NOCASE OR qr_token = ? OR id = ?`,
    ref, ref, /^\d+$/.test(ref) ? Number(ref) : -1);
  if (!h) throw new HttpError(404, `Herramienta "${ref}" no encontrada`);
  return h;
}

function ipLocal() {
  for (const lista of Object.values(os.networkInterfaces()))
    for (const i of lista || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  return 'localhost';
}
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://${ipLocal()}:${PORT}`).replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Campos editables por tabla
// ---------------------------------------------------------------------------
const CAMPOS = {
  personas: ['nombre', 'apellidos', 'telefono', 'email', 'cargo', 'estado'],
  ubicaciones: ['nombre', 'tipo', 'direccion', 'responsable_id', 'estado', 'observaciones'],
  // ubicacion_actual_id / responsable_actual_id solo se fijan en el alta; luego cambian vía movimientos
  herramientas: ['codigo', 'nombre', 'categoria', 'marca', 'modelo', 'numero_serie', 'estado',
    'fecha_compra', 'precio_compra', 'observaciones'],
  incidencias: ['herramienta_id', 'fecha', 'comunicada_por_id', 'tipo', 'descripcion', 'prioridad', 'estado', 'fecha_resolucion'],
  mantenimientos: ['herramienta_id', 'tipo', 'fecha_prevista', 'fecha_realizada', 'proveedor', 'coste', 'estado', 'observaciones'],
};

const PREFIJOS = {
  Taladros: 'TAL', Radiales: 'RAD', Escaleras: 'ESC', Atornilladores: 'ATO',
  Maquinaria: 'MAQ', 'Medición': 'MED', Andamios: 'AND', Otros: 'OTR',
};

function siguienteCodigo(prefijo) {
  prefijo = String(prefijo || 'OTR').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'OTR';
  const filas = all(`SELECT codigo FROM herramientas WHERE codigo LIKE ?`, `${prefijo}-%`);
  const max = filas.reduce((m, r) => Math.max(m, parseInt(r.codigo.split('-')[1], 10) || 0), 0);
  return `${prefijo}-${String(max + 1).padStart(3, '0')}`;
}

// Tras cambiar una incidencia, sincroniza el estado de la herramienta
function sincronizarEstadoPorIncidencias(herramientaId) {
  const h = get(`SELECT estado FROM herramientas WHERE id = ?`, herramientaId);
  if (!h || h.estado === 'Retirada') return;
  const abiertas = all(`SELECT estado FROM incidencias WHERE herramienta_id = ? AND estado <> 'Resuelta'`, herramientaId);
  if (abiertas.some(i => i.estado === 'En reparación')) {
    run(`UPDATE herramientas SET estado = 'En reparación' WHERE id = ?`, herramientaId);
  } else if (!abiertas.length && ['Averiada', 'En reparación'].includes(h.estado)) {
    // Sin incidencias pendientes: vuelve a estar operativa
    const enAlmacen = get(`SELECT u.tipo FROM herramientas h LEFT JOIN ubicaciones u ON u.id = h.ubicacion_actual_id WHERE h.id = ?`, herramientaId);
    const nuevo = enAlmacen && enAlmacen.tipo === 'Almacén' ? 'Disponible' : 'En uso';
    run(`UPDATE herramientas SET estado = ? WHERE id = ?`, nuevo, herramientaId);
  }
}

const parseFotos = i => ({ ...i, fotos: JSON.parse(i.fotos || '[]') });

const SQL_MOV = `
  SELECT m.*, h.codigo, h.nombre AS herramienta_nombre,
         uo.nombre AS origen_nombre, ud.nombre AS destino_nombre,
         NULLIF(TRIM(COALESCE(pr.nombre,'')||' '||COALESCE(pr.apellidos,'')),'') AS realizado_por_nombre,
         NULLIF(TRIM(COALESCE(pc.nombre,'')||' '||COALESCE(pc.apellidos,'')),'') AS receptor_nombre
    FROM movimientos m
    JOIN herramientas h ON h.id = m.herramienta_id
    LEFT JOIN ubicaciones uo ON uo.id = m.origen_id
    LEFT JOIN ubicaciones ud ON ud.id = m.destino_id
    LEFT JOIN personas pr ON pr.id = m.realizado_por_id
    LEFT JOIN personas pc ON pc.id = m.receptor_id`;

const SQL_INC = `
  SELECT i.*, h.codigo, h.nombre AS herramienta_nombre, h.estado AS herramienta_estado,
         NULLIF(TRIM(COALESCE(p.nombre,'')||' '||COALESCE(p.apellidos,'')),'') AS comunicada_por_nombre
    FROM incidencias i
    JOIN herramientas h ON h.id = i.herramienta_id
    LEFT JOIN personas p ON p.id = i.comunicada_por_id`;

const ORDEN_PRIORIDAD = `CASE i.prioridad WHEN 'Urgente' THEN 0 WHEN 'Alta' THEN 1 WHEN 'Media' THEN 2 ELSE 3 END`;

const SQL_MAN = `
  SELECT m.*, h.codigo, h.nombre AS herramienta_nombre, u.nombre AS ubicacion_nombre
    FROM mantenimientos m
    JOIN herramientas h ON h.id = m.herramienta_id
    LEFT JOIN ubicaciones u ON u.id = h.ubicacion_actual_id`;

// ---------------------------------------------------------------------------
// Rutas de la API
// ---------------------------------------------------------------------------
const rutas = [];
const ruta = (metodo, patron, fn) => {
  const claves = [];
  const re = new RegExp('^' + patron.replace(/:(\w+)/g, (_, k) => { claves.push(k); return '([^/]+)'; }) + '$');
  rutas.push({ metodo, re, claves, fn });
};

// Autenticación ---------------------------------------------------------------
const DEMO = process.env.DEMO !== '0';   // muestra accesos rápidos en la pantalla de login
const RUTAS_PUBLICAS = new Set(['/api/config', '/api/login', '/api/demo-usuarios']);
const SQL_USUARIO = `SELECT id, nombre, apellidos, email, cargo, telefono FROM personas`;

function usuarioDeSesion(req) {
  const m = /^Bearer\s+([a-f0-9]{48})$/i.exec(req.headers.authorization || '');
  if (!m) return null;
  return get(`${SQL_USUARIO.replace('FROM personas', 'FROM sesiones s JOIN personas ON personas.id = s.persona_id')}
     WHERE s.token = ? AND s.expira_en > datetime('now','localtime') AND personas.estado = 'Activo'`, m[1]) || null;
}

ruta('GET', '/api/config', () => ({ publicUrl: PUBLIC_URL, prefijos: PREFIJOS, demo: DEMO }));

ruta('GET', '/api/demo-usuarios', () => DEMO
  ? all(`SELECT nombre, apellidos, email, cargo FROM personas WHERE estado = 'Activo' AND password_hash IS NOT NULL ORDER BY nombre LIMIT 6`)
  : []);

ruta('POST', '/api/login', (q, p, body) => {
  const email = String(body.email || '').trim().toLowerCase();
  const fila = get(`SELECT id, password_hash, estado FROM personas WHERE lower(email) = ?`, email);
  if (!fila || fila.estado !== 'Activo' || !verificarPassword(body.password || '', fila.password_hash)) {
    throw new HttpError(401, 'Email o contraseña incorrectos');
  }
  const token = crypto.randomBytes(24).toString('hex');
  run(`INSERT INTO sesiones (token, persona_id, expira_en) VALUES (?, ?, datetime('now','localtime','+30 days'))`, token, fila.id);
  return { token, usuario: get(`${SQL_USUARIO} WHERE id = ?`, fila.id) };
});

ruta('POST', '/api/logout', (q, p, b, usuario, req) => {
  const m = /^Bearer\s+(\w+)$/i.exec(req.headers.authorization || '');
  if (m) run(`DELETE FROM sesiones WHERE token = ?`, m[1]);
  return { ok: true };
});

ruta('GET', '/api/yo', (q, p, b, usuario) => usuario);

ruta('GET', '/api/dashboard', () => {
  const c = get(`SELECT COUNT(*) AS total,
      SUM(estado='Disponible') AS disponibles, SUM(estado='En uso') AS en_uso,
      SUM(estado='Averiada') AS averiadas, SUM(estado='En reparación') AS en_reparacion,
      SUM(estado='Retirada') AS retiradas FROM herramientas`);
  c.incidencias_abiertas = get(`SELECT COUNT(*) AS n FROM incidencias WHERE estado <> 'Resuelta'`).n;
  c.mantenimientos_vencidos = get(`SELECT COUNT(*) AS n FROM mantenimientos WHERE estado='Programado' AND fecha_prevista < ?`, hoy()).n;
  return {
    indicadores: c,
    ultimos_movimientos: all(`${SQL_MOV} ORDER BY m.fecha_hora DESC, m.id DESC LIMIT 8`),
    incidencias: all(`${SQL_INC} WHERE i.estado <> 'Resuelta' ORDER BY ${ORDEN_PRIORIDAD}, i.fecha LIMIT 6`).map(parseFotos),
    mantenimientos: all(`${SQL_MAN} WHERE m.estado='Programado' ORDER BY m.fecha_prevista LIMIT 6`),
    por_ubicacion: all(`SELECT u.id, u.nombre, u.tipo, COUNT(h.id) AS n FROM ubicaciones u
      JOIN herramientas h ON h.ubicacion_actual_id = u.id AND h.estado <> 'Retirada'
      GROUP BY u.id ORDER BY n DESC`),
  };
});

// Herramientas -------------------------------------------------------------
ruta('GET', '/api/herramientas', (q) => {
  const w = [], p = [];
  if (q.q) {
    w.push(`(codigo LIKE ? OR nombre LIKE ? OR marca LIKE ? OR modelo LIKE ? OR numero_serie LIKE ?
             OR categoria LIKE ? OR ubicacion_nombre LIKE ? OR responsable_nombre LIKE ?)`);
    p.push(...Array(8).fill(`%${q.q}%`));
  }
  if (q.estado) { w.push('estado = ?'); p.push(q.estado); }
  if (q.categoria) { w.push('categoria = ?'); p.push(q.categoria); }
  if (q.ubicacion) { w.push('ubicacion_actual_id = ?'); p.push(Number(q.ubicacion)); }
  if (q.responsable) { w.push('responsable_actual_id = ?'); p.push(Number(q.responsable)); }
  if (!q.estado && q.retiradas !== '1') w.push(`estado <> 'Retirada'`);
  return all(`SELECT * FROM v_herramientas ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY codigo`, ...p);
});

ruta('GET', '/api/herramientas/:ref', (q, p) => {
  const h = buscarHerramienta(decodeURIComponent(p.ref));
  return {
    ...h,
    movimientos: all(`${SQL_MOV} WHERE m.herramienta_id = ? ORDER BY m.fecha_hora DESC, m.id DESC`, h.id),
    incidencias: all(`${SQL_INC} WHERE i.herramienta_id = ? ORDER BY i.fecha DESC, i.id DESC`, h.id).map(parseFotos),
    mantenimientos: all(`${SQL_MAN} WHERE m.herramienta_id = ? ORDER BY m.fecha_prevista DESC`, h.id),
  };
});

ruta('GET', '/api/siguiente-codigo', (q) => ({ codigo: siguienteCodigo(q.prefijo || PREFIJOS[q.categoria]) }));

ruta('POST', '/api/herramientas', (q, p, body) => tx(() => {
  const d = pick(body, CAMPOS.herramientas);
  if (!d.nombre) throw new HttpError(400, 'El nombre es obligatorio');
  d.codigo = (d.codigo || siguienteCodigo(PREFIJOS[d.categoria])).toUpperCase().trim();
  d.qr_token = crypto.randomBytes(5).toString('hex');
  if (body.foto) d.foto = guardarImagen(body.foto);
  d.ubicacion_actual_id = val(body.ubicacion_actual_id);
  d.responsable_actual_id = val(body.responsable_actual_id);
  const id = insertar('herramientas', d);
  return get(`SELECT * FROM v_herramientas WHERE id = ?`, id);
}));

ruta('PUT', '/api/herramientas/:id', (q, p, body) => tx(() => {
  const d = pick(body, CAMPOS.herramientas);
  if (d.codigo) d.codigo = String(d.codigo).toUpperCase().trim();
  if ('foto' in body) d.foto = body.foto ? guardarImagen(body.foto) : null;
  actualizar('herramientas', Number(p.id), d);
  return get(`SELECT * FROM v_herramientas WHERE id = ?`, Number(p.id));
}));

// Baja: la herramienta pasa a «Retirada» y deja constancia del motivo en sus observaciones
const MOTIVOS_BAJA = ['Rotura irreparable', 'Pérdida o robo', 'Desgaste u obsoleta', 'Venta o donación', 'Otro'];
const fechaES = f => f.split('-').reverse().join('/');
function anotar(h, linea) {
  run(`UPDATE herramientas SET observaciones = ? WHERE id = ?`, [h.observaciones, linea].filter(Boolean).join('\n'), h.id);
}
ruta('POST', '/api/herramientas/:id/baja', (q, p, body, usuario) => tx(() => {
  const h = get(`SELECT id, estado, observaciones FROM herramientas WHERE id = ?`, Number(p.id));
  if (!h) throw new HttpError(404, 'Herramienta no encontrada');
  if (h.estado === 'Retirada') throw new HttpError(400, 'La herramienta ya está dada de baja');
  const motivo = String(body.motivo || '').trim();
  if (!MOTIVOS_BAJA.includes(motivo)) throw new HttpError(400, 'Indica el motivo de la baja');
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(body.fecha || '') ? body.fecha : get(`SELECT date('now','localtime') AS d`).d;
  const nota = String(body.observaciones || '').trim().slice(0, 500);
  run(`UPDATE herramientas SET estado = 'Retirada' WHERE id = ?`, h.id);
  run(`UPDATE mantenimientos SET estado = 'Cancelado' WHERE herramienta_id = ? AND estado = 'Programado'`, h.id);
  const quien = usuario ? `${usuario.nombre} ${usuario.apellidos || ''}`.trim() : '';
  anotar(h, `Baja ${fechaES(fecha)}: ${motivo}${quien ? ` (${quien})` : ''}${nota ? `. ${nota}` : ''}`);
  return get(`SELECT * FROM v_herramientas WHERE id = ?`, h.id);
}));
ruta('POST', '/api/herramientas/:id/reactivar', (q, p, body, usuario) => tx(() => {
  const h = get(`SELECT h.id, h.estado, h.observaciones, u.tipo FROM herramientas h
    LEFT JOIN ubicaciones u ON u.id = h.ubicacion_actual_id WHERE h.id = ?`, Number(p.id));
  if (!h) throw new HttpError(404, 'Herramienta no encontrada');
  if (h.estado !== 'Retirada') throw new HttpError(400, 'La herramienta no está dada de baja');
  run(`UPDATE herramientas SET estado = ? WHERE id = ?`, h.tipo === 'Almacén' ? 'Disponible' : 'En uso', h.id);
  const quien = usuario ? `${usuario.nombre} ${usuario.apellidos || ''}`.trim() : '';
  anotar(h, `Reactivada ${fechaES(get(`SELECT date('now','localtime') AS d`).d)}${quien ? ` (${quien})` : ''}`);
  return get(`SELECT * FROM v_herramientas WHERE id = ?`, h.id);
}));

ruta('POST', '/api/herramientas/:id/regenerar-qr', (q, p) => {
  run(`UPDATE herramientas SET qr_token = ? WHERE id = ?`, crypto.randomBytes(5).toString('hex'), Number(p.id));
  return get(`SELECT * FROM v_herramientas WHERE id = ?`, Number(p.id));
});

// Ubicaciones y personas ------------------------------------------------------
ruta('GET', '/api/ubicaciones', () => all(`
  SELECT u.*, NULLIF(TRIM(COALESCE(p.nombre,'')||' '||COALESCE(p.apellidos,'')),'') AS responsable_nombre,
         (SELECT COUNT(*) FROM herramientas h WHERE h.ubicacion_actual_id = u.id AND h.estado <> 'Retirada') AS num_herramientas
    FROM ubicaciones u LEFT JOIN personas p ON p.id = u.responsable_id
   ORDER BY u.estado, CASE u.tipo WHEN 'Almacén' THEN 0 WHEN 'Obra' THEN 1 WHEN 'Vehículo' THEN 2 ELSE 3 END, u.nombre`));

ruta('GET', '/api/personas', () => all(`
  SELECT p.id, p.nombre, p.apellidos, p.telefono, p.email, p.cargo, p.estado,
         p.password_hash IS NOT NULL AS tiene_acceso,
         (SELECT COUNT(*) FROM herramientas h WHERE h.responsable_actual_id = p.id AND h.estado <> 'Retirada') AS num_herramientas
    FROM personas p ORDER BY p.estado, p.nombre, p.apellidos`));

for (const t of ['ubicaciones', 'personas']) {
  // En personas, un campo "password" con valor asigna o cambia la contraseña de acceso
  const datos = body => {
    const d = pick(body, CAMPOS[t]);
    if (t === 'personas' && body.password) d.password_hash = hashPassword(body.password);
    return d;
  };
  ruta('POST', `/api/${t}`, (q, p, body) => {
    const d = datos(body);
    if (!d.nombre) throw new HttpError(400, 'El nombre es obligatorio');
    return { id: insertar(t, d) };
  });
  ruta('PUT', `/api/${t}/:id`, (q, p, body) => {
    actualizar(t, Number(p.id), datos(body));
    if (t === 'personas' && body.estado === 'Inactivo') run(`DELETE FROM sesiones WHERE persona_id = ?`, Number(p.id));
    return { ok: true };
  });
}

// Movimientos (solo alta y consulta: el historial es inmutable) ---------------
ruta('GET', '/api/movimientos', (q) => {
  const w = [], p = [];
  if (q.herramienta_id) { w.push('m.herramienta_id = ?'); p.push(Number(q.herramienta_id)); }
  if (q.ubicacion) { w.push('(m.origen_id = ? OR m.destino_id = ?)'); p.push(Number(q.ubicacion), Number(q.ubicacion)); }
  return all(`${SQL_MOV} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY m.fecha_hora DESC, m.id DESC LIMIT ?`,
    ...p, Number(q.limite || 200));
});

ruta('POST', '/api/movimientos', (q, p, body, usuario) => tx(() => {
  if (!val(body.realizado_por_id)) body.realizado_por_id = usuario.id;   // por defecto, quien ha iniciado sesión
  const h = get(`SELECT * FROM herramientas WHERE id = ?`, Number(body.herramienta_id));
  if (!h) throw new HttpError(400, 'Herramienta no válida');
  if (h.estado === 'Retirada') throw new HttpError(400, 'La herramienta está retirada');
  if (!['Entrega', 'Traslado', 'Devolución'].includes(body.tipo)) throw new HttpError(400, 'Tipo de movimiento no válido');
  const destino = get(`SELECT * FROM ubicaciones WHERE id = ?`, Number(body.destino_id));
  if (!destino) throw new HttpError(400, 'Indica la ubicación de destino');
  if (destino.estado === 'Cerrada') throw new HttpError(400, 'La ubicación de destino está cerrada');
  const id = insertar('movimientos', {
    herramienta_id: h.id,
    fecha_hora: val(body.fecha_hora) ? String(body.fecha_hora).replace('T', ' ').slice(0, 16) : ahora(),
    origen_id: h.ubicacion_actual_id,          // el origen es siempre la ubicación actual registrada
    destino_id: destino.id,
    realizado_por_id: val(body.realizado_por_id),
    receptor_id: val(body.receptor_id),
    tipo: body.tipo,
    observaciones: val(body.observaciones),
  });
  return get(`${SQL_MOV} WHERE m.id = ?`, id);
}));

ruta('PUT', '/api/movimientos/:id', () => { throw new HttpError(405, 'El historial de movimientos no se puede modificar'); });
ruta('DELETE', '/api/movimientos/:id', () => { throw new HttpError(405, 'El historial de movimientos no se puede borrar'); });

// Incidencias -------------------------------------------------------------------
ruta('GET', '/api/incidencias', (q) => {
  const w = [], p = [];
  if (q.pendientes === '1') w.push(`i.estado <> 'Resuelta'`);
  if (q.estado) { w.push('i.estado = ?'); p.push(q.estado); }
  if (q.herramienta_id) { w.push('i.herramienta_id = ?'); p.push(Number(q.herramienta_id)); }
  return all(`${SQL_INC} ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
    ORDER BY i.estado = 'Resuelta', ${ORDEN_PRIORIDAD}, i.fecha DESC`, ...p).map(parseFotos);
});

ruta('POST', '/api/incidencias', (q, p, body, usuario) => tx(() => {
  const d = pick(body, CAMPOS.incidencias);
  if (!d.comunicada_por_id) d.comunicada_por_id = usuario.id;
  if (!d.herramienta_id) throw new HttpError(400, 'Indica la herramienta');
  if (!d.descripcion) throw new HttpError(400, 'Describe la incidencia');
  d.fecha = d.fecha || hoy();
  d.fotos = JSON.stringify((body.fotos || []).slice(0, 6).map(guardarImagen).filter(Boolean));
  const id = insertar('incidencias', d);
  if (body.marcar_averiada) {
    run(`UPDATE herramientas SET estado = 'Averiada' WHERE id = ? AND estado IN ('Disponible','En uso')`, d.herramienta_id);
  }
  return parseFotos(get(`${SQL_INC} WHERE i.id = ?`, id));
}));

ruta('PUT', '/api/incidencias/:id', (q, p, body) => tx(() => {
  const d = pick(body, CAMPOS.incidencias);
  if (d.estado === 'Resuelta' && !d.fecha_resolucion) d.fecha_resolucion = hoy();
  if (d.estado && d.estado !== 'Resuelta' && !('fecha_resolucion' in body)) d.fecha_resolucion = null;
  actualizar('incidencias', Number(p.id), d);
  const i = get(`SELECT herramienta_id FROM incidencias WHERE id = ?`, Number(p.id));
  sincronizarEstadoPorIncidencias(i.herramienta_id);
  return parseFotos(get(`${SQL_INC} WHERE i.id = ?`, Number(p.id)));
}));

// Mantenimientos ----------------------------------------------------------------
ruta('GET', '/api/mantenimientos', (q) => {
  const w = [], p = [];
  if (q.pendientes === '1') w.push(`m.estado = 'Programado'`);
  if (q.herramienta_id) { w.push('m.herramienta_id = ?'); p.push(Number(q.herramienta_id)); }
  return all(`${SQL_MAN} ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
    ORDER BY m.estado <> 'Programado', CASE WHEN m.estado = 'Programado' THEN m.fecha_prevista END ASC,
             COALESCE(m.fecha_realizada, m.fecha_prevista) DESC`, ...p);
});

ruta('POST', '/api/mantenimientos', (q, p, body) => {
  const d = pick(body, CAMPOS.mantenimientos);
  if (!d.herramienta_id || !d.fecha_prevista) throw new HttpError(400, 'Herramienta y fecha prevista son obligatorias');
  return { id: insertar('mantenimientos', d) };
});

ruta('PUT', '/api/mantenimientos/:id', (q, p, body) => {
  const d = pick(body, CAMPOS.mantenimientos);
  if (d.estado === 'Realizado' && !d.fecha_realizada) d.fecha_realizada = hoy();
  actualizar('mantenimientos', Number(p.id), d);
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Servidor HTTP
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

function enviarJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function servirArchivo(res, base, rel) {
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}

function leerCuerpo(req) {
  return new Promise((ok, ko) => {
    const trozos = []; let tam = 0;
    req.on('data', c => { tam += c.length; if (tam > 40 * 1024 * 1024) { ko(new HttpError(413, 'Petición demasiado grande')); req.destroy(); } else trozos.push(c); });
    req.on('end', () => {
      if (!trozos.length) return ok({});
      try { ok(JSON.parse(Buffer.concat(trozos).toString('utf8'))); } catch { ko(new HttpError(400, 'JSON no válido')); }
    });
    req.on('error', ko);
  });
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const ruta_ = decodeURIComponent(url.pathname);

  // Enlaces cortos para etiquetas QR:
  //   /h/<codigo|token>  -> ficha de la herramienta
  //   /m/<codigo|token>  -> registrar movimiento
  //   /i/<codigo|token>  -> comunicar incidencia
  const corto = /^\/([hmi])\/([^/]+)\/?$/.exec(url.pathname);
  if (corto) {
    const destino = { h: 'herramienta', m: 'movimiento', i: 'incidencia' }[corto[1]];
    res.writeHead(302, { Location: `/#/${destino}/${corto[2]}` });
    return res.end();
  }

  if (ruta_.startsWith('/api/')) {
    const r = rutas.find(r => r.metodo === req.method && r.re.test(url.pathname));
    if (!r) return enviarJSON(res, 404, { error: 'Ruta no encontrada' });
    try {
      const usuario = usuarioDeSesion(req);
      if (!usuario && !RUTAS_PUBLICAS.has(url.pathname)) throw new HttpError(401, 'Inicia sesión para continuar');
      const m = r.re.exec(url.pathname);
      const params = Object.fromEntries(r.claves.map((k, i) => [k, m[i + 1]]));
      const body = ['POST', 'PUT'].includes(req.method) ? await leerCuerpo(req) : {};
      enviarJSON(res, 200, await r.fn(Object.fromEntries(url.searchParams), params, body, usuario, req));
    } catch (e) {
      let status = e.status || 500, msg = e.message;
      if (/UNIQUE constraint failed: herramientas.codigo/.test(msg)) { status = 409; msg = 'Ya existe una herramienta con ese código'; }
      else if (/UNIQUE constraint failed: ubicaciones.nombre/.test(msg)) { status = 409; msg = 'Ya existe una ubicación con ese nombre'; }
      else if (/CHECK constraint failed|FOREIGN KEY constraint failed|no se puede/.test(msg)) status = 400;
      if (status === 500) console.error(e);
      enviarJSON(res, status, { error: msg });
    }
    return;
  }

  if (ruta_.startsWith('/uploads/')) return servirArchivo(res, UPLOAD_DIR, ruta_.slice('/uploads/'.length));
  servirArchivo(res, PUBLIC_DIR, ruta_ === '/' ? 'index.html' : ruta_);
});

if (require.main === module) {
  servidor.listen(PORT, '0.0.0.0', () => {
    console.log(`Inventario de herramientas en marcha:`);
    console.log(`  Ordenador:          http://localhost:${PORT}`);
    console.log(`  Móvil (misma wifi): ${PUBLIC_URL}`);
  });
}

module.exports = { servidor, db };

// Permisos por rol y eliminación de usuarios contra la API real, con bases de datos temporales.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'inventario-roles-'));
const arrancar = (port, env = {}) => spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port), DB_FILE: path.join(folder, `${port}.db`), ...env }, stdio: 'ignore', windowsHide: true,
});
const cliente = port => async (metodo, url, token, body) => {
  const r = await fetch(`http://localhost:${port}${url}`, {
    method: metodo, headers: token ? { Authorization: 'Bearer ' + token } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
};
const listo = async port => {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://localhost:${port}/api/config`)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('El servidor no arranca');
};
const servidores = [arrancar(3103), arrancar(3104, { NO_SEED: '1', DEMO: '0', CLAVE_ALTA: 'clave-de-alta-de-prueba-123' })];
(async () => {
  await Promise.all([listo(3103), listo(3104)]);
  const api = cliente(3103);
  const entrar = async email => (await api('POST', '/api/login', null, { email, password: 'demo' })).data;
  const admin = await entrar('laura.gomez@reformas-ejemplo.es');
  const emp = await entrar('carlos.perez@reformas-ejemplo.es');
  assert.equal(admin.usuario.rol, 'admin');
  assert.equal(emp.usuario.rol, 'empleado');

  // Lo que un empleado no puede hacer
  const personas = (await api('GET', '/api/personas', admin.token)).data;
  const id = email => personas.find(p => p.email === email).id;
  const prohibidas = [
    ['POST', '/api/herramientas', { nombre: 'x' }], ['PUT', '/api/herramientas/1', { nombre: 'x' }],
    ['POST', '/api/herramientas/1/baja', { motivo: 'Otro' }], ['POST', '/api/herramientas/1/reactivar'],
    ['POST', '/api/herramientas/1/regenerar-qr'], ['POST', '/api/ubicaciones', { nombre: 'x' }],
    ['PUT', '/api/ubicaciones/1', { nombre: 'x' }], ['POST', '/api/personas', { nombre: 'x' }],
    ['PUT', `/api/personas/${emp.usuario.id}`, { rol: 'admin' }], ['DELETE', '/api/personas/1'],
    ['PUT', '/api/incidencias/1', { estado: 'Resuelta' }], ['POST', '/api/mantenimientos', { herramienta_id: 1, fecha_prevista: '2030-01-01' }],
    ['PUT', '/api/mantenimientos/1', { estado: 'Realizado' }],
  ];
  for (const [m, url, body] of prohibidas) assert.equal((await api(m, url, emp.token, body)).status, 403, `${m} ${url}`);

  // Lo que sí puede, siempre a su nombre
  const mov = await api('POST', '/api/movimientos', emp.token, {
    herramienta_id: 1, destino_id: 2, tipo: 'Traslado', realizado_por_id: admin.usuario.id, fecha_hora: '2020-01-01T10:00',
  });
  assert.equal(mov.status, 200);
  assert.equal(mov.data.realizado_por_id, emp.usuario.id);
  assert.doesNotMatch(mov.data.fecha_hora, /^2020/);
  const inc = await api('POST', '/api/incidencias', emp.token, {
    herramienta_id: 1, descripcion: 'Prueba', comunicada_por_id: admin.usuario.id, estado: 'Resuelta',
  });
  assert.equal(inc.data.comunicada_por_id, emp.usuario.id);
  assert.equal(inc.data.estado, 'Abierta');

  // Contraseña propia
  assert.equal((await api('POST', '/api/yo/password', emp.token, { actual: 'mala', nueva: 'nueva123' })).status, 400);
  assert.equal((await api('POST', '/api/yo/password', emp.token, { actual: 'demo', nueva: 'corta' })).status, 400);
  assert.equal((await api('POST', '/api/yo/password', emp.token, { actual: 'demo', nueva: 'nueva123' })).status, 200);
  assert.equal((await api('POST', '/api/login', null, { email: emp.usuario.email, password: 'nueva123' })).status, 200);

  // Eliminar usuarios
  assert.equal((await api('DELETE', `/api/personas/${admin.usuario.id}`, admin.token)).status, 400, 'auto-eliminación');
  const conCargo = personas.find(p => p.num_herramientas > 0 && p.id !== admin.usuario.id);
  assert.equal((await api('DELETE', `/api/personas/${conCargo.id}`, admin.token)).status, 409, 'con herramientas a su cargo');
  assert.equal((await api('POST', '/api/personas', admin.token, { nombre: 'Dup', email: 'LAURA.gomez@reformas-ejemplo.es' })).status, 409);
  const nuevo = (await api('POST', '/api/personas', admin.token, { nombre: 'Temporal', email: 'temp@ejemplo.es', password: 'secreto1' })).data.id;
  const borrado = await api('DELETE', `/api/personas/${nuevo}`, admin.token);
  assert.deepEqual(borrado.data, { ok: true, conservadoEnHistorial: false });

  // Con historial: desaparece y pierde el acceso, pero el historial mantiene su nombre
  const sergio = await entrar('sergio.ramos@reformas-ejemplo.es');
  const suyas = (await api('GET', `/api/herramientas?responsable=${sergio.usuario.id}`, admin.token)).data;
  for (const h of suyas) await api('POST', '/api/movimientos', admin.token, { herramienta_id: h.id, destino_id: 1, tipo: 'Devolución' });
  await api('POST', '/api/incidencias', sergio.token, { herramienta_id: 1, descripcion: 'Suya' });
  const r = await api('DELETE', `/api/personas/${sergio.usuario.id}`, admin.token);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.conservadoEnHistorial, true);
  assert.equal((await api('GET', '/api/yo', sergio.token)).status, 401);
  assert.equal((await api('POST', '/api/login', null, { email: sergio.usuario.email, password: 'demo' })).status, 401);
  assert(!(await api('GET', '/api/personas', admin.token)).data.some(p => p.id === sergio.usuario.id));
  const incs = (await api('GET', '/api/incidencias', admin.token)).data;
  assert(incs.some(i => i.comunicada_por_nombre?.startsWith('Sergio')));

  // Siempre queda un administrador
  for (const email of ['javier.martin@reformas-ejemplo.es', 'ana.torres@reformas-ejemplo.es']) {
    assert.equal((await api('PUT', `/api/personas/${id(email)}`, admin.token, { rol: 'empleado' })).status, 200);
  }
  assert.equal((await api('PUT', `/api/personas/${admin.usuario.id}`, admin.token, { rol: 'empleado' })).status, 400);
  assert.equal((await api('PUT', `/api/personas/${admin.usuario.id}`, admin.token, { estado: 'Inactivo' })).status, 400);

  // Instalación vacía: primer administrador, una sola vez
  const nueva = cliente(3104);
  assert.equal((await nueva('GET', '/api/config')).data.primerUso, true);
  assert.equal((await nueva('POST', '/api/primer-admin', null, { nombre: 'A', email: 'a@b.es', password: '123' })).status, 400);
  const primero = await nueva('POST', '/api/primer-admin', null, { nombre: 'Ana', email: 'A@b.es', password: 'secreto1' });
  assert.equal(primero.data.usuario.rol, 'admin');
  assert.equal((await nueva('POST', '/api/primer-admin', null, { nombre: 'B', email: 'c@d.es', password: 'secreto1' })).status, 409);
  assert.equal((await nueva('GET', '/api/ubicaciones', primero.data.token)).data.length, 1);
  assert.equal((await nueva('GET', '/api/config')).data.primerUso, false);

  // Servidor común: una segunda empresa no ve ni toca nada de la primera
  const t1 = primero.data.token;
  const h1 = (await nueva('POST', '/api/herramientas', t1, { nombre: 'Taladro A', categoria: 'Taladros', ubicacion_actual_id: 1 })).data;
  assert.equal(h1.codigo, 'TAL-001');
  assert.equal((await nueva('POST', '/api/empresas', null, { clave: 'mala', empresa: 'X', nombre: 'X', email: 'x@x.es', password: 'secreto1' })).status, 403);
  const alta = await nueva('POST', '/api/empresas', null, { clave: 'clave-de-alta-de-prueba-123', empresa: 'Reformas Beta', nombre: 'Bea', email: 'bea@beta.es', password: 'secreto1' });
  assert.equal(alta.status, 200, JSON.stringify(alta.data));
  const t2 = (await nueva('POST', '/api/login', null, { email: 'bea@beta.es', password: 'secreto1' })).data.token;
  assert.equal((await nueva('GET', '/api/yo', t2)).data.empresa_nombre, 'Reformas Beta');
  assert.equal((await nueva('GET', '/api/herramientas', t2)).data.length, 0);
  assert.equal((await nueva('GET', '/api/personas', t2)).data.length, 1);
  const ubi2 = (await nueva('GET', '/api/ubicaciones', t2)).data;
  assert.equal(ubi2.length, 1);
  for (const [m, url, body] of [
    ['GET', '/api/herramientas/' + h1.id], ['GET', '/api/herramientas/' + h1.qr_token], ['GET', '/api/herramientas/TAL-001'],
    ['PUT', '/api/herramientas/' + h1.id, { nombre: 'hack' }], ['POST', `/api/herramientas/${h1.id}/baja`, { motivo: 'Otro' }],
    ['PUT', '/api/ubicaciones/1', { nombre: 'hack' }], ['PUT', '/api/personas/1', { nombre: 'hack' }], ['DELETE', '/api/personas/1'],
    ['POST', '/api/movimientos', { herramienta_id: h1.id, destino_id: ubi2[0].id, tipo: 'Traslado' }],
    ['POST', '/api/incidencias', { herramienta_id: h1.id, descripcion: 'x' }],
    ['POST', '/api/mantenimientos', { herramienta_id: h1.id, fecha_prevista: '2030-01-01' }],
    ['POST', '/api/herramientas', { nombre: 'x', ubicacion_actual_id: 1 }],
  ]) assert((await nueva(m, url, t2, body)).status >= 400, `fuga entre empresas: ${m} ${url}`);
  const h2 = (await nueva('POST', '/api/herramientas', t2, { nombre: 'Taladro B', categoria: 'Taladros' })).data;
  assert.equal(h2.codigo, 'TAL-001', 'los códigos se numeran por empresa');
  const d1 = (await nueva('GET', '/api/dashboard', t1)).data.indicadores;
  assert.equal(d1.total, 1);
  assert.equal((await nueva('GET', '/api/herramientas/' + h1.id, t1)).data.nombre, 'Taladro A');
  console.log('PASS: permisos por rol, contraseña propia, eliminación de usuarios, último admin, primer arranque y aislamiento entre empresas.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => servidores.forEach(s => s.kill()));

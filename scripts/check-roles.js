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
const servidores = [arrancar(3103), arrancar(3104, { NO_SEED: '1', DEMO: '0' })];
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
  console.log('PASS: permisos por rol, contraseña propia, eliminación de usuarios, último admin y primer arranque.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => servidores.forEach(s => s.kill()));

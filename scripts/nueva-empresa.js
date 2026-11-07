// Da de alta una empresa cliente en el servidor común.
// Uso: CLAVE_ALTA=... node scripts/nueva-empresa.js https://inventario.tudominio.es "Reformas Pérez" "Juan Pérez" juan@reformasperez.es
// La contraseña inicial del administrador se genera y se muestra una sola vez: entrégasela y que la cambie al entrar.
'use strict';
const crypto = require('node:crypto');
const [servidor, empresa, nombreCompleto, email] = process.argv.slice(2);
if (!servidor || !empresa || !nombreCompleto || !email || !process.env.CLAVE_ALTA) {
  console.error('Uso: CLAVE_ALTA=... node scripts/nueva-empresa.js <servidor> "<empresa>" "<nombre del admin>" <email>');
  process.exit(1);
}
const [nombre, ...apellidos] = nombreCompleto.trim().split(/\s+/);
const password = crypto.randomBytes(9).toString('base64url');
(async () => {
  const r = await fetch(servidor.replace(/\/$/, '') + '/api/empresas', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave: process.env.CLAVE_ALTA, empresa, nombre, apellidos: apellidos.join(' '), email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('Error:', data.error || r.status); process.exit(1); }
  console.log(`Empresa "${empresa}" creada.\n  Usuario: ${email}\n  Contraseña inicial: ${password}`);
})();

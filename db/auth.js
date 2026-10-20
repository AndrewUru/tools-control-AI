// Hash de contraseñas con scrypt (módulo crypto de Node, sin dependencias)
'use strict';
const crypto = require('node:crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verificarPassword(password, guardado) {
  if (!guardado || !guardado.includes(':')) return false;
  const [salt, hash] = guardado.split(':');
  const calc = crypto.scryptSync(String(password), salt, 32);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === calc.length && crypto.timingSafeEqual(ref, calc);
}

module.exports = { hashPassword, verificarPassword };

// Datos de ejemplo ficticios. Las fechas son relativas al día en que se crea la base de datos.
'use strict';
const crypto = require('node:crypto');
const { hashPassword } = require('./auth');

// Contraseña común de todos los usuarios de demostración
const PASSWORD_DEMO = 'demo';

function pad(n) { return String(n).padStart(2, '0'); }
function fecha(dias, hora) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return hora ? `${s} ${hora}` : s;
}
function token() { return crypto.randomBytes(5).toString('hex'); }

module.exports = function seed(db) {
  const ins = (sql, params) => Number(db.prepare(sql).run(...params).lastInsertRowid);

  // PERSONAS ---------------------------------------------------------------
  const P = {};
  const personas = [
    ['javier', 'Javier', 'Martín Ruiz', '600 111 222', 'javier.martin@reformas-ejemplo.es', 'Jefe de obra', 'Activo'],
    ['laura', 'Laura', 'Gómez Sánchez', '600 333 444', 'laura.gomez@reformas-ejemplo.es', 'Encargada de almacén', 'Activo'],
    ['carlos', 'Carlos', 'Pérez Díaz', '600 555 666', 'carlos.perez@reformas-ejemplo.es', 'Oficial de albañilería', 'Activo'],
    ['miguel', 'Miguel', 'Fernández López', '600 777 888', 'miguel.fernandez@reformas-ejemplo.es', 'Electricista', 'Activo'],
    ['ana', 'Ana', 'Torres Molina', '600 999 000', 'ana.torres@reformas-ejemplo.es', 'Administración', 'Activo'],
    ['sergio', 'Sergio', 'Ramos Vidal', '611 222 333', 'sergio.ramos@reformas-ejemplo.es', 'Fontanero', 'Activo'],
    ['raul', 'Raúl', 'Navarro Gil', '622 444 555', 'raul.navarro@reformas-ejemplo.es', 'Peón', 'Inactivo'],
  ];
  for (const [k, ...v] of personas) {
    P[k] = ins(`INSERT INTO personas (nombre, apellidos, telefono, email, cargo, estado) VALUES (?,?,?,?,?,?)`, v);
  }

  // Acceso a la app para las personas activas (contraseña de demo)
  for (const [k, , , , , , estado] of personas) {
    if (estado === 'Activo') db.prepare('UPDATE personas SET password_hash = ? WHERE id = ?').run(hashPassword(PASSWORD_DEMO), P[k]);
  }

  // UBICACIONES ------------------------------------------------------------
  const U = {};
  const ubicaciones = [
    ['almacen', 'Almacén central', 'Almacén', 'C/ de la Industria 14, Polígono El Prado', P.laura, 'Activa', 'Horario de 7:30 a 15:30'],
    ['mayor', 'Obra C/ Mayor 23 - Reforma integral', 'Obra', 'C/ Mayor 23, 2º B', P.javier, 'Activa', 'Llave en portería'],
    ['constitucion', 'Obra Av. Constitución 8 - Baño y cocina', 'Obra', 'Av. de la Constitución 8, 1º A', P.carlos, 'Activa', null],
    ['olivos', 'Obra Chalet Los Olivos - Fachada', 'Obra', 'Urb. Los Olivos, parcela 12', P.javier, 'Activa', 'Andamio montado hasta fin de mes'],
    ['furgo1', 'Furgoneta 1234-KLM', 'Vehículo', null, P.carlos, 'Activa', 'Ford Transit blanca'],
    ['furgo2', 'Furgoneta 5678-JHG', 'Vehículo', null, P.miguel, 'Activa', 'Renault Kangoo gris'],
    ['oficina', 'Oficina', 'Oficina', 'C/ del Comercio 3, bajo', P.ana, 'Activa', null],
    ['plaza', 'Obra Local Plaza España (finalizada)', 'Obra', 'Plaza de España 5, local', P.javier, 'Cerrada', 'Obra entregada'],
    ['taller', 'Taller Reparaciones Hnos. Ortiz', 'Otra', 'C/ Herreros 21', null, 'Activa', 'Servicio técnico externo'],
  ];
  for (const [k, ...v] of ubicaciones) {
    U[k] = ins(`INSERT INTO ubicaciones (nombre, tipo, direccion, responsable_id, estado, observaciones) VALUES (?,?,?,?,?,?)`, v);
  }

  // HERRAMIENTAS (todas se dan de alta en el almacén, a cargo de Laura) -----
  const H = {};
  const herramientas = [
    ['TAL-001', 'Taladro percutor', 'Taladros', 'Bosch', 'GSB 18V-55', 'BSH-58213-A', -620, 189.9, null],
    ['TAL-002', 'Taladro percutor', 'Taladros', 'Makita', 'HP457DWE', 'MKT-77120', -410, 129.0, null],
    ['TAL-003', 'Martillo perforador SDS-Plus', 'Taladros', 'DeWalt', 'D25133K', 'DW-33109-X', -300, 245.5, 'Incluye maletín y 3 brocas'],
    ['RAD-001', 'Radial 125 mm', 'Radiales', 'Bosch', 'GWS 880', 'BSH-90011', -700, 79.9, null],
    ['RAD-002', 'Radial 230 mm', 'Radiales', 'Makita', 'GA9020', 'MKT-11873', -520, 159.0, 'Usar siempre con protector'],
    ['RAD-003', 'Radial batería 125 mm', 'Radiales', 'Milwaukee', 'M18 CAG125X', 'MLW-55021', -90, 299.0, null],
    ['ESC-001', 'Escalera tijera 7 peldaños', 'Escaleras', 'Svelt', 'Scaletta 7', null, -900, 110.0, null],
    ['ESC-002', 'Escalera extensible 3 tramos', 'Escaleras', 'Hailo', 'ProfiStep Multi', 'HL-3x9', -460, 275.0, 'Revisar zapatas antideslizantes'],
    ['ESC-003', 'Escalera tijera aluminio 5 peldaños', 'Escaleras', 'Hailo', 'L60', null, -200, 69.9, null],
    ['ATO-001', 'Atornillador de impacto', 'Atornilladores', 'Makita', 'DTD153', 'MKT-DTD-4412', -380, 149.0, null],
    ['ATO-002', 'Atornillador batería 12V', 'Atornilladores', 'Bosch', 'GSR 12V-15', 'BSH-12-8873', -250, 99.0, null],
    ['ATO-003', 'Atornillador pladur con cargador', 'Atornilladores', 'DeWalt', 'DCF620', 'DW-620-1187', -150, 239.0, null],
    ['MAQ-001', 'Hormigonera 160 L', 'Maquinaria', 'Altrad', 'B160', 'ALT-160-221', -1100, 395.0, 'Engrasar corona cada 3 meses'],
    ['MAQ-002', 'Martillo demoledor 10 kg', 'Maquinaria', 'Hilti', 'TE 700-AVR', 'HLT-700-3341', -800, 1250.0, null],
    ['MAQ-003', 'Cortadora de azulejo', 'Maquinaria', 'Rubi', 'TX-900-N', 'RUB-900-5520', -600, 320.0, null],
    ['MAQ-004', 'Generador eléctrico 3 kW', 'Maquinaria', 'Honda', 'EU30i', 'HND-EU30-0091', -1300, 2100.0, 'Gasolina sin plomo'],
    ['MED-001', 'Nivel láser autonivelante', 'Medición', 'Bosch', 'GLL 3-80', 'BSH-GLL-7765', -340, 389.0, 'Guardar siempre en su funda'],
    ['MED-002', 'Medidor láser de distancias', 'Medición', 'Leica', 'Disto D2', 'LEI-D2-2290', -270, 145.0, null],
    ['OTR-001', 'Aspirador de obra', 'Otros', 'Kärcher', 'WD 6 P', 'KAR-WD6-6612', -480, 229.0, null],
    ['OTR-002', 'Juego de sargentos (6 uds.)', 'Otros', 'Bessey', 'GZ', null, -1000, 85.0, null],
  ];
  for (const [codigo, nombre, categoria, marca, modelo, serie, compra, precio, obs] of herramientas) {
    H[codigo] = ins(`INSERT INTO herramientas
      (codigo, nombre, categoria, marca, modelo, numero_serie, estado, ubicacion_actual_id, responsable_actual_id,
       fecha_compra, precio_compra, observaciones, qr_token)
      VALUES (?,?,?,?,?,?, 'Disponible', ?, ?, ?, ?, ?, ?)`,
      [codigo, nombre, categoria, marca, modelo, serie, U.almacen, P.laura, fecha(compra), precio, obs, token()]);
  }

  // MOVIMIENTOS (en orden cronológico; los triggers actualizan ubicación/responsable/estado)
  const mov = (codigo, dias, hora, tipo, origen, destino, realiza, recibe, obs = null) =>
    ins(`INSERT INTO movimientos (herramienta_id, fecha_hora, origen_id, destino_id, realizado_por_id, receptor_id, tipo, observaciones)
         VALUES (?,?,?,?,?,?,?,?)`,
      [H[codigo], fecha(dias, hora), U[origen], U[destino], P[realiza] ?? null, P[recibe] ?? null, tipo, obs]);

  // Obra Plaza España (ya cerrada): ida y vuelta
  mov('MAQ-002', -60, '08:10', 'Entrega', 'almacen', 'plaza', 'laura', 'javier', 'Demolición tabiques local');
  mov('MAQ-002', -41, '16:30', 'Devolución', 'plaza', 'almacen', 'javier', 'laura');
  mov('RAD-002', -60, '08:12', 'Entrega', 'almacen', 'plaza', 'laura', 'javier');
  mov('RAD-002', -41, '16:35', 'Devolución', 'plaza', 'almacen', 'javier', 'laura');

  // Obra C/ Mayor
  mov('TAL-001', -30, '07:45', 'Entrega', 'almacen', 'mayor', 'laura', 'javier');
  mov('MAQ-001', -30, '07:50', 'Entrega', 'almacen', 'mayor', 'laura', 'javier', 'Transportada con la furgoneta grande');
  mov('ESC-002', -30, '07:55', 'Entrega', 'almacen', 'mayor', 'laura', 'javier');
  mov('RAD-001', -28, '08:00', 'Entrega', 'almacen', 'mayor', 'laura', 'javier');
  mov('MAQ-002', -27, '08:20', 'Entrega', 'almacen', 'mayor', 'laura', 'javier', 'Demolición baño');
  mov('MED-001', -20, '09:00', 'Entrega', 'almacen', 'mayor', 'laura', 'miguel');
  mov('ATO-003', -12, '08:30', 'Entrega', 'almacen', 'mayor', 'laura', 'javier', 'Tabiquería de pladur');

  // Obra Av. Constitución
  mov('TAL-002', -18, '08:05', 'Entrega', 'almacen', 'constitucion', 'laura', 'carlos');
  mov('MAQ-003', -18, '08:06', 'Entrega', 'almacen', 'constitucion', 'laura', 'carlos', 'Alicatado cocina');
  mov('ESC-001', -18, '08:07', 'Entrega', 'almacen', 'constitucion', 'laura', 'carlos');
  mov('OTR-001', -15, '12:00', 'Entrega', 'almacen', 'constitucion', 'laura', 'sergio');

  // Furgonetas
  mov('ATO-001', -25, '07:30', 'Entrega', 'almacen', 'furgo1', 'laura', 'carlos');
  mov('TAL-003', -22, '07:30', 'Entrega', 'almacen', 'furgo2', 'laura', 'miguel');
  mov('MED-002', -22, '07:31', 'Entrega', 'almacen', 'furgo2', 'laura', 'miguel');

  // Traslados entre obras
  mov('ATO-001', -10, '13:15', 'Traslado', 'furgo1', 'constitucion', 'carlos', 'carlos', 'Se queda en obra para montaje de muebles');
  mov('MAQ-002', -8, '15:00', 'Traslado', 'mayor', 'olivos', 'javier', 'javier', 'Picado de fachada');
  mov('ESC-002', -6, '09:40', 'Traslado', 'mayor', 'olivos', 'javier', 'carlos');
  mov('MED-001', -5, '10:00', 'Traslado', 'mayor', 'furgo2', 'miguel', 'miguel');

  // Devoluciones recientes
  mov('TAL-002', -3, '15:20', 'Devolución', 'constitucion', 'almacen', 'carlos', 'laura');
  mov('RAD-001', -2, '15:45', 'Devolución', 'mayor', 'almacen', 'javier', 'laura', 'Disco gastado, se ha cambiado');

  // Llevada al taller (queda registrada como traslado)
  mov('RAD-002', -4, '11:00', 'Traslado', 'almacen', 'taller', 'laura', null, 'Escobillas desgastadas');

  // Herramienta retirada
  db.prepare(`UPDATE herramientas SET estado = 'Retirada', observaciones = 'Motor quemado, no compensa reparar. Dada de baja.' WHERE codigo = 'OTR-002'`).run();

  // INCIDENCIAS ------------------------------------------------------------
  const inc = (codigo, dias, quien, tipo, desc, prioridad, estado, resuelta = null) =>
    ins(`INSERT INTO incidencias (herramienta_id, fecha, comunicada_por_id, tipo, descripcion, prioridad, estado, fecha_resolucion)
         VALUES (?,?,?,?,?,?,?,?)`,
      [H[codigo], fecha(dias), P[quien], tipo, desc, prioridad, estado, resuelta === null ? null : fecha(resuelta)]);

  inc('RAD-002', -5, 'laura', 'Avería', 'Echa chispas por la rejilla y pierde potencia. Posibles escobillas.', 'Alta', 'En reparación');
  inc('ATO-001', -1, 'carlos', 'Avería', 'La batería no carga. Probado con dos cargadores distintos.', 'Media', 'Abierta');
  inc('ESC-002', -2, 'carlos', 'Daño', 'Una de las zapatas antideslizantes está partida.', 'Urgente', 'En revisión');
  inc('MED-002', -7, 'miguel', 'Falta accesorio', 'Se ha perdido la funda de transporte.', 'Baja', 'Abierta');
  inc('TAL-001', -45, 'javier', 'Avería', 'El portabrocas no aprieta bien.', 'Media', 'Resuelta', -40);

  db.prepare(`UPDATE herramientas SET estado = 'En reparación' WHERE codigo = 'RAD-002'`).run();
  db.prepare(`UPDATE herramientas SET estado = 'Averiada' WHERE codigo IN ('ATO-001','ESC-002')`).run();

  // MANTENIMIENTOS ---------------------------------------------------------
  const man = (codigo, tipo, prevista, realizada, proveedor, coste, estado, obs = null) =>
    ins(`INSERT INTO mantenimientos (herramienta_id, tipo, fecha_prevista, fecha_realizada, proveedor, coste, estado, observaciones)
         VALUES (?,?,?,?,?,?,?,?)`,
      [H[codigo], tipo, fecha(prevista), realizada === null ? null : fecha(realizada), proveedor, coste, estado, obs]);

  man('MAQ-001', 'Engrase', -95, -94, 'Interno', 0, 'Realizado', 'Engrase de corona y piñón');
  man('MAQ-001', 'Engrase', -3, null, 'Interno', null, 'Programado', 'Engrase trimestral (vencido)');
  man('MAQ-004', 'Revisión', 6, null, 'Motores Honda Servicio Oficial', 85, 'Programado', 'Cambio de aceite y bujía');
  man('MAQ-002', 'Revisión', 12, null, 'Hilti Center', null, 'Programado', 'Revisión anual');
  man('RAD-002', 'Reparación', -4, null, 'Taller Reparaciones Hnos. Ortiz', 45, 'Programado', 'Cambio de escobillas');
  man('ESC-002', 'Inspección de seguridad', 2, null, 'Interno', null, 'Programado', 'Inspección tras incidencia de zapata');
  man('MED-001', 'Calibración', 25, null, 'Bosch Service', 60, 'Programado');
  man('TAL-001', 'Reparación', -44, -40, 'Taller Reparaciones Hnos. Ortiz', 32.5, 'Realizado', 'Cambio de portabrocas');
  man('MAQ-003', 'Revisión', 40, null, 'Interno', null, 'Programado', 'Revisar rodamientos y rueda de corte');
  man('ESC-001', 'Inspección de seguridad', 60, null, 'Interno', null, 'Programado');
  man('OTR-001', 'Cambio de filtro', 18, null, 'Interno', 19.9, 'Programado');
};
module.exports.PASSWORD_DEMO = PASSWORD_DEMO;

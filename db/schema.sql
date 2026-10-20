-- =====================================================================
--  Inventario de herramientas - Esquema SQLite
-- =====================================================================
PRAGMA foreign_keys = ON;

-- 3. PERSONAS ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS personas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre     TEXT NOT NULL,
  apellidos  TEXT,
  telefono   TEXT,
  email      TEXT,
  cargo      TEXT,
  estado     TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo','Inactivo')),
  password_hash TEXT                                   -- acceso a la app (NULL = sin acceso)
);

-- Sesiones de usuario (login)
CREATE TABLE IF NOT EXISTS sesiones (
  token      TEXT PRIMARY KEY,
  persona_id INTEGER NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  creada_en  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expira_en  TEXT NOT NULL
);

-- 2. UBICACIONES -------------------------------------------------------
CREATE TABLE IF NOT EXISTS ubicaciones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre         TEXT NOT NULL UNIQUE,
  tipo           TEXT NOT NULL DEFAULT 'Almacén'
                 CHECK (tipo IN ('Almacén','Obra','Vehículo','Oficina','Otra')),
  direccion      TEXT,
  responsable_id INTEGER REFERENCES personas(id) ON DELETE SET NULL,
  estado         TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa','Cerrada')),
  observaciones  TEXT
);

-- 1. HERRAMIENTAS ------------------------------------------------------
-- ubicacion_actual_id y responsable_actual_id se actualizan solos
-- mediante el trigger trg_movimiento_actualiza_herramienta.
-- proximo_mantenimiento se calcula solo a partir de MANTENIMIENTOS.
CREATE TABLE IF NOT EXISTS herramientas (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                TEXT NOT NULL UNIQUE,          -- p.ej. TAL-001
  nombre                TEXT NOT NULL,
  categoria             TEXT,
  marca                 TEXT,
  modelo                TEXT,
  numero_serie          TEXT,
  foto                  TEXT,                          -- ruta /uploads/...
  estado                TEXT NOT NULL DEFAULT 'Disponible'
                        CHECK (estado IN ('Disponible','En uso','Averiada','En reparación','Retirada')),
  ubicacion_actual_id   INTEGER REFERENCES ubicaciones(id),
  responsable_actual_id INTEGER REFERENCES personas(id),
  fecha_compra          TEXT,
  precio_compra         REAL,
  proximo_mantenimiento TEXT,
  observaciones         TEXT,
  qr_token              TEXT NOT NULL UNIQUE,          -- identificador fijo de la etiqueta QR
  creado_en             TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 4. MOVIMIENTOS (historial inmutable) ----------------------------------
CREATE TABLE IF NOT EXISTS movimientos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  herramienta_id   INTEGER NOT NULL REFERENCES herramientas(id) ON DELETE RESTRICT,
  fecha_hora       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M','now','localtime')),
  origen_id        INTEGER REFERENCES ubicaciones(id),
  destino_id       INTEGER NOT NULL REFERENCES ubicaciones(id),
  realizado_por_id INTEGER REFERENCES personas(id),
  receptor_id      INTEGER REFERENCES personas(id),
  tipo             TEXT NOT NULL CHECK (tipo IN ('Entrega','Traslado','Devolución')),
  observaciones    TEXT,
  registrado_en    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_mov_herr ON movimientos(herramienta_id, fecha_hora);

-- El historial nunca se modifica ni se borra.
CREATE TRIGGER IF NOT EXISTS trg_movimientos_no_update
BEFORE UPDATE ON movimientos
BEGIN SELECT RAISE(ABORT, 'El historial de movimientos no se puede modificar'); END;

CREATE TRIGGER IF NOT EXISTS trg_movimientos_no_delete
BEFORE DELETE ON movimientos
BEGIN SELECT RAISE(ABORT, 'El historial de movimientos no se puede borrar'); END;

-- Al registrar un movimiento, la herramienta pasa a la ubicación de destino
-- y al responsable receptor (solo si es el movimiento más reciente).
-- Entrega => "En uso", Devolución => "Disponible" (si no está averiada/en reparación/retirada).
CREATE TRIGGER IF NOT EXISTS trg_movimiento_actualiza_herramienta
AFTER INSERT ON movimientos
BEGIN
  UPDATE herramientas
     SET ubicacion_actual_id   = NEW.destino_id,
         responsable_actual_id = NEW.receptor_id,
         estado = CASE
                    WHEN estado IN ('Disponible','En uso') THEN
                      CASE NEW.tipo
                        WHEN 'Entrega'    THEN 'En uso'
                        WHEN 'Devolución' THEN 'Disponible'
                        ELSE estado
                      END
                    ELSE estado
                  END
   WHERE id = NEW.herramienta_id
     AND NOT EXISTS (SELECT 1 FROM movimientos m
                      WHERE m.herramienta_id = NEW.herramienta_id
                        AND m.fecha_hora > NEW.fecha_hora);
END;

-- 5. INCIDENCIAS --------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidencias (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  herramienta_id    INTEGER NOT NULL REFERENCES herramientas(id) ON DELETE CASCADE,
  fecha             TEXT NOT NULL DEFAULT (date('now','localtime')),
  comunicada_por_id INTEGER REFERENCES personas(id),
  tipo              TEXT NOT NULL DEFAULT 'Avería',
  descripcion       TEXT NOT NULL,
  fotos             TEXT NOT NULL DEFAULT '[]',        -- JSON con rutas /uploads/...
  prioridad         TEXT NOT NULL DEFAULT 'Media' CHECK (prioridad IN ('Baja','Media','Alta','Urgente')),
  estado            TEXT NOT NULL DEFAULT 'Abierta'
                    CHECK (estado IN ('Abierta','En revisión','En reparación','Resuelta')),
  fecha_resolucion  TEXT
);

-- 6. MANTENIMIENTOS -----------------------------------------------------
CREATE TABLE IF NOT EXISTS mantenimientos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  herramienta_id  INTEGER NOT NULL REFERENCES herramientas(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'Revisión',
  fecha_prevista  TEXT NOT NULL,
  fecha_realizada TEXT,
  proveedor       TEXT,
  coste           REAL,
  estado          TEXT NOT NULL DEFAULT 'Programado' CHECK (estado IN ('Programado','Realizado','Cancelado')),
  observaciones   TEXT
);

-- Próximo mantenimiento = fecha prevista más cercana de los programados.
CREATE TRIGGER IF NOT EXISTS trg_mant_ins AFTER INSERT ON mantenimientos
BEGIN
  UPDATE herramientas SET proximo_mantenimiento =
    (SELECT MIN(fecha_prevista) FROM mantenimientos
      WHERE herramienta_id = NEW.herramienta_id AND estado = 'Programado')
   WHERE id = NEW.herramienta_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_mant_upd AFTER UPDATE ON mantenimientos
BEGIN
  UPDATE herramientas SET proximo_mantenimiento =
    (SELECT MIN(fecha_prevista) FROM mantenimientos m
      WHERE m.herramienta_id = herramientas.id AND m.estado = 'Programado')
   WHERE id IN (NEW.herramienta_id, OLD.herramienta_id);
END;
CREATE TRIGGER IF NOT EXISTS trg_mant_del AFTER DELETE ON mantenimientos
BEGIN
  UPDATE herramientas SET proximo_mantenimiento =
    (SELECT MIN(fecha_prevista) FROM mantenimientos
      WHERE herramienta_id = OLD.herramienta_id AND estado = 'Programado')
   WHERE id = OLD.herramienta_id;
END;

-- VISTA: herramientas con ubicación y responsable actuales -----------------
DROP VIEW IF EXISTS v_herramientas;
CREATE VIEW v_herramientas AS
SELECT h.*,
       u.nombre AS ubicacion_nombre,
       u.tipo   AS ubicacion_tipo,
       NULLIF(TRIM(COALESCE(p.nombre,'') || ' ' || COALESCE(p.apellidos,'')), '') AS responsable_nombre,
       (SELECT COUNT(*) FROM incidencias i
         WHERE i.herramienta_id = h.id AND i.estado <> 'Resuelta') AS incidencias_abiertas
  FROM herramientas h
  LEFT JOIN ubicaciones u ON u.id = h.ubicacion_actual_id
  LEFT JOIN personas    p ON p.id = h.responsable_actual_id;

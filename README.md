# Inventario de herramientas

## APK Android para demostración

La edición MVP funciona sin conexión y guarda los datos en el móvil. Instalación, alcance y compilación: [ANDROID-MVP.md](ANDROID-MVP.md).

Demo técnica de una aplicación móvil para controlar las herramientas de una empresa de reformas. Muestra dónde está cada herramienta, quién es responsable, en qué estado se encuentra y todo su historial de movimientos, incidencias y mantenimientos.

La interfaz se adapta a móvil, tablet y ordenador. En iPhone/iPad se instala desde Safari con **Compartir → Añadir a pantalla de inicio**. La edición web/iOS necesita conexión con el servidor; la cámara requiere HTTPS. Instrucciones y alcance: [WEB-IOS.md](WEB-IOS.md).

## Flujo de la app

1. **Login.** Es la primera pantalla. En modo demo muestra accesos rápidos para cada usuario de ejemplo.
2. **Buscador.** Es la pantalla de inicio tras entrar. Busca por texto y filtra por estado, categoría, ubicación o "solo a mi cargo".
3. **Barra inferior.** Da acceso a Buscar, Panel, Mover, Avisar y Más. "Más" abre el menú con el resto de pantallas y el cierre de sesión.

Si se abre un enlace QR sin sesión, la app pide el login y después lleva directamente a la ficha.

### Usuarios de demostración

Todas las personas activas de los datos de ejemplo pueden entrar con la contraseña `demo`.

| Email | Cargo |
|---|---|
| `laura.gomez@reformas-ejemplo.es` | Encargada de almacén |
| `javier.martin@reformas-ejemplo.es` | Jefe de obra |
| `carlos.perez@reformas-ejemplo.es` | Oficial de albañilería |
| `miguel.fernandez@reformas-ejemplo.es` | Electricista |

Raúl Navarro está inactivo y no puede entrar. Desde Personas se puede asignar o cambiar la contraseña de cualquiera.

## Puesta en marcha

Requisitos: **Node.js 22.13 o superior** (usa el módulo SQLite integrado de Node). No hay dependencias que instalar.

```bash
npm start            # arranca en http://localhost:3000
npm run reset        # con el servidor parado: borra la base de datos, que se recrea con datos de ejemplo
```

Al arrancar se muestran dos direcciones: la del ordenador y la de la red local para abrirla desde el móvil (misma wifi).

El lector de QR integrado (botón QR del buscador) usa la cámara con HTTPS o localhost y funciona también sin conexión en la app Android. Incluye el decodificador jsQR y entrada manual cuando la cámara no está disponible. La cámara externa del móvil solo puede abrir etiquetas de la edición web si su dirección es accesible.

Variables de entorno opcionales:

| Variable     | Uso                                                                 |
|--------------|---------------------------------------------------------------------|
| `PORT`       | Puerto HTTP (por defecto 3000)                                      |
| `PUBLIC_URL` | URL pública que irá dentro de los QR, p. ej. `https://herramientas.miempresa.es` |
| `DB_FILE`    | Ruta del fichero SQLite (por defecto `data/inventario.db`)          |
| `NO_SEED=1`  | No cargar datos de ejemplo al crear una base de datos nueva          |
| `DEMO=0`     | Ocultar los accesos rápidos de demostración en el login              |

## Interfaz

- **Tipografía Inter** (variable) e **iconos Lucide**, servidos desde `public/vendor` sin depender de internet.
- **Componentes móviles**: barra de pestañas con botón central de acción, menú lateral, hojas inferiores para filtros y formularios, pestañas segmentadas, interruptores, esqueletos de carga y transiciones suaves.
- **Modo oscuro** automático según el sistema.
- **Estados con color, icono y texto**, nunca solo color.

Las librerías se instalan como dependencias de desarrollo y se copian a `public/vendor`. Solo hace falta repetirlo para actualizarlas o añadir iconos, editando la lista de `scripts/build-vendor.js`:

```bash
npm install
npm run vendor     # genera public/vendor/icons.js (solo los iconos usados) y copia la fuente Inter
```

## Estructura

```
server.js          Servidor HTTP + API REST (sin dependencias)
db/schema.sql      Tablas, triggers y vista v_herramientas
db/seed.js         Datos de ejemplo ficticios
db/auth.js         Hash de contraseñas (scrypt)
public/            Interfaz (HTML, CSS y JavaScript sin frameworks)
public/vendor/     Iconos, fuente y librería QR ya preparados
scripts/           Generación de public/vendor
data/              Base de datos SQLite (se crea sola)
uploads/           Fotos de herramientas e incidencias
```

## Modelo de datos

Seis tablas relacionadas: `herramientas`, `ubicaciones`, `personas`, `movimientos`, `incidencias` y `mantenimientos`.

- **Ubicación y responsable actuales automáticos.** Un trigger actualiza la herramienta con el destino y el receptor de cada movimiento nuevo. Solo cuenta el movimiento más reciente por fecha, así que registrar uno con fecha atrasada no altera la situación actual.
- **Estado automático por movimiento.** Una *Entrega* pasa la herramienta a "En uso" y una *Devolución* a "Disponible". Nunca se cambia así una herramienta averiada, en reparación o retirada.
- **Historial inmutable.** Hay triggers que impiden `UPDATE` y `DELETE` en `movimientos`, incluso desde fuera de la aplicación. La API tampoco expone esas operaciones.
- **Origen automático.** El origen de un movimiento es siempre la ubicación registrada en ese momento.
- **Incidencias y estado.** Al comunicar una incidencia se puede marcar la herramienta como "Averiada". Si una incidencia pasa a "En reparación", la herramienta también. Cuando ya no quedan incidencias pendientes, vuelve a "Disponible" si está en un almacén, o a "En uso" si no.
- **Próximo mantenimiento.** Se calcula solo: es la fecha prevista más cercana de los mantenimientos programados.
- **Código interno.** Se propone automáticamente según la categoría: TAL, RAD, ESC, ATO, MAQ, MED, AND u OTR, seguido de un número correlativo.

## Códigos QR

Cada herramienta tiene un `qr_token` fijo, independiente de su código interno. Los QR apuntan a enlaces cortos:

| Enlace          | Abre                                   |
|-----------------|----------------------------------------|
| `/h/<token>`    | Ficha de la herramienta                |
| `/m/<token>`    | Formulario de movimiento ya rellenado  |
| `/i/<token>`    | Formulario de incidencia ya rellenado  |

Los enlaces también aceptan el código interno, por ejemplo `/h/TAL-001`. En **Etiquetas QR** puedes seleccionar herramientas, copias y destino (ficha, movimiento o incidencia). Ofrece A4 con etiquetas de 48 × 25, 60 × 40 o 90 × 60 mm, margen de 10 mm y separación de 2 mm, y térmicas de 50 × 30 o 100 × 50 mm. Imprime al 100 % o guarda en PDF desde el diálogo de impresión; comprueba las medidas de tu papel adhesivo. Si una etiqueta se pierde o se copia, el token se puede regenerar con `POST /api/herramientas/:id/regenerar-qr`.

Para usar los QR fuera de la oficina, publica el servidor en una dirección accesible y arráncalo con `PUBLIC_URL` antes de imprimir las etiquetas.

## API principal

Todas las rutas requieren la cabecera `Authorization: Bearer <token>`, salvo login, configuración y la lista de usuarios demo. El token se obtiene con `POST /api/login` usando `{ email, password }`, dura 30 días y se invalida con `POST /api/logout`. Si no se indica quién registra un movimiento o una incidencia, se usa el usuario con la sesión iniciada.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/dashboard` | Indicadores, incidencias, mantenimientos y últimos movimientos |
| GET | `/api/herramientas?q=&estado=&categoria=&ubicacion=&responsable=` | Búsqueda y filtros |
| GET | `/api/herramientas/:ref` | Ficha completa por id, código o token QR |
| POST/PUT | `/api/herramientas[/:id]` | Alta y edición |
| GET/POST | `/api/movimientos` | Historial y alta. PUT y DELETE devuelven 405 |
| GET/POST/PUT | `/api/incidencias` | `?pendientes=1` para las no resueltas |
| GET/POST/PUT | `/api/mantenimientos` | `?pendientes=1` para los programados |
| GET/POST/PUT | `/api/ubicaciones`, `/api/personas` | Maestros |

## Datos de ejemplo

Se cargan 7 personas, 9 ubicaciones, 20 herramientas, unos 25 movimientos, 5 incidencias y 11 mantenimientos. Todos son ficticios. Las fechas se generan relativas al día de creación, así que siempre hay mantenimientos vencidos y próximos que probar.

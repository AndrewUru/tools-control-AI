# MVP Android sin conexión

APK: `dist/android/herramientas-mvp.apk`. Compatible con Android 8 o superior.

## Presentación del 21 de octubre de 2026

1. Copia el APK al móvil por USB, Drive o el medio que prefieras.
2. Ábrelo en el móvil y permite instalar desde esa aplicación si Android lo solicita.
3. Abre **Herramientas MVP**. Entra con uno de los accesos de demostración, o con `laura.gomez@reformas-ejemplo.es` y contraseña `demo`.
4. Activa el modo avión para comprobar que funciona antes de salir.
5. Busca una herramienta, abre su ficha y registra una entrega a una obra. Muestra cómo cambian la ubicación y el historial.
6. Comunica una incidencia marcando la herramienta como averiada y resuélvela después. Revisa también el panel y los mantenimientos.

La aplicación incluye datos ficticios y no necesita ordenador, servidor ni Internet. Cada instalación tiene su propia base SQLite privada. Los cambios se conservan al cerrar la app y actualizar el APK con la misma firma; desinstalarla o borrar sus datos elimina el inventario local. No hay sincronización entre móviles.

Esta es una compilación de demostración firmada con la clave de desarrollo, no una publicación de Google Play. No se copia la base de datos real del ordenador. El login sirve para demostrar distintos usuarios locales.

## Alcance

Incluye búsqueda, filtros, fichas, altas y edición, ubicaciones, personas, movimientos, incidencias, fotos desde el selector de archivos, mantenimiento y generación de etiquetas. El lector integrado usa la cámara y decodifica los QR sin conexión. Pide permiso al abrirlo por primera vez; si se deniega, permite introducir el código manualmente. Los enlaces QR locales deben escanearse desde esta app, con la herramienta existente en su base de datos: no son enlaces públicos.

## Escanear e imprimir (versión 1.3)

- Pulsa el icono QR junto al buscador, concede permiso de cámara y apunta a la etiqueta. Abre la ficha, el formulario de movimiento o el de incidencia según el QR; no registra cambios automáticamente.
- En **Más → Etiquetas QR**, selecciona herramientas, copias y destino. En **Contenido**, elige **Solo QR** para imprimir únicamente el código, sin texto, ocupando el lado corto de la etiqueta. Desde una ficha, **Etiqueta** deja esa herramienta seleccionada.
- Formatos A4: 48 × 25 mm (30 etiquetas/hoja), 60 × 40 mm (18/hoja) y 90 × 60 mm (8/hoja). Margen exterior de 10 mm y separación de 2 mm: comprueba la compatibilidad con la referencia de tus hojas precortadas.
- También hay formatos térmicos de 50 × 30 y 100 × 50 mm, una etiqueta por página.
- **Imprimir / Guardar PDF** abre el diálogo del sistema. Selecciona A4, escala 100 %, sin ajuste ni márgenes adicionales. Primero prueba una hoja normal y superponla al papel adhesivo. Las impresoras deben estar disponibles mediante el servicio de impresión de Android.

Verificación QR: lectura de los cinco tamaños a 300 ppp, dimensiones y paginación PDF, selección y copias, lectura de un vídeo simulado, permiso denegado y liberación de cámara al cerrar. Falta la prueba física de cámara e impresora en el móvil.

## Volver a generar el APK

Verificación realizada: compilación del APK, firma APK v2, instalación en emulador y pruebas de API/SQLite en Node (login, validaciones, herramientas, movimientos, incidencias, mantenimiento y persistencia). La prueba completa de interfaz y persistencia dentro de Android no pudo completarse: el emulador Android 37 sufrió bloqueos de System UI y tiempos de espera. Antes de la presentación, abre el APK en tu móvil y recorre el guion anterior en modo avión.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1
```

Requiere Node.js 22.13+, Android SDK 36 y el JDK de Android Studio. `ANDROID_HOME` y `JAVA_HOME` permiten indicar otras instalaciones.

El generador copia la interfaz de `public`, adapta las rutas de `server.js` a SQLite nativo y genera una base nueva a partir de `db/schema.sql` y `db/seed.js`. El proyecto web sigue usando su servidor original. Los recursos Android generados se excluyen de Git; hay que generarlos antes de compilar desde Android Studio.

Referencia del selector de archivos WebView: https://developer.android.com/reference/android/webkit/WebChromeClient#onShowFileChooser(android.webkit.WebView,android.webkit.ValueCallback%3Candroid.net.Uri[]%3E,android.webkit.WebChromeClient.FileChooserParams)

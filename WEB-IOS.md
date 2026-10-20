# Web e iPhone/iPad

La interfaz web funciona en ordenador, móvil y tablet. En iPhone/iPad se puede instalar desde Safari como aplicación web (PWA). Esta edición utiliza la API y la base SQLite del servidor, por lo que necesita conexión para consultar y guardar el inventario.

## Ejecutar la versión web

Requiere Node.js 22.13 o superior:

```powershell
npm start
```

Abre `http://localhost:3000` en el ordenador. Para una prueba en la misma Wi-Fi, abre en el iPhone la dirección de red que muestra el servidor. El ordenador debe permanecer encendido y el firewall debe permitir la conexión.

La cámara y la instalación completa necesitan HTTPS (localhost es una excepción solo en el propio ordenador). Una dirección de red como `http://192.168...:3000` permite probar el inventario, pero no el escáner.

## Uso desde iOS

1. Sirve la aplicación en una dirección HTTPS accesible, con un certificado válido.
2. Abre esa dirección en Safari y entra con tu usuario.
3. Pulsa **Compartir → Añadir a pantalla de inicio**. Si aparece **Abrir como app web**, actívalo.
4. Abre Herramientas desde su icono.
5. Para escanear, pulsa el botón QR del buscador y permite el acceso a la cámara.
6. Para imprimir, entra en **Más → Etiquetas QR**, selecciona el formato A4 y las herramientas y pulsa **Imprimir / Guardar PDF**. Las opciones de impresión, guardado y AirPrint dependen del dispositivo y de la impresora.

También hay una guía de instalación dentro de **Más → Instalar aplicación**. Los campos tienen tamaño de letra de 16 px para evitar el zoom al escribir y la interfaz reserva espacio para las zonas seguras del iPhone.

Referencia de Apple: https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios

## Servidor compartido

Para usarla fuera de la Wi-Fi, despliega el servidor Node detrás de HTTPS. Necesita almacenamiento persistente para `data/` y `uploads/`; no debe alojarse como una web estática. Configura `PUBLIC_URL` con la dirección HTTPS definitiva antes de imprimir etiquetas.

Las sesiones de web e iOS que apunten al mismo servidor comparten el inventario. El APK Android sin conexión mantiene una base local independiente; esta modificación no añade sincronización entre esa base y el servidor.

No se ha publicado una dirección pública ni una aplicación en App Store. La instalación desde Safari no requiere compilar un paquete iOS. Una distribución nativa por App Store requiere un proyecto iOS, compilación y firma con las herramientas y cuenta de Apple.

## Conectividad y privacidad

El service worker guarda únicamente la pantalla pública de desconexión y los iconos. No guarda respuestas de la API, fotografías ni datos del inventario en Cache Storage. Tampoco registra operaciones pendientes para enviarlas después.

Si se pierde la conexión al abrir la app, muestra **No se puede conectar** y permite reintentar conservando la ruta. Si falla una petición durante el uso, se informa del fallo de conexión.

## Verificación

```powershell
# PLAYWRIGHT_MODULE puede apuntar a una instalación externa de Playwright.
node scripts/check-platforms.js
```

Comprueba Chromium de escritorio y WebKit con perfiles de iPhone e iPad: acceso, diseño, instrucciones de instalación, cámara denegada con entrada manual, lectura de QR y medidas de impresión A4. En Chromium también verifica la desconexión, la recuperación y que la caché no contenga datos privados.

Las pruebas de WebKit no sustituyen la comprobación física en Safari/iOS. Quedan por comprobar la cámara real, la instalación desde Safari y AirPrint en un iPhone.

Los iconos PNG se generan desde `public/icon.svg` con `scripts/build-app-icons.js`.

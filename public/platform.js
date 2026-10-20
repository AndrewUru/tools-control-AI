// Web/iOS integration. Android's packaged offline edition keeps its native bridge.
(() => {
  if (window.Android) return;
  const button = document.querySelector('#btn-install');
  const standalone = window.matchMedia('(display-mode: standalone)');
  const installed = () => standalone.matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installPrompt;
  const updateButton = () => { button.hidden = installed(); };
  updateButton();
  standalone.addEventListener('change', updateButton);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    updateButton();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; button.hidden = true; });
  button.addEventListener('click', async () => {
    cerrarMenu();
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      await prompt.prompt();
      await prompt.userChoice;
      return;
    }
    hoja(`<div class="sheet-head"><h3>Instalar Herramientas</h3><button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">${I('x')}</button></div>
      ${ios
        ? '<p>Abre esta dirección en Safari. Pulsa <strong>Compartir → Añadir a pantalla de inicio</strong> y, si aparece, activa <strong>Abrir como app web</strong>.</p>'
        : '<p>Abre el menú del navegador y elige <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>, si está disponible. También puedes seguir usándola en esta pestaña.</p>'}
      <p class="small muted">La versión web necesita conexión con el servidor para consultar y guardar el inventario. La cámara requiere una dirección HTTPS.</p>`);
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
      // Installation support must not prevent the online inventory from working.
    });
  }
})();

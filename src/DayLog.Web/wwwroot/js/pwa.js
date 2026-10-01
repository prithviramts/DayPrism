// Daywise: app-wide "installable app" behaviour, loaded on every page.
//   1. registers the service worker (sw.js) that makes the app open offline,
//   2. shows a banner while you're offline,
//   3. powers the "Install Daywise" button on the Settings page (Android / desktop Chrome & Edge).
(() => {
  'use strict';

  // ---- 1. Service worker. Browsers only allow it on https:// or localhost.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service worker not registered:', err));
    });
  }

  // ---- 2. Offline banner.
  const banner = document.getElementById('offline-banner');
  const updateBanner = () => { if (banner) banner.hidden = navigator.onLine; };
  window.addEventListener('online', updateBanner);
  window.addEventListener('offline', updateBanner);
  updateBanner();

  // ---- 3. Install button. Chrome/Edge fire "beforeinstallprompt" when the app can be installed;
  // we keep the event and replay it when you tap our button. Safari has no such event: iPhone
  // users install via Share → Add to Home Screen (instructions are on the Settings page).
  let installEvent = null;
  const isInstalled = () =>
    matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  function updateInstallUi() {
    document.querySelectorAll('[data-install-state]').forEach(el => {
      const state = isInstalled() ? 'installed' : installEvent ? 'available' : 'manual';
      el.hidden = el.dataset.installState !== state;
    });
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); // don't show the browser's mini-bar; we offer our own button
    installEvent = event;
    updateInstallUi();
  });

  window.addEventListener('appinstalled', () => {
    installEvent = null;
    updateInstallUi();
  });

  document.addEventListener('click', async event => {
    if (!event.target.closest('[data-action="install"]') || !installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    updateInstallUi();
  });

  updateInstallUi();
})();

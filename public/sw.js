// ponytail: SW auto-destructivo. NO llama clients.claim() a propósito —
// claim dispara "controllerchange", y los bundles viejos cacheados tienen
// un listener controllerchange->location.reload() que causaba un loop de recarga infinito.
// Este SW solo se desregistra y limpia caches; el bundle nuevo ya no registra ningún SW.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(
  self.registration.unregister()
    .then(() => caches.keys())
    .then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .catch(() => {})
))

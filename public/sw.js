// ponytail: no-op SW — sin fetch handler el browser maneja todo nativamente
// Existe solo para satisfacer manifest PWA sin interferir con requests
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keys = await caches.keys()
  await Promise.all(keys.map(k => caches.delete(k)))
  await self.clients.claim()
})()))

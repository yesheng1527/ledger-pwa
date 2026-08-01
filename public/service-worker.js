const LEDGER_CACHE_PREFIX = 'ledger-pwa';
const CLEANUP_MESSAGE = 'ledger-pwa-cache-cleared-20260801';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith(LEDGER_CACHE_PREFIX))
        .map((cacheName) => caches.delete(cacheName)),
    );

    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach((client) => client.postMessage(CLEANUP_MESSAGE));
    await self.registration.unregister();
  })());
});

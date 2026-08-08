const CACHE_VERSION = 'ledger-pwa-shell-v20260808';
const SCOPE = new URL(self.registration.scope);
const SHELL_URLS = [
  SCOPE.pathname,
  `${SCOPE.pathname}index.html`,
  `${SCOPE.pathname}manifest.webmanifest`,
  `${SCOPE.pathname}icons/icon-192-seabreeze.png`,
  `${SCOPE.pathname}icons/icon-512-seabreeze.png`,
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(SHELL_URLS.slice(1));
    const page = await fetch(SCOPE.pathname, { cache: 'no-store' });
    const html = await page.clone().text();
    await cache.put(SCOPE.pathname, page);
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], SCOPE).href)
      .filter((url) => url.startsWith(SCOPE.href));
    await cache.addAll([...new Set(assets)]);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('ledger-pwa-') && name !== CACHE_VERSION).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE_VERSION)).put(request, response.clone());
        return response;
      } catch {
        return (await caches.match(request))
          || (await caches.match(SCOPE.pathname))
          || (await caches.match(`${SCOPE.pathname}index.html`))
          || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE_VERSION)).put(request, response.clone());
    return response;
  })());
});

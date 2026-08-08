const CACHE_VERSION = 'ledger-pwa-shell-v20260808-3';
const SCOPE = new URL(self.registration.scope);
const SHELL_URLS = [
  SCOPE.pathname,
  `${SCOPE.pathname}index.html`,
  `${SCOPE.pathname}manifest.webmanifest`,
  `${SCOPE.pathname}icons/icon-192-seabreeze.png`,
  `${SCOPE.pathname}icons/icon-512-seabreeze.png`,
];

async function cacheWithRetry(cache, url, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        await cache.put(url, response);
        return true;
      }
    } catch {
      // A later attempt or the runtime cache can recover an optional asset.
    }
  }
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll([`${SCOPE.pathname}index.html`]);
    await Promise.all(SHELL_URLS.filter((url) => !url.endsWith('index.html')).map((url) => cacheWithRetry(cache, url)));
    const page = await fetch(SCOPE.pathname, { cache: 'no-store' });
    const html = await page.clone().text();
    await cache.put(SCOPE.pathname, page);
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], SCOPE).href)
      .filter((url) => url.startsWith(SCOPE.href));
    const manifestResponse = await fetch(`${SCOPE.pathname}asset-manifest.json`, { cache: 'no-store' });
    const buildAssets = manifestResponse.ok
      ? (await manifestResponse.json()).map((asset) => new URL(asset, SCOPE).href)
      : [];
    await cache.addAll([...new Set(assets)]);
    await Promise.all([...new Set(buildAssets)].map((asset) => cacheWithRetry(cache, asset)));
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

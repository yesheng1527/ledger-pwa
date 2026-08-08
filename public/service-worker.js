const CACHE_VERSION = 'ledger-pwa-shell-v20260808-6';
const SCOPE = new URL(self.registration.scope);
const SHELL_URLS = [
  SCOPE.pathname,
  `${SCOPE.pathname}index.html`,
  `${SCOPE.pathname}manifest.webmanifest`,
  `${SCOPE.pathname}icons/icon-192-seabreeze.png`,
  `${SCOPE.pathname}icons/icon-512-seabreeze.png`,
];

async function cacheWithRetry(cache, url, attempts = 2) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (response.ok) {
        await cache.put(url, response);
        return true;
      }
    } catch {
      // A later attempt or the runtime cache can recover an optional asset.
    } finally {
      clearTimeout(timeout);
    }
  }
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.all(SHELL_URLS.map((url) => cacheWithRetry(cache, url, 3)));
    const page = await cache.match(SCOPE.pathname) || await cache.match(`${SCOPE.pathname}index.html`);
    if (!page) return;
    const html = await page.clone().text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], SCOPE).href)
      .filter((url) => url.startsWith(SCOPE.href));
    let buildAssets = [];
    try {
      const manifestResponse = await fetch(`${SCOPE.pathname}asset-manifest.json`, { cache: 'no-store' });
      if (manifestResponse.ok) {
        buildAssets = (await manifestResponse.json())
          .filter((asset) => !asset.includes('exceljs.min-'))
          .map((asset) => new URL(asset, SCOPE).href);
      }
    } catch {
      // Runtime caching remains available if the optional manifest is unavailable.
    }
    const requiredAssets = assets.filter((asset) => /\.(?:js|css)(?:\?|$)/.test(asset));
    const optionalAssets = assets.filter((asset) => !requiredAssets.includes(asset));
    await Promise.all([...new Set(requiredAssets)].map((asset) => cacheWithRetry(cache, asset, 3)));
    await Promise.all([...new Set(optionalAssets)].map((asset) => cacheWithRetry(cache, asset)));
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

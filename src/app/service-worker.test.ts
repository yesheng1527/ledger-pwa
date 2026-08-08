import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production service worker', () => {
  const source = readFileSync(resolve(process.cwd(), 'public/service-worker.js'), 'utf8');

  it('caches the app shell and serves navigation offline', () => {
    expect(source).toContain("html.matchAll(/(?:src|href)");
    expect(source).toContain("fetch(`${SCOPE.pathname}asset-manifest.json`");
    expect(source).toContain('new Set(buildAssets)');
    expect(source).toContain("request.mode === 'navigate'");
    expect(source).toContain('caches.match(SCOPE.pathname)');
  });

  it('pre-caches build assets needed after an offline navigation', () => {
    expect(source).toContain('manifestResponse.json()');
    expect(source).toContain('new URL(asset, SCOPE).href');
    expect(source).toContain('cacheWithRetry(cache, asset)');
    expect(source).toContain("/\\.(?:js|css)(?:\\?|$)/");
    expect(source).toContain('new Set(requiredAssets)');
    expect(source).toContain('new Set(optionalAssets)');
    expect(source).not.toContain('cache.addAll');
    expect(source).toContain('new AbortController()');
    expect(source).toContain('controller.abort()');
    expect(source).toContain("!asset.includes('exceljs.min-')");
  });

  it('does not unregister itself or purge the active cache', () => {
    expect(source).not.toContain('registration.unregister');
    expect(source).toContain("name !== CACHE_VERSION");
  });
});

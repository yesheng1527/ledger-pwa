import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production service worker', () => {
  const source = readFileSync(resolve(process.cwd(), 'public/service-worker.js'), 'utf8');

  it('caches the app shell and serves navigation offline', () => {
    expect(source).toContain("html.matchAll(/(?:src|href)");
    expect(source).toContain("cache.addAll([...new Set(assets)])");
    expect(source).toContain("request.mode === 'navigate'");
    expect(source).toContain('caches.match(SCOPE.pathname)');
  });

  it('does not unregister itself or purge the active cache', () => {
    expect(source).not.toContain('registration.unregister');
    expect(source).toContain("name !== CACHE_VERSION");
  });
});

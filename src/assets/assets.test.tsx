import { describe, expect, it } from 'vitest';
import { assetRegistry, type AssetKey } from './registry';

const svgSources = import.meta.glob<string>('./**/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const required: AssetKey[] = [
  'brand:shell',
  'illustration:auth-seaside',
  'nav:home',
  'nav:ledger',
  'nav:entry',
  'nav:statistics',
  'nav:profile',
];

describe('minimal visual asset registry', () => {
  it('contains every shell asset as an independent file', () => {
    expect(Object.keys(assetRegistry).sort()).toEqual([...required].sort());
    for (const key of required) expect(assetRegistry[key]).toMatch(/\.(svg|webp)$/);
  });

  it('does not expose the full reference board to production code', () => {
    expect(Object.values(assetRegistry).join('\n')).not.toContain('visual-reference');
  });

  it('keeps every production SVG text-free and self-contained', () => {
    expect(Object.keys(svgSources)).toHaveLength(7);

    for (const [path, source] of Object.entries(svgSources)) {
      expect(source, `${path} has a viewBox`).toMatch(/<svg\b[^>]*\bviewBox="[^"]+"/);
      expect(source, `${path} has no text nodes`).not.toMatch(/<text\b/i);
      expect(source, `${path} has no embedded images`).not.toMatch(/data:image/i);
      expect(source, `${path} has no image elements`).not.toMatch(/<image\b/i);
      expect(source, `${path} uses rounded strokes`).toContain('stroke-linecap="round"');
    }
  });

  it('uses the locked artboards for icons and the auth illustration', () => {
    for (const [path, source] of Object.entries(svgSources)) {
      const viewBox = path.endsWith('auth-seaside.svg') ? '0 0 390 240' : '0 0 64 64';
      expect(source, path).toContain(`viewBox="${viewBox}"`);
    }
  });
});

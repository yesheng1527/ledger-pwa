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
  'illustration:home-seaside',
  'illustration:empty-ledger',
  'nav:home',
  'nav:ledger',
  'nav:entry',
  'nav:statistics',
  'nav:profile',
  'category:food',
  'category:transport',
  'category:shopping',
  'category:housing',
  'category:entertainment',
  'category:daily',
  'category:study',
  'category:medical',
  'category:travel',
  'category:income',
  'category:other',
];

describe('minimal visual asset registry', () => {
  it('contains every shell asset as an independent file', () => {
    expect(Object.keys(assetRegistry).sort()).toEqual([...required].sort());
    for (const key of required) expect(assetRegistry[key]).toMatch(/\.(svg|webp)$/);
  });

  it('does not expose the full reference board to production code', () => {
    expect(Object.values(assetRegistry).join('\n')).not.toContain('visual-reference');
  });

  it('is immutable at runtime', () => {
    expect(Object.isFrozen(assetRegistry)).toBe(true);
  });

  it.each([
    'illustration:home-seaside',
    'illustration:empty-ledger',
    'category:food',
    'category:transport',
    'category:shopping',
    'category:housing',
    'category:entertainment',
    'category:daily',
    'category:study',
    'category:medical',
    'category:travel',
    'category:income',
    'category:other',
  ] as const)('registers %s as an independent hashed asset', (key) => {
    expect((assetRegistry as Record<string, string>)[key]).toMatch(/\.(svg)(\?|$)/);
  });

  it('keeps every production SVG text-free and self-contained', () => {
    expect(Object.keys(svgSources)).toHaveLength(20);

    for (const [path, source] of Object.entries(svgSources)) {
      const sourceWithoutNamespace = source.replace(
        /\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/i,
        '',
      );

      expect(source, `${path} has a viewBox`).toMatch(/<svg\b[^>]*\bviewBox="[^"]+"/);
      expect(source, `${path} has no scripts`).not.toMatch(/<script\b/i);
      expect(source, `${path} has no foreign objects`).not.toMatch(/<foreignObject\b/i);
      expect(source, `${path} has no text nodes`).not.toMatch(/<text\b/i);
      expect(sourceWithoutNamespace, `${path} has no remote URLs`).not.toMatch(/https?:/i);
      expect(source, `${path} has no embedded images`).not.toMatch(/data:image/i);
      expect(source, `${path} has no image elements`).not.toMatch(/<image\b/i);
      expect(source, `${path} has no emoji glyphs`).not.toMatch(/\p{Emoji_Presentation}/u);
      expect(source, `${path} uses rounded strokes`).toContain('stroke-linecap="round"');
    }
  });

  it('uses the locked artboards for icons and the auth illustration', () => {
    for (const [path, source] of Object.entries(svgSources)) {
      if (path.includes('/categories/')) {
        expect(source, path).toContain('viewBox="0 0 48 48"');
      } else if (path.endsWith('auth-seaside.svg')) {
        expect(source, path).toContain('viewBox="0 0 390 240"');
      } else if (path.includes('/icons/')) {
        expect(source, path).toContain('viewBox="0 0 64 64"');
      }
    }
  });
});

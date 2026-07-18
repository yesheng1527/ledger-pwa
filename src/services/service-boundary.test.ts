import { describe, expect, it } from 'vitest';

const files = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('Supabase service boundary', () => {
  it('keeps Supabase runtime calls inside src/services', () => {
    const eligibleFiles = Object.entries(files).filter(
      ([path]) =>
        !path.startsWith('./') &&
        !path.endsWith('.test.ts') &&
        !path.endsWith('.test.tsx'),
    );

    expect(eligibleFiles, 'eligible source files').not.toHaveLength(0);

    for (const [path, source] of eligibleFiles) {
      expect(source, path).not.toMatch(
        /getSupabaseClient\(|\.rpc\(|createClient\(/,
      );
    }
  });
});

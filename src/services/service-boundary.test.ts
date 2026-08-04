import { describe, expect, it } from 'vitest';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';

const files = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const forbiddenSupabaseCall = /getSupabaseClient\(|\.rpc\(|createClient\(/;
const supabasePackage = '@supabase/supabase-js';

interface SourceToken {
  kind: SyntaxKind;
  value: string;
}

function sourceTokens(source: string): SourceToken[] {
  const scanner = createScanner(true, undefined, source);
  const tokens: SourceToken[] = [];
  let kind: SyntaxKind;
  do {
    kind = scanner.scan();
    tokens.push({ kind, value: scanner.getTokenValue() });
  } while (kind !== SyntaxKind.EndOfFile);
  return tokens;
}

function isSupabasePackage(token: SourceToken | undefined): boolean {
  return token?.value === supabasePackage &&
    (token.kind === SyntaxKind.StringLiteral ||
      token.kind === SyntaxKind.NoSubstitutionTemplateLiteral);
}

function findSupabaseRuntimeImport(source: string): string | undefined {
  const tokens = sourceTokens(source);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    const argument = tokens[index + 2];

    if (
      (token.kind === SyntaxKind.ImportKeyword ||
        token.kind === SyntaxKind.RequireKeyword ||
        (token.kind === SyntaxKind.Identifier && token.value === 'require')) &&
      next?.kind === SyntaxKind.OpenParenToken &&
      isSupabasePackage(argument)
    ) {
      return token.kind === SyntaxKind.ImportKeyword ? 'dynamic import' : 'require';
    }

    if (token.kind === SyntaxKind.ImportKeyword) {
      if (next?.kind === SyntaxKind.TypeKeyword) continue;
      if (isSupabasePackage(next)) return 'runtime import';
    }

    if (
      token.kind === SyntaxKind.FromKeyword &&
      isSupabasePackage(next)
    ) {
      let declarationIndex = index - 1;
      while (
        declarationIndex >= 0 &&
        tokens[declarationIndex].kind !== SyntaxKind.ImportKeyword &&
        tokens[declarationIndex].kind !== SyntaxKind.ExportKeyword &&
        tokens[declarationIndex].kind !== SyntaxKind.SemicolonToken
      ) {
        declarationIndex -= 1;
      }
      if (tokens[declarationIndex + 1]?.kind === SyntaxKind.TypeKeyword) continue;
      return 'runtime import or re-export';
    }
  }

  return undefined;
}

function findSupabaseBoundaryViolation(source: string): string | undefined {
  return findSupabaseRuntimeImport(source) ?? forbiddenSupabaseCall.exec(source)?.[0];
}

describe('Supabase runtime import detection', () => {
  it.each([
    [
      'type-only import',
      "import type { SupabaseClient } from '@supabase/supabase-js';",
    ],
    [
      'comments that mention the package',
      [
        "// import { createClient } from '@supabase/supabase-js';",
        "/* const sdk = await import('@supabase/supabase-js'); */",
      ].join('\n'),
    ],
  ])('allows %s', (_label, source) => {
    expect(findSupabaseBoundaryViolation(source)).toBeUndefined();
  });

  it.each([
    [
      'ordinary import',
      "import { createClient } from '@supabase/supabase-js';",
    ],
    [
      'aliased import and call',
      [
        "import { createClient as makeClient } from '@supabase/supabase-js';",
        "makeClient('url', 'key');",
      ].join('\n'),
    ],
    [
      'namespace import',
      "import * as supabase from '@supabase/supabase-js';",
    ],
    [
      'side-effect import',
      "import '@supabase/supabase-js';",
    ],
    [
      'dynamic import',
      "const sdk = await import('@supabase/supabase-js');",
    ],
    [
      'CommonJS require',
      "const sdk = require('@supabase/supabase-js');",
    ],
  ])('detects %s', (_label, source) => {
    expect(findSupabaseBoundaryViolation(source)).toBeDefined();
  });
});

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
      expect(findSupabaseBoundaryViolation(source), path).toBeUndefined();
    }
  });
});

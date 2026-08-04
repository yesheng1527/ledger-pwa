import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./AuthGate', () => ({
  AuthGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./providers', () => ({
  useAppRuntime: () => ({ ledgerViewModel: {}, session: null }),
}));

vi.mock('./AppShell', () => ({
  AppShell: () => <main>五页应用</main>,
}));

describe('App', () => {
  it('mounts the rebuilt five-page application after authentication', () => {
    const { getByRole } = render(<App />);

    expect(getByRole('main')).toHaveTextContent('五页应用');
  });
});

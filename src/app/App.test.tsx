import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./AuthGate', () => ({
  AuthGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('App', () => {
  it('composes the authenticated application shell', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '海风小账本' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '首页',
      '流水',
      '记账',
      '统计',
      '我的',
    ]);
  });
});

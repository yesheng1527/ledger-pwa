import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the product name without legacy markup', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '海风小账本' })).toBeInTheDocument();
  });
});

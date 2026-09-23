import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('shows the empty week with an import call to action', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Inget program än' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Importera program' })).toHaveAttribute('href', '#/import');
  });
});

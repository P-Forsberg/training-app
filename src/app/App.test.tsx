import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSyncStore } from '@/data/sync/engine';
import { App } from './App';

describe('App', () => {
  it('with a backend and no signed-in user, only the login screen is shown', async () => {
    useSyncStore.setState({ state: 'signed-out', user: null, recovery: false });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Logga in' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Huvudmeny' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fråga assistenten' })).not.toBeInTheDocument();
    useSyncStore.setState({ state: 'local-only' });
  });

  it('shows the empty week with an import call to action', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Inget program än' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Importera program' })).toHaveAttribute('href', '#/import');
  });
});

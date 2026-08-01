import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const payloadFor = (url: string) => {
  if (url.endsWith('/indications')) return { indications: [] };
  if (url.endsWith('/churches')) return { churches: [] };
  if (url.endsWith('/municipalities')) return { municipalities: [] };
  if (url.endsWith('/settings')) return { settings: {} };
  if (url.endsWith('/whatsapp/instance')) return { configured: false };
  return {};
};

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(
    JSON.stringify(payloadFor(String(input))),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )));
});

describe('App messages navigation', () => {
  it('lets a coordinator open the Mensagens area from application navigation', async () => {
    localStorage.setItem('guti_user', JSON.stringify({ id: 'coordinator-1', email: 'coord@test.local', name: 'Coord', role: 'COORDENADOR' }));
    const user = userEvent.setup();
    render(<App />);
    const navigationButtons = screen.getAllByRole('button', { name: 'Mensagens' });
    await user.click(navigationButtons[0]);
    expect(await screen.findByRole('heading', { name: 'Mensagens' })).toBeInTheDocument();
  });

  it('does not expose Mensagens navigation to a regional leader', async () => {
    localStorage.setItem('guti_user', JSON.stringify({ id: 'leader-1', email: 'leader@test.local', name: 'Leader', role: 'LIDER_REGIONAL' }));
    render(<App />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Mensagens' })).not.toBeInTheDocument();
  });
});

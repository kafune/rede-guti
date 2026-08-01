import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SuppressionsPanel } from './SuppressionsPanel';

const suppression = {
  id: 'suppression-1', tenantId: 'tenant-1', phoneNormalized: '5511987654321', source: 'MANUAL',
  reason: 'Pedido do contato', active: true, suppressedAt: '2026-08-01T10:00:00Z',
  reauthorizedAt: null, createdAt: '2026-08-01T10:00:00Z', updatedAt: '2026-08-01T10:00:00Z',
};

describe('SuppressionsPanel', () => {
  it('creates a suppression and explicitly reauthorizes an active entry', async () => {
    const user = userEvent.setup();
    const api = {
      listSuppressions: vi.fn().mockResolvedValue([suppression]),
      createSuppression: vi.fn().mockResolvedValue(suppression),
      reauthorizeSuppression: vi.fn().mockResolvedValue({ ...suppression, active: false }),
    } as any;
    render(<SuppressionsPanel api={api} />);
    expect(await screen.findByText(/5511987654321/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Telefone'), '11987654321');
    await user.type(screen.getByLabelText('Motivo'), 'Solicitação manual');
    await user.click(screen.getByRole('button', { name: 'Adicionar supressão' }));
    expect(api.createSuppression).toHaveBeenCalledWith({ phone: '11987654321', reason: 'Solicitação manual' });
    await user.click(screen.getByRole('button', { name: 'Reautorizar com consentimento' }));
    expect(api.reauthorizeSuppression).toHaveBeenCalledWith('suppression-1');
  });
});

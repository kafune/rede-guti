import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WhatsAppConnection } from './WhatsAppConnection';

describe('WhatsAppConnection', () => {
  it('creates, connects with pair code, and disconnects an instance', async () => {
    const user = userEvent.setup();
    const configured = { configured: true as const, instanceId: 'instance-1', name: 'Campanha', phone: null, status: 'disconnected' };
    const api = {
      getInstance: vi.fn().mockResolvedValueOnce({ configured: false }).mockResolvedValue(configured),
      createInstance: vi.fn().mockResolvedValue(configured),
      connectInstance: vi.fn().mockResolvedValue({ paircode: 'ABCD-1234' }),
      disconnectInstance: vi.fn().mockResolvedValue({ response: 'disconnected' }),
    } as any;
    render(<WhatsAppConnection api={api} />);
    await user.clear(await screen.findByLabelText('Nome da instância'));
    await user.type(screen.getByLabelText('Nome da instância'), 'Campanha');
    await user.click(screen.getByRole('button', { name: 'Criar instância' }));
    expect(api.createInstance).toHaveBeenCalledWith('Campanha');
    await user.click(await screen.findByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText(/ABCD-1234/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desconectar' }));
    expect(api.disconnectInstance).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/ABCD-1234/)).not.toBeInTheDocument();
  });
});

import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignHistory } from './CampaignHistory';
import type { WhatsAppApi, WhatsAppCampaign, WhatsAppCampaignStatus } from '../../whatsapp/types';

function campaign(status: WhatsAppCampaignStatus, overrides: Partial<WhatsAppCampaign> = {}): WhatsAppCampaign {
  return {
    id: `campaign-${status}`, tenantId: 'tenant-1', createdById: 'coordinator-1', name: `Campanha ${status}`,
    status, category: 'UTILITY', audienceFilter: { type: 'SUPPORTERS' },
    content: { primary: { type: 'text', text: 'Olá' }, sequence: [] },
    consentAt: '2026-08-01T10:00:00.000Z', scheduledAt: null, remoteFolderId: 'folder-1',
    remoteFolderStatus: null, remoteFolderCreatedAt: null, totalRecipients: 10, validRecipients: 8,
    excludedRecipients: 2, queuedCount: 8, sentCount: 7, failedCount: 1, deliveredCount: 6,
    readCount: 5, playedCount: 1, replyCount: 2, optOutCount: 1, lastError: null,
    queuedAt: null, startedAt: null, pausedAt: null, completedAt: null, canceledAt: null,
    failedAt: null, createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise; reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const apiFor = (campaigns: WhatsAppCampaign[]) => ({
  listCampaigns: vi.fn().mockResolvedValue(campaigns),
  getCampaign: vi.fn().mockImplementation(async (id: string) => ({ ...campaigns.find((item) => item.id === id)!, recipients: [] })),
  syncCampaigns: vi.fn().mockResolvedValue({ synced: campaigns.length, campaignIds: campaigns.map(({ id }) => id) }),
  syncCampaign: vi.fn(), pauseCampaign: vi.fn(), resumeCampaign: vi.fn(), cancelCampaign: vi.fn(),
  rescheduleCampaign: vi.fn(), updateCampaign: vi.fn(), retryFailedRecipients: vi.fn(),
}) as unknown as WhatsAppApi;

afterEach(() => vi.useRealTimers());

describe('CampaignHistory', () => {
  it('polls every 15 seconds while an active status is listed and stops after unmount', async () => {
    vi.useFakeTimers();
    const api = apiFor([campaign('SENDING')]);
    const { unmount } = render(<CampaignHistory api={api} />);
    await act(async () => Promise.resolve());
    expect(api.listCampaigns).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(api.syncCampaigns).toHaveBeenCalledTimes(1);
    expect(api.listCampaigns).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(api.listCampaigns).toHaveBeenCalledTimes(2);
  });

  it('does not poll when every listed campaign is terminal', async () => {
    vi.useFakeTimers();
    const api = apiFor([campaign('COMPLETED'), campaign('FAILED')]);
    render(<CampaignHistory api={api} />);
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(45_000));
    expect(api.syncCampaigns).not.toHaveBeenCalled();
    expect(api.listCampaigns).toHaveBeenCalledTimes(1);
  });

  it('reports a failed manual active sync without leaking an unhandled rejection', async () => {
    const user = userEvent.setup();
    const api = apiFor([campaign('SENDING')]);
    api.syncCampaigns = vi.fn().mockRejectedValue(new Error('Falha ao sincronizar agora'));
    render(<CampaignHistory api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Sincronizar ativas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao sincronizar agora');
  });

  it.each([
    ['SENDING', { remoteFolderStatus: 'sending' }, ['Pausar', 'Cancelar'], ['Retomar', 'Editar', 'Reenviar falhas']],
    ['PAUSED', { remoteFolderStatus: 'paused' }, ['Retomar', 'Cancelar'], ['Pausar', 'Editar', 'Reenviar falhas']],
    ['SCHEDULED', { remoteFolderStatus: 'scheduled', sentCount: 0, deliveredCount: 0, readCount: 0, playedCount: 0 }, ['Pausar', 'Cancelar', 'Editar'], ['Retomar', 'Reenviar falhas']],
    ['DRAFT', { remoteFolderId: null, remoteFolderStatus: null, sentCount: 0, deliveredCount: 0, readCount: 0, playedCount: 0 }, ['Editar'], ['Pausar', 'Retomar', 'Cancelar', 'Reenviar falhas']],
    ['FAILED', { failedCount: 2 }, ['Reenviar falhas'], ['Pausar', 'Retomar', 'Cancelar', 'Editar']],
    ['COMPLETED', {}, [], ['Pausar', 'Retomar', 'Cancelar', 'Editar', 'Reenviar falhas']],
  ] as const)('shows backend-compatible lifecycle controls for %s', async (status, overrides, visible, hidden) => {
    const user = userEvent.setup();
    const api = apiFor([campaign(status, { failedCount: status === 'FAILED' ? 2 : 0, ...overrides })]);
    render(<CampaignHistory api={api} />);
    const card = await screen.findByRole('article', { name: `Campanha ${status}` });
    await user.click(within(card).getByRole('button', { name: 'Ver detalhes' }));
    for (const label of visible) expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    for (const label of hidden) expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
  });

  it('only offers rescheduling inside the edit form for an unstarted campaign', async () => {
    const user = userEvent.setup();
    const item = campaign('SCHEDULED', {
      remoteFolderStatus: 'scheduled', sentCount: 0, deliveredCount: 0, readCount: 0, playedCount: 0,
    });
    const api = apiFor([item]);
    render(<CampaignHistory api={api} />);
    await user.click(within(await screen.findByRole('article', { name: item.name }))
      .getByRole('button', { name: 'Ver detalhes' }));
    expect(screen.queryByRole('button', { name: 'Reagendar' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('button', { name: 'Reagendar' })).toBeInTheDocument();
  });

  it('renders every campaign metric and recipient errors in detail', async () => {
    const user = userEvent.setup();
    const item = campaign('COMPLETED');
    const api = apiFor([item]);
    api.getCampaign = vi.fn().mockResolvedValue({
      ...item,
      recipients: [{
        id: 'recipient-1', tenantId: 'tenant-1', campaignId: item.id, origin: 'INDICATION', sourceId: 'source-1',
        sourceName: 'Maria', personName: 'Maria', phoneOriginal: '11987654321', phoneNormalized: '5511987654321',
        personalizedContent: item.content, isValid: true, exclusionReason: null, status: 'FAILED',
        externalMessageIds: [], externalChatId: null, error: 'Número indisponível', queuedAt: null,
        sentAt: null, deliveredAt: null, readAt: null, playedAt: null, failedAt: '2026-08-01T10:00:00.000Z',
        canceledAt: null, createdAt: item.createdAt, updatedAt: item.updatedAt,
      }],
    });
    render(<CampaignHistory api={api} />);
    const card = await screen.findByRole('article', { name: item.name });
    for (const metric of ['8 na fila', '7 enviados', '1 falhou', '6 entregues', '5 lidos', '1 reproduzido', '2 respostas', '1 opt-out']) {
      expect(within(card).getByText(metric)).toBeInTheDocument();
    }
    await user.click(within(card).getByRole('button', { name: 'Ver detalhes' }));
    expect(await screen.findByText('Número indisponível')).toBeInTheDocument();
  });

  it('locks retry synchronously, then upserts the child and suppresses retry on its original', async () => {
    const user = userEvent.setup();
    const original = campaign('FAILED', {
      id: 'campaign-original', name: 'Campanha original', failedCount: 2,
      sentCount: 0, deliveredCount: 0, readCount: 0, playedCount: 0,
    });
    const retry = campaign('QUEUED', {
      id: 'campaign-retry', name: 'Campanha original (retry)', failedCount: 0,
      sentCount: 0, deliveredCount: 0, readCount: 0, playedCount: 0,
      audienceFilter: { type: 'RETRY', retryOfCampaignId: original.id },
    });
    const api = apiFor([original]);
    api.listCampaigns = vi.fn()
      .mockResolvedValueOnce([original])
      .mockResolvedValue([original, retry]);
    api.getCampaign = vi.fn().mockImplementation(async (id: string) => ({
      ...(id === retry.id ? retry : original), recipients: [],
    }));
    const pendingRetry = deferred<WhatsAppCampaign>();
    api.retryFailedRecipients = vi.fn().mockReturnValue(pendingRetry.promise);

    render(<CampaignHistory api={api} />);
    await user.click(within(await screen.findByRole('article', { name: original.name }))
      .getByRole('button', { name: 'Ver detalhes' }));
    const retryButton = await screen.findByRole('button', { name: 'Reenviar falhas' });
    act(() => { retryButton.click(); retryButton.click(); });

    expect(api.retryFailedRecipients).toHaveBeenCalledTimes(1);
    expect(api.retryFailedRecipients).toHaveBeenCalledWith(
      original.id,
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
    expect(retryButton).toBeDisabled();
    expect(retryButton).toHaveTextContent('Reenviando falhas');
    expect(screen.getByRole('button', { name: 'Sincronizar' })).toBeDisabled();

    await act(async () => pendingRetry.resolve(retry));

    expect(await screen.findByRole('heading', { name: retry.name })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reenviar falhas' })).not.toBeInTheDocument();
    expect(api.listCampaigns).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: /Voltar ao histórico/ }));
    await user.click(within(await screen.findByRole('article', { name: original.name }))
      .getByRole('button', { name: 'Ver detalhes' }));
    expect(await screen.findByRole('heading', { name: original.name })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reenviar falhas' })).not.toBeInTheDocument();
  });

  it('reuses the retry command UUID after a failed request', async () => {
    const user = userEvent.setup();
    const original = campaign('FAILED', {
      id: 'campaign-retry-key-original', name: 'Retry key original', failedCount: 1,
    });
    const child = campaign('QUEUED', {
      id: 'campaign-retry-key-child', name: 'Retry key child', failedCount: 0,
      audienceFilter: { type: 'RETRY', retryOfCampaignId: original.id },
    });
    const api = apiFor([original]);
    api.listCampaigns = vi.fn().mockResolvedValueOnce([original]).mockResolvedValue([original, child]);
    api.getCampaign = vi.fn().mockImplementation(async (id: string) => ({
      ...(id === child.id ? child : original), recipients: [],
    }));
    api.retryFailedRecipients = vi.fn()
      .mockRejectedValueOnce(new Error('Resposta perdida no retry'))
      .mockResolvedValue(child);
    render(<CampaignHistory api={api} />);
    await user.click(within(await screen.findByRole('article', { name: original.name }))
      .getByRole('button', { name: 'Ver detalhes' }));

    await user.click(await screen.findByRole('button', { name: 'Reenviar falhas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Resposta perdida no retry');
    await user.click(screen.getByRole('button', { name: 'Reenviar falhas' }));
    expect(await screen.findByRole('heading', { name: child.name })).toBeInTheDocument();

    expect(api.retryFailedRecipients).toHaveBeenCalledTimes(2);
    expect((api.retryFailedRecipients as any).mock.calls[0][1])
      .toBe((api.retryFailedRecipients as any).mock.calls[1][1]);
  });

  it('keeps the edit dialog open when saving fails and closes it only after success', async () => {
    const user = userEvent.setup();
    const item = campaign('SCHEDULED', {
      remoteFolderStatus: 'scheduled', sentCount: 0, deliveredCount: 0, readCount: 0, playedCount: 0,
    });
    const api = apiFor([item]);
    api.updateCampaign = vi.fn()
      .mockRejectedValueOnce(new Error('Falha ao editar'))
      .mockResolvedValueOnce({ ...item, name: 'Nome corrigido' });
    render(<CampaignHistory api={api} />);
    await user.click(within(await screen.findByRole('article', { name: item.name }))
      .getByRole('button', { name: 'Ver detalhes' }));
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await user.clear(screen.getByLabelText('Novo nome'));
    await user.type(screen.getByLabelText('Novo nome'), 'Nome corrigido');

    await user.click(screen.getByRole('button', { name: 'Salvar edição' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao editar');
    expect(screen.getByRole('button', { name: 'Salvar edição' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salvar edição' }));
    expect(await screen.findByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar edição' })).not.toBeInTheDocument();
  });
});

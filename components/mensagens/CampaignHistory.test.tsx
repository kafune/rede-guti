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

  it.each([
    ['SENDING', ['Pausar', 'Cancelar'], ['Retomar', 'Editar', 'Reenviar falhas']],
    ['PAUSED', ['Retomar', 'Cancelar', 'Editar'], ['Pausar', 'Reenviar falhas']],
    ['SCHEDULED', ['Pausar', 'Cancelar', 'Editar'], ['Retomar', 'Reenviar falhas']],
    ['FAILED', ['Reenviar falhas'], ['Pausar', 'Retomar', 'Cancelar', 'Editar']],
    ['COMPLETED', [], ['Pausar', 'Retomar', 'Cancelar', 'Editar', 'Reenviar falhas']],
  ] as const)('shows lifecycle controls allowed for %s', async (status, visible, hidden) => {
    const user = userEvent.setup();
    const api = apiFor([campaign(status, { failedCount: status === 'FAILED' ? 2 : 0 })]);
    render(<CampaignHistory api={api} />);
    const card = await screen.findByRole('article', { name: `Campanha ${status}` });
    await user.click(within(card).getByRole('button', { name: 'Ver detalhes' }));
    for (const label of visible) expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    for (const label of hidden) expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
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
});

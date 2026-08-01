import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MensagensPanel } from './MensagensPanel';
import type { AudiencePreview, WhatsAppApi, WhatsAppCampaign } from '../../whatsapp/types';

const content = { primary: { type: 'text' as const, text: 'Olá, {{primeiro_nome}}' }, sequence: [] };

const preview: AudiencePreview = {
  totals: { source: 8, valid: 4, invalid: 1, duplicate: 2, suppressed: 1 },
  recipients: [{
    origin: 'INDICATION', sourceId: 'supporter-1', sourceName: 'Maria', personName: 'Maria Silva',
    phoneOriginal: '(11) 98765-4321', phoneNormalized: '5511987654321', isValid: true,
    exclusionReason: null, personalizedContent: { primary: { type: 'text', text: 'Olá, Maria' }, sequence: [] },
  }],
  samples: [{
    sourceId: 'supporter-1', personName: 'Maria Silva', phoneNormalized: '5511987654321',
    content: { primary: { type: 'text', text: 'Olá, Maria' }, sequence: [] },
  }],
};

function campaign(overrides: Partial<WhatsAppCampaign> = {}): WhatsAppCampaign {
  return {
    id: 'campaign-1', tenantId: 'tenant-1', createdById: 'coordinator-1', name: 'Campanha',
    status: 'COMPLETED', category: 'UTILITY', audienceFilter: { type: 'SUPPORTERS' }, content,
    consentAt: '2026-08-01T10:00:00.000Z', scheduledAt: null, remoteFolderId: 'folder-1',
    remoteFolderStatus: 'Completed', remoteFolderCreatedAt: '2026-08-01T10:00:00.000Z',
    totalRecipients: 8, validRecipients: 4, excludedRecipients: 4, queuedCount: 4, sentCount: 4,
    failedCount: 0, deliveredCount: 3, readCount: 2, playedCount: 1, replyCount: 1,
    optOutCount: 1, lastError: null, queuedAt: '2026-08-01T10:00:00.000Z', startedAt: null,
    pausedAt: null, completedAt: '2026-08-01T10:10:00.000Z', canceledAt: null, failedAt: null,
    createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T10:10:00.000Z',
    ...overrides,
  };
}

function fakeApi(overrides: Partial<WhatsAppApi> = {}): WhatsAppApi {
  const terminal = campaign();
  return {
    getInstance: vi.fn().mockResolvedValue({ configured: false }),
    createInstance: vi.fn(), connectInstance: vi.fn(), disconnectInstance: vi.fn(),
    uploadMedia: vi.fn(), listTemplates: vi.fn().mockResolvedValue([]), createTemplate: vi.fn(),
    updateTemplate: vi.fn(), setTemplateFavorite: vi.fn(), duplicateTemplate: vi.fn(), deleteTemplate: vi.fn(),
    previewCampaign: vi.fn().mockResolvedValue(preview), sendTestCampaign: vi.fn(), createCampaign: vi.fn().mockResolvedValue(terminal),
    listCampaigns: vi.fn().mockResolvedValue([terminal]), getCampaign: vi.fn().mockResolvedValue({ ...terminal, recipients: [] }),
    syncCampaigns: vi.fn(), syncCampaign: vi.fn(), pauseCampaign: vi.fn(), resumeCampaign: vi.fn(),
    cancelCampaign: vi.fn(), rescheduleCampaign: vi.fn(), updateCampaign: vi.fn(), retryFailedRecipients: vi.fn(),
    listSuppressions: vi.fn().mockResolvedValue([]), createSuppression: vi.fn(), reauthorizeSuppression: vi.fn(),
    ...overrides,
  };
}

describe('MensagensPanel', () => {
  it('serializes supporter audience filters and hides church filtering when disabled', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<MensagensPanel api={api} churchFieldEnabled={false} />);

    await user.click(screen.getByRole('tab', { name: 'Nova campanha' }));
    expect(screen.queryByLabelText('IDs de igrejas')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Tipo de público'), 'SUPPORTERS');
    await user.click(screen.getByLabelText('Apoiadores ativos'));
    await user.type(screen.getByLabelText('IDs de municípios'), 'city-1, city-2');
    await user.type(screen.getByLabelText('IDs de lideranças'), 'leader-1');
    await user.type(screen.getByLabelText('Criados a partir de'), '2026-08-02T09:30');
    await user.click(screen.getByRole('button', { name: 'Continuar para conteúdo' }));
    fireEvent.change(screen.getByLabelText('Mensagem principal'), { target: { value: 'Olá, {{primeiro_nome}}' } });
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));

    expect(api.previewCampaign).toHaveBeenCalledWith({
      category: 'UTILITY',
      audienceFilter: {
        type: 'SUPPORTERS', statuses: ['ATIVO'], municipalityIds: ['city-1', 'city-2'], leaderIds: ['leader-1'],
        createdFrom: new Date('2026-08-02T09:30').toISOString(),
      },
      content,
    });
  });

  it('serializes event guest status and explicit selections', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<MensagensPanel api={api} />);
    await user.click(screen.getByRole('tab', { name: 'Nova campanha' }));
    await user.selectOptions(screen.getByLabelText('Tipo de público'), 'EVENT_GUESTS');
    await user.type(screen.getByLabelText('ID do evento'), 'event-1');
    await user.click(screen.getByLabelText('Convidados confirmados'));
    await user.type(screen.getByLabelText('IDs de convidados'), 'guest-1, guest-2');
    await user.click(screen.getByRole('button', { name: 'Continuar para conteúdo' }));
    fireEvent.change(screen.getByLabelText('Mensagem principal'), { target: { value: 'Olá' } });
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
    expect(api.previewCampaign).toHaveBeenCalledWith(expect.objectContaining({ audienceFilter: {
      type: 'EVENT_GUESTS', eventId: 'event-1', statuses: ['CONFIRMADO'], selectedIds: ['guest-1', 'guest-2'],
    } }));
  });

  it('serializes team status, contact kinds, teams and selected contacts', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<MensagensPanel api={api} />);
    await user.click(screen.getByRole('tab', { name: 'Nova campanha' }));
    await user.selectOptions(screen.getByLabelText('Tipo de público'), 'TEAM_CONTACTS');
    await user.click(screen.getByLabelText('Equipes ativas'));
    await user.click(screen.getByLabelText('Membros'));
    await user.type(screen.getByLabelText('IDs de equipes'), 'team-1');
    await user.type(screen.getByLabelText('IDs de contatos'), 'member-1');
    await user.click(screen.getByRole('button', { name: 'Continuar para conteúdo' }));
    fireEvent.change(screen.getByLabelText('Mensagem principal'), { target: { value: 'Olá' } });
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
    expect(api.previewCampaign).toHaveBeenCalledWith(expect.objectContaining({ audienceFilter: {
      type: 'TEAM_CONTACTS', statuses: ['ATIVA'], contactKinds: ['MEMBER'], teamIds: ['team-1'], selectedIds: ['member-1'],
    } }));
  });

  it('shows preview totals, personalized sample and exclusion information', async () => {
    const user = userEvent.setup();
    render(<MensagensPanel api={fakeApi()} />);
    await user.click(screen.getByRole('tab', { name: 'Nova campanha' }));
    await user.click(screen.getByRole('button', { name: 'Continuar para conteúdo' }));
    await user.type(screen.getByLabelText('Mensagem principal'), 'Olá, {{primeiro_nome}}');
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));

    const summary = screen.getByRole('region', { name: 'Resumo da prévia' });
    expect(within(summary).getByText('4 válidos')).toBeInTheDocument();
    expect(within(summary).getByText('1 inválido')).toBeInTheDocument();
    expect(within(summary).getByText('2 duplicados')).toBeInTheDocument();
    expect(within(summary).getByText('1 suprimido')).toBeInTheDocument();
    expect(screen.getByText('Olá, Maria')).toBeInTheDocument();
  });

  it('requires explicit consent and converts a local schedule once before create', async () => {
    const user = userEvent.setup();
    const createCampaign = vi.fn().mockResolvedValue(campaign());
    render(<MensagensPanel api={fakeApi({ createCampaign })} />);
    await user.click(screen.getByRole('tab', { name: 'Nova campanha' }));
    await user.click(screen.getByRole('button', { name: 'Continuar para conteúdo' }));
    await user.type(screen.getByLabelText('Mensagem principal'), 'Olá, {{primeiro_nome}}');
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
    await user.click(screen.getByRole('button', { name: 'Continuar para confirmação' }));
    await user.type(screen.getByLabelText('Nome da campanha'), 'Mobilização');
    await user.type(screen.getByLabelText('Agendar para'), '2026-08-02T09:30');

    expect(screen.getByRole('button', { name: 'Criar campanha' })).toBeDisabled();
    await user.click(screen.getByLabelText('Confirmo que há consentimento para este envio'));
    await user.click(screen.getByRole('button', { name: 'Criar campanha' }));

    expect(createCampaign).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Mobilização', consentimentoConfirmado: true,
      scheduledAt: new Date('2026-08-02T09:30').toISOString(),
    }));
  });

  it('switches across all four functional tabs', async () => {
    const user = userEvent.setup();
    render(<MensagensPanel api={fakeApi()} />);
    for (const [tab, heading] of [
      ['Conexão', 'Conexão com WhatsApp'], ['Nova campanha', 'Público'],
      ['Histórico', 'Histórico de campanhas'], ['Supressões', 'Lista de supressões'],
    ]) {
      await user.click(screen.getByRole('tab', { name: tab }));
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });
});

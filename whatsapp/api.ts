import type {
  AudiencePreview,
  CreateCampaignInput,
  PreviewCampaignInput,
  TestCampaignInput,
  WhatsAppApi,
  WhatsAppCampaign,
  WhatsAppCampaignContent,
  WhatsAppCampaignDetail,
  WhatsAppConnectResponse,
  WhatsAppDisconnectResponse,
  WhatsAppInstance,
  WhatsAppMedia,
  WhatsAppSuppression,
  WhatsAppTemplate,
} from './types';

const getApiBase = () => {
  const configured = String((import.meta as any).env?.VITE_API_URL ?? '').trim();
  const hostname = typeof window === 'undefined' ? 'localhost' : window.location.hostname;
  const local = `http://${hostname || 'localhost'}:4000`;
  if (!configured || configured.toLowerCase() === 'auto') return local;
  if ((configured.includes('localhost') || configured.includes('127.0.0.1'))
    && !['localhost', '127.0.0.1'].includes(hostname)) return local;
  return configured;
};

export class WhatsAppApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof localStorage === 'undefined' ? null : localStorage.getItem('guti_token');
  const isForm = options.body instanceof FormData;
  const response = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers: {
      ...(!isForm && options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
    throw new WhatsAppApiError(payload.error ?? payload.message ?? 'Erro ao conectar com o WhatsApp.', response.status);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

const body = (value: unknown): Pick<RequestInit, 'body'> => ({ body: JSON.stringify(value) });
const campaignAction = async (id: string, action: 'pause' | 'resume' | 'cancel' | 'sync' | 'retry-failed') =>
  (await request<{ campaign: WhatsAppCampaign }>(`/whatsapp/campaigns/${id}/${action}`, { method: 'POST' })).campaign;

export const whatsappApi: WhatsAppApi = {
  getInstance: () => request<WhatsAppInstance>('/whatsapp/instance'),
  createInstance: async (name) => request<WhatsAppInstance>('/whatsapp/instance', { method: 'POST', ...body({ name }) }),
  connectInstance: () => request<WhatsAppConnectResponse>('/whatsapp/instance/connect', { method: 'POST' }),
  disconnectInstance: () => request<WhatsAppDisconnectResponse>('/whatsapp/instance/disconnect', { method: 'POST' }),
  uploadMedia: async (file) => {
    const form = new FormData();
    form.append('file', file);
    return (await request<{ media: WhatsAppMedia }>('/whatsapp/media', { method: 'POST', body: form })).media;
  },
  listTemplates: async () => (await request<{ templates: WhatsAppTemplate[] }>('/whatsapp/templates')).templates,
  createTemplate: async (input) =>
    (await request<{ template: WhatsAppTemplate }>('/whatsapp/templates', { method: 'POST', ...body(input) })).template,
  updateTemplate: async (id, input) =>
    (await request<{ template: WhatsAppTemplate }>(`/whatsapp/templates/${id}`, { method: 'PATCH', ...body(input) })).template,
  setTemplateFavorite: async (id, favorite) =>
    (await request<{ template: WhatsAppTemplate }>(`/whatsapp/templates/${id}/favorite`, { method: 'PATCH', ...body({ favorite }) })).template,
  duplicateTemplate: async (id, name) =>
    (await request<{ template: WhatsAppTemplate }>(`/whatsapp/templates/${id}/duplicate`, { method: 'POST', ...body({ name }) })).template,
  deleteTemplate: (id) => request<void>(`/whatsapp/templates/${id}`, { method: 'DELETE' }),
  previewCampaign: (input: PreviewCampaignInput) =>
    request<AudiencePreview>('/whatsapp/campaigns/preview', { method: 'POST', ...body(input) }),
  sendTestCampaign: (input: TestCampaignInput) =>
    request<{ sent: true }>('/whatsapp/campaigns/test', { method: 'POST', ...body(input) }),
  createCampaign: async (input: CreateCampaignInput) =>
    (await request<{ campaign: WhatsAppCampaign }>('/whatsapp/campaigns', { method: 'POST', ...body(input) })).campaign,
  listCampaigns: async () => (await request<{ campaigns: WhatsAppCampaign[] }>('/whatsapp/campaigns')).campaigns,
  getCampaign: async (id) =>
    (await request<{ campaign: WhatsAppCampaignDetail }>(`/whatsapp/campaigns/${id}`)).campaign,
  syncCampaigns: () => request<{ synced: number; campaignIds: string[] }>('/whatsapp/campaigns/sync', { method: 'POST' }),
  syncCampaign: (id) => campaignAction(id, 'sync'),
  pauseCampaign: (id) => campaignAction(id, 'pause'),
  resumeCampaign: (id) => campaignAction(id, 'resume'),
  cancelCampaign: (id) => campaignAction(id, 'cancel'),
  rescheduleCampaign: async (id, scheduledAt) =>
    (await request<{ campaign: WhatsAppCampaign }>(`/whatsapp/campaigns/${id}/reschedule`, {
      method: 'POST', ...body({ scheduledAt }),
    })).campaign,
  updateCampaign: async (id, input: { name?: string; content?: WhatsAppCampaignContent }) =>
    (await request<{ campaign: WhatsAppCampaign }>(`/whatsapp/campaigns/${id}`, { method: 'PATCH', ...body(input) })).campaign,
  retryFailedRecipients: (id) => campaignAction(id, 'retry-failed'),
  listSuppressions: async () => (await request<{ suppressions: WhatsAppSuppression[] }>('/whatsapp/suppressions')).suppressions,
  createSuppression: async (input) =>
    (await request<{ suppression: WhatsAppSuppression }>('/whatsapp/suppressions', { method: 'POST', ...body(input) })).suppression,
  reauthorizeSuppression: async (id) =>
    (await request<{ suppression: WhatsAppSuppression }>(`/whatsapp/suppressions/${id}/reauthorize`, {
      method: 'POST', ...body({ consentimentoConfirmado: true }),
    })).suppression,
};

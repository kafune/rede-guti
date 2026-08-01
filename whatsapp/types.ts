export type WhatsAppCampaignCategory = 'MARKETING' | 'UTILITY';
export type WhatsAppButtonAction = 'REPLY' | 'URL' | 'CALL' | 'COPY';

export interface WhatsAppButton {
  label: string;
  action: WhatsAppButtonAction;
  value: string;
}

export type WhatsAppContentItem =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaId: string; caption?: string }
  | { type: 'document'; mediaId: string; caption?: string; filename?: string }
  | { type: 'audio'; mediaId: string; caption?: string }
  | { type: 'button'; text: string; footerText?: string; mediaId?: string; buttons: WhatsAppButton[] }
  | { type: 'poll'; text: string; choices: string[]; selectableCount: number }
  | { type: 'carousel'; text: string; cards: Array<{ text: string; mediaId?: string; buttons: WhatsAppButton[] }> };

export interface WhatsAppCampaignContent {
  primary: WhatsAppContentItem;
  sequence: WhatsAppContentItem[];
}

export type LeaderRole = 'COORDENADOR' | 'LIDER_REGIONAL' | 'VERIFICADORA';
export type SupporterStatus = 'ATIVO' | 'INATIVO';
export type EventGuestStatus = 'INDICADO' | 'APROVADO' | 'RECUSADO' | 'CONFIRMADO' | 'PRESENTE';
export type TeamStatus = 'ATIVA' | 'INATIVA';
export type TeamContactKind = 'DRIVER' | 'MEMBER';

export type AudienceFilter =
  | { type: 'LEADERS'; roles?: LeaderRole[]; active?: boolean; hierarchyRootId?: string; selectedIds?: string[] }
  | {
    type: 'SUPPORTERS'; statuses?: SupporterStatus[]; municipalityIds?: string[]; churchIds?: string[];
    leaderIds?: string[]; createdFrom?: string; createdTo?: string; selectedIds?: string[];
  }
  | { type: 'EVENT_GUESTS'; eventId: string; statuses?: EventGuestStatus[]; selectedIds?: string[] }
  | {
    type: 'TEAM_CONTACTS'; statuses?: TeamStatus[]; leaderIds?: string[]; contactKinds?: TeamContactKind[];
    teamIds?: string[]; selectedIds?: string[];
  };

export type AudienceOrigin = 'INDICATION' | 'EVENT_GUEST' | 'TEAM_DRIVER' | 'TEAM_MEMBER' | 'MANUAL';
export type AudienceExclusionReason =
  | 'INVALID_LENGTH' | 'INVALID_DDD' | 'INVALID_SUBSCRIBER' | 'DUPLICATE' | 'SUPPRESSED';

export interface AudienceRecipient {
  origin: AudienceOrigin;
  sourceId: string;
  sourceName: string;
  personName: string;
  phoneOriginal: string;
  phoneNormalized: string | null;
  isValid: boolean;
  exclusionReason: AudienceExclusionReason | null;
  personalizedContent: WhatsAppCampaignContent;
}

export interface AudiencePreview {
  totals: { source: number; valid: number; invalid: number; duplicate: number; suppressed: number };
  recipients: AudienceRecipient[];
  samples: Array<{
    sourceId: string;
    personName: string;
    phoneNormalized: string;
    content: WhatsAppCampaignContent;
  }>;
}

export type WhatsAppCampaignStatus =
  | 'DRAFT' | 'SCHEDULED' | 'QUEUED' | 'SENDING' | 'PAUSED' | 'COMPLETED' | 'CANCELED' | 'FAILED';
export type WhatsAppRecipientStatus =
  | 'PENDING' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'PLAYED' | 'FAILED' | 'CANCELED';

export interface WhatsAppCampaign {
  id: string;
  tenantId: string;
  createdById: string;
  name: string;
  status: WhatsAppCampaignStatus;
  category: WhatsAppCampaignCategory;
  audienceFilter: AudienceFilter | { type: 'RETRY'; retryOfCampaignId: string };
  content: WhatsAppCampaignContent;
  consentAt: string;
  scheduledAt: string | null;
  remoteFolderId: string | null;
  remoteFolderStatus: string | null;
  remoteFolderCreatedAt: string | null;
  totalRecipients: number;
  validRecipients: number;
  excludedRecipients: number;
  queuedCount: number;
  sentCount: number;
  failedCount: number;
  deliveredCount: number;
  readCount: number;
  playedCount: number;
  replyCount: number;
  optOutCount: number;
  lastError: string | null;
  queuedAt: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppRecipient {
  id: string;
  tenantId: string;
  campaignId: string;
  origin: AudienceOrigin;
  sourceId: string | null;
  sourceName: string | null;
  personName: string;
  phoneOriginal: string;
  phoneNormalized: string | null;
  personalizedContent: WhatsAppCampaignContent;
  isValid: boolean;
  exclusionReason: string | null;
  status: WhatsAppRecipientStatus;
  externalMessageIds: string[];
  externalChatId: string | null;
  error: string | null;
  queuedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  playedAt: string | null;
  failedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WhatsAppCampaignDetail = WhatsAppCampaign & { recipients: WhatsAppRecipient[] };

export type WhatsAppInstance =
  | { configured: false }
  | {
    configured: true;
    instanceId: string | null;
    name: string | null;
    phone?: string | null;
    status: string | null;
    connection?: { connected: boolean; loggedIn: boolean; jid?: Record<string, string | number> };
    connected?: boolean;
  };

export interface WhatsAppConnectResponse {
  connected?: boolean;
  loggedIn?: boolean;
  jid?: Record<string, string | number>;
  qrcode?: string;
  paircode?: string;
  instance?: { id?: string; name?: string; status?: string };
}

export interface WhatsAppDisconnectResponse { response?: string; info?: string }

export interface WhatsAppMedia {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string;
  createdAt: string;
}

export interface WhatsAppTemplate {
  id: string;
  tenantId: string;
  createdById: string;
  name: string;
  category: WhatsAppCampaignCategory;
  purpose: string | null;
  content: WhatsAppCampaignContent;
  favorite: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppSuppression {
  id: string;
  tenantId: string;
  phoneNormalized: string;
  active: boolean;
  reason: string | null;
  source: string | null;
  createdById: string | null;
  firstOptOutAt: string;
  lastOptOutAt: string;
  reauthorizedAt: string | null;
  reauthorizedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PreviewCampaignInput {
  category: WhatsAppCampaignCategory;
  audienceFilter: AudienceFilter;
  content: WhatsAppCampaignContent;
}

export interface CreateCampaignInput extends PreviewCampaignInput {
  name: string;
  consentimentoConfirmado: true;
  scheduledAt?: string;
}

export interface TestCampaignInput {
  phone: string;
  name: string;
  category: WhatsAppCampaignCategory;
  content: WhatsAppCampaignContent;
}

export interface WhatsAppApi {
  getInstance(): Promise<WhatsAppInstance>;
  createInstance(name: string): Promise<WhatsAppInstance>;
  connectInstance(): Promise<WhatsAppConnectResponse>;
  disconnectInstance(): Promise<WhatsAppDisconnectResponse>;
  uploadMedia(file: File): Promise<WhatsAppMedia>;
  listTemplates(): Promise<WhatsAppTemplate[]>;
  createTemplate(input: Pick<WhatsAppTemplate, 'name' | 'category' | 'content'> & { purpose?: string }): Promise<WhatsAppTemplate>;
  updateTemplate(id: string, input: Partial<Pick<WhatsAppTemplate, 'name' | 'category' | 'purpose' | 'content'>>): Promise<WhatsAppTemplate>;
  setTemplateFavorite(id: string, favorite: boolean): Promise<WhatsAppTemplate>;
  duplicateTemplate(id: string, name: string): Promise<WhatsAppTemplate>;
  deleteTemplate(id: string): Promise<void>;
  previewCampaign(input: PreviewCampaignInput): Promise<AudiencePreview>;
  sendTestCampaign(input: TestCampaignInput): Promise<{ sent: true }>;
  createCampaign(input: CreateCampaignInput): Promise<WhatsAppCampaign>;
  listCampaigns(): Promise<WhatsAppCampaign[]>;
  getCampaign(id: string): Promise<WhatsAppCampaignDetail>;
  syncCampaigns(): Promise<{ synced: number; campaignIds: string[] }>;
  syncCampaign(id: string): Promise<WhatsAppCampaign>;
  pauseCampaign(id: string): Promise<WhatsAppCampaign>;
  resumeCampaign(id: string): Promise<WhatsAppCampaign>;
  cancelCampaign(id: string): Promise<WhatsAppCampaign>;
  rescheduleCampaign(id: string, scheduledAt: string): Promise<WhatsAppCampaign>;
  updateCampaign(id: string, input: { name?: string; content?: WhatsAppCampaignContent }): Promise<WhatsAppCampaign>;
  retryFailedRecipients(id: string): Promise<WhatsAppCampaign>;
  listSuppressions(): Promise<WhatsAppSuppression[]>;
  createSuppression(input: { phone: string; reason: string }): Promise<WhatsAppSuppression>;
  reauthorizeSuppression(id: string): Promise<WhatsAppSuppression>;
}

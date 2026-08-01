import type {
  WhatsAppCampaignMetrics,
  WhatsAppCampaignStatus,
  WhatsAppRecipientStatus,
} from '../types.js';

const RECIPIENT_STATUS_ORDER: Record<WhatsAppRecipientStatus, number> = {
  PENDING: 0,
  QUEUED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
  PLAYED: 5,
  FAILED: 6,
  CANCELED: 6,
};
const TERMINAL_RECIPIENT_STATUSES = new Set<WhatsAppRecipientStatus>(['FAILED', 'CANCELED']);
const TERMINAL_CAMPAIGN_STATUSES = new Set<WhatsAppCampaignStatus>(['COMPLETED', 'CANCELED', 'FAILED']);
const CAMPAIGN_STATUS_ORDER: Record<WhatsAppCampaignStatus, number> = {
  DRAFT: 0,
  SCHEDULED: 1,
  QUEUED: 2,
  SENDING: 3,
  PAUSED: 3,
  COMPLETED: 4,
  CANCELED: 4,
  FAILED: 4,
};
const COUNTERS = ['queued', 'sent', 'failed', 'delivered', 'read', 'played', 'replies', 'optOuts'] as const;

function advanceCampaignStatus(
  current: WhatsAppCampaignStatus,
  incoming: WhatsAppCampaignStatus | undefined,
): WhatsAppCampaignStatus {
  if (incoming === undefined || TERMINAL_CAMPAIGN_STATUSES.has(current)) return current;
  if (TERMINAL_CAMPAIGN_STATUSES.has(incoming)) return incoming;
  if (current === 'PAUSED' && incoming === 'SENDING') return 'SENDING';
  if (incoming === 'PAUSED' && current !== 'DRAFT') return 'PAUSED';
  return CAMPAIGN_STATUS_ORDER[incoming] > CAMPAIGN_STATUS_ORDER[current] ? incoming : current;
}

export function advanceRecipientStatus(
  current: WhatsAppRecipientStatus,
  incoming: WhatsAppRecipientStatus,
): WhatsAppRecipientStatus {
  if (TERMINAL_RECIPIENT_STATUSES.has(current)) return current;
  return RECIPIENT_STATUS_ORDER[incoming] > RECIPIENT_STATUS_ORDER[current] ? incoming : current;
}

export function mergeCampaignMetrics(
  current: WhatsAppCampaignMetrics,
  incoming: Partial<WhatsAppCampaignMetrics>,
): WhatsAppCampaignMetrics {
  const result: WhatsAppCampaignMetrics = {
    ...current,
    status: advanceCampaignStatus(current.status, incoming.status),
  };
  for (const counter of COUNTERS) {
    result[counter] = Math.max(current[counter], incoming[counter] ?? current[counter]);
  }
  return result;
}

import type {
  WhatsAppCampaignMetrics,
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
const TERMINAL_CAMPAIGN_STATUSES = new Set(['COMPLETED', 'CANCELED', 'FAILED']);
const COUNTERS = ['queued', 'sent', 'failed', 'delivered', 'read', 'played', 'replies', 'optOuts'] as const;

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
    status: TERMINAL_CAMPAIGN_STATUSES.has(current.status)
      ? current.status
      : incoming.status ?? current.status,
  };
  for (const counter of COUNTERS) {
    result[counter] = Math.max(current[counter], incoming[counter] ?? current[counter]);
  }
  return result;
}

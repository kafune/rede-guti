import type { WhatsAppCampaignContent } from '../types.js';

export type LeaderRole = 'COORDENADOR' | 'LIDER_REGIONAL' | 'VERIFICADORA';
export type SupporterStatus = 'ATIVO' | 'INATIVO';
export type EventGuestStatus = 'INDICADO' | 'APROVADO' | 'RECUSADO' | 'CONFIRMADO' | 'PRESENTE';
export type TeamStatus = 'ATIVA' | 'INATIVA';
export type TeamContactKind = 'DRIVER' | 'MEMBER';

export type AudienceFilter =
  | {
    type: 'LEADERS';
    roles?: LeaderRole[];
    active?: boolean;
    hierarchyRootId?: string;
    selectedIds?: string[];
  }
  | {
    type: 'SUPPORTERS';
    statuses?: SupporterStatus[];
    municipalityIds?: string[];
    churchIds?: string[];
    leaderIds?: string[];
    createdFrom?: string;
    createdTo?: string;
    selectedIds?: string[];
  }
  | {
    type: 'EVENT_GUESTS';
    eventId: string;
    statuses?: EventGuestStatus[];
    selectedIds?: string[];
  }
  | {
    type: 'TEAM_CONTACTS';
    statuses?: TeamStatus[];
    leaderIds?: string[];
    contactKinds?: TeamContactKind[];
    teamIds?: string[];
    selectedIds?: string[];
  };

export type AudienceOrigin = 'INDICATION' | 'EVENT_GUEST' | 'TEAM_DRIVER' | 'TEAM_MEMBER' | 'MANUAL';
export type AudienceExclusionReason =
  | 'INVALID_LENGTH'
  | 'INVALID_DDD'
  | 'INVALID_SUBSCRIBER'
  | 'DUPLICATE'
  | 'SUPPRESSED';

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
  totals: {
    source: number;
    valid: number;
    invalid: number;
    duplicate: number;
    suppressed: number;
  };
  recipients: AudienceRecipient[];
  samples: Array<{
    sourceId: string;
    personName: string;
    phoneNormalized: string;
    content: WhatsAppCampaignContent;
  }>;
}

export class AudienceValidationError extends Error {
  readonly statusCode = 400;
}

export class AudienceLimitError extends AudienceValidationError {
  constructor(public readonly limit: number) {
    super(`Audience exceeds the limit of ${limit} valid recipients.`);
  }
}

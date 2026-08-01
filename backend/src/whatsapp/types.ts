export type WhatsAppButtonAction = 'REPLY' | 'URL' | 'CALL' | 'COPY';

export interface WhatsAppButton {
  label: string;
  action: WhatsAppButtonAction;
  value: string;
}

export type WhatsAppContentItem =
  | { type: 'text'; text: string }
  | { type: 'image' | 'document' | 'audio'; mediaId: string; caption?: string; filename?: string }
  | {
    type: 'button';
    text: string;
    footerText?: string;
    mediaId?: string;
    buttons: WhatsAppButton[];
  }
  | { type: 'poll'; text: string; choices: string[]; selectableCount: number }
  | {
    type: 'carousel';
    text: string;
    cards: Array<{ text: string; mediaId?: string; buttons: WhatsAppButton[] }>;
  };

export interface WhatsAppCampaignContent {
  primary: WhatsAppContentItem;
  sequence: WhatsAppContentItem[];
}

export interface WhatsAppPerson {
  name: string;
}

export interface UazapiMessageContext {
  number: string;
  mediaUrl: (mediaId: string) => string;
}

export interface UazapiAdvancedMessage {
  number: string;
  type: WhatsAppContentItem['type'];
  text?: string;
  file?: string;
  docName?: string;
  footerText?: string;
  imageButton?: string;
  selectableCount?: number;
  choices?: string[];
}

export type PhoneNormalizationReason = 'INVALID_LENGTH' | 'INVALID_DDD' | 'INVALID_SUBSCRIBER';

export type PhoneNormalization =
  | { normalized: string; valid: true; reason: null }
  | { normalized: null; valid: false; reason: PhoneNormalizationReason };

export type WhatsAppRecipientStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'PLAYED'
  | 'FAILED'
  | 'CANCELED';

export type WhatsAppCampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'QUEUED'
  | 'SENDING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELED'
  | 'FAILED';

export interface WhatsAppCampaignMetrics {
  status: WhatsAppCampaignStatus;
  queued: number;
  sent: number;
  failed: number;
  delivered: number;
  read: number;
  played: number;
  replies: number;
  optOuts: number;
}

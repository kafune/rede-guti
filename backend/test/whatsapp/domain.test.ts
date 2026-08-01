import { describe, expect, test } from 'bun:test';
import {
  decryptSecret,
  encryptSecret,
  sanitizeCredentials,
} from '../../src/whatsapp/domain/crypto.js';
import {
  applyMarketingFooter,
  buildUazapiMessage,
  personalizeContent,
} from '../../src/whatsapp/domain/content.js';
import {
  advanceRecipientStatus,
  mergeCampaignMetrics,
} from '../../src/whatsapp/domain/metrics.js';
import { normalizeBrazilianPhone } from '../../src/whatsapp/domain/phone.js';
import type {
  WhatsAppCampaignContent,
  WhatsAppContentItem,
} from '../../src/whatsapp/types.js';

describe('normalizeBrazilianPhone', () => {
  for (const [input, normalized] of [
    ['(11) 98765-4321', '5511987654321'],
    ['+55 (21) 99876-5432', '5521998765432'],
    ['55 31 91234 5678', '5531912345678'],
  ] as const) {
    test(`normalizes ${input}`, () => {
      expect(normalizeBrazilianPhone(input)).toEqual({
        normalized,
        valid: true,
        reason: null,
      });
    });
  }

  for (const [input, reason] of [
    ['119876543', 'INVALID_LENGTH'],
    ['(10) 98765-4321', 'INVALID_DDD'],
    ['(11) 58765-4321', 'INVALID_SUBSCRIBER'],
  ] as const) {
    test(`rejects ${input} as ${reason}`, () => {
      expect(normalizeBrazilianPhone(input)).toEqual({
        normalized: null,
        valid: false,
        reason,
      });
    });
  }
});

describe('campaign content', () => {
  test('personalizes both supported variables in every text-bearing field without mutation', () => {
    const content: WhatsAppCampaignContent = {
      primary: {
        type: 'button',
        text: 'Olá, {{nome}}!',
        footerText: 'Para {{primeiro_nome}}',
        buttons: [{ label: 'Falar com {{primeiro_nome}}', action: 'REPLY', value: 'oi-{{nome}}' }],
      },
      sequence: [{
        type: 'carousel',
        text: 'Ofertas de {{primeiro_nome}}',
        cards: [{
          text: 'Card de {{nome}}',
          buttons: [{ label: 'Copiar {{primeiro_nome}}', action: 'COPY', value: '{{nome}}-10' }],
        }],
      }],
    };

    expect(personalizeContent(content, { name: 'Maria Silva' })).toEqual({
      primary: {
        type: 'button',
        text: 'Olá, Maria Silva!',
        footerText: 'Para Maria',
        buttons: [{ label: 'Falar com Maria', action: 'REPLY', value: 'oi-Maria Silva' }],
      },
      sequence: [{
        type: 'carousel',
        text: 'Ofertas de Maria',
        cards: [{
          text: 'Card de Maria Silva',
          buttons: [{ label: 'Copiar Maria', action: 'COPY', value: 'Maria Silva-10' }],
        }],
      }],
    });
    expect(content.primary.text).toBe('Olá, {{nome}}!');
  });

  test('rejects unknown variables', () => {
    expect(() => personalizeContent({
      primary: { type: 'text', text: 'Olá, {{email}}' },
      sequence: [],
    }, { name: 'Maria' })).toThrow('Unsupported variable: email');
  });

  test('accepts ten content items and rejects eleven', () => {
    const text = (value: string): WhatsAppContentItem => ({ type: 'text', text: value });
    expect(personalizeContent({
      primary: text('1'),
      sequence: Array.from({ length: 9 }, (_, index) => text(String(index + 2))),
    }, { name: 'Maria' }).sequence).toHaveLength(9);
    expect(() => personalizeContent({
      primary: text('1'),
      sequence: Array.from({ length: 10 }, (_, index) => text(String(index + 2))),
    }, { name: 'Maria' })).toThrow('Campaign content supports at most 10 items');
  });

  test('adds the marketing footer exactly once to the last item', () => {
    const original: WhatsAppCampaignContent = {
      primary: { type: 'text', text: 'Primeira' },
      sequence: [{ type: 'image', mediaId: 'media-1', caption: 'Última' }],
    };
    const once = applyMarketingFooter(original);
    const twice = applyMarketingFooter(once);

    expect(once).toEqual({
      primary: { type: 'text', text: 'Primeira' },
      sequence: [{
        type: 'image',
        mediaId: 'media-1',
        caption: 'Última\n\nPara não receber mais mensagens, responda SAIR.',
      }],
    });
    expect(twice).toEqual(once);
    expect(original.sequence[0]).toEqual({ type: 'image', mediaId: 'media-1', caption: 'Última' });
  });
});

describe('buildUazapiMessage', () => {
  const context = {
    number: '5511987654321',
    mediaUrl: (mediaId: string) => `https://api.example.test/public/whatsapp/media/${mediaId}`,
  };

  for (const [name, item, expected] of [
    ['text', { type: 'text', text: 'Olá' }, {
      number: '5511987654321', type: 'text', text: 'Olá',
    }],
    ['image', { type: 'image', mediaId: 'image-1', caption: 'Foto' }, {
      number: '5511987654321', type: 'image',
      file: 'https://api.example.test/public/whatsapp/media/image-1', text: 'Foto',
    }],
    ['document', { type: 'document', mediaId: 'doc-1', caption: 'Leia', filename: 'guia.pdf' }, {
      number: '5511987654321', type: 'document',
      file: 'https://api.example.test/public/whatsapp/media/doc-1', text: 'Leia', docName: 'guia.pdf',
    }],
    ['audio', { type: 'audio', mediaId: 'audio-1' }, {
      number: '5511987654321', type: 'audio',
      file: 'https://api.example.test/public/whatsapp/media/audio-1',
    }],
    ['button', {
      type: 'button', text: 'Escolha', footerText: 'Rodapé', mediaId: 'button-1',
      buttons: [
        { label: 'Responder', action: 'REPLY', value: 'sim' },
        { label: 'Site', action: 'URL', value: 'https://example.test' },
        { label: 'Ligar', action: 'CALL', value: '5511999999999' },
        { label: 'Copiar', action: 'COPY', value: 'CUPOM10' },
      ],
    }, {
      number: '5511987654321', type: 'button', text: 'Escolha', footerText: 'Rodapé',
      imageButton: 'https://api.example.test/public/whatsapp/media/button-1',
      choices: [
        'Responder|reply:sim',
        'Site|https://example.test',
        'Ligar|call:5511999999999',
        'Copiar|copy:CUPOM10',
      ],
    }],
    ['poll', { type: 'poll', text: 'Qual?', choices: ['A', 'B'], selectableCount: 1 }, {
      number: '5511987654321', type: 'poll', text: 'Qual?', choices: ['A', 'B'], selectableCount: 1,
    }],
    ['carousel', {
      type: 'carousel', text: 'Produtos', cards: [
        { text: 'Produto A', mediaId: 'card-a', buttons: [{ label: 'Comprar', action: 'URL', value: 'https://example.test/a' }] },
        { text: 'Produto B', buttons: [{ label: 'Código', action: 'COPY', value: 'B10' }] },
      ],
    }, {
      number: '5511987654321', type: 'carousel', text: 'Produtos', choices: [
        '[Produto A]',
        '{https://api.example.test/public/whatsapp/media/card-a}',
        'Comprar|https://example.test/a',
        '[Produto B]',
        'Código|copy:B10',
      ],
    }],
  ] as const) {
    test(`maps ${name} to the Uazapi advanced fields`, () => {
      expect(buildUazapiMessage(item as WhatsAppContentItem, context)).toEqual(expected);
    });
  }
});

describe('credential safety', () => {
  test('round-trips AES ciphertext and rejects authenticated ciphertext mutation', () => {
    const encrypted = encryptSecret('instance-token', 'test encryption key');
    expect(encrypted).not.toContain('instance-token');
    expect(decryptSecret(encrypted, 'test encryption key')).toBe('instance-token');

    const parts = encrypted.split(':');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    ciphertext[0] ^= 1;
    parts[3] = ciphertext.toString('base64url');
    const mutated = parts.join(':');
    expect(() => decryptSecret(mutated, 'test encryption key')).toThrow();
  });

  test('recursively redacts credential keys without mutating the input', () => {
    const credentials = {
      token: 'instance-token',
      nested: {
        admintoken: 'admin-token',
        rows: [{ authorization: 'Bearer secret' }, { password: 'password' }],
      },
      status: 'connected',
    };
    expect(sanitizeCredentials(credentials)).toEqual({
      token: '[REDACTED]',
      nested: {
        admintoken: '[REDACTED]',
        rows: [{ authorization: '[REDACTED]' }, { password: '[REDACTED]' }],
      },
      status: 'connected',
    });
    expect(credentials.token).toBe('instance-token');
  });
});

describe('monotonic delivery state', () => {
  test('recipient status advances but never regresses', () => {
    expect(advanceRecipientStatus('SENT', 'DELIVERED')).toBe('DELIVERED');
    expect(advanceRecipientStatus('READ', 'SENT')).toBe('READ');
    expect(advanceRecipientStatus('CANCELED', 'READ')).toBe('CANCELED');
  });

  test('terminal campaign status never reopens and counters use Math.max', () => {
    expect(mergeCampaignMetrics({
      status: 'COMPLETED', queued: 10, sent: 9, failed: 1, delivered: 8,
      read: 7, played: 2, replies: 3, optOuts: 1,
    }, {
      status: 'SENDING', queued: 8, sent: 10, failed: 0, delivered: 9,
      read: 6, played: 3, replies: 2, optOuts: 0,
    })).toEqual({
      status: 'COMPLETED', queued: 10, sent: 10, failed: 1, delivered: 9,
      read: 7, played: 3, replies: 3, optOuts: 1,
    });
  });
});

import type {
  UazapiAdvancedMessage,
  UazapiMessageContext,
  WhatsAppButton,
  WhatsAppCampaignContent,
  WhatsAppContentItem,
  WhatsAppPerson,
} from '../types.js';

export const MARKETING_FOOTER = 'Para não receber mais mensagens, responda SAIR.';
const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function personalizeText(value: string, person: WhatsAppPerson): string {
  const firstName = person.name.trim().split(/\s+/)[0] ?? '';
  return value.replace(VARIABLE_PATTERN, (_match, variable: string) => {
    if (variable === 'nome') return person.name;
    if (variable === 'primeiro_nome') return firstName;
    throw new Error(`Unsupported variable: ${variable}`);
  });
}

function personalizeButton(button: WhatsAppButton, person: WhatsAppPerson): WhatsAppButton {
  return {
    ...button,
    label: personalizeText(button.label, person),
    value: personalizeText(button.value, person),
  };
}

function personalizeItem(item: WhatsAppContentItem, person: WhatsAppPerson): WhatsAppContentItem {
  switch (item.type) {
    case 'text':
      return { ...item, text: personalizeText(item.text, person) };
    case 'image':
    case 'document':
    case 'audio':
      return {
        ...item,
        ...(item.caption === undefined ? {} : { caption: personalizeText(item.caption, person) }),
        ...(item.filename === undefined ? {} : { filename: personalizeText(item.filename, person) }),
      };
    case 'button':
      return {
        ...item,
        text: personalizeText(item.text, person),
        ...(item.footerText === undefined ? {} : { footerText: personalizeText(item.footerText, person) }),
        buttons: item.buttons.map((button) => personalizeButton(button, person)),
      };
    case 'poll':
      return {
        ...item,
        text: personalizeText(item.text, person),
        choices: item.choices.map((choice) => personalizeText(choice, person)),
      };
    case 'carousel':
      return {
        ...item,
        text: personalizeText(item.text, person),
        cards: item.cards.map((card) => ({
          ...card,
          text: personalizeText(card.text, person),
          buttons: card.buttons.map((button) => personalizeButton(button, person)),
        })),
      };
  }
}

export function personalizeContent(
  content: WhatsAppCampaignContent,
  person: WhatsAppPerson,
): WhatsAppCampaignContent {
  if (content.sequence.length > 9) {
    throw new Error('Campaign content supports at most 10 items');
  }
  return {
    primary: personalizeItem(content.primary, person),
    sequence: content.sequence.map((item) => personalizeItem(item, person)),
  };
}

function normalizedText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function itemTextValues(item: WhatsAppContentItem): string[] {
  switch (item.type) {
    case 'text': return [item.text];
    case 'image':
    case 'document':
    case 'audio': return [item.caption ?? ''];
    case 'button': return [item.text, item.footerText ?? '', ...item.buttons.flatMap(({ label, value }) => [label, value])];
    case 'poll': return [item.text, ...item.choices];
    case 'carousel': return [item.text, ...item.cards.flatMap((card) => [
      card.text,
      ...card.buttons.flatMap(({ label, value }) => [label, value]),
    ])];
  }
}

function appendFooter(item: WhatsAppContentItem): WhatsAppContentItem {
  const append = (value?: string): string => value?.trim()
    ? `${value}\n\n${MARKETING_FOOTER}`
    : MARKETING_FOOTER;

  switch (item.type) {
    case 'text': return { ...item, text: append(item.text) };
    case 'image':
    case 'document':
    case 'audio': return { ...item, caption: append(item.caption) };
    case 'button': return { ...item, text: append(item.text), buttons: item.buttons.map((button) => ({ ...button })) };
    case 'poll': return { ...item, text: append(item.text), choices: [...item.choices] };
    case 'carousel': return {
      ...item,
      text: append(item.text),
      cards: item.cards.map((card) => ({ ...card, buttons: card.buttons.map((button) => ({ ...button })) })),
    };
  }
}

export function applyMarketingFooter(content: WhatsAppCampaignContent): WhatsAppCampaignContent {
  const items = [content.primary, ...content.sequence];
  const footer = normalizedText(MARKETING_FOOTER);
  if (items.some((item) => itemTextValues(item).some((value) => normalizedText(value).includes(footer)))) {
    return structuredClone(content);
  }

  const clonedSequence = content.sequence.map((item) => structuredClone(item));
  if (clonedSequence.length === 0) {
    return { primary: appendFooter(content.primary), sequence: [] };
  }
  clonedSequence[clonedSequence.length - 1] = appendFooter(clonedSequence[clonedSequence.length - 1]);
  return { primary: structuredClone(content.primary), sequence: clonedSequence };
}

function encodeButton(button: WhatsAppButton): string {
  const actionPrefix = {
    REPLY: 'reply:',
    URL: '',
    CALL: 'call:',
    COPY: 'copy:',
  }[button.action];
  return `${button.label}|${actionPrefix}${button.value}`;
}

export function buildUazapiMessage(
  item: WhatsAppContentItem,
  context: UazapiMessageContext,
): UazapiAdvancedMessage {
  const base = { number: context.number, type: item.type } as const;
  switch (item.type) {
    case 'text':
      return { ...base, text: item.text };
    case 'image':
    case 'audio':
      return {
        ...base,
        file: context.mediaUrl(item.mediaId),
        ...(item.caption === undefined ? {} : { text: item.caption }),
      };
    case 'document':
      return {
        ...base,
        file: context.mediaUrl(item.mediaId),
        ...(item.caption === undefined ? {} : { text: item.caption }),
        ...(item.filename === undefined ? {} : { docName: item.filename }),
      };
    case 'button':
      return {
        ...base,
        text: item.text,
        ...(item.footerText === undefined ? {} : { footerText: item.footerText }),
        ...(item.mediaId === undefined ? {} : { imageButton: context.mediaUrl(item.mediaId) }),
        choices: item.buttons.map(encodeButton),
      };
    case 'poll':
      return { ...base, text: item.text, choices: [...item.choices], selectableCount: item.selectableCount };
    case 'carousel':
      return {
        ...base,
        text: item.text,
        choices: item.cards.flatMap((card) => [
          `[${card.text}]`,
          ...(card.mediaId === undefined ? [] : [`{${context.mediaUrl(card.mediaId)}}`]),
          ...card.buttons.map(encodeButton),
        ]),
      };
  }
}

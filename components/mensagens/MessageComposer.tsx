import React, { useEffect, useMemo, useState } from 'react';
import type { WhatsAppApi, WhatsAppCampaignContent, WhatsAppContentItem } from '../../whatsapp/types';

type Props = {
  value: WhatsAppCampaignContent;
  onChange: (value: WhatsAppCampaignContent) => void;
  api?: WhatsAppApi;
  onValidityChange?: (valid: boolean) => void;
};
const types = ['text', 'image', 'document', 'audio', 'button', 'poll', 'carousel'] as const;

const emptyItem = (type: WhatsAppContentItem['type']): WhatsAppContentItem => {
  if (type === 'text') return { type, text: '' };
  if (type === 'image' || type === 'audio') return { type, mediaId: '' };
  if (type === 'document') return { type, mediaId: '' };
  if (type === 'button') return { type, text: '', buttons: [{ label: '', action: 'REPLY', value: '' }] };
  if (type === 'poll') return { type, text: '', choices: ['', ''], selectableCount: 1 };
  return { type: 'carousel', text: '', cards: [{ text: '', buttons: [{ label: '', action: 'REPLY', value: '' }] }] };
};

const itemTexts = (item: WhatsAppContentItem) => {
  if (item.type === 'text') return [item.text];
  if (item.type === 'image' || item.type === 'audio') return [item.caption ?? ''];
  if (item.type === 'document') return [item.caption ?? '', item.filename ?? ''];
  if (item.type === 'button') return [item.text, item.footerText ?? '', ...item.buttons.flatMap((button) => [button.label, button.value])];
  if (item.type === 'poll') return [item.text, ...item.choices];
  return [item.text, ...item.cards.flatMap((card) => [card.text, ...card.buttons.flatMap((button) => [button.label, button.value])])];
};

function variableError(content: WhatsAppCampaignContent) {
  for (const text of [content.primary, ...content.sequence].flatMap(itemTexts)) {
    for (const match of text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/gu)) {
      if (!['nome', 'primeiro_nome'].includes(match[1])) return `Variável não suportada: ${match[1]}`;
    }
  }
  return null;
}

const blank = (value: string | undefined) => !value?.trim();
const optionalBlank = (value: string | undefined) => value !== undefined && blank(value);

function buttonError(buttons: Array<{ label: string; value: string }>) {
  if (buttons.length < 1 || buttons.length > 10) return 'Adicione entre 1 e 10 botões.';
  if (buttons.some((button) => blank(button.label) || blank(button.value))) return 'Preencha o rótulo e o valor de todos os botões.';
  return null;
}

function itemError(item: WhatsAppContentItem) {
  if (item.type === 'text') return blank(item.text) ? 'Preencha o texto da mensagem.' : null;
  if (item.type === 'image' || item.type === 'audio' || item.type === 'document') {
    if (blank(item.mediaId)) return 'Selecione ou envie uma mídia.';
    if (optionalBlank(item.caption)) return 'Remova ou preencha a legenda.';
    if (item.type === 'document' && optionalBlank(item.filename)) return 'Remova ou preencha o nome do documento.';
    return null;
  }
  if (item.type === 'button') {
    if (blank(item.text)) return 'Preencha o texto da mensagem com botões.';
    if (optionalBlank(item.footerText)) return 'Remova ou preencha o rodapé.';
    if (optionalBlank(item.mediaId)) return 'Remova ou selecione a mídia do botão.';
    return buttonError(item.buttons);
  }
  if (item.type === 'poll') {
    if (blank(item.text)) return 'Preencha a pergunta da enquete.';
    if (item.choices.length < 2 || item.choices.length > 12 || item.choices.some(blank)) return 'Informe entre 2 e 12 opções preenchidas.';
    if (!Number.isInteger(item.selectableCount) || item.selectableCount < 1 || item.selectableCount > item.choices.length) {
      return 'A quantidade selecionável deve ficar entre 1 e o número de opções.';
    }
    return null;
  }
  if (blank(item.text)) return 'Preencha o texto do carrossel.';
  if (item.cards.length < 1 || item.cards.length > 10) return 'Adicione entre 1 e 10 cards.';
  for (const card of item.cards) {
    if (blank(card.text)) return 'Preencha o texto de todos os cards.';
    if (optionalBlank(card.mediaId)) return 'Remova ou selecione a mídia do card.';
    const error = buttonError(card.buttons);
    if (error) return error;
  }
  return null;
}

export function contentValidationError(content: WhatsAppCampaignContent) {
  if (content.sequence.length > 9) return 'A sequência aceita no máximo 9 itens';
  for (const item of [content.primary, ...content.sequence]) {
    const error = itemError(item);
    if (error) return error;
  }
  return variableError(content);
}

function ItemEditor({ item, label, onChange, api }: {
  item: WhatsAppContentItem; label: string; onChange: (item: WhatsAppContentItem) => void; api?: WhatsAppApi;
}) {
  const [uploading, setUploading] = useState(false);
  const typeLabel = label === 'principal' ? 'Tipo da mensagem principal' : `Tipo da mensagem ${label}`;
  const textLabel = label === 'principal' ? 'Mensagem principal' : `Texto ${label}`;
  const upload = async (file?: File) => {
    if (!file || !api || item.type === 'text' || item.type === 'poll' || item.type === 'carousel') return;
    setUploading(true);
    try { onChange({ ...item, mediaId: (await api.uploadMedia(file)).id }); } finally { setUploading(false); }
  };
  return <div className="space-y-3">
    <label className="block font-semibold">{typeLabel}
      <select className="mt-1 w-full rounded-xl border p-3" value={item.type}
        onChange={(event) => onChange(emptyItem(event.target.value as WhatsAppContentItem['type']))}>
        {types.map((type) => <option key={type} value={type}>{type}</option>)}
      </select>
    </label>
    {item.type === 'text' && <label className="block font-semibold">{textLabel}
      <textarea className="mt-1 w-full rounded-xl border p-3" value={item.text}
        onChange={(event) => onChange({ ...item, text: event.target.value })} />
    </label>}
    {(item.type === 'image' || item.type === 'document' || item.type === 'audio') && <>
      <label className="block font-semibold">ID da mídia
        <input className="mt-1 w-full rounded-xl border p-3" value={item.mediaId}
          onChange={(event) => onChange({ ...item, mediaId: event.target.value })} />
      </label>
      {api && <label className="block font-semibold">Enviar arquivo
        <input type="file" disabled={uploading} className="mt-1 block w-full" onChange={(event) => void upload(event.target.files?.[0])} />
      </label>}
      <label className="block font-semibold">Legenda
        <textarea className="mt-1 w-full rounded-xl border p-3" value={item.caption ?? ''}
          onChange={(event) => onChange({ ...item, caption: event.target.value || undefined })} />
      </label>
      {item.type === 'document' && <label className="block font-semibold">Nome do documento
        <input className="mt-1 w-full rounded-xl border p-3" value={item.filename ?? ''}
          onChange={(event) => onChange({ ...item, filename: event.target.value || undefined })} />
      </label>}
    </>}
    {item.type === 'button' && <>
      <label className="block font-semibold">{textLabel}<textarea className="mt-1 w-full rounded-xl border p-3" value={item.text}
        onChange={(event) => onChange({ ...item, text: event.target.value })} /></label>
      <label className="block font-semibold">Rodapé do botão<input className="mt-1 w-full rounded-xl border p-3" value={item.footerText ?? ''}
        onChange={(event) => onChange({ ...item, footerText: event.target.value || undefined })} /></label>
      <label className="block font-semibold">Mídia do botão<input className="mt-1 w-full rounded-xl border p-3" value={item.mediaId ?? ''}
        onChange={(event) => onChange({ ...item, mediaId: event.target.value || undefined })} /></label>
      {api && <label className="block font-semibold">Enviar mídia do botão<input type="file" disabled={uploading}
        className="mt-1 block w-full" onChange={(event) => void upload(event.target.files?.[0])} /></label>}
      {item.buttons.map((button, index) => <div key={index} className="grid grid-cols-3 gap-2">
        <input aria-label={`Rótulo do botão ${index + 1}`} className="rounded-xl border p-2" value={button.label}
          onChange={(event) => onChange({ ...item, buttons: item.buttons.map((old, at) => at === index ? { ...old, label: event.target.value } : old) })} />
        <select aria-label={`Ação do botão ${index + 1}`} className="rounded-xl border p-2" value={button.action}
          onChange={(event) => onChange({ ...item, buttons: item.buttons.map((old, at) => at === index ? { ...old, action: event.target.value as any } : old) })}>
          {['REPLY', 'URL', 'CALL', 'COPY'].map((action) => <option key={action}>{action}</option>)}
        </select>
        <input aria-label={`Valor do botão ${index + 1}`} className="rounded-xl border p-2" value={button.value}
          onChange={(event) => onChange({ ...item, buttons: item.buttons.map((old, at) => at === index ? { ...old, value: event.target.value } : old) })} />
      </div>)}
      <button type="button" disabled={item.buttons.length >= 10} onClick={() => onChange({ ...item, buttons: [...item.buttons, { label: '', action: 'REPLY', value: '' }] })}
        className="rounded-xl border px-3 py-2">Adicionar botão</button>
    </>}
    {item.type === 'poll' && <>
      <label className="block font-semibold">{textLabel}<textarea className="mt-1 w-full rounded-xl border p-3" value={item.text}
        onChange={(event) => onChange({ ...item, text: event.target.value })} /></label>
      <label className="block font-semibold">Opções (uma por linha)<textarea className="mt-1 w-full rounded-xl border p-3" value={item.choices.join('\n')}
        onChange={(event) => onChange({ ...item, choices: event.target.value.split('\n').slice(0, 12) })} /></label>
      <label className="block font-semibold">Quantidade selecionável<input type="number" min={1} max={12} className="mt-1 w-full rounded-xl border p-3"
        value={item.selectableCount} onChange={(event) => onChange({ ...item, selectableCount: Number(event.target.value) })} /></label>
    </>}
    {item.type === 'carousel' && <>
      <label className="block font-semibold">{textLabel}<textarea className="mt-1 w-full rounded-xl border p-3" value={item.text}
        onChange={(event) => onChange({ ...item, text: event.target.value })} /></label>
      {item.cards.map((card, index) => <fieldset key={index} className="space-y-2 rounded-xl border p-3"><legend className="px-2 font-bold">Card {index + 1}</legend>
        <label className="block font-semibold">Texto do card {index + 1}<textarea className="mt-1 w-full rounded-xl border p-3" value={card.text}
          onChange={(event) => onChange({ ...item, cards: item.cards.map((old, at) => at === index ? { ...old, text: event.target.value } : old) })} /></label>
        <label className="block font-semibold">Mídia do card {index + 1}<input className="mt-1 w-full rounded-xl border p-3" value={card.mediaId ?? ''}
          onChange={(event) => onChange({ ...item, cards: item.cards.map((old, at) => at === index ? { ...old, mediaId: event.target.value || undefined } : old) })} /></label>
        {card.buttons.map((button, buttonIndex) => <div key={buttonIndex} className="grid gap-2 sm:grid-cols-3">
          <label className="font-semibold">Rótulo do botão do card {index + 1}<input className="mt-1 w-full rounded-xl border p-2" value={button.label}
            onChange={(event) => onChange({ ...item, cards: item.cards.map((old, at) => at === index ? { ...old, buttons: old.buttons.map((entry, buttonAt) => buttonAt === buttonIndex ? { ...entry, label: event.target.value } : entry) } : old) })} /></label>
          <label className="font-semibold">Ação do botão do card {index + 1}<select className="mt-1 w-full rounded-xl border p-2" value={button.action}
            onChange={(event) => onChange({ ...item, cards: item.cards.map((old, at) => at === index ? { ...old, buttons: old.buttons.map((entry, buttonAt) => buttonAt === buttonIndex ? { ...entry, action: event.target.value as any } : entry) } : old) })}>
            {['REPLY', 'URL', 'CALL', 'COPY'].map((action) => <option key={action}>{action}</option>)}</select></label>
          <label className="font-semibold">Valor do botão do card {index + 1}<input className="mt-1 w-full rounded-xl border p-2" value={button.value}
            onChange={(event) => onChange({ ...item, cards: item.cards.map((old, at) => at === index ? { ...old, buttons: old.buttons.map((entry, buttonAt) => buttonAt === buttonIndex ? { ...entry, value: event.target.value } : entry) } : old) })} /></label>
        </div>)}
        <button type="button" disabled={card.buttons.length >= 10} className="rounded-lg border px-3 py-2"
          onClick={() => onChange({ ...item, cards: item.cards.map((old, at) => at === index ? { ...old, buttons: [...old.buttons, { label: '', action: 'REPLY', value: '' }] } : old) })}>Adicionar botão ao card</button>
      </fieldset>)}
      <button type="button" disabled={item.cards.length >= 10} onClick={() => onChange({ ...item, cards: [...item.cards, { text: '', buttons: [{ label: '', action: 'REPLY', value: '' }] }] })}
        className="rounded-xl border px-3 py-2">Adicionar card</button>
    </>}
  </div>;
}

export function MessageComposer({ value, onChange, api, onValidityChange }: Props) {
  const [draft, setDraft] = useState(value);
  const [limitError, setLimitError] = useState<string | null>(null);
  useEffect(() => setDraft(value), [value]);
  const update = (next: WhatsAppCampaignContent) => { setDraft(next); onChange(next); setLimitError(null); };
  const validationError = useMemo(() => contentValidationError(draft), [draft]);
  useEffect(() => onValidityChange?.(!validationError), [validationError, onValidityChange]);
  const addSequence = () => {
    if (draft.sequence.length >= 9) { setLimitError('A sequência aceita no máximo 9 itens'); return; }
    update({ ...draft, sequence: [...draft.sequence, emptyItem('text')] });
  };
  return <section className="space-y-5" aria-labelledby="composer-heading">
    <div><h2 id="composer-heading" className="text-xl font-black">Conteúdo</h2>
      <p className="text-sm opacity-60">Variáveis disponíveis: {'{{nome}}'} e {'{{primeiro_nome}}'}.</p></div>
    <ItemEditor item={draft.primary} label="principal" api={api} onChange={(primary) => update({ ...draft, primary })} />
    {draft.sequence.map((item, index) => <fieldset key={index} aria-label={`Item de sequência ${index + 1}`} className="rounded-2xl border p-4">
      <legend className="px-2 font-bold">Item de sequência {index + 1}</legend>
      <ItemEditor item={item} label={`da sequência ${index + 1}`} api={api}
        onChange={(next) => update({ ...draft, sequence: draft.sequence.map((old, at) => at === index ? next : old) })} />
      <button type="button" className="mt-3 text-sm font-bold text-red-600" onClick={() => update({ ...draft, sequence: draft.sequence.filter((_, at) => at !== index) })}>Remover item</button>
    </fieldset>)}
    <button type="button" aria-disabled={draft.sequence.length >= 9} onClick={addSequence}
      className="rounded-xl border px-4 py-3 font-bold">Adicionar item à sequência</button>
    {(validationError || limitError) && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{limitError ?? validationError}</p>}
    <button type="button" disabled={Boolean(validationError)} className="sr-only">Validar conteúdo</button>
  </section>;
}

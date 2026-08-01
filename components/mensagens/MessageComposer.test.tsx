import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { contentValidationError, MessageComposer } from './MessageComposer';
import type { WhatsAppCampaignContent } from '../../whatsapp/types';

describe('MessageComposer', () => {
  it('rejects variables outside the supported personalization set', async () => {
    const user = userEvent.setup();
    render(<MessageComposer value={{ primary: { type: 'text', text: '' }, sequence: [] }} onChange={vi.fn()} />);
    await user.type(screen.getByLabelText('Mensagem principal'), 'Olá, {{{{variavel_desconhecida}}}}');
    expect(screen.getByRole('alert')).toHaveTextContent('Variável não suportada: variavel_desconhecida');
    expect(screen.getByRole('button', { name: 'Validar conteúdo' })).toBeDisabled();
  });

  it('allows nine sequence items and rejects a tenth', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = React.useState({ primary: { type: 'text' as const, text: 'Principal' }, sequence: [] });
      return <MessageComposer value={value} onChange={setValue} />;
    }
    render(<Harness />);
    const add = screen.getByRole('button', { name: 'Adicionar item à sequência' });
    for (let index = 0; index < 9; index += 1) await user.click(add);
    expect(screen.getAllByRole('group', { name: /Item de sequência/ })).toHaveLength(9);
    await user.click(add);
    expect(screen.getByRole('alert')).toHaveTextContent('A sequência aceita no máximo 9 itens');
    expect(screen.getAllByRole('group', { name: /Item de sequência/ })).toHaveLength(9);
  });

  it('offers every supported content type', () => {
    render(<MessageComposer value={{ primary: { type: 'text', text: '' }, sequence: [] }} onChange={vi.fn()} />);
    const options = Array.from((screen.getByLabelText('Tipo da mensagem principal') as HTMLSelectElement).options)
      .map((option) => option.value);
    expect(options).toEqual(['text', 'image', 'document', 'audio', 'button', 'poll', 'carousel']);
  });

  it.each([
    ['text', { type: 'text', text: '   ' }, 'texto da mensagem'],
    ['image', { type: 'image', mediaId: '' }, 'mídia'],
    ['document', { type: 'document', mediaId: '' }, 'mídia'],
    ['audio', { type: 'audio', mediaId: '' }, 'mídia'],
    ['button', { type: 'button', text: 'Escolha', buttons: [{ label: '', action: 'REPLY', value: '' }] }, 'rótulo e o valor'],
    ['poll', { type: 'poll', text: 'Escolha', choices: ['Uma', 'Duas'], selectableCount: 3 }, 'quantidade selecionável'],
    ['carousel', { type: 'carousel', text: 'Opções', cards: [{ text: '', buttons: [{ label: 'Abrir', action: 'URL', value: 'https://example.test' }] }] }, 'texto de todos os cards'],
  ] as const)('validates required %s content before preview', (_type, primary, message) => {
    expect(contentValidationError({ primary, sequence: [] } as WhatsAppCampaignContent)).toContain(message);
  });

  it('accepts valid content for all seven supported types', () => {
    const items = [
      { type: 'text', text: 'Olá' },
      { type: 'image', mediaId: 'image-1' },
      { type: 'document', mediaId: 'document-1', filename: 'guia.pdf' },
      { type: 'audio', mediaId: 'audio-1' },
      { type: 'button', text: 'Escolha', footerText: 'Rodapé', mediaId: 'image-2', buttons: [{ label: 'Sim', action: 'REPLY', value: 'sim' }] },
      { type: 'poll', text: 'Escolha', choices: ['Uma', 'Duas'], selectableCount: 2 },
      { type: 'carousel', text: 'Opções', cards: [{ text: 'Card', mediaId: 'image-3', buttons: [{ label: 'Abrir', action: 'URL', value: 'https://example.test' }] }] },
    ] as WhatsAppCampaignContent['primary'][];
    for (const primary of items) expect(contentValidationError({ primary, sequence: [] })).toBeNull();
  });

  it('uploads and selects media for a button message', async () => {
    const user = userEvent.setup();
    const uploadMedia = vi.fn().mockResolvedValue({ id: 'media-uploaded' });
    function Harness() {
      const [value, setValue] = React.useState<WhatsAppCampaignContent>({ primary: { type: 'text', text: 'Olá' }, sequence: [] });
      return <MessageComposer value={value} onChange={setValue} api={{ uploadMedia } as any} />;
    }
    render(<Harness />);
    await user.selectOptions(screen.getByLabelText('Tipo da mensagem principal'), 'button');
    await user.type(screen.getByLabelText('Rodapé do botão'), 'Escolha uma opção');
    await user.upload(screen.getByLabelText('Enviar mídia do botão'), new File(['bytes'], 'card.png', { type: 'image/png' }));
    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(await screen.findByDisplayValue('media-uploaded')).toBeInTheDocument();
  });

  it('edits carousel card media and button data', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = React.useState({ primary: { type: 'text' as const, text: '' }, sequence: [] });
      return <MessageComposer value={value} onChange={setValue} />;
    }
    render(<Harness />);
    await user.selectOptions(screen.getByLabelText('Tipo da mensagem principal'), 'carousel');
    await user.type(screen.getByLabelText('Mídia do card 1'), 'media-1');
    await user.type(screen.getByLabelText('Rótulo do botão do card 1'), 'Saiba mais');
    await user.type(screen.getByLabelText('Valor do botão do card 1'), 'https://example.test');
    expect(screen.getByLabelText('Mídia do card 1')).toHaveValue('media-1');
    expect(screen.getByLabelText('Rótulo do botão do card 1')).toHaveValue('Saiba mais');
    expect(screen.getByLabelText('Valor do botão do card 1')).toHaveValue('https://example.test');
  });
});

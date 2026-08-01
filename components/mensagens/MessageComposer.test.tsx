import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageComposer } from './MessageComposer';

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

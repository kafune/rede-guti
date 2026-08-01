import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TemplatesPanel } from './TemplatesPanel';
import type { WhatsAppApi, WhatsAppTemplate } from '../../whatsapp/types';

const content = { primary: { type: 'text' as const, text: 'Mensagem original' }, sequence: [] };
const template: WhatsAppTemplate = {
  id: 'template-1', tenantId: 'tenant-1', createdById: 'coordinator-1', name: 'Boas-vindas',
  category: 'UTILITY', purpose: 'Recepcionar apoiadores', content, favorite: false, version: 1,
  createdAt: '2026-08-01T10:00:00.000Z', updatedAt: '2026-08-01T10:00:00.000Z',
};

function apiForTemplates(): WhatsAppApi {
  return {
    listTemplates: vi.fn().mockResolvedValue([template]),
    createTemplate: vi.fn().mockResolvedValue({ ...template, id: 'template-new' }),
    updateTemplate: vi.fn().mockResolvedValue({ ...template, name: 'Boas-vindas atualizadas', version: 2 }),
    setTemplateFavorite: vi.fn().mockResolvedValue({ ...template, favorite: true }),
    duplicateTemplate: vi.fn().mockResolvedValue({ ...template, id: 'template-copy', name: 'Cópia de boas-vindas' }),
    deleteTemplate: vi.fn().mockResolvedValue(undefined),
  } as unknown as WhatsAppApi;
}

async function openPanel() {
  const user = userEvent.setup();
  await user.click(screen.getByText('Modelos salvos'));
  await screen.findByText('Boas-vindas');
  return user;
}

describe('TemplatesPanel', () => {
  it('creates a template from explicit name, category, purpose and content fields', async () => {
    const api = apiForTemplates();
    render(<TemplatesPanel api={api} content={content} category="UTILITY" onLoad={vi.fn()} />);
    const user = await openPanel();
    await user.click(screen.getByRole('button', { name: 'Novo modelo' }));
    await user.type(screen.getByLabelText('Nome do modelo'), 'Mobilização');
    await user.selectOptions(screen.getByLabelText('Categoria do modelo'), 'MARKETING');
    await user.type(screen.getByLabelText('Finalidade do modelo'), 'Convite para mobilização');
    fireEvent.change(screen.getByLabelText('Mensagem principal'), { target: { value: 'Olá, {{primeiro_nome}}' } });
    await user.click(screen.getByRole('button', { name: 'Salvar novo modelo' }));

    expect(api.createTemplate).toHaveBeenCalledWith({
      name: 'Mobilização', category: 'MARKETING',
      purpose: 'Convite para mobilização',
      content: { primary: { type: 'text', text: 'Olá, {{primeiro_nome}}' }, sequence: [] },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Modelo criado');
  });

  it('updates the selected template with a strict backend payload', async () => {
    const api = apiForTemplates();
    render(<TemplatesPanel api={api} content={content} category="UTILITY" onLoad={vi.fn()} />);
    const user = await openPanel();
    await user.click(screen.getByRole('button', { name: 'Editar Boas-vindas' }));
    await user.clear(screen.getByLabelText('Nome do modelo'));
    await user.type(screen.getByLabelText('Nome do modelo'), 'Boas-vindas atualizadas');
    await user.selectOptions(screen.getByLabelText('Categoria do modelo'), 'MARKETING');
    await user.clear(screen.getByLabelText('Finalidade do modelo'));
    await user.type(screen.getByLabelText('Finalidade do modelo'), 'Atualização editorial');
    fireEvent.change(screen.getByLabelText('Mensagem principal'), { target: { value: 'Texto revisado' } });
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(api.updateTemplate).toHaveBeenCalledWith('template-1', {
      name: 'Boas-vindas atualizadas', category: 'MARKETING',
      purpose: 'Atualização editorial',
      content: { primary: { type: 'text', text: 'Texto revisado' }, sequence: [] },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Modelo atualizado');
  });

  it('sends null when an existing template purpose is cleared', async () => {
    const api = apiForTemplates();
    render(<TemplatesPanel api={api} content={content} category="UTILITY" onLoad={vi.fn()} />);
    const user = await openPanel();
    await user.click(screen.getByRole('button', { name: 'Editar Boas-vindas' }));
    await user.clear(screen.getByLabelText('Finalidade do modelo'));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(api.updateTemplate).toHaveBeenCalledWith('template-1', expect.objectContaining({ purpose: null }));
  });

  it('loads and favorites a template with visible confirmation', async () => {
    const api = apiForTemplates();
    const onLoad = vi.fn();
    render(<TemplatesPanel api={api} content={content} category="UTILITY" onLoad={onLoad} />);
    const user = await openPanel();
    const row = screen.getByRole('listitem');
    await user.click(within(row).getByRole('button', { name: 'Carregar' }));
    expect(onLoad).toHaveBeenCalledWith(template);
    await user.click(within(row).getByRole('button', { name: 'Favoritar' }));
    expect(api.setTemplateFavorite).toHaveBeenCalledWith('template-1', true);
    expect(await screen.findByRole('status')).toHaveTextContent('Favorito atualizado');
  });

  it('duplicates only after collecting and confirming the new name', async () => {
    const api = apiForTemplates();
    render(<TemplatesPanel api={api} content={content} category="UTILITY" onLoad={vi.fn()} />);
    const user = await openPanel();
    await user.click(screen.getByRole('button', { name: 'Duplicar Boas-vindas' }));
    expect(api.duplicateTemplate).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Nome da cópia'), 'Cópia de boas-vindas');
    await user.click(screen.getByRole('button', { name: 'Confirmar duplicação' }));
    expect(api.duplicateTemplate).toHaveBeenCalledWith('template-1', 'Cópia de boas-vindas');
    expect(await screen.findByRole('status')).toHaveTextContent('Modelo duplicado');
  });

  it('deletes only after explicit confirmation and exposes API errors', async () => {
    const api = apiForTemplates();
    render(<TemplatesPanel api={api} content={content} category="UTILITY" onLoad={vi.fn()} />);
    const user = await openPanel();
    await user.click(screen.getByRole('button', { name: 'Excluir Boas-vindas' }));
    expect(api.deleteTemplate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    expect(api.deleteTemplate).toHaveBeenCalledWith('template-1');
    expect(await screen.findByRole('status')).toHaveTextContent('Modelo excluído');

    api.setTemplateFavorite = vi.fn().mockRejectedValue(new Error('Falha remota'));
    await user.click(screen.getByRole('button', { name: 'Favoritar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha remota');
  });
});

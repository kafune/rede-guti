import React, { useEffect, useState } from 'react';
import type { WhatsAppApi, WhatsAppCampaignCategory, WhatsAppCampaignContent, WhatsAppTemplate } from '../../whatsapp/types';
import { MessageComposer } from './MessageComposer';

type EditorState = {
  id?: string;
  name: string;
  category: WhatsAppCampaignCategory;
  purpose: string;
  content: WhatsAppCampaignContent;
};

export function TemplatesPanel({ api, content, category, onLoad }: {
  api: WhatsAppApi; content: WhatsAppCampaignContent; category: WhatsAppCampaignCategory;
  onLoad: (template: WhatsAppTemplate) => void;
}) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorValid, setEditorValid] = useState(true);
  const [duplicate, setDuplicate] = useState<WhatsAppTemplate | null>(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [removing, setRemoving] = useState<WhatsAppTemplate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => setTemplates(await api.listTemplates());
  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : 'Erro nos modelos.')); }, [api]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); setNotice(success); await load(); return true; }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Erro nos modelos.'); return false; }
    finally { setBusy(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor || !editor.name.trim() || !editorValid) return;
    const payload = {
      name: editor.name.trim(), category: editor.category,
      purpose: editor.purpose.trim() || undefined, content: editor.content,
    };
    const saved = editor.id
      ? await run(() => api.updateTemplate(editor.id!, payload), 'Modelo atualizado.')
      : await run(() => api.createTemplate(payload), 'Modelo criado.');
    if (saved) setEditor(null);
  };

  return <details className="rounded-2xl border p-4">
    <summary className="cursor-pointer font-black">Modelos salvos</summary>
    <div className="mt-4 space-y-4">
      <button type="button" onClick={() => setEditor({ name: '', category, purpose: '', content })}
        className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Novo modelo</button>

      {editor && <form aria-label={editor.id ? 'Editar modelo' : 'Criar modelo'} className="space-y-4 rounded-2xl border p-4" onSubmit={save}>
        <h3 className="font-black">{editor.id ? 'Editar modelo' : 'Novo modelo'}</h3>
        <label className="block font-semibold">Nome do modelo<input className="mt-1 w-full rounded-xl border p-3" value={editor.name}
          onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
        <label className="block font-semibold">Categoria do modelo<select className="mt-1 w-full rounded-xl border p-3" value={editor.category}
          onChange={(event) => setEditor({ ...editor, category: event.target.value as WhatsAppCampaignCategory })}>
          <option value="UTILITY">Utilidade</option><option value="MARKETING">Marketing</option>
        </select></label>
        <label className="block font-semibold">Finalidade do modelo<input aria-label="Finalidade do modelo" className="mt-1 w-full rounded-xl border p-3" value={editor.purpose}
          onChange={(event) => setEditor({ ...editor, purpose: event.target.value })} />
          <span className="mt-1 block text-xs font-normal opacity-60">Objetivo editorial salvo com o modelo.</span>
        </label>
        <MessageComposer value={editor.content} api={api} onChange={(next) => setEditor({ ...editor, content: next })}
          onValidityChange={setEditorValid} />
        <div className="flex gap-2"><button disabled={busy || !editor.name.trim() || !editorValid}
          className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white">{editor.id ? 'Salvar alterações' : 'Salvar novo modelo'}</button>
          <button type="button" onClick={() => setEditor(null)} className="rounded-xl border px-4 py-3">Cancelar edição</button></div>
      </form>}

      <ul className="space-y-2">{templates.map((template) => <li key={template.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3">
        <strong className="mr-auto">{template.favorite ? '★ ' : ''}{template.name}</strong>
        <button type="button" onClick={() => { onLoad(template); setNotice('Modelo carregado.'); }} className="rounded-lg border px-3 py-2">Carregar</button>
        <button type="button" aria-label={`Editar ${template.name}`} onClick={() => setEditor({
          id: template.id, name: template.name, category: template.category, purpose: template.purpose ?? '', content: template.content,
        })} className="rounded-lg border px-3 py-2">Editar</button>
        <button type="button" onClick={() => void run(() => api.setTemplateFavorite(template.id, !template.favorite), 'Favorito atualizado.')}
          className="rounded-lg border px-3 py-2">{template.favorite ? 'Desfavoritar' : 'Favoritar'}</button>
        <button type="button" aria-label={`Duplicar ${template.name}`} onClick={() => { setDuplicate(template); setDuplicateName(''); }}
          className="rounded-lg border px-3 py-2">Duplicar</button>
        <button type="button" aria-label={`Excluir ${template.name}`} onClick={() => setRemoving(template)}
          className="rounded-lg border px-3 py-2 text-red-600">Excluir</button>
      </li>)}</ul>

      {duplicate && <section aria-label="Confirmar duplicação" className="space-y-3 rounded-xl border p-4">
        <label className="block font-semibold">Nome da cópia<input className="mt-1 w-full rounded-xl border p-3" value={duplicateName}
          onChange={(event) => setDuplicateName(event.target.value)} /></label>
        <button type="button" disabled={!duplicateName.trim() || busy} onClick={() => void (async () => {
          if (await run(() => api.duplicateTemplate(duplicate.id, duplicateName.trim()), 'Modelo duplicado.')) setDuplicate(null);
        })()} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white">Confirmar duplicação</button>
        <button type="button" onClick={() => setDuplicate(null)} className="ml-2 rounded-xl border px-4 py-2">Cancelar duplicação</button>
      </section>}

      {removing && <section aria-label="Confirmar exclusão" className="rounded-xl border border-red-200 p-4">
        <p>Excluir o modelo {removing.name}?</p>
        <button type="button" disabled={busy} onClick={() => void (async () => {
          if (await run(() => api.deleteTemplate(removing.id), 'Modelo excluído.')) setRemoving(null);
        })()} className="mt-3 rounded-xl bg-red-600 px-4 py-2 font-bold text-white">Confirmar exclusão</button>
        <button type="button" onClick={() => setRemoving(null)} className="ml-2 rounded-xl border px-4 py-2">Cancelar exclusão</button>
      </section>}

      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-700">{notice}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
    </div>
  </details>;
}

import React, { useEffect, useState } from 'react';
import type { WhatsAppApi, WhatsAppCampaignCategory, WhatsAppCampaignContent, WhatsAppTemplate } from '../../whatsapp/types';

export function TemplatesPanel({ api, content, category, onLoad }: {
  api: WhatsAppApi; content: WhatsAppCampaignContent; category: WhatsAppCampaignCategory;
  onLoad: (template: WhatsAppTemplate) => void;
}) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = () => api.listTemplates().then(setTemplates).catch((caught) => setError(caught instanceof Error ? caught.message : 'Erro nos modelos.'));
  useEffect(() => { void load(); }, [api]);
  const run = async (action: () => Promise<unknown>) => {
    setError(null); try { await action(); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Erro nos modelos.'); }
  };
  return <details className="rounded-2xl border p-4">
    <summary className="cursor-pointer font-black">Modelos salvos</summary>
    <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void run(() => api.createTemplate({ name: name.trim(), category, content })); }}>
      <label className="sr-only" htmlFor="template-name">Nome do modelo</label>
      <input id="template-name" placeholder="Nome do modelo" className="min-w-0 flex-1 rounded-xl border p-3" value={name} onChange={(event) => setName(event.target.value)} />
      <button disabled={!name.trim()} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Salvar modelo</button>
    </form>
    <ul className="mt-4 space-y-2">{templates.map((template) => <li key={template.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3">
      <strong className="mr-auto">{template.favorite ? '★ ' : ''}{template.name}</strong>
      <button onClick={() => onLoad(template)} className="rounded-lg border px-3 py-2">Carregar</button>
      <button onClick={() => void run(() => api.setTemplateFavorite(template.id, !template.favorite))} className="rounded-lg border px-3 py-2">{template.favorite ? 'Desfavoritar' : 'Favoritar'}</button>
      <button onClick={() => void run(() => api.duplicateTemplate(template.id, `${template.name} cópia`))} className="rounded-lg border px-3 py-2">Duplicar</button>
      <button onClick={() => void run(() => api.deleteTemplate(template.id))} className="rounded-lg border px-3 py-2 text-red-600">Excluir</button>
    </li>)}</ul>
    {error && <p role="alert" className="mt-3 text-red-600">{error}</p>}
  </details>;
}

import React, { useState } from 'react';
import { FEATURES } from '../../features';
import { whatsappApi } from '../../whatsapp/api';
import { localDateTimeToUtc } from '../../whatsapp/date';
import type {
  AudienceFilter,
  AudiencePreview,
  WhatsAppApi,
  WhatsAppCampaignCategory,
  WhatsAppCampaignContent,
} from '../../whatsapp/types';
import { AudienceSelector } from './AudienceSelector';
import { CampaignHistory } from './CampaignHistory';
import { CampaignPreview } from './CampaignPreview';
import { MessageComposer } from './MessageComposer';
import { SuppressionsPanel } from './SuppressionsPanel';
import { TemplatesPanel } from './TemplatesPanel';
import { WhatsAppConnection } from './WhatsAppConnection';

type Tab = 'conexao' | 'nova' | 'historico' | 'supressoes';
type Step = 'audience' | 'content' | 'preview' | 'confirm';
const initialContent = (): WhatsAppCampaignContent => ({ primary: { type: 'text', text: '' }, sequence: [] });

const compact = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== undefined),
) as T;

function requestAudience(filter: AudienceFilter, churchFieldEnabled: boolean): AudienceFilter {
  if (filter.type !== 'SUPPORTERS') return compact(filter);
  return compact({
    ...filter,
    ...(!churchFieldEnabled ? { churchIds: undefined } : {}),
    createdFrom: filter.createdFrom ? localDateTimeToUtc(filter.createdFrom) : undefined,
    createdTo: filter.createdTo ? localDateTimeToUtc(filter.createdTo) : undefined,
  });
}

function NewCampaign({ api, churchFieldEnabled, onCreated }: {
  api: WhatsAppApi; churchFieldEnabled: boolean; onCreated: () => void;
}) {
  const [step, setStep] = useState<Step>('audience');
  const [audience, setAudience] = useState<AudienceFilter>({ type: 'SUPPORTERS' });
  const [category, setCategory] = useState<WhatsAppCampaignCategory>('UTILITY');
  const [content, setContent] = useState<WhatsAppCampaignContent>(initialContent);
  const [contentValid, setContentValid] = useState(true);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [name, setName] = useState(''); const [schedule, setSchedule] = useState('');
  const [consent, setConsent] = useState(false); const [testPhone, setTestPhone] = useState('');
  const [testName, setTestName] = useState('Teste'); const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  const generatePreview = async () => {
    setBusy(true); setError(null);
    try {
      setPreview(await api.previewCampaign({ category, audienceFilter: requestAudience(audience, churchFieldEnabled), content }));
      setStep('preview');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível gerar a prévia.'); }
    finally { setBusy(false); }
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); if (!consent) return;
    setBusy(true); setError(null);
    try {
      const scheduledAt = localDateTimeToUtc(schedule);
      await api.createCampaign(compact({
        name: name.trim(), category, audienceFilter: requestAudience(audience, churchFieldEnabled), content,
        consentimentoConfirmado: true as const, scheduledAt,
      }));
      onCreated();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível criar a campanha.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <ol aria-label="Etapas da campanha" className="flex flex-wrap gap-2 text-sm font-bold">
      {['Público', 'Conteúdo', 'Prévia', 'Confirmação'].map((label, index) => <li key={label} className={`rounded-full px-3 py-1 ${index === ['audience', 'content', 'preview', 'confirm'].indexOf(step) ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>{label}</li>)}
    </ol>
    {step === 'audience' && <>
      <AudienceSelector value={audience} onChange={setAudience} churchFieldEnabled={churchFieldEnabled} />
      <button onClick={() => setStep('content')} disabled={audience.type === 'EVENT_GUESTS' && !audience.eventId.trim()}
        className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Continuar para conteúdo</button>
    </>}
    {step === 'content' && <>
      <label className="block font-semibold">Categoria da campanha
        <select className="mt-1 w-full rounded-xl border p-3" value={category} onChange={(event) => setCategory(event.target.value as WhatsAppCampaignCategory)}>
          <option value="UTILITY">Utilidade</option><option value="MARKETING">Marketing (inclui instrução de opt-out)</option>
        </select>
      </label>
      {category === 'MARKETING' && <p className="rounded-xl bg-amber-50 p-3 text-amber-900">Envios de marketing recebem automaticamente a instrução para responder SAIR.</p>}
      <TemplatesPanel api={api} content={content} category={category} onLoad={(template) => { setContent(template.content); setCategory(template.category); }} />
      <MessageComposer value={content} onChange={setContent} api={api} onValidityChange={setContentValid} />
      <div className="flex gap-2"><button onClick={() => setStep('audience')} className="rounded-xl border px-4 py-3 font-bold">Voltar</button>
        <button onClick={() => void generatePreview()} disabled={busy || !contentValid}
          className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Gerar prévia</button></div>
    </>}
    {step === 'preview' && preview && <>
      <CampaignPreview preview={preview} />
      <fieldset className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-3"><legend className="px-2 font-black">Envio de teste</legend>
        <label className="font-semibold">Telefone de teste<input className="mt-1 w-full rounded-xl border p-3" value={testPhone} onChange={(event) => setTestPhone(event.target.value)} /></label>
        <label className="font-semibold">Nome de teste<input className="mt-1 w-full rounded-xl border p-3" value={testName} onChange={(event) => setTestName(event.target.value)} /></label>
        <button disabled={!testPhone.trim()} onClick={() => {
          setNotice(null); setError(null); void api.sendTestCampaign({ phone: testPhone, name: testName, category, content })
            .then(() => setNotice('Mensagem de teste enviada.')).catch((caught) => setError(caught instanceof Error ? caught.message : 'Erro no teste.'));
        }} className="self-end rounded-xl border px-4 py-3 font-bold">Enviar teste</button>
      </fieldset>
      <div className="flex gap-2"><button onClick={() => setStep('content')} className="rounded-xl border px-4 py-3 font-bold">Editar conteúdo</button>
        <button onClick={() => setStep('confirm')} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Continuar para confirmação</button></div>
    </>}
    {step === 'confirm' && <form className="space-y-4" onSubmit={create}>
      <h2 className="text-xl font-black">Confirmação e agendamento</h2>
      <label className="block font-semibold">Nome da campanha<input required className="mt-1 w-full rounded-xl border p-3" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="block font-semibold">Agendar para<input type="datetime-local" className="mt-1 w-full rounded-xl border p-3" value={schedule} onChange={(event) => setSchedule(event.target.value)} /></label>
      <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 font-semibold"><input type="checkbox" className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        Confirmo que há consentimento para este envio</label>
      <div className="flex gap-2"><button type="button" onClick={() => setStep('preview')} className="rounded-xl border px-4 py-3 font-bold">Voltar à prévia</button>
        <button disabled={!consent || !name.trim() || busy} className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white">Criar campanha</button></div>
    </form>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-700">{notice}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
  </div>;
}

export function MensagensPanel({ api = whatsappApi, churchFieldEnabled = FEATURES.churchFieldEnabled }: {
  api?: WhatsAppApi; churchFieldEnabled?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('conexao');
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'conexao', label: 'Conexão' }, { id: 'nova', label: 'Nova campanha' },
    { id: 'historico', label: 'Histórico' }, { id: 'supressoes', label: 'Supressões' },
  ];
  return <section className="space-y-6"><div><p className="text-sm font-bold uppercase tracking-widest text-emerald-600">WhatsApp</p>
    <h1 className="text-3xl font-black">Mensagens</h1></div>
    <div role="tablist" aria-label="Áreas de mensagens" className="flex flex-wrap gap-2 border-b pb-3">
      {tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
        className={`rounded-xl px-4 py-3 font-bold ${tab === item.id ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>{item.label}</button>)}
    </div>
    {tab === 'conexao' && <WhatsAppConnection api={api} />}
    {tab === 'nova' && <NewCampaign api={api} churchFieldEnabled={churchFieldEnabled} onCreated={() => setTab('historico')} />}
    {tab === 'historico' && <CampaignHistory api={api} />}
    {tab === 'supressoes' && <SuppressionsPanel api={api} />}
  </section>;
}

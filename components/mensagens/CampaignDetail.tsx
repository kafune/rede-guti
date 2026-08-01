import React, { useEffect, useState } from 'react';
import { localDateTimeToUtc } from '../../whatsapp/date';
import type { WhatsAppApi, WhatsAppCampaign, WhatsAppCampaignDetail } from '../../whatsapp/types';

const canPause = (status: WhatsAppCampaign['status']) => ['SCHEDULED', 'QUEUED', 'SENDING'].includes(status);
const canResume = (status: WhatsAppCampaign['status']) => status === 'PAUSED';
const canCancel = (status: WhatsAppCampaign['status']) => ['DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED'].includes(status);
const canEdit = (status: WhatsAppCampaign['status']) => ['DRAFT', 'SCHEDULED', 'QUEUED', 'PAUSED'].includes(status);

export function CampaignDetail({ campaignId, api, onBack, onChanged }: {
  campaignId: string; api: WhatsAppApi; onBack: () => void; onChanged: (campaign: WhatsAppCampaign) => void;
}) {
  const [campaign, setCampaign] = useState<WhatsAppCampaignDetail | null>(null);
  const [editing, setEditing] = useState(false); const [name, setName] = useState('');
  const [schedule, setSchedule] = useState(''); const [error, setError] = useState<string | null>(null);
  const load = () => api.getCampaign(campaignId).then((value) => { setCampaign(value); setName(value.name); });
  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : 'Erro ao carregar campanha.')); }, [api, campaignId]);
  const run = async (action: () => Promise<WhatsAppCampaign>) => {
    setError(null);
    try { const changed = await action(); onChanged(changed); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Erro ao controlar campanha.'); }
  };
  if (!campaign) return <section><button onClick={onBack}>Voltar ao histórico</button><p>{error ?? 'Carregando detalhes...'}</p></section>;
  return <section className="space-y-5" aria-labelledby="campaign-detail-heading">
    <button onClick={onBack} className="font-bold text-blue-600">← Voltar ao histórico</button>
    <div><h2 id="campaign-detail-heading" className="text-xl font-black">{campaign.name}</h2><p>Status: {campaign.status}</p></div>
    <div className="flex flex-wrap gap-2">
      {canPause(campaign.status) && <button onClick={() => void run(() => api.pauseCampaign(campaign.id))} className="rounded-xl border px-4 py-2">Pausar</button>}
      {canResume(campaign.status) && <button onClick={() => void run(() => api.resumeCampaign(campaign.id))} className="rounded-xl border px-4 py-2">Retomar</button>}
      {canCancel(campaign.status) && <button onClick={() => void run(() => api.cancelCampaign(campaign.id))} className="rounded-xl border px-4 py-2 text-red-600">Cancelar</button>}
      {canEdit(campaign.status) && <button onClick={() => setEditing((value) => !value)} className="rounded-xl border px-4 py-2">Editar</button>}
      {campaign.failedCount > 0 && <button onClick={() => void run(() => api.retryFailedRecipients(campaign.id))} className="rounded-xl border px-4 py-2">Reenviar falhas</button>}
      <button onClick={() => void run(() => api.syncCampaign(campaign.id))} className="rounded-xl border px-4 py-2">Sincronizar</button>
    </div>
    {editing && <form className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2" onSubmit={(event) => {
      event.preventDefault(); void run(() => api.updateCampaign(campaign.id, { name })).then(() => setEditing(false));
    }}><label className="font-semibold">Novo nome<input className="mt-1 w-full rounded-xl border p-3" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button className="self-end rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Salvar edição</button>
      <label className="font-semibold">Novo agendamento<input type="datetime-local" className="mt-1 w-full rounded-xl border p-3" value={schedule} onChange={(event) => setSchedule(event.target.value)} /></label>
      <button type="button" disabled={!schedule} onClick={() => {
        const utc = localDateTimeToUtc(schedule); if (utc) void run(() => api.rescheduleCampaign(campaign.id, utc));
      }} className="self-end rounded-xl border px-4 py-3 font-bold">Reagendar</button>
    </form>}
    <section aria-labelledby="recipients-heading"><h3 id="recipients-heading" className="font-black">Destinatários</h3>
      <div className="mt-2 overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Nome</th><th>Telefone</th><th>Status</th><th>Erro/exclusão</th></tr></thead>
        <tbody>{campaign.recipients.map((recipient) => <tr key={recipient.id} className="border-t"><td className="p-2">{recipient.personName}</td>
          <td className="p-2">{recipient.phoneNormalized ?? recipient.phoneOriginal}</td><td className="p-2">{recipient.status}</td>
          <td className="p-2 text-red-700">{recipient.error ?? recipient.exclusionReason ?? '—'}</td></tr>)}</tbody></table></div>
    </section>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
  </section>;
}

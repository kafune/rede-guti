import React, { useEffect, useMemo, useState } from 'react';
import type { WhatsAppApi, WhatsAppCampaign } from '../../whatsapp/types';
import { CampaignDetail } from './CampaignDetail';

const ACTIVE = new Set<WhatsAppCampaign['status']>(['SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED']);

export function CampaignHistory({ api }: { api: WhatsAppApi }) {
  const [campaigns, setCampaigns] = useState<WhatsAppCampaign[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => { try { setCampaigns(await api.listCampaigns()); setError(null); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Erro no histórico.'); } };
  useEffect(() => { void load(); }, [api]);
  const hasActive = useMemo(() => campaigns.some(({ status }) => ACTIVE.has(status)), [campaigns]);
  const retriedCampaignIds = useMemo(() => new Set(campaigns.flatMap((campaign) =>
    campaign.audienceFilter.type === 'RETRY' ? [campaign.audienceFilter.retryOfCampaignId] : []
  )), [campaigns]);
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => { void api.syncCampaigns().then(load).catch((caught) => setError(caught instanceof Error ? caught.message : 'Erro ao sincronizar.')); }, 15_000);
    return () => window.clearInterval(timer);
  }, [api, hasActive]);

  if (selected) return <CampaignDetail campaignId={selected} api={api} onBack={() => setSelected(null)} onChanged={(changed) => {
    setCampaigns((current) => current.map((item) => item.id === changed.id ? changed : item));
  }} retryAlreadyExists={retriedCampaignIds.has(selected)} onRetry={async (campaignId) => {
    const retry = await api.retryFailedRecipients(campaignId);
    setCampaigns((current) => current.some(({ id }) => id === retry.id)
      ? current.map((item) => item.id === retry.id ? retry : item)
      : [...current, retry]);
    setSelected(retry.id);
    await load();
  }} />;

  return <section className="space-y-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Histórico de campanhas</h2>
    <button onClick={() => void api.syncCampaigns().then(load)} className="rounded-xl border px-4 py-2 font-bold">Sincronizar ativas</button></div>
    {campaigns.length === 0 && !error && <p>Nenhuma campanha criada.</p>}
    <div className="space-y-4">{campaigns.map((campaign) => <article key={campaign.id} aria-label={campaign.name} className="rounded-2xl border p-5">
      <div className="flex items-start justify-between gap-4"><div><h3 className="font-black">{campaign.name}</h3><p>{campaign.status}</p></div>
        <button onClick={() => setSelected(campaign.id)} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white">Ver detalhes</button></div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <span>{campaign.queuedCount} na fila</span><span>{campaign.sentCount} enviados</span><span>{campaign.failedCount} falhou</span>
        <span>{campaign.deliveredCount} entregues</span><span>{campaign.readCount} lidos</span><span>{campaign.playedCount} reproduzido</span>
        <span>{campaign.replyCount} respostas</span><span>{campaign.optOutCount} opt-out</span>
      </div>
    </article>)}</div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
  </section>;
}

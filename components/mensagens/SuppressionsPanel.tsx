import React, { useEffect, useState } from 'react';
import type { WhatsAppApi, WhatsAppSuppression } from '../../whatsapp/types';

export function SuppressionsPanel({ api }: { api: WhatsAppApi }) {
  const [items, setItems] = useState<WhatsAppSuppression[]>([]);
  const [phone, setPhone] = useState(''); const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = () => api.listSuppressions().then(setItems).catch((caught) => setError(caught instanceof Error ? caught.message : 'Erro nas supressões.'));
  useEffect(() => { void load(); }, [api]);
  const run = async (action: () => Promise<unknown>) => { setError(null); try { await action(); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Erro nas supressões.'); } };
  return <section className="space-y-5"><h2 className="text-xl font-black">Lista de supressões</h2>
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={(event) => { event.preventDefault(); void run(() => api.createSuppression({ phone, reason })); }}>
      <label className="font-semibold">Telefone<input required className="mt-1 w-full rounded-xl border p-3" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <label className="font-semibold">Motivo<input required className="mt-1 w-full rounded-xl border p-3" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button disabled={!phone.trim() || !reason.trim()} className="self-end rounded-xl bg-red-600 px-4 py-3 font-bold text-white">Adicionar supressão</button>
    </form>
    <ul className="space-y-2">{items.map((item) => <li key={item.id} className="flex items-center gap-3 rounded-xl border p-3">
      <span className="mr-auto"><strong>{item.phoneNormalized}</strong> · {item.reason ?? item.source ?? 'Sem motivo'} · {item.active ? 'Ativa' : 'Reautorizada'}</span>
      {item.active && <button onClick={() => void run(() => api.reauthorizeSuppression(item.id))} className="rounded-lg border px-3 py-2">Reautorizar com consentimento</button>}
    </li>)}</ul>
    {error && <p role="alert" className="text-red-600">{error}</p>}
  </section>;
}

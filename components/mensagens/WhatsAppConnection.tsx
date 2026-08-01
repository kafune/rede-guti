import React, { useEffect, useState } from 'react';
import type { WhatsAppApi, WhatsAppConnectResponse, WhatsAppInstance } from '../../whatsapp/types';

export function WhatsAppConnection({ api }: { api: WhatsAppApi }) {
  const [instance, setInstance] = useState<WhatsAppInstance | null>(null);
  const [connect, setConnect] = useState<WhatsAppConnectResponse | null>(null);
  const [name, setName] = useState('Rede Guti');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => api.getInstance().then(setInstance).catch((caught) => setError(caught instanceof Error ? caught.message : 'Erro ao carregar conexão.'));
  useEffect(() => { void refresh(); }, [api]);
  const run = async (action: () => Promise<unknown>, after?: (value: any) => void) => {
    setBusy(true); setError(null);
    try { const result = await action(); after?.(result); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Erro na conexão.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-5">
    <h2 className="text-xl font-black">Conexão com WhatsApp</h2>
    {!instance && !error && <p>Verificando conexão...</p>}
    {instance?.configured === false && <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault(); void run(() => api.createInstance(name));
    }}><label className="block font-semibold">Nome da instância<input className="mt-1 w-full rounded-xl border p-3" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button disabled={busy || !name.trim()} className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white">Criar instância</button>
    </form>}
    {instance?.configured && <div className="space-y-3 rounded-2xl border p-5">
      <p><strong>{instance.name ?? 'Instância'}</strong> · {instance.phone ?? 'sem telefone'} · {instance.status ?? 'sem status'}</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void run(() => api.connectInstance(), setConnect)} className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white">Conectar</button>
        <button disabled={busy} onClick={() => void run(() => api.disconnectInstance(), () => setConnect(null))} className="rounded-xl border px-4 py-3 font-bold">Desconectar</button>
        <button disabled={busy} onClick={() => void refresh()} className="rounded-xl border px-4 py-3 font-bold">Atualizar estado</button>
      </div>
    </div>}
    {connect?.qrcode && <img alt="QR Code para conectar WhatsApp" src={connect.qrcode.startsWith('data:') ? connect.qrcode : `data:image/png;base64,${connect.qrcode}`} />}
    {connect?.paircode && <p>Código de pareamento: <strong>{connect.paircode}</strong></p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
  </section>;
}

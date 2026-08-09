import React, { useEffect, useState } from 'react';
import { ElectoralZone, Team, TerritoryChurch, Visit, VISIT_STATUS_LABEL } from '../../territoryTypes';
import {
  fetchChurchDetail,
  generateVisits,
  reclassifyChurch,
  revokeVisitToken,
  setChurchZone,
  updateTerritoryChurch,
  updateVisit,
} from '../../territoryApi';
import { getApiErrorMessage } from '../../api';

interface Props {
  churchId: string;
  zones: ElectoralZone[];
  teams: Team[];
  canEdit: boolean;
  onBack: () => void;
  onChanged: () => void;
}

const visitLink = (token: string) => `${window.location.origin}/#/v/${token}`;

const statusTone = (status: string) => {
  if (status === 'visita_realizada') return 'bg-emerald-500/15 text-emerald-600';
  if (status === 'checkin_realizado' || status === 'em_rota') return 'bg-sky-500/15 text-sky-600';
  if (status === 'agendada' || status === 'reagendada') return 'bg-blue-500/15 text-blue-600';
  if (status === 'pendente_validacao') return 'bg-amber-500/15 text-amber-600';
  if (status === 'nao_realizada' || status === 'ausente' || status === 'cancelada') return 'bg-red-500/15 text-red-600';
  return 'bg-gray-500/15 text-gray-500';
};

const geofenceTone = (g: string | null) =>
  g === 'confirmado' ? 'text-emerald-600' : g === 'atencao' ? 'text-amber-600' : g === 'fora' ? 'text-red-600' : 'opacity-50';

const ChurchDetailView: React.FC<Props> = ({ churchId, zones, teams, canEdit, onBack, onChanged }) => {
  const [church, setChurch] = useState<TerritoryChurch | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<TerritoryChurch>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchChurchDetail(churchId);
      setChurch(data.church);
      setVisits(data.visits);
      setForm(data.church);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [churchId]);

  const saveEdit = async () => {
    try {
      await updateTerritoryChurch(churchId, {
        name: form.name!,
        denomination: form.denomination ?? undefined,
        pastorName: form.pastorName ?? undefined,
        phone: form.phone ?? undefined,
        whatsapp: form.whatsapp ?? undefined,
        email: form.email ?? undefined,
        street: form.street ?? undefined,
        number: form.number ?? undefined,
        district: form.district ?? undefined,
        city: form.city ?? undefined,
        postalCode: form.postalCode ?? undefined,
        latitude: form.latitude ?? undefined,
        longitude: form.longitude ?? undefined,
        notes: form.notes ?? undefined,
      });
      setEditing(false);
      await load();
      onChanged();
    } catch (e) {
      alert(getApiErrorMessage(e));
    }
  };

  const overrideZone = async (zoneNumber: string) => {
    if (!zoneNumber) return;
    await setChurchZone(churchId, zoneNumber);
    await load();
    onChanged();
  };

  const doReclassify = async () => {
    const res = await reclassifyChurch(churchId);
    await load();
    onChanged();
    alert(res.zoneResolution?.reason ?? 'Reclassificado.');
  };

  const doGenerate = async () => {
    await generateVisits(churchId);
    await load();
    onChanged();
  };

  const doRevoke = async (id: string) => {
    if (!confirm('Gerar novo link e invalidar o atual?')) return;
    await revokeVisitToken(id);
    await load();
  };

  const scheduleVisit = async (v: Visit, patch: any) => {
    await updateVisit(v.id, patch);
    await load();
    onChanged();
  };

  const copyLink = (token: string) => {
    navigator.clipboard?.writeText(visitLink(token));
    setCopied(token);
    setTimeout(() => setCopied((t) => (t === token ? null : t)), 1500);
  };

  if (loading) return <div className="p-6 opacity-60">Carregando…</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;
  if (!church) return null;

  const input = 'w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm';

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm font-bold opacity-60 hover:opacity-100">
        <i className="fa-solid fa-arrow-left mr-2"></i>Voltar
      </button>

      {/* Cabeçalho */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {church.zoneNumber ? (
                <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: `${church.zoneColor}22`, color: church.zoneColor ?? undefined }}>
                  Zona {church.zoneNumber}
                </span>
              ) : (
                <span className="text-xs font-black px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-500">Sem zona</span>
              )}
              {church.zoneRequiresReview && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                  <i className="fa-solid fa-triangle-exclamation mr-1"></i>Requer validação
                </span>
              )}
              {church.currentTeamName && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600">{church.currentTeamName}</span>
              )}
            </div>
            <h2 className="text-2xl font-black mt-2">{church.name}</h2>
            {church.denomination && <p className="opacity-60">{church.denomination}</p>}
          </div>
          {canEdit && (
            <button onClick={() => setEditing((v) => !v)} className="text-sm font-bold text-blue-600">
              <i className="fa-solid fa-pen mr-1"></i>{editing ? 'Cancelar' : 'Editar'}
            </button>
          )}
        </div>

        {!editing ? (
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 mt-4 text-sm">
            <div><span className="opacity-50">Pastor/líder:</span> {church.pastorName ?? '—'}</div>
            <div><span className="opacity-50">Telefone:</span> {church.phone ?? '—'}</div>
            <div className="sm:col-span-2"><span className="opacity-50">Endereço:</span> {[church.street, church.number, church.district, church.city].filter(Boolean).join(', ') || '—'}</div>
            <div><span className="opacity-50">Coordenada:</span> {church.latitude != null ? `${church.latitude.toFixed(5)}, ${church.longitude?.toFixed(5)}` : 'sem coordenada'}</div>
            <div><span className="opacity-50">CEP:</span> {church.postalCode ?? '—'}</div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            {([
              ['name', 'Nome'], ['denomination', 'Denominação'], ['pastorName', 'Pastor/líder'], ['phone', 'Telefone'],
              ['street', 'Rua'], ['number', 'Número'], ['district', 'Bairro'], ['city', 'Cidade'], ['postalCode', 'CEP'],
            ] as [keyof TerritoryChurch, string][]).map(([key, label]) => (
              <label key={key} className="text-sm">
                <span className="opacity-50 text-xs">{label}</span>
                <input className={input} value={(form[key] as string) ?? ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
              </label>
            ))}
            <label className="text-sm"><span className="opacity-50 text-xs">Latitude</span>
              <input className={input} type="number" step="any" value={form.latitude ?? ''} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value === '' ? null : Number(e.target.value) }))} />
            </label>
            <label className="text-sm"><span className="opacity-50 text-xs">Longitude</span>
              <input className={input} type="number" step="any" value={form.longitude ?? ''} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value === '' ? null : Number(e.target.value) }))} />
            </label>
            <div className="sm:col-span-2">
              <button onClick={saveEdit} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm">Salvar</button>
            </div>
          </div>
        )}

        {/* Zona */}
        {canEdit && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-2">
            <span className="text-xs opacity-50">Zona eleitoral:</span>
            <select className="rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1 text-sm" value={church.zoneNumber ?? ''} onChange={(e) => overrideZone(e.target.value)}>
              <option value="">— selecionar —</option>
              {zones.map((z) => <option key={z.id} value={z.number}>Zona {z.number}</option>)}
            </select>
            <button onClick={doReclassify} className="text-xs font-bold text-blue-600"><i className="fa-solid fa-wand-magic-sparkles mr-1"></i>Reclassificar por bairro</button>
            {church.zoneSource && <span className="text-[11px] opacity-40">fonte: {church.zoneSource}</span>}
          </div>
        )}
      </div>

      {/* Visitas */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black">Visitas</h3>
          {canEdit && visits.length === 0 && (
            <button onClick={doGenerate} className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-sm font-bold">
              <i className="fa-solid fa-plus mr-1"></i>Gerar visitas
            </button>
          )}
        </div>

        {visits.length === 0 ? (
          <p className="text-sm opacity-50">Nenhuma visita programada.</p>
        ) : (
          <div className="space-y-4">
            {visits.map((v) => (
              <div key={v.id} className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="font-black">Visita #{v.visitNumber}</div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusTone(v.status)}`}>
                    {VISIT_STATUS_LABEL[v.status] ?? v.status}
                  </span>
                </div>

                {v.checkinAt && (
                  <div className="mt-2 text-sm grid sm:grid-cols-3 gap-x-4 gap-y-1">
                    <div><span className="opacity-50">Check-in:</span> {new Date(v.checkinAt).toLocaleString('pt-BR')}</div>
                    <div className={geofenceTone(v.geofenceStatus)}>
                      <span className="opacity-50">GPS:</span> {v.geofenceStatus ?? '—'}{v.distanceFromChurch != null ? ` · ${v.distanceFromChurch} m` : ''}
                    </div>
                    <div><span className="opacity-50">Foto:</span> {v.hasPhoto ? 'sim' : 'não'}</div>
                    {v.outcome && <div className="sm:col-span-3"><span className="opacity-50">Resultado:</span> {v.outcome}</div>}
                  </div>
                )}

                {v.hasPhoto && v.photoUrl && (
                  <img src={v.photoUrl} alt={`Foto visita ${v.visitNumber}`} className="mt-3 rounded-xl max-h-48" />
                )}

                {canEdit && (
                  <div className="mt-3 grid sm:grid-cols-4 gap-2 items-end">
                    <label className="text-xs"><span className="opacity-50">Data</span>
                      <input type="date" className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-sm"
                        value={v.scheduledDate ? v.scheduledDate.slice(0, 10) : ''}
                        onChange={(e) => scheduleVisit(v, { scheduledDate: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                    </label>
                    <label className="text-xs"><span className="opacity-50">Hora</span>
                      <input type="time" className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-sm"
                        value={v.scheduledStartTime ?? ''}
                        onChange={(e) => scheduleVisit(v, { scheduledStartTime: e.target.value || null })} />
                    </label>
                    <label className="text-xs"><span className="opacity-50">Equipe</span>
                      <select className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-sm"
                        value={v.teamId ?? ''} onChange={(e) => scheduleVisit(v, { teamId: e.target.value || null })}>
                        <option value="">—</option>
                        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </label>
                    <div className="flex gap-2">
                      <button onClick={() => copyLink(v.publicToken)} className="flex-1 px-2 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-bold">
                        <i className="fa-solid fa-link mr-1"></i>{copied === v.publicToken ? 'Copiado!' : 'Link'}
                      </button>
                      <button onClick={() => doRevoke(v.id)} title="Revogar link" className="px-2 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs">
                        <i className="fa-solid fa-rotate"></i>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChurchDetailView;

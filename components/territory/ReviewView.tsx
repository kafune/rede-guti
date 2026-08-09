import React, { useEffect, useState } from 'react';
import { Visit, VISIT_STATUS_LABEL } from '../../territoryTypes';
import { fetchReviewQueue, reviewVisit } from '../../territoryApi';
import { getApiErrorMessage } from '../../api';

interface Props {
  canEdit: boolean;
  onOpenChurch: (id: string) => void;
  onDataChanged: () => void;
}

const geofenceTone = (g: string | null) =>
  g === 'atencao' ? 'text-amber-600' : g === 'fora' ? 'text-red-600' : 'opacity-60';

const ReviewView: React.FC<Props> = ({ canEdit, onOpenChurch, onDataChanged }) => {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setVisits(await fetchReviewQueue());
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (id: string, decision: 'aprovar' | 'rejeitar' | 'corrigir') => {
    try {
      await reviewVisit(id, decision);
      await load();
      onDataChanged();
    } catch (e) {
      alert(getApiErrorMessage(e));
    }
  };

  if (loading) return <div className="opacity-60 p-6">Carregando…</div>;
  if (error) return <div className="text-red-500 p-4">{error}</div>;

  return (
    <div className="space-y-3">
      <p className="text-sm opacity-60">
        Check-ins com GPS fora do raio, precisão ruim, justificativa ou pendentes de validação.
      </p>
      {visits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center opacity-60">
          <i className="fa-solid fa-circle-check text-emerald-500 text-2xl"></i>
          <p className="mt-2 text-sm">Nada para revisar.</p>
        </div>
      ) : (
        visits.map((v) => (
          <div key={v.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => onOpenChurch(v.churchId)} className="text-left">
                <div className="font-bold">{v.churchName ?? 'Igreja'} <span className="text-xs opacity-40">#{v.visitNumber}</span></div>
                <div className="text-xs opacity-50">{v.teamName ?? 'sem equipe'} · {VISIT_STATUS_LABEL[v.status] ?? v.status}</div>
              </button>
              {v.hasPhoto && v.photoUrl && <img src={v.photoUrl} alt="Foto" className="w-16 h-16 rounded-xl object-cover" />}
            </div>
            <div className="mt-2 text-sm grid sm:grid-cols-3 gap-x-4 gap-y-1">
              <div className={geofenceTone(v.geofenceStatus)}>
                <i className="fa-solid fa-location-crosshairs mr-1"></i>{v.geofenceStatus ?? '—'}
                {v.distanceFromChurch != null ? ` · ${v.distanceFromChurch} m` : ''}
              </div>
              <div><span className="opacity-50">Precisão:</span> {v.checkinAccuracy != null ? `${Math.round(v.checkinAccuracy)} m` : '—'}</div>
              <div><span className="opacity-50">Check-in:</span> {v.checkinAt ? new Date(v.checkinAt).toLocaleString('pt-BR') : '—'}</div>
              {v.justification && <div className="sm:col-span-3"><span className="opacity-50">Justificativa:</span> {v.justification}</div>}
            </div>
            {canEdit && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => decide(v.id, 'aprovar')} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">Aprovar</button>
                <button onClick={() => decide(v.id, 'rejeitar')} className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-sm font-bold">Rejeitar</button>
                <button onClick={() => decide(v.id, 'corrigir')} className="px-3 py-1.5 rounded-xl bg-gray-200 dark:bg-gray-800 text-sm font-bold">Solicitar correção</button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default ReviewView;

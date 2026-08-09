import React, { useEffect, useMemo, useState } from 'react';
import { ElectoralZone, Team, Visit, VISIT_STATUS_LABEL } from '../../territoryTypes';
import { fetchVisits, VisitFilters } from '../../territoryApi';
import { getApiErrorMessage } from '../../api';

interface Props {
  zones: ElectoralZone[];
  teams: Team[];
  onOpenChurch: (id: string) => void;
}

const inputCls = 'rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm';

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

const AgendaView: React.FC<Props> = ({ zones, teams, onOpenChurch }) => {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState('');
  const [teamId, setTeamId] = useState('');
  const [late, setLate] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: VisitFilters = { zone: zone || undefined, teamId: teamId || undefined, late: late ? 'true' : undefined };
      setVisits(await fetchVisits(filters));
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone, teamId, late]);

  const grouped = useMemo(() => {
    const map = new Map<string, Visit[]>();
    const noDate: Visit[] = [];
    for (const v of visits) {
      if (!v.scheduledDate) { noDate.push(v); continue; }
      const key = v.scheduledDate.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(v);
      map.set(key, arr);
    }
    const days = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return { days, noDate };
  }, [visits]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select value={zone} onChange={(e) => setZone(e.target.value)} className={inputCls}>
          <option value="">Todas as zonas</option>
          {zones.map((z) => <option key={z.id} value={z.number}>Zona {z.number}</option>)}
        </select>
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={inputCls}>
          <option value="">Todas as equipes</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button onClick={() => setLate((v) => !v)} className={`${inputCls} font-bold ${late ? 'bg-red-500/20 text-red-600 border-red-500/40' : ''}`}>
          <i className="fa-solid fa-clock mr-1"></i>Só atrasadas
        </button>
      </div>

      {error && <div className="text-sm px-3 py-2 rounded-xl bg-red-500/10 text-red-600">{error}</div>}
      {loading ? (
        <div className="opacity-60 p-6">Carregando…</div>
      ) : visits.length === 0 ? (
        <p className="opacity-50 text-sm">Nenhuma visita para os filtros.</p>
      ) : (
        <div className="space-y-5">
          {grouped.days.map(([day, dayVisits]) => (
            <div key={day}>
              <h3 className="font-black capitalize mb-2">{dayLabel(day)}</h3>
              <div className="space-y-2">
                {dayVisits
                  .sort((a, b) => (a.scheduledStartTime ?? '').localeCompare(b.scheduledStartTime ?? ''))
                  .map((v) => (
                    <button key={v.id} onClick={() => onOpenChurch(v.churchId)} className="w-full text-left bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-3 flex items-center gap-3">
                      <div className="text-center w-14 flex-shrink-0">
                        <div className="font-black">{v.scheduledStartTime ?? '--:--'}</div>
                        <div className="text-[10px] opacity-50">#{v.visitNumber}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate">{v.churchName ?? 'Igreja'}</div>
                        <div className="text-xs opacity-50 truncate">{v.teamName ?? 'sem equipe'}</div>
                      </div>
                      <span className="text-[11px] font-bold opacity-60">{VISIT_STATUS_LABEL[v.status] ?? v.status}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}

          {grouped.noDate.length > 0 && (
            <div>
              <h3 className="font-black mb-2 opacity-60">Sem data</h3>
              <div className="space-y-2">
                {grouped.noDate.map((v) => (
                  <button key={v.id} onClick={() => onOpenChurch(v.churchId)} className="w-full text-left bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{v.churchName ?? 'Igreja'} <span className="text-xs opacity-40">#{v.visitNumber}</span></div>
                      <div className="text-xs opacity-50 truncate">{v.teamName ?? 'sem equipe'}</div>
                    </div>
                    <span className="text-[11px] font-bold opacity-60">{VISIT_STATUS_LABEL[v.status] ?? v.status}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgendaView;

import React from 'react';
import { TerritoryDashboard as DashboardData } from '../../territoryTypes';

const Card: React.FC<{ label: string; value: number; tone?: string; icon: string }> = ({ label, value, tone = 'text-blue-600', icon }) => (
  <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-black uppercase tracking-wider opacity-40">{label}</span>
      <i className={`fa-solid ${icon} ${tone} opacity-60`}></i>
    </div>
    <div className={`text-3xl font-black mt-2 ${tone}`}>{value.toLocaleString('pt-BR')}</div>
  </div>
);

const FunnelRow: React.FC<{ label: string; value: number; max: number; color: string }> = ({ label, value, max, color }) => (
  <div>
    <div className="flex justify-between text-sm mb-1">
      <span className="font-semibold opacity-70">{label}</span>
      <span className="font-black">{value.toLocaleString('pt-BR')}</span>
    </div>
    <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} />
    </div>
  </div>
);

interface Props {
  data: DashboardData;
}

const TerritoryDashboard: React.FC<Props> = ({ data }) => {
  const c = data.cards;
  const f = data.funnel;
  const funnelMax = f.cadastradas || 1;

  const funnelSteps = [
    { label: 'Igrejas cadastradas', value: f.cadastradas, color: '#64748b' },
    { label: 'Com zona identificada', value: f.classificadas, color: '#6366f1' },
    { label: 'Atribuídas a equipe', value: f.atribuidas, color: '#3b82f6' },
    { label: 'Visita 1 agendada', value: f.v1Agendada, color: '#0ea5e9' },
    { label: 'Visita 1 concluída', value: f.v1Concluida, color: '#10b981' },
    { label: 'Visita 2 agendada', value: f.v2Agendada, color: '#f59e0b' },
    { label: 'Ciclo completo (2 visitas)', value: f.cicloCompleto, color: '#a855f7' },
  ];

  const zoneMaxChurches = Math.max(1, ...data.byZone.map((z) => z.churches));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Igrejas" value={c.churchesTotal} icon="fa-church" />
        <Card label="Com zona" value={c.churchesWithZone} tone="text-indigo-600" icon="fa-location-dot" />
        <Card label="Pendentes classificação" value={c.pendingClassification} tone="text-amber-600" icon="fa-triangle-exclamation" />
        <Card label="Atribuídas" value={c.assigned} tone="text-sky-600" icon="fa-people-group" />
        <Card label="Visitas agendadas" value={c.visitsScheduled} tone="text-blue-600" icon="fa-calendar-check" />
        <Card label="Visitas realizadas" value={c.visitsDone} tone="text-emerald-600" icon="fa-circle-check" />
        <Card label="Visitas atrasadas" value={c.visitsLate} tone="text-red-600" icon="fa-clock" />
        <Card label="Ciclo completo" value={c.cycleComplete} tone="text-purple-600" icon="fa-flag-checkered" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5">
          <h3 className="font-black mb-4">Funil territorial</h3>
          <div className="space-y-3">
            {funnelSteps.map((s) => (
              <FunnelRow key={s.label} label={s.label} value={s.value} max={funnelMax} color={s.color} />
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5">
          <h3 className="font-black mb-4">Por Zona Eleitoral</h3>
          <div className="space-y-3">
            {data.byZone.map((z) => (
              <div key={z.zoneId}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-bold inline-flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: z.color ?? '#94a3b8' }} />
                    Zona {z.number}
                  </span>
                  <span className="opacity-60">
                    {z.churches} igrejas · {z.unassigned} sem equipe · {z.late} atrasadas
                  </span>
                </div>
                <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden flex">
                  <div className="h-full" style={{ width: `${(z.v1Done / zoneMaxChurches) * 100}%`, background: '#10b981' }} title={`V1 concluídas: ${z.v1Done}`} />
                  <div className="h-full" style={{ width: `${(z.v2Done / zoneMaxChurches) * 100}%`, background: '#a855f7' }} title={`V2 concluídas: ${z.v2Done}`} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-4 text-[11px] opacity-60">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> V1 concluída</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> V2 concluída</span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 overflow-x-auto">
        <h3 className="font-black mb-4">Equipes</h3>
        {data.byTeam.length === 0 ? (
          <p className="text-sm opacity-50">Nenhuma equipe cadastrada ainda.</p>
        ) : (
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left opacity-50 text-xs uppercase">
                <th className="py-2">Equipe</th>
                <th>Zona</th>
                <th>Igrejas</th>
                <th>V1</th>
                <th>V2</th>
                <th>Atrasadas</th>
                <th>% concluído</th>
              </tr>
            </thead>
            <tbody>
              {data.byTeam.map((t) => (
                <tr key={t.teamId} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-2 font-bold">{t.name}</td>
                  <td>{t.zoneNumber ?? '—'}</td>
                  <td>{t.churches}</td>
                  <td className="text-emerald-600 font-semibold">{t.v1Done}</td>
                  <td className="text-purple-600 font-semibold">{t.v2Done}</td>
                  <td className={t.late > 0 ? 'text-red-600 font-semibold' : ''}>{t.late}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${t.pct}%` }} />
                      </div>
                      <span className="text-xs opacity-60">{t.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default TerritoryDashboard;

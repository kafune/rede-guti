import React, { useCallback, useEffect, useState } from 'react';
import { User } from '../../types';
import { ElectoralZone, Team, TerritoryDashboard as DashboardData } from '../../territoryTypes';
import { fetchTerritoryDashboard, fetchTeams, fetchZones } from '../../territoryApi';
import { getApiErrorMessage, isUnauthorized } from '../../api';
import TerritoryDashboard from './TerritoryDashboard';
import ChurchesView from './ChurchesView';
import ChurchDetailView from './ChurchDetailView';
import TeamsView from './TeamsView';
import AgendaView from './AgendaView';
import ReviewView from './ReviewView';

interface Props {
  currentUser: User;
  onLogout: () => void;
}

type Tab = 'painel' | 'igrejas' | 'equipes' | 'agenda' | 'revisao';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'painel', label: 'Painel', icon: 'fa-chart-pie' },
  { key: 'igrejas', label: 'Igrejas', icon: 'fa-church' },
  { key: 'equipes', label: 'Equipes', icon: 'fa-people-group' },
  { key: 'agenda', label: 'Agenda', icon: 'fa-calendar-days' },
  { key: 'revisao', label: 'Revisão', icon: 'fa-user-shield' },
];

const TerritoryApp: React.FC<Props> = ({ currentUser, onLogout }) => {
  const canEdit = currentUser.role === 'COORDENADOR';
  const [tab, setTab] = useState<Tab>('painel');
  const [zones, setZones] = useState<ElectoralZone[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [selectedChurch, setSelectedChurch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [z, t] = await Promise.all([fetchZones(), fetchTeams()]);
        if (cancelled) return;
        setZones(z);
        setTeams(t);
      } catch (e) {
        if (isUnauthorized(e)) return onLogout();
        setError(getApiErrorMessage(e));
      }
    })();
    return () => { cancelled = true; };
  }, [version, onLogout]);

  useEffect(() => {
    if (tab !== 'painel') return;
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchTerritoryDashboard();
        if (!cancelled) setDashboard(d);
      } catch (e) {
        if (isUnauthorized(e)) return onLogout();
        setError(getApiErrorMessage(e));
      }
    })();
    return () => { cancelled = true; };
  }, [tab, version, onLogout]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black flex items-center gap-2">
          <i className="fa-solid fa-map-location-dot text-blue-600"></i> Território
        </h1>
        <p className="text-sm opacity-50">Igrejas por Zona Eleitoral, equipes e visitas com check-in geolocalizado.</p>
      </div>

      {!selectedChurch && (
        <div className="flex gap-1 overflow-x-auto no-scrollbar bg-gray-100 dark:bg-gray-800/50 rounded-2xl p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                tab === t.key ? 'bg-white dark:bg-gray-900 shadow text-blue-600' : 'opacity-50'
              }`}
            >
              <i className={`fa-solid ${t.icon} mr-1.5`}></i>{t.label}
            </button>
          ))}
        </div>
      )}

      {error && <div className="text-sm px-3 py-2 rounded-xl bg-red-500/10 text-red-600">{error}</div>}

      {selectedChurch ? (
        <ChurchDetailView
          churchId={selectedChurch}
          zones={zones}
          teams={teams}
          canEdit={canEdit}
          onBack={() => setSelectedChurch(null)}
          onChanged={bump}
        />
      ) : (
        <>
          {tab === 'painel' && (dashboard ? <TerritoryDashboard data={dashboard} /> : <div className="opacity-60 p-6">Carregando painel…</div>)}
          {tab === 'igrejas' && (
            <ChurchesView zones={zones} teams={teams} canEdit={canEdit} onOpenChurch={setSelectedChurch} onDataChanged={bump} />
          )}
          {tab === 'equipes' && <TeamsView zones={zones} canEdit={canEdit} onDataChanged={bump} />}
          {tab === 'agenda' && <AgendaView zones={zones} teams={teams} onOpenChurch={setSelectedChurch} />}
          {tab === 'revisao' && <ReviewView canEdit={canEdit} onOpenChurch={setSelectedChurch} onDataChanged={bump} />}
        </>
      )}
    </div>
  );
};

export default TerritoryApp;

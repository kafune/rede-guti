import React, { useEffect, useState } from 'react';
import { ElectoralZone, Team } from '../../territoryTypes';
import { AdminUser } from '../../types';
import { fetchUsers, getApiErrorMessage } from '../../api';
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  fetchTeams,
  removeTeamMember,
  updateTeam,
} from '../../territoryApi';

interface Props {
  zones: ElectoralZone[];
  canEdit: boolean;
  onDataChanged: () => void;
}

const inputCls = 'rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm';

const TeamsView: React.FC<Props> = ({ zones, canEdit, onDataChanged }) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newZone, setNewZone] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [memberPick, setMemberPick] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [t, u] = await Promise.all([fetchTeams(), canEdit ? fetchUsers().catch(() => []) : Promise.resolve([])]);
      setTeams(t);
      setUsers(u);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (newName.trim().length < 2) return;
    try {
      await createTeam({ name: newName.trim(), electoralZoneId: newZone || null });
      setNewName('');
      setNewZone('');
      await load();
      onDataChanged();
    } catch (e) {
      alert(getApiErrorMessage(e));
    }
  };

  const patch = async (id: string, data: any) => {
    await updateTeam(id, data);
    await load();
    onDataChanged();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir equipe? As igrejas ficam sem equipe.')) return;
    await deleteTeam(id);
    await load();
    onDataChanged();
  };

  const userName = (u: AdminUser) => u.name ?? u.email;

  if (loading) return <div className="opacity-60 p-6">Carregando…</div>;

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-wrap gap-2 items-end">
          <label className="text-sm flex-1 min-w-[160px]">
            <span className="opacity-50 text-xs">Nome da equipe</span>
            <input className={`${inputCls} w-full`} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Equipe 176-A" />
          </label>
          <label className="text-sm">
            <span className="opacity-50 text-xs">Zona</span>
            <select className={inputCls} value={newZone} onChange={(e) => setNewZone(e.target.value)}>
              <option value="">—</option>
              {zones.map((z) => <option key={z.id} value={z.id}>Zona {z.number}</option>)}
            </select>
          </label>
          <button onClick={create} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm">
            <i className="fa-solid fa-plus mr-1"></i>Criar equipe
          </button>
        </div>
      )}

      {teams.length === 0 && <p className="opacity-50 text-sm">Nenhuma equipe cadastrada.</p>}

      <div className="grid md:grid-cols-2 gap-3">
        {teams.map((t) => (
          <div key={t.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-black text-lg">{t.name}</div>
                <div className="text-xs opacity-50">
                  {t.zoneNumber ? `Zona ${t.zoneNumber}` : 'sem zona'} · {t.churchCount} igrejas
                </div>
              </div>
              {canEdit && (
                <button onClick={() => remove(t.id)} className="text-red-500 text-sm"><i className="fa-solid fa-trash"></i></button>
              )}
            </div>

            {canEdit ? (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <label className="text-xs"><span className="opacity-50">Zona</span>
                  <select className={`${inputCls} w-full`} value={t.electoralZoneId ?? ''} onChange={(e) => patch(t.id, { electoralZoneId: e.target.value || null })}>
                    <option value="">—</option>
                    {zones.map((z) => <option key={z.id} value={z.id}>Zona {z.number}</option>)}
                  </select>
                </label>
                <label className="text-xs"><span className="opacity-50">Motorista</span>
                  <select className={`${inputCls} w-full`} value={t.driverUserId ?? ''} onChange={(e) => patch(t.id, { driverUserId: e.target.value || null })}>
                    <option value="">—</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{userName(u)}</option>)}
                  </select>
                </label>
                <label className="text-xs"><span className="opacity-50">Líder</span>
                  <select className={`${inputCls} w-full`} value={t.leaderUserId ?? ''} onChange={(e) => patch(t.id, { leaderUserId: e.target.value || null })}>
                    <option value="">—</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{userName(u)}</option>)}
                  </select>
                </label>
                <label className="text-xs"><span className="opacity-50">Veículo</span>
                  <input className={`${inputCls} w-full`} defaultValue={t.vehicle ?? ''} onBlur={(e) => e.target.value !== (t.vehicle ?? '') && patch(t.id, { vehicle: e.target.value || null })} />
                </label>
              </div>
            ) : (
              <div className="text-sm mt-2 space-y-0.5">
                <div><span className="opacity-50">Motorista:</span> {t.driverName ?? '—'}</div>
                <div><span className="opacity-50">Líder:</span> {t.leaderName ?? '—'}</div>
              </div>
            )}

            {/* Membros */}
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => setExpanded(expanded === t.id ? null : t.id)} className="text-xs font-bold opacity-60">
                <i className={`fa-solid fa-chevron-${expanded === t.id ? 'up' : 'down'} mr-1`}></i>
                {t.members.length} integrantes
              </button>
              {expanded === t.id && (
                <div className="mt-2 space-y-1">
                  {t.members.map((m) => (
                    <div key={m.userId} className="flex items-center justify-between text-sm">
                      <span>{m.name}</span>
                      {canEdit && (
                        <button onClick={async () => { await removeTeamMember(t.id, m.userId); await load(); }} className="text-red-400 text-xs">remover</button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <div className="flex gap-2 mt-2">
                      <select value={memberPick} onChange={(e) => setMemberPick(e.target.value)} className={`${inputCls} flex-1`}>
                        <option value="">Adicionar integrante…</option>
                        {users.filter((u) => !t.members.some((m) => m.userId === u.id)).map((u) => (
                          <option key={u.id} value={u.id}>{userName(u)}</option>
                        ))}
                      </select>
                      <button
                        disabled={!memberPick}
                        onClick={async () => { await addTeamMember(t.id, memberPick); setMemberPick(''); await load(); }}
                        className="px-3 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TeamsView;

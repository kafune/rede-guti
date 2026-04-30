import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { AdminUser, Supporter, UserRole } from '../types';
import { fetchUsers, getApiErrorMessage } from '../api';

interface Props {
  supporters: Supporter[];
}

const ExportPanel: React.FC<Props> = ({ supporters }) => {
  const [leaders, setLeaders] = useState<AdminUser[]>([]);
  const [loadingLeaders, setLoadingLeaders] = useState(false);
  const [leadersError, setLeadersError] = useState<string | null>(null);
  const [selectedLeaderIds, setSelectedLeaderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      setLoadingLeaders(true);
      setLeadersError(null);
      try {
        const users = await fetchUsers();
        setLeaders(users.filter((u) => u.role === UserRole.LIDER_REGIONAL));
      } catch (error) {
        setLeadersError(getApiErrorMessage(error, 'Erro ao carregar lideres regionais.'));
      } finally {
        setLoadingLeaders(false);
      }
    };
    void load();
  }, []);

  const toggleLeader = (id: string) => {
    setSelectedLeaderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedLeaderIds.size === leaders.length) {
      setSelectedLeaderIds(new Set());
    } else {
      setSelectedLeaderIds(new Set(leaders.map((l) => l.id)));
    }
  };

  const filteredSupporters =
    selectedLeaderIds.size === 0
      ? supporters
      : supporters.filter((s) => selectedLeaderIds.has(s.createdBy));

  const exportXLSX = () => {
    const rows = filteredSupporters.map((s) => ({
      Nome: s.name,
      Cidade: s.notes || s.region,
      Numero: s.whatsapp,
      Email: s.email || '',
      Igreja: s.church,
      Status: s.status,
      'Lider Regional': s.createdByName || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 28 },
      { wch: 20 },
      { wch: 18 },
      { wch: 30 },
      { wch: 28 },
      { wch: 14 },
      { wch: 24 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Apoiadores');
    XLSX.writeFile(workbook, `rede_sp_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const allSelected = leaders.length > 0 && selectedLeaderIds.size === leaders.length;
  const noneSelected = selectedLeaderIds.size === 0;

  return (
    <div className="space-y-6 animate-fade-up">
      <h2 className="text-2xl font-bold animate-soft-pop">Exportar Dados</h2>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600 text-xl">
            <i className="fa-solid fa-filter"></i>
          </div>
          <div>
            <h3 className="text-lg font-bold">Filtrar por Lider Regional</h3>
            <p className="text-sm opacity-60">
              Selecione quais lideres incluir na exportacao. Sem selecao = todos.
            </p>
          </div>
        </div>

        {loadingLeaders && (
          <p className="text-sm opacity-60 animate-pulse">Carregando lideres...</p>
        )}

        {leadersError && (
          <p className="text-sm text-red-500">{leadersError}</p>
        )}

        {!loadingLeaders && !leadersError && leaders.length === 0 && (
          <p className="text-sm opacity-60">Nenhum lider regional cadastrado.</p>
        )}

        {!loadingLeaders && leaders.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={toggleAll}
              className="text-sm font-semibold text-blue-600 hover:underline"
            >
              {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 sm:max-h-64 overflow-y-auto pr-1">
              {leaders.map((leader) => (
                <label
                  key={leader.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedLeaderIds.has(leader.id)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-blue-600"
                    checked={selectedLeaderIds.has(leader.id)}
                    onChange={() => toggleLeader(leader.id)}
                  />
                  <span className="text-sm font-medium truncate">
                    {leader.name || leader.email}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold">Apoiadores a exportar</h3>
            <p className="text-sm opacity-60">
              {noneSelected
                ? `${filteredSupporters.length} apoiadores (todos)`
                : `${filteredSupporters.length} apoiadores dos lideres selecionados`}
            </p>
          </div>
          <button
            onClick={exportXLSX}
            disabled={filteredSupporters.length === 0}
            className="w-full sm:w-auto min-h-[44px] py-3 px-6 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 inline-flex items-center justify-center"
          >
            <i className="fa-solid fa-file-export mr-2"></i>
            Exportar XLSX
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportPanel;

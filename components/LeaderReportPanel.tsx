import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AdminUser } from '../types';
import { fetchUsers, getApiErrorMessage } from '../api';
import { getRoleLabel } from '../roleUtils';

type ReportRow = {
  id: string;
  name: string;
  roleLabel: string;
  supporters: number;
};

const todayLabel = () =>
  new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const pct = (value: number, total: number) =>
  total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0%';

const LeaderReportPanel: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        setUsers(await fetchUsers());
      } catch (err) {
        setError(getApiErrorMessage(err, 'Erro ao carregar lideranças.'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const rows = useMemo<ReportRow[]>(() => {
    return users
      .filter((u) => (u.directSupportersCount ?? 0) > 0)
      .map((u) => ({
        id: u.id,
        name: u.name || u.email,
        roleLabel: getRoleLabel(u.role),
        supporters: u.directSupportersCount ?? 0
      }))
      .sort((a, b) => b.supporters - a.supporters || a.name.localeCompare(b.name, 'pt-BR'));
  }, [users]);

  const totalSupporters = useMemo(() => rows.reduce((s, r) => s + r.supporters, 0), [rows]);
  const top = rows[0];
  const average = rows.length > 0 ? Math.round(totalSupporters / rows.length) : 0;

  const handlePrint = () => window.print();

  const handleExport = () => {
    const data = rows.map((r, index) => ({
      'Posição': index + 1,
      'Liderança': r.name,
      'Perfil': r.roleLabel,
      'Apoiadores': r.supporters,
      '% do total': pct(r.supporters, totalSupporters)
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet['!cols'] = [{ wch: 10 }, { wch: 32 }, { wch: 18 }, { wch: 14 }, { wch: 12 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Lideranças');
    XLSX.writeFile(workbook, `relatorio_liderancas_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Barra de ações — não aparece na impressão */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-2xl font-bold animate-soft-pop">Relatório de Lideranças</h2>
          <p className="text-sm opacity-60">
            Lideranças ordenadas pela quantidade de apoiadores cadastrados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={rows.length === 0}
            className="min-h-[44px] py-3 px-5 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl font-bold active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
          >
            <i className="fa-solid fa-file-excel mr-2 text-emerald-600"></i>
            Exportar
          </button>
          <button
            onClick={handlePrint}
            disabled={rows.length === 0}
            className="min-h-[44px] py-3 px-6 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
          >
            <i className="fa-solid fa-print mr-2"></i>
            Imprimir
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-sm opacity-60 animate-pulse print:hidden">Carregando lideranças...</p>
      )}
      {error && <p className="text-sm text-red-500 print:hidden">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm opacity-60">Nenhuma liderança com apoiadores cadastrados.</p>
      )}

      {/* Folha do relatório — estilo inspirado no modelo aprovado */}
      {!loading && !error && rows.length > 0 && (
        <div
          id="leader-report"
          className="bg-white text-gray-900 mx-auto max-w-3xl p-8 sm:p-10 rounded-3xl border border-gray-200 shadow-sm print:shadow-none print:border-0 print:rounded-none print:max-w-none print:p-0"
        >
          {/* Cabeçalho */}
          <header className="text-center pb-4 border-b-2 border-[#2c5070]">
            <h1 className="text-2xl font-bold text-[#2c5070] tracking-wide">REDE GUTI</h1>
            <p className="text-base font-semibold text-gray-800 mt-0.5">
              Relatório de Lideranças por Apoiadores
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Base: Geral – SP &nbsp;|&nbsp; Critério: nº de apoiadores cadastrados &nbsp;|&nbsp; Data:{' '}
              {todayLabel()}
            </p>
          </header>

          {/* 1. Resumo */}
          <section className="mt-6">
            <h2 className="text-base font-bold text-[#2c5070] mb-2">1. Resumo</h2>
            <p className="text-sm leading-relaxed text-gray-700">
              A rede conta atualmente com <strong>{totalSupporters}</strong> apoiadores cadastrados,
              distribuídos entre <strong>{rows.length}</strong>{' '}
              {rows.length === 1 ? 'liderança' : 'lideranças'} com base ativa. A liderança com maior
              base é <strong>{top.name}</strong>, responsável por <strong>{top.supporters}</strong>{' '}
              apoiadores ({pct(top.supporters, totalSupporters)} do total).
            </p>
          </section>

          {/* 2. Números gerais */}
          <section className="mt-6">
            <h2 className="text-base font-bold text-[#2c5070] mb-2">2. Números gerais</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#2c5070] text-white text-left">
                  <th className="py-2 px-3 font-semibold">Indicador</th>
                  <th className="py-2 px-3 font-semibold text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-3">Total de apoiadores</td>
                  <td className="py-2 px-3 text-right font-semibold">{totalSupporters}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-3">Lideranças com base ativa</td>
                  <td className="py-2 px-3 text-right font-semibold">{rows.length}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-3">Média de apoiadores por liderança</td>
                  <td className="py-2 px-3 text-right font-semibold">{average}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-3">Maior base ({top.name})</td>
                  <td className="py-2 px-3 text-right font-semibold">{top.supporters}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 3. Ranking de lideranças */}
          <section className="mt-6">
            <h2 className="text-base font-bold text-[#2c5070] mb-2">3. Ranking de lideranças</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#2c5070] text-white text-left">
                  <th className="py-2 px-3 font-semibold w-12">#</th>
                  <th className="py-2 px-3 font-semibold">Liderança</th>
                  <th className="py-2 px-3 font-semibold text-right">Apoiadores</th>
                  <th className="py-2 px-3 font-semibold text-right w-20">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className="border-b border-gray-200">
                    <td className="py-2 px-3 font-bold text-[#2c5070]">{index + 1}</td>
                    <td className="py-2 px-3">
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-[11px] uppercase tracking-wide text-gray-400">
                        {row.roleLabel}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold tabular-nums">
                      {row.supporters}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-600 tabular-nums">
                      {pct(row.supporters, totalSupporters)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td className="py-2 px-3"></td>
                  <td className="py-2 px-3 uppercase text-xs tracking-widest">TOTAL</td>
                  <td className="py-2 px-3 text-right tabular-nums">{totalSupporters}</td>
                  <td className="py-2 px-3 text-right tabular-nums">100%</td>
                </tr>
              </tfoot>
            </table>
            <p className="text-xs italic text-gray-500 mt-3">
              Leitura: o ranking mostra a força de cada liderança pelo número de apoiadores
              cadastrados, do maior para o menor.
            </p>
          </section>
        </div>
      )}
    </div>
  );
};

export default LeaderReportPanel;

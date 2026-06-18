import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Supporter } from '../types';
import {
  REPORT_REGION_FILTERS,
  ReportRegionFilter,
  formatPct,
  getLeaderId,
  getLeaderName,
  matchesRegionFilter,
  todayLabel
} from '../reportUtils';
import LeaderDetailReport from './LeaderDetailReport';

interface Props {
  supporters: Supporter[];
}

type LeaderGroup = {
  id: string;
  name: string;
  supporters: Supporter[];
};

const LeaderReportPanel: React.FC<Props> = ({ supporters }) => {
  const [regionFilter, setRegionFilter] = useState<ReportRegionFilter>('Todas');
  const [selectedLeaderId, setSelectedLeaderId] = useState<string | null>(null);

  const filtered = useMemo(
    () => supporters.filter((s) => matchesRegionFilter(s, regionFilter)),
    [supporters, regionFilter]
  );

  const groups = useMemo<LeaderGroup[]>(() => {
    const map = new Map<string, LeaderGroup>();
    for (const s of filtered) {
      const id = getLeaderId(s);
      const existing = map.get(id);
      if (existing) {
        existing.supporters.push(s);
      } else {
        map.set(id, { id, name: getLeaderName(s), supporters: [s] });
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        b.supporters.length - a.supporters.length || a.name.localeCompare(b.name, 'pt-BR')
    );
  }, [filtered]);

  const totalSupporters = filtered.length;
  const top = groups[0];
  const average = groups.length > 0 ? Math.round(totalSupporters / groups.length) : 0;

  const selectedGroup = selectedLeaderId
    ? groups.find((g) => g.id === selectedLeaderId) ?? null
    : null;

  const handlePrint = () => window.print();

  const handleExport = () => {
    const data = groups.map((g, index) => ({
      'Posição': index + 1,
      'Liderança': g.name,
      'Apoiadores': g.supporters.length,
      '% do total': formatPct(g.supporters.length, totalSupporters)
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet['!cols'] = [{ wch: 10 }, { wch: 32 }, { wch: 14 }, { wch: 12 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Lideranças');
    XLSX.writeFile(
      workbook,
      `relatorio_liderancas_${regionFilter.toLowerCase()}_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  };

  if (selectedGroup) {
    return (
      <LeaderDetailReport
        leaderName={selectedGroup.name}
        supporters={selectedGroup.supporters}
        onBack={() => setSelectedLeaderId(null)}
      />
    );
  }

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
            disabled={groups.length === 0}
            className="min-h-[44px] py-3 px-5 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl font-bold active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
          >
            <i className="fa-solid fa-file-excel mr-2 text-emerald-600"></i>
            Exportar
          </button>
          <button
            onClick={handlePrint}
            disabled={groups.length === 0}
            className="min-h-[44px] py-3 px-6 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
          >
            <i className="fa-solid fa-print mr-2"></i>
            Imprimir
          </button>
        </div>
      </div>

      {/* Filtro por região */}
      <div className="flex flex-wrap gap-2 print:hidden">
        {REPORT_REGION_FILTERS.map((region) => (
          <button
            key={region}
            onClick={() => setRegionFilter(region)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
              regionFilter === region
                ? 'bg-[#2c5070] text-white shadow'
                : 'bg-white dark:bg-gray-800 border dark:border-gray-700 opacity-70 hover:opacity-100'
            }`}
          >
            {region}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <p className="text-sm opacity-60">
          Nenhuma liderança com apoiadores
          {regionFilter !== 'Todas' ? ` em ${regionFilter}` : ''}.
        </p>
      )}

      {/* Folha do relatório — estilo inspirado no modelo aprovado */}
      {groups.length > 0 && (
        <div
          id="leader-report"
          className="bg-white text-gray-900 mx-auto max-w-3xl p-8 sm:p-10 rounded-3xl border border-gray-200 shadow-sm print:shadow-none print:border-0 print:rounded-none print:max-w-none print:p-0"
        >
          <header className="text-center pb-4 border-b-2 border-[#2c5070]">
            <h1 className="text-2xl font-bold text-[#2c5070] tracking-wide">REDE GUTI</h1>
            <p className="text-base font-semibold text-gray-800 mt-0.5">
              Relatório de Lideranças por Apoiadores
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Base: {regionFilter === 'Todas' ? 'Geral – SP' : regionFilter} &nbsp;|&nbsp; Critério:
              nº de apoiadores cadastrados &nbsp;|&nbsp; Data: {todayLabel()}
            </p>
          </header>

          <section className="mt-6">
            <h2 className="text-base font-bold text-[#2c5070] mb-2">1. Resumo</h2>
            <p className="text-sm leading-relaxed text-gray-700">
              {regionFilter === 'Todas' ? 'A rede' : `A rede em ${regionFilter}`} conta atualmente
              com <strong>{totalSupporters}</strong> apoiadores cadastrados, distribuídos entre{' '}
              <strong>{groups.length}</strong>{' '}
              {groups.length === 1 ? 'liderança' : 'lideranças'} com base ativa. A liderança com
              maior base é <strong>{top.name}</strong>, responsável por{' '}
              <strong>{top.supporters.length}</strong> apoiadores (
              {formatPct(top.supporters.length, totalSupporters)} do total).
            </p>
          </section>

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
                  <td className="py-2 px-3 text-right font-semibold">{groups.length}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-3">Média de apoiadores por liderança</td>
                  <td className="py-2 px-3 text-right font-semibold">{average}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-3">Maior base ({top.name})</td>
                  <td className="py-2 px-3 text-right font-semibold">{top.supporters.length}</td>
                </tr>
              </tbody>
            </table>
          </section>

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
                {groups.map((g, index) => (
                  <tr
                    key={g.id}
                    onClick={() => setSelectedLeaderId(g.id)}
                    className="border-b border-gray-200 cursor-pointer hover:bg-blue-50 print:hover:bg-transparent print:cursor-auto"
                    title="Ver relatório detalhado desta liderança"
                  >
                    <td className="py-2 px-3 font-bold text-[#2c5070]">{index + 1}</td>
                    <td className="py-2 px-3 font-medium">
                      {g.name}
                      <i className="fa-solid fa-chevron-right ml-2 text-[10px] opacity-30 print:hidden"></i>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold tabular-nums">
                      {g.supporters.length}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-600 tabular-nums">
                      {formatPct(g.supporters.length, totalSupporters)}
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
            <p className="text-xs italic text-gray-500 mt-3 print:hidden">
              Toque em uma liderança para ver o relatório detalhado (distribuição por igreja e
              cidade).
            </p>
          </section>
        </div>
      )}
    </div>
  );
};

export default LeaderReportPanel;

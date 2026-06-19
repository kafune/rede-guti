import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Supporter } from '../types';
import { formatPct, getSupporterCity, tallyBy, todayLabel } from '../reportUtils';
import {
  buildIncentiveMessage,
  buildLeaderReportFileName,
  buildLeaderReportPdf,
  shareLeaderReport,
  LeaderReportData
} from '../reportPdf';

interface Props {
  leaderName: string;
  supporters: Supporter[];
  onBack: () => void;
}

const SectionTable: React.FC<{
  title: string;
  columnLabel: string;
  rows: { label: string; count: number }[];
  total: number;
}> = ({ title, columnLabel, rows, total }) => (
  <section className="mt-6">
    <h2 className="text-base font-bold text-[#2c5070] mb-2">{title}</h2>
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="bg-[#2c5070] text-white text-left">
          <th className="py-2 px-3 font-semibold">{columnLabel}</th>
          <th className="py-2 px-3 font-semibold text-right w-28">Apoiadores</th>
          <th className="py-2 px-3 font-semibold text-right w-20">%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-gray-200">
            <td className="py-2 px-3">{row.label}</td>
            <td className="py-2 px-3 text-right font-semibold tabular-nums">{row.count}</td>
            <td className="py-2 px-3 text-right text-gray-600 tabular-nums">
              {formatPct(row.count, total)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="bg-gray-100 font-bold">
          <td className="py-2 px-3 uppercase text-xs tracking-widest">TOTAL</td>
          <td className="py-2 px-3 text-right tabular-nums">{total}</td>
          <td className="py-2 px-3 text-right tabular-nums">100%</td>
        </tr>
      </tfoot>
    </table>
  </section>
);

const LeaderDetailReport: React.FC<Props> = ({ leaderName, supporters, onBack }) => {
  const total = supporters.length;

  const byChurch = useMemo(
    () => tallyBy(supporters, (s) => s.church, 'Sem igreja informada'),
    [supporters]
  );
  const byCity = useMemo(
    () => tallyBy(supporters, getSupporterCity, 'Sem cidade informada'),
    [supporters]
  );

  const mainCity = byCity[0];
  const distinctChurches = byChurch.length;
  const distinctCities = byCity.length;
  const activeCount = supporters.filter((s) => s.status === 'Ativo').length;

  const [sending, setSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);

  const reportData: LeaderReportData = {
    leaderName,
    total,
    activeCount,
    mainCityLabel: mainCity?.label,
    mainCityPct: mainCity ? formatPct(mainCity.count, total) : undefined,
    distinctChurches,
    distinctCities,
    byChurch,
    byCity
  };

  const handleWhatsApp = async () => {
    if (total === 0 || sending) return;
    setSending(true);
    setSendFeedback(null);
    try {
      const doc = buildLeaderReportPdf(reportData);
      const result = await shareLeaderReport(
        doc,
        buildLeaderReportFileName(leaderName),
        buildIncentiveMessage(reportData)
      );
      if (result === 'fallback') {
        setSendFeedback('PDF baixado. Anexe-o na conversa do WhatsApp que foi aberta.');
      } else if (result === 'shared') {
        setSendFeedback('Relatório pronto para envio no WhatsApp.');
      }
    } catch {
      setSendFeedback('Não foi possível gerar o envio. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  const handlePrint = () => window.print();

  const handleExport = () => {
    const workbook = XLSX.utils.book_new();
    const igrejas = XLSX.utils.json_to_sheet(
      byChurch.map((r) => ({ 'Igreja / Vínculo': r.label, Apoiadores: r.count, '%': formatPct(r.count, total) }))
    );
    igrejas['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(workbook, igrejas, 'Por igreja');
    const cidades = XLSX.utils.json_to_sheet(
      byCity.map((r) => ({ Cidade: r.label, Apoiadores: r.count, '%': formatPct(r.count, total) }))
    );
    cidades['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(workbook, cidades, 'Por cidade');
    XLSX.writeFile(
      workbook,
      `relatorio_${leaderName.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline self-start"
        >
          <i className="fa-solid fa-arrow-left"></i>
          Voltar ao ranking
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleWhatsApp}
            disabled={total === 0 || sending}
            className="min-h-[44px] py-3 px-6 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
          >
            <i className={`fa-brands fa-whatsapp mr-2 ${sending ? 'animate-pulse' : ''}`}></i>
            {sending ? 'Gerando...' : 'Enviar (WhatsApp)'}
          </button>
          <button
            onClick={handleExport}
            disabled={total === 0}
            className="min-h-[44px] py-3 px-5 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl font-bold active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
          >
            <i className="fa-solid fa-file-excel mr-2 text-emerald-600"></i>
            Exportar
          </button>
          <button
            onClick={handlePrint}
            disabled={total === 0}
            className="min-h-[44px] py-3 px-6 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
          >
            <i className="fa-solid fa-print mr-2"></i>
            Imprimir
          </button>
        </div>
      </div>

      {sendFeedback && (
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 print:hidden">
          <i className="fa-solid fa-circle-info mr-1.5"></i>
          {sendFeedback}
        </p>
      )}

      <div
        id="leader-report"
        className="bg-white text-gray-900 mx-auto max-w-3xl p-8 sm:p-10 rounded-3xl border border-gray-200 shadow-sm print:shadow-none print:border-0 print:rounded-none print:max-w-none print:p-0"
      >
        <header className="text-center pb-4 border-b-2 border-[#2c5070]">
          <h1 className="text-2xl font-bold text-[#2c5070] tracking-wide">REDE GUTI</h1>
          <p className="text-base font-semibold text-gray-800 mt-0.5">
            Relatório de Apoiadores Cadastrados
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Liderança: {leaderName} &nbsp;|&nbsp; Base:{' '}
            {mainCity ? `${mainCity.label}/SP` : '—'} &nbsp;|&nbsp; Data: {todayLabel()}
          </p>
        </header>

        <section className="mt-6">
          <h2 className="text-base font-bold text-[#2c5070] mb-2">1. Resumo</h2>
          <p className="text-sm leading-relaxed text-gray-700">
            A rede sob liderança de <strong>{leaderName}</strong> conta atualmente com{' '}
            <strong>{total}</strong> {total === 1 ? 'apoiador cadastrado' : 'apoiadores cadastrados'}
            {mainCity && (
              <>
                , concentrados majoritariamente em <strong>{mainCity.label}</strong> (
                {formatPct(mainCity.count, total)})
              </>
            )}
            . A base está distribuída em <strong>{distinctChurches}</strong>{' '}
            {distinctChurches === 1 ? 'vínculo religioso' : 'vínculos religiosos distintos'} e{' '}
            <strong>{distinctCities}</strong> {distinctCities === 1 ? 'cidade' : 'cidades'}.
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
                <td className="py-2 px-3 text-right font-semibold">{total}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-2 px-3">Apoiadores ativos</td>
                <td className="py-2 px-3 text-right font-semibold">{activeCount}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-2 px-3">Cidade principal</td>
                <td className="py-2 px-3 text-right font-semibold">
                  {mainCity ? `${mainCity.label} (${formatPct(mainCity.count, total)})` : '—'}
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-2 px-3">Vínculos religiosos distintos</td>
                <td className="py-2 px-3 text-right font-semibold">{distinctChurches}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-2 px-3">Cidades distintas</td>
                <td className="py-2 px-3 text-right font-semibold">{distinctCities}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <SectionTable
          title="3. Distribuição por igreja"
          columnLabel="Igreja / Vínculo"
          rows={byChurch}
          total={total}
        />

        <SectionTable
          title="4. Distribuição por cidade"
          columnLabel="Cidade"
          rows={byCity}
          total={total}
        />
      </div>
    </div>
  );
};

export default LeaderDetailReport;

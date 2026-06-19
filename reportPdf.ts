import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatPct, todayLabel } from './reportUtils';

export interface LeaderReportData {
  leaderName: string;
  total: number;
  activeCount: number;
  mainCityLabel?: string;
  mainCityPct?: string;
  distinctChurches: number;
  distinctCities: number;
  byChurch: { label: string; count: number }[];
  byCity: { label: string; count: number }[];
}

const NAVY: [number, number, number] = [44, 80, 112];

export const buildLeaderReportFileName = (leaderName: string): string =>
  `relatorio_${leaderName.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`;

// Mensagem de incentivo enviada junto com o PDF para a liderança.
export const buildIncentiveMessage = (data: LeaderReportData): string => {
  const cityPart = data.mainCityLabel
    ? `, com forte presença em ${data.mainCityLabel}`
    : '';
  return (
    `🙌 Olá, ${data.leaderName}! Parabéns pelo seu trabalho na Rede Guti!\n\n` +
    `Você já cadastrou *${data.total} ${data.total === 1 ? 'apoiador' : 'apoiadores'}*${cityPart}. ` +
    `Cada novo cadastro fortalece a nossa rede e faz toda a diferença! 💪\n\n` +
    `Segue o relatório atualizado da sua liderança. Continue cadastrando — seu empenho é essencial para chegarmos ainda mais longe! 🚀\n\n` +
    `Equipe Rede Guti`
  );
};

export const buildLeaderReportPdf = (data: LeaderReportData): jsPDF => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const center = pageWidth / 2;
  const marginX = 40;
  let y = 50;

  // Cabeçalho
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...NAVY);
  doc.text('REDE GUTI', center, y, { align: 'center' });
  y += 20;
  doc.setFontSize(13);
  doc.setTextColor(40, 40, 40);
  doc.text('Relatório de Apoiadores Cadastrados', center, y, { align: 'center' });
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Liderança: ${data.leaderName}  |  Base: ${
      data.mainCityLabel ? `${data.mainCityLabel}/SP` : '—'
    }  |  Data: ${todayLabel()}`,
    center,
    y,
    { align: 'center' }
  );
  y += 12;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.5);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 26;

  // 1. Resumo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('1. Resumo', marginX, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const resumo =
    `A rede sob liderança de ${data.leaderName} conta atualmente com ${data.total} ` +
    `${data.total === 1 ? 'apoiador cadastrado' : 'apoiadores cadastrados'}` +
    `${
      data.mainCityLabel
        ? `, concentrados majoritariamente em ${data.mainCityLabel} (${data.mainCityPct})`
        : ''
    }. A base está distribuída em ${data.distinctChurches} ` +
    `${data.distinctChurches === 1 ? 'vínculo religioso' : 'vínculos religiosos distintos'} e ` +
    `${data.distinctCities} ${data.distinctCities === 1 ? 'cidade' : 'cidades'}.`;
  const lines = doc.splitTextToSize(resumo, pageWidth - marginX * 2);
  doc.text(lines, marginX, y);
  y += lines.length * 14 + 14;

  // 2. Números gerais
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('2. Números gerais', marginX, y);
  y += 8;
  autoTable(doc, {
    startY: y,
    head: [['Indicador', 'Valor']],
    body: [
      ['Total de apoiadores', String(data.total)],
      ['Apoiadores ativos', String(data.activeCount)],
      [
        'Cidade principal',
        data.mainCityLabel ? `${data.mainCityLabel} (${data.mainCityPct})` : '—'
      ],
      ['Vínculos religiosos distintos', String(data.distinctChurches)],
      ['Cidades distintas', String(data.distinctCities)]
    ],
    theme: 'grid',
    headStyles: { fillColor: NAVY, halign: 'left' },
    columnStyles: { 1: { halign: 'right' } },
    styles: { fontSize: 9, cellPadding: 4 },
    margin: { left: marginX, right: marginX }
  });
  y = (doc as any).lastAutoTable.finalY + 22;

  // 3. Distribuição por igreja
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('3. Distribuição por igreja', marginX, y);
  y += 8;
  autoTable(doc, {
    startY: y,
    head: [['Igreja / Vínculo', 'Apoiadores', '%']],
    body: data.byChurch.map((r) => [r.label, String(r.count), formatPct(r.count, data.total)]),
    foot: [['TOTAL', String(data.total), '100%']],
    theme: 'grid',
    headStyles: { fillColor: NAVY, halign: 'left' },
    footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    styles: { fontSize: 9, cellPadding: 4 },
    margin: { left: marginX, right: marginX }
  });
  y = (doc as any).lastAutoTable.finalY + 22;

  // 4. Distribuição por cidade
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('4. Distribuição por cidade', marginX, y);
  y += 8;
  autoTable(doc, {
    startY: y,
    head: [['Cidade', 'Apoiadores', '%']],
    body: data.byCity.map((r) => [r.label, String(r.count), formatPct(r.count, data.total)]),
    foot: [['TOTAL', String(data.total), '100%']],
    theme: 'grid',
    headStyles: { fillColor: NAVY, halign: 'left' },
    footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    styles: { fontSize: 9, cellPadding: 4 },
    margin: { left: marginX, right: marginX }
  });

  return doc;
};

export type ShareResult = 'shared' | 'cancelled' | 'fallback';

// Tenta enviar o PDF + mensagem pelo compartilhamento nativo (WhatsApp no
// celular). Sem suporte, baixa o PDF e abre o WhatsApp com a mensagem.
export const shareLeaderReport = async (
  doc: jsPDF,
  fileName: string,
  message: string
): Promise<ShareResult> => {
  const blob = doc.output('blob');
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data?: ShareData) => Promise<void>;
  };

  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], text: message, title: 'Relatório Rede Guti' });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }
      // Cai para o fallback em qualquer outro erro de share.
    }
  }

  doc.save(fileName);
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  return 'fallback';
};

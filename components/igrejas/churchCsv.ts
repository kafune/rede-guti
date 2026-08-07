import { Igreja } from '../../types';

// Escapa um campo para CSV (aspas, vírgula, quebra de linha).
const cell = (value: unknown): string => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const COLUMNS: { header: string; get: (i: Igreja) => unknown }[] = [
  { header: 'Nome', get: (i) => i.nome },
  { header: 'Denominação', get: (i) => i.denominacao },
  { header: 'Pastor', get: (i) => i.pastor },
  { header: 'Endereço', get: (i) => i.endereco },
  { header: 'Bairro', get: (i) => i.bairro },
  { header: 'Cidade', get: (i) => i.cidade },
  { header: 'Estado', get: (i) => i.estado },
  { header: 'Telefone', get: (i) => i.telefone },
  { header: 'E-mail', get: (i) => i.email },
  { header: 'Latitude', get: (i) => (i.latitude ?? '') },
  { header: 'Longitude', get: (i) => (i.longitude ?? '') },
  { header: 'Membros estimados', get: (i) => (i.membrosEstimados ?? '') },
  { header: 'Zona eleitoral', get: (i) => (i.zonaEleitoral ?? '') },
  { header: 'Origem', get: (i) => i.origem },
  { header: 'Equipes vinculadas', get: (i) => i.equipes.map((e) => e.equipeNome).join(' | ') },
  { header: 'Cadastrado por', get: (i) => i.createdByNome ?? '' },
  { header: 'Observações', get: (i) => i.observacoes },
  { header: 'Cadastrado em', get: (i) => new Date(i.createdAt).toLocaleString('pt-BR') }
];

// Gera o CSV e dispara o download no navegador. Prefixo BOM p/ acentos no Excel.
export const exportIgrejasToCSV = (igrejas: Igreja[], filename?: string) => {
  const header = COLUMNS.map((c) => cell(c.header)).join(',');
  const rows = igrejas.map((i) => COLUMNS.map((c) => cell(c.get(i))).join(','));
  const csv = '﻿' + [header, ...rows].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename ?? `igrejas_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

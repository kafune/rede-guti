import { Supporter } from './types';

// Agrupamento geográfico derivado da cidade do apoiador (campo `notes`),
// já que a região detalhada não vem da API. Atende ao pedido de visualizar
// as lideranças por Guarulhos / Litoral / Capital / Interior.
export type ReportRegion = 'Guarulhos' | 'Litoral' | 'Capital' | 'Interior' | 'Sem cidade';

export const REPORT_REGION_FILTERS = [
  'Todas',
  'Guarulhos',
  'Litoral',
  'Capital',
  'Interior'
] as const;

export type ReportRegionFilter = (typeof REPORT_REGION_FILTERS)[number];

// Litoral paulista: Baixada Santista + Litoral Norte.
const LITORAL_CITIES = new Set(
  [
    'santos',
    'sao vicente',
    'praia grande',
    'guaruja',
    'cubatao',
    'bertioga',
    'mongagua',
    'itanhaem',
    'peruibe',
    'caraguatatuba',
    'sao sebastiao',
    'ilhabela',
    'ubatuba'
  ].map((c) => c)
);

const normalize = (value: string | undefined | null): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

export const getSupporterCity = (supporter: Supporter): string =>
  (supporter.notes && supporter.notes.trim()) || '';

export const classifyRegion = (supporter: Supporter): ReportRegion => {
  const city = normalize(getSupporterCity(supporter));
  if (!city) return 'Sem cidade';
  if (city === 'guarulhos') return 'Guarulhos';
  if (LITORAL_CITIES.has(city)) return 'Litoral';
  if (city === 'sao paulo') return 'Capital';
  return 'Interior';
};

export const matchesRegionFilter = (
  supporter: Supporter,
  filter: ReportRegionFilter
): boolean => {
  if (filter === 'Todas') return true;
  return classifyRegion(supporter) === filter;
};

// Identificador da liderança dona do apoiador (mesma convenção do ExportPanel).
export const getLeaderId = (supporter: Supporter): string =>
  supporter.createdBy || 'sem-lider';

export const getLeaderName = (supporter: Supporter): string =>
  supporter.createdByName || 'Sem liderança';

export const formatPct = (value: number, total: number): string =>
  total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0%';

export const todayLabel = (): string =>
  new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Agrega uma lista [rótulo -> contagem] ordenada do maior para o menor.
export const tallyBy = (
  items: Supporter[],
  keyFn: (s: Supporter) => string,
  emptyLabel: string
): { label: string; count: number }[] => {
  const map = new Map<string, number>();
  for (const item of items) {
    const raw = keyFn(item);
    const label = raw && raw.trim() ? raw.trim() : emptyLabel;
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
};

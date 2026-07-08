// Geografia da instância (dataset do mapa e rótulos associados).
// O dataset aponta para um arquivo data/<dataset>.geo.json empacotado no build;
// os defaults preservam a instância original (Estado de São Paulo).
const env = (import.meta as any).env ?? {};

const read = (key: string, fallback: string): string => {
  const value = String(env[key] ?? '').trim();
  return value || fallback;
};

export const GEO = {
  /** Nome do dataset GeoJSON em data/<dataset>.geo.json. */
  dataset: read('VITE_GEO_DATASET', 'sp-municipios'),
  /** Título curto acima do mapa. */
  mapTitle: read('VITE_GEO_MAP_TITLE', 'Mapa político de São Paulo'),
  /** Texto exibido durante o carregamento do mapa. */
  loadingLabel: read('VITE_GEO_LOADING_LABEL', 'Carregando mapa político de SP...'),
  /** Total de municípios da área coberta (denominador do contador "ativos"). */
  totalMunicipalities: Number(read('VITE_GEO_TOTAL_MUNICIPALITIES', '645')) || 645,
};

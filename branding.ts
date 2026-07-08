// Identidade da instância (marca, campanha, textos institucionais).
// Cada deploy define os seus valores via variáveis VITE_BRAND_* em build-time;
// sem elas, os defaults preservam a instância original ("Rede SP / Guti 2026").
const env = (import.meta as any).env ?? {};

const read = (key: string, fallback: string): string => {
  const value = String(env[key] ?? '').trim();
  return value || fallback;
};

export const BRAND = {
  /** Nome curto da rede, exibido no header do app. */
  name: read('VITE_BRAND_NAME', 'Rede SP'),
  /** Nome da campanha/vertical, exibido como subtítulo e em títulos públicos. */
  campaign: read('VITE_BRAND_CAMPAIGN', 'Guti 2026'),
  /** Inicial exibida no quadrado do logo. */
  initial: read('VITE_BRAND_INITIAL', 'G'),
  /** Nome completo usado na mensagem de convite pelo WhatsApp. */
  shareName: read('VITE_BRAND_SHARE_NAME', 'Rede Guti 2026'),
  /** Descrição da rede nas telas de login e cadastro público. */
  tagline: read('VITE_BRAND_TAGLINE', 'Rede de Apoiadores do Estado de SP'),
  /** Rótulo do total geral no dashboard da coordenação. */
  networkTotalLabel: read('VITE_BRAND_NETWORK_TOTAL_LABEL', 'Total da Rede SP'),
  /** Título da tela de boas-vindas pós-cadastro. */
  welcomeTitle: read('VITE_BRAND_WELCOME_TITLE', 'Bem-vindo à Família Guti 2026!'),
  /** Rodapé institucional das telas públicas. */
  footer: read('VITE_BRAND_FOOTER', 'Guti 2026 • Rede de Apoiadores SP'),
  /** Cabeçalho compacto das páginas públicas de eventos/atividades. */
  publicHeader: read('VITE_BRAND_PUBLIC_HEADER', 'Rede SP · Guti 2026'),
  /** Rótulo de origem quando o apoiador não tem indicador identificado. */
  directLeadershipLabel: read('VITE_BRAND_DIRECT_LEADERSHIP_LABEL', 'Lideranca Direta (Rede Guti)'),
};

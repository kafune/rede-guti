// Dataset territorial de Guarulhos digitalizado do "Mapa Político de Guarulhos"
// (foto fornecida pela coordenação). É a fonte "Nível A/B" do plano: associa
// bairro → Zona Eleitoral sem depender de polígonos oficiais/PostGIS.
//
// IMPORTANTE: bairros que aparecem em MAIS DE UMA zona no mapa geram ambiguidade
// e a resolução marca a igreja como "requer validação" (nunca chuta uma zona
// como oficial).

export interface ZoneSeed {
  number: string;
  color: string;
  eleitores: number;
  bairros: string[];
}

export const GUARULHOS_ZONE_SOURCE = 'Mapa Político de Guarulhos';

export const GUARULHOS_ZONES: ZoneSeed[] = [
  {
    number: '176',
    color: '#7c3aed',
    eleitores: 123692,
    bairros: [
      'Várzea do Palácio', 'Macedo', 'Vila Rio de Janeiro', 'Jardim Bom Clima',
      'Centro', 'Parque Cecap', 'Cocaia', 'Jardim Paraventi', 'Jardim Rossi',
      'Jardim Pinhal', 'Jardim São Paulo', 'Vila São Jorge', 'Jardim dos Afonsos',
      'Vila Progresso', 'Vila Bremen', 'Parque Renato Maia', 'Jardim Adriana',
    ],
  },
  {
    number: '185',
    color: '#eab308',
    eleitores: 132495,
    bairros: [
      'Jardim Nova Cidade', 'Conjunto Marcos Freire', 'Jardim Leblon',
      'Vila Dinamarca', 'Jardim Arujá', 'Jardim Jacy', 'Cidade Aracília',
      'Parque Jurema', 'Jardim Centenário', 'Jardim Maria Alice', 'Jardim Anny',
      'Parque das Nações', 'Cidade Parque Alvorada', 'Jardim Santo Afonso',
      'Jardim Monte Alegre', 'Parque Maria Helena', 'Parque São Miguel',
      'Jardim Arapongas', 'Sítio São Francisco', 'Jardim Angélica',
      'Jardim Guaracy', 'Cidade Parque Brasília', 'Cidade Tupinambá',
    ],
  },
  {
    number: '278',
    color: '#3b82f6',
    eleitores: 89310,
    bairros: [
      'Gopoúva', 'Vila Progresso', 'Jardim Dourado', 'Vila Augusta',
      'Jardim Vila Galvão', 'Jardim Munhoz', 'Vila São Rafael', 'Ponte Grande',
      'Jardim Tranquilidade', 'Vila Endres', 'Vila das Palmeiras',
      'Jardim Santa Francisca', 'Parque Santo Antônio', 'Vila Tijuco',
      'Jardim Tijuco', 'Vila São João', 'Vila Sorocabana',
      'Sanatório do Padre Bento',
    ],
  },
  {
    number: '279',
    color: '#ef4444',
    eleitores: 110785,
    bairros: [
      'Jardim Santa Rita', 'Jardim Capri', 'Vila Flórida',
      'Vila Nossa Senhora de Fátima', 'Jardim Almeida Prado', 'Jardim Santa Lídia',
      'Jardim Santa Emília', 'Parque Mikail', 'Jardim São Domingos',
      'Parque Primavera', 'Jardim Acácio', 'Jardim América',
      'Parque Santo Agostinho', 'Vila Barros', 'Jardim Santa Bárbara',
      'Jardim Nova Taboão', 'Jardim Bela Vista', 'Parque das Laranjeiras',
      'Jardim Alvorada', 'Jardim Tamassia',
    ],
  },
  {
    number: '393',
    color: '#f97316',
    eleitores: 113041,
    bairros: [
      'Jardim Santa Mena', 'Jardim dos Cardosos', 'Vila Galvão', 'Vila Tibagi',
      'Jardim Paulista', 'Recreio São Jorge', 'Jardim Flor da Montanha',
      'Jardim Aliança', 'Parque Continental III', 'Vila Rosália',
      'Parque Continental IV', 'Jardim Rosa de França', 'Jardim São Luís',
      'Jardim Moreira', 'Parque Continental I', 'Jardim Palmira', 'Jardim Betel',
      'Parque Continental II', 'Jardim Las Vegas', 'Jardim São Ricardo',
    ],
  },
  {
    number: '394',
    color: '#ec4899',
    eleitores: 142784,
    bairros: [
      'Cidade Soberana', 'Ponte Alta', 'Jardim Triunfo',
      'Conjunto Residencial Haroldo Veloso', 'Jardim Bondança', 'Cidade Seródio',
      'Jardim Santo Expedito', 'Jardim Santa Terezinha', 'Jardim Álamo',
      'Jardim Bananal', 'Água Azul', 'Bonsucesso', 'Jardim Fátima',
      'Jardim Fortaleza', 'Parque Residencial Bamby', 'Parque Santo Dumont',
      'Jardim Novo Portugal', 'Jardim Santa Paula', 'Vila Nova Bonsucesso',
      'Jardim Lenize', 'Jardim São João', 'Chácara das Lavras',
      'Jardim Quarto Centenário', 'Vila Carmela I',
    ],
  },
  {
    number: '395',
    color: '#16a34a',
    eleitores: 116218,
    bairros: [
      'Cumbica', 'Jardim Presidente Dutra', 'Jardim das Nações', 'Jardim Castanha',
      'Cidade Jardim Cumbica', 'Vila Paraíso', 'Residencial Parque Cumbica',
      'Jardim Maria Dirce', 'Vila Nova Cumbica', 'Parque Uirapuru', 'Bonsucesso',
      'Jardim Cumbica', 'Jardim Manoel', 'Jardim Ottawa', 'Conjunto Inocoop',
    ],
  },
];

// Normalização de bairro: MAIÚSCULAS, sem acento, sem pontuação, espaços
// colapsados e abreviações comuns expandidas. Usada IGUAL no seed e no
// resolvedor para que "Jd. São Paulo" e "JARDIM SAO PAULO" batam na mesma chave.
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bJD\b/g, 'JARDIM'],
  [/\bJ\b/g, 'JARDIM'],
  [/\bPQ\b/g, 'PARQUE'],
  [/\bPQE\b/g, 'PARQUE'],
  [/\bVL\b/g, 'VILA'],
  [/\bV\b/g, 'VILA'],
  [/\bCONJ\b/g, 'CONJUNTO'],
  [/\bRES\b/g, 'RESIDENCIAL'],
  [/\bRESID\b/g, 'RESIDENCIAL'],
  [/\bPRES\b/g, 'PRESIDENTE'],
  [/\bSTO\b/g, 'SANTO'],
  [/\bSTA\b/g, 'SANTA'],
  [/\bSAO\b/g, 'SAO'],
  [/\bCD\b/g, 'CIDADE'],
  [/\bCID\b/g, 'CIDADE'],
];

export const normalizeBairro = (raw: string): string => {
  let s = (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toUpperCase()
    .replace(/[.,/()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [pattern, replacement] of ABBREVIATIONS) {
    s = s.replace(pattern, replacement);
  }
  return s.replace(/\s+/g, ' ').trim();
};

// Constrói as linhas do dicionário bairro→zona para o seed (uma linha por par).
export const buildBairroZonaRows = () => {
  const rows: Array<{ bairroNormalized: string; bairroLabel: string; zoneNumber: string; source: string }> = [];
  for (const zone of GUARULHOS_ZONES) {
    for (const bairro of zone.bairros) {
      rows.push({
        bairroNormalized: normalizeBairro(bairro),
        bairroLabel: bairro,
        zoneNumber: zone.number,
        source: GUARULHOS_ZONE_SOURCE,
      });
    }
  }
  return rows;
};

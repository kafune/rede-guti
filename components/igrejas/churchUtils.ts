import { Igreja, IgrejaFormData } from '../../types';

export const emptyIgrejaForm = (): IgrejaFormData => ({
  nome: '',
  denominacao: '',
  pastor: '',
  endereco: '',
  bairro: '',
  cidade: 'Guarulhos',
  estado: 'SP',
  telefone: '',
  email: '',
  latitude: null,
  longitude: null,
  observacoes: '',
  membrosEstimados: null,
  zonaEleitoral: null
});

export const igrejaToForm = (i: Igreja): IgrejaFormData => ({
  nome: i.nome,
  denominacao: i.denominacao,
  pastor: i.pastor,
  endereco: i.endereco,
  bairro: i.bairro,
  cidade: i.cidade,
  estado: i.estado,
  telefone: i.telefone,
  email: i.email,
  latitude: i.latitude,
  longitude: i.longitude,
  observacoes: i.observacoes,
  membrosEstimados: i.membrosEstimados,
  zonaEleitoral: i.zonaEleitoral
});

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Valida o formulário (mesmas regras do backend). Retorna mensagem de erro ou null.
export const validateIgrejaForm = (data: IgrejaFormData): string | null => {
  if (data.nome.trim().length < 2) return 'Informe o nome da igreja.';
  if (data.email.trim() && !emailRegex.test(data.email.trim())) return 'E-mail inválido.';
  if (data.latitude !== null && (Number.isNaN(data.latitude) || Math.abs(data.latitude) > 90))
    return 'Latitude inválida (-90 a 90).';
  if (data.longitude !== null && (Number.isNaN(data.longitude) || Math.abs(data.longitude) > 180))
    return 'Longitude inválida (-180 a 180).';
  return null;
};

// Normaliza texto para comparação: minúsculas, sem acentos, espaços colapsados.
export const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Distância haversine em metros entre dois pontos (lat/lng).
export const haversineMeters = (
  a: { latitude: number | null; longitude: number | null },
  b: { latitude: number | null; longitude: number | null }
): number => {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) {
    return Infinity;
  }
  const R = 6371000; // raio da Terra em metros
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
};

export const DUPLICATE_RADIUS_METERS = 200;

/**
 * Possíveis duplicatas: nome semelhante (um contém o outro, após normalizar) E
 * a menos de 200 m. Sem coordenadas a distância é Infinity, então não acusa —
 * evita falso positivo só por nome. `ignoreId` pula a própria igreja na edição.
 */
export const isPossibleDuplicate = (
  candidate: IgrejaFormData,
  existing: Igreja[],
  ignoreId?: string
): Igreja[] => {
  const candName = normalize(candidate.nome);
  if (candName.length < 2) return [];
  return existing.filter((c) => {
    if (ignoreId && c.id === ignoreId) return false;
    const cName = normalize(c.nome);
    const nameSimilar = cName.includes(candName) || candName.includes(cName);
    const near = haversineMeters(candidate, c) < DUPLICATE_RADIUS_METERS;
    return nameSimilar && near;
  });
};

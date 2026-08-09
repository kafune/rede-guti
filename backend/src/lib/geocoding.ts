import { config } from '../config.js';
import { prisma } from '../db.js';
import { getTenantId } from './tenantContext.js';

// Abstração de geocodificação (permite trocar o provedor sem mexer no resto).
// Implementação padrão: Nominatim/OSM (grátis, ~1 req/s, User-Agent obrigatório).
// Cache em geocode_cache evita reconsultar o mesmo endereço (inclui negativos).

export interface GeocodeQuery {
  street?: string | null;
  number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  provider: string;
  confidence: string | null;
  formattedAddress: string | null;
}

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const parts = (q: GeocodeQuery) => {
  const city = q.city || config.geocoderDefaultCity;
  const state = q.state || config.geocoderDefaultState;
  const line = [q.street, q.number].filter(Boolean).join(', ');
  return { line, district: q.district || '', city, state, postalCode: q.postalCode || '' };
};

// Chave de cache: precisa de rua OU bairro para valer a consulta.
export const buildAddressKey = (q: GeocodeQuery): string | null => {
  const p = parts(q);
  if (!p.line && !p.district) return null;
  return normalize([p.line, p.district, p.city, p.state, p.postalCode].filter(Boolean).join(' | '));
};

const buildQueryString = (q: GeocodeQuery): string => {
  const p = parts(q);
  return [p.line, p.district, `${p.city} - ${p.state}`, p.postalCode, 'Brasil'].filter(Boolean).join(', ');
};

// Throttle global do processo para respeitar o limite do Nominatim.
let lastCallAt = 0;
const MIN_INTERVAL_MS = 1100;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const throttle = async () => {
  const since = Date.now() - lastCallAt;
  if (since < MIN_INTERVAL_MS) await wait(MIN_INTERVAL_MS - since);
  lastCallAt = Date.now();
};

const nominatimGeocode = async (q: GeocodeQuery): Promise<GeocodeResult | null> => {
  await throttle();
  const url = new URL(`${config.nominatimUrl}/search`);
  url.searchParams.set('q', buildQueryString(q));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('addressdetails', '0');
  if (config.geocoderEmail) url.searchParams.set('email', config.geocoderEmail);

  const res = await fetch(url, {
    headers: { 'User-Agent': config.geocoderUserAgent, 'Accept-Language': 'pt-BR' },
  });
  if (!res.ok) throw new Error(`Geocoder HTTP ${res.status}`);
  const data = (await res.json()) as any[];
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit?.lat || !hit?.lon) return null;
  return {
    latitude: Number(hit.lat),
    longitude: Number(hit.lon),
    provider: 'nominatim',
    confidence: hit.type ?? hit.category ?? null,
    formattedAddress: hit.display_name ?? null,
  };
};

const runProvider = async (q: GeocodeQuery): Promise<GeocodeResult | null> => {
  // Ponto único de troca de provedor (Google/Mapbox no futuro).
  return nominatimGeocode(q);
};

/**
 * Geocodifica um endereço com cache. Retorna null quando o provedor não acha
 * (o negativo também é cacheado para não repetir a consulta).
 */
export const geocodeAddress = async (q: GeocodeQuery): Promise<GeocodeResult | null> => {
  const key = buildAddressKey(q);
  if (!key) return null;

  const cached = await prisma.geocodeCache.findFirst({ where: { addressKey: key } });
  if (cached) {
    if (!cached.found || cached.latitude == null || cached.longitude == null) return null;
    return {
      latitude: cached.latitude,
      longitude: cached.longitude,
      provider: cached.provider ?? 'cache',
      confidence: cached.confidence,
      formattedAddress: cached.formattedAddress,
    };
  }

  let result: GeocodeResult | null = null;
  try {
    result = await runProvider(q);
  } catch (err) {
    // Erro transitório do provedor: não cacheia (permite retry depois).
    throw err;
  }

  await prisma.geocodeCache.create({
    data: {
      tenantId: getTenantId(),
      addressKey: key,
      latitude: result?.latitude ?? null,
      longitude: result?.longitude ?? null,
      provider: result?.provider ?? null,
      confidence: result?.confidence ?? null,
      formattedAddress: result?.formattedAddress ?? null,
      found: Boolean(result),
    },
  });

  return result;
};

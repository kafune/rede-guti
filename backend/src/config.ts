import { decodeEncryptionKey } from './whatsapp/domain/crypto.js';

function optionalValue(value: string | undefined): string | null {
  return value?.trim() || null;
}

function optionalUrl(value: string | undefined): string | null {
  return value?.trim().replace(/\/+$/, '') || null;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined || value.trim() === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function optionalEncryptionKey(value: string | undefined): string | null {
  const key = optionalValue(value);
  if (key === null) return null;
  try {
    decodeEncryptionKey(key);
  } catch {
    throw new Error(
      'WHATSAPP_ENCRYPTION_KEY must be 64 hex characters or base64 encoding exactly 32 bytes.',
    );
  }
  return key;
}

const whatsappDelayMin = positiveInteger(process.env.WHATSAPP_DELAY_MIN, 5, 'WHATSAPP_DELAY_MIN');
const whatsappDelayMax = positiveInteger(process.env.WHATSAPP_DELAY_MAX, 15, 'WHATSAPP_DELAY_MAX');

if (whatsappDelayMin > whatsappDelayMax) {
  throw new Error('WHATSAPP_DELAY_MIN must be less than or equal to WHATSAPP_DELAY_MAX.');
}

export const config = {
  port: positiveInteger(process.env.PORT, 4000, 'PORT'),
  host: process.env.HOST ?? '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET ?? 'change_me',
  // Instance geography: which municipalities dataset validates the public
  // signup ('sp' → data/municipios_sp_645.csv) and the state code stamped on
  // municipalities created by it.
  geoDataset: (process.env.GEO_DATASET ?? 'sp').trim().toLowerCase(),
  geoStateCode: (process.env.GEO_STATE_CODE ?? 'SP').trim().toUpperCase(),
  // "Igreja" field on supporter registration. The region-based instance turns
  // this off; supporters are then linked to a sentinel church record so the
  // NOT NULL churchId column stays untouched.
  churchFieldEnabled: (process.env.CHURCH_FIELD_ENABLED ?? 'true').trim().toLowerCase() !== 'false',
  // Multi-tenant (Fase B): slug do tenant desta instância. O processo resolve
  // o tenant no boot e TODAS as queries ficam escopadas a ele. O default
  // 'default' é o tenant que a migração cria para adotar os dados existentes,
  // então instâncias sem a env nova continuam funcionando como antes.
  tenantSlug: (process.env.TENANT_SLUG ?? 'default').trim().toLowerCase(),
  uazapiBaseUrl: optionalUrl(process.env.UAZAPI_BASE_URL),
  uazapiAdminToken: optionalValue(process.env.UAZAPI_ADMIN_TOKEN),
  uazapiWebhookSecret: optionalValue(process.env.UAZAPI_WEBHOOK_SECRET),
  whatsappEncryptionKey: optionalEncryptionKey(process.env.WHATSAPP_ENCRYPTION_KEY),
  whatsappDelayMin,
  whatsappDelayMax,
  whatsappUploadMaxMb: positiveInteger(process.env.WHATSAPP_UPLOAD_MAX_MB, 20, 'WHATSAPP_UPLOAD_MAX_MB'),
  whatsappMassMaxRecipients: positiveInteger(
    process.env.WHATSAPP_MASS_MAX_RECIPIENTS,
    1000,
    'WHATSAPP_MASS_MAX_RECIPIENTS',
  ),
  publicApiUrl: optionalUrl(process.env.PUBLIC_API_URL),
  // Geocodificação do módulo territorial. Nominatim (OSM) exige ~1 req/s e
  // um User-Agent identificável; as envs permitem trocar o provedor/endpoint.
  geocoderProvider: (process.env.GEOCODER_PROVIDER ?? 'nominatim').trim().toLowerCase(),
  nominatimUrl: optionalUrl(process.env.NOMINATIM_URL) || 'https://nominatim.openstreetmap.org',
  geocoderUserAgent: process.env.GEOCODER_USER_AGENT?.trim() || 'rede-guti-territorial/1.0 (+https://redeguti.ddnsfree.com)',
  geocoderEmail: optionalValue(process.env.GEOCODER_EMAIL),
  geocoderDefaultCity: process.env.GEOCODER_DEFAULT_CITY?.trim() || 'Guarulhos',
  geocoderDefaultState: process.env.GEOCODER_DEFAULT_STATE?.trim() || 'SP',
};

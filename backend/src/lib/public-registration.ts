import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

// Datasets registrados: nome lógico (GEO_DATASET) → CSV em src/data/.
// Datasets fora do registro seguem a convenção municipios_<dataset>.csv.
const DATASET_FILES: Record<string, string> = {
  sp: 'municipios_sp_645.csv',
};

const resolveDatasetFileName = (dataset: string) => {
  const sanitized = dataset.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!sanitized) return DATASET_FILES.sp;
  return DATASET_FILES[sanitized] ?? `municipios_${sanitized}.csv`;
};

const collapseWhitespace = (value: string) => value.trim().replace(/\s+/g, ' ');

const stripDiacritics = (value: string) =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '');

const normalizeLookupKey = (value: string) => {
  const sanitized = stripDiacritics(collapseWhitespace(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();

  return sanitized.replace(/\bsp\b$/u, '').trim();
};

const loadOfficialMunicipalities = () => {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  const fileName = resolveDatasetFileName(config.geoDataset);
  const csvPath =
    [
      join(currentDir, `../data/${fileName}`),
      join(currentDir, `../../src/data/${fileName}`)
    ].find((candidatePath) => existsSync(candidatePath)) ?? '';

  if (!csvPath) {
    throw new Error(`Municipalities dataset file not found: ${fileName}`);
  }

  const municipalityNames = readFileSync(csvPath, 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(',')[1]?.trim() ?? '')
    .filter(Boolean);

  return Array.from(new Set(municipalityNames)).sort((left, right) => left.localeCompare(right));
};

const officialMunicipalities = loadOfficialMunicipalities();
const municipalityLookup = new Map(
  officialMunicipalities.map((name) => [normalizeLookupKey(name), name])
);

export const normalizeText = (value: string) => collapseWhitespace(value);

export const normalizeMunicipalityName = (value: string) => {
  const lookupKey = normalizeLookupKey(value);
  if (!lookupKey) return null;
  return municipalityLookup.get(lookupKey) ?? null;
};

export const getPublicMunicipalityOptions = () => [...officialMunicipalities];

type PhoneValidationResult =
  | { normalized: string }
  | { error: string };

export const validateAndNormalizeBrazilWhatsapp = (value: string): PhoneValidationResult => {
  const digitsOnly = value.replace(/\D/g, '');
  if (!digitsOnly) {
    return { error: 'Informe um WhatsApp com DDD.' };
  }

  const nationalDigits =
    digitsOnly.startsWith('55') && digitsOnly.length > 11 ? digitsOnly.slice(2) : digitsOnly;

  if (nationalDigits.length !== 11) {
    return { error: 'Informe um WhatsApp valido com DDD.' };
  }

  const areaCode = nationalDigits.slice(0, 2);
  const subscriberNumber = nationalDigits.slice(2);

  if (!/^[1-9]{2}$/.test(areaCode) || subscriberNumber[0] !== '9') {
    return { error: 'Informe um WhatsApp valido com DDD.' };
  }

  return { normalized: `55${nationalDigits}` };
};

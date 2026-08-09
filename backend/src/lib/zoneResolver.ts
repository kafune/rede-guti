import { prisma } from '../db.js';
import { normalizeBairro } from './territory.js';

// Serviço isolado de classificação territorial (endereço/bairro → Zona Eleitoral).
// Mantido separado das rotas para permitir trocar a metodologia no futuro
// (ex.: polígonos oficiais + point-in-polygon) sem alterar o resto do sistema.

export type ZoneMethod = 'bairro_lookup' | 'none';

export interface ZoneResolution {
  zoneNumber: string | null;
  method: ZoneMethod;
  confidence: number; // 0..1
  source: string | null;
  requiresReview: boolean;
  candidates: string[]; // zonas candidatas quando o bairro é ambíguo
  reason: string;
}

/**
 * Resolve a zona pelo bairro usando o dicionário BairroZona do tenant.
 * - 1 zona candidata  → confiança alta, sem revisão.
 * - >1 zona candidata → ambíguo, "requer validação".
 * - 0                 → sem classificação, "requer validação".
 */
export const resolveZoneByBairro = async (district?: string | null): Promise<ZoneResolution> => {
  const label = (district ?? '').trim();
  if (!label) {
    return {
      zoneNumber: null,
      method: 'none',
      confidence: 0,
      source: null,
      requiresReview: true,
      candidates: [],
      reason: 'Bairro não informado.',
    };
  }

  const key = normalizeBairro(label);
  const matches = await prisma.bairroZona.findMany({
    where: { bairroNormalized: key },
    select: { zoneNumber: true, source: true },
  });

  const zones = [...new Set(matches.map((m) => m.zoneNumber))];
  const source = matches[0]?.source ?? null;

  if (zones.length === 1) {
    return {
      zoneNumber: zones[0],
      method: 'bairro_lookup',
      confidence: 0.9,
      source,
      requiresReview: false,
      candidates: zones,
      reason: `Bairro "${label}" mapeado 1:1 à zona ${zones[0]}.`,
    };
  }

  if (zones.length > 1) {
    return {
      zoneNumber: null,
      method: 'bairro_lookup',
      confidence: 0.4,
      source,
      requiresReview: true,
      candidates: zones,
      reason: `Bairro "${label}" aparece em mais de uma zona (${zones.join(', ')}). Requer validação.`,
    };
  }

  return {
    zoneNumber: null,
    method: 'none',
    confidence: 0,
    source: null,
    requiresReview: true,
    candidates: [],
    reason: `Bairro "${label}" não encontrado no dicionário. Requer validação.`,
  };
};

import { prisma } from '../db.js';
import { getTenantId } from './tenantContext.js';

// Configurações operacionais do módulo territorial (raio de geofence, foto
// obrigatória, visitas por igreja). Criadas sob demanda com defaults do prompt.
export const getTerritorySettings = async () => {
  const tenantId = getTenantId();
  const existing = await prisma.territorySettings.findUnique({ where: { tenantId } });
  if (existing) return existing;
  return prisma.territorySettings.create({ data: { tenantId } });
};

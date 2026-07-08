import { prisma } from '../db.js';
import { getTenantId } from './tenantContext.js';

// Registro-âncora usado quando a instância não coleta igreja
// (CHURCH_FIELD_ENABLED=false): mantém churchId NOT NULL sem migration.
// Um por tenant (a busca e a criação são escopadas pelo tenant do processo).
export const SENTINEL_CHURCH_NAME = '(sem igreja)';

export const resolveSentinelChurchId = async (): Promise<string> => {
  const existing = await prisma.church.findFirst({
    where: { name: { equals: SENTINEL_CHURCH_NAME, mode: 'insensitive' } },
    select: { id: true }
  });
  if (existing) return existing.id;

  const created = await prisma.church.create({
    data: { name: SENTINEL_CHURCH_NAME, tenantId: getTenantId() },
    select: { id: true }
  });
  return created.id;
};

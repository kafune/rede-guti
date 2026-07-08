import { prisma } from '../db.js';

// Registro-âncora usado quando a instância não coleta igreja
// (CHURCH_FIELD_ENABLED=false): mantém churchId NOT NULL sem migration.
export const SENTINEL_CHURCH_NAME = '(sem igreja)';

export const resolveSentinelChurchId = async (): Promise<string> => {
  const existing = await prisma.church.findFirst({
    where: { name: { equals: SENTINEL_CHURCH_NAME, mode: 'insensitive' } },
    select: { id: true }
  });
  if (existing) return existing.id;

  const created = await prisma.church.create({
    data: { name: SENTINEL_CHURCH_NAME },
    select: { id: true }
  });
  return created.id;
};

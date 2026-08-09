import type { FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { getTenantId } from './tenantContext.js';

// Registro de auditoria das operações sensíveis (troca de zona, endereço, equipe,
// motorista, reagendamento, check-in, exclusão de foto, cancelamento etc.).
// Fire-and-forget: a auditoria nunca deve derrubar a operação principal.
export const recordAudit = (params: {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  userId?: string | null;
  request?: FastifyRequest;
}): void => {
  const { action, entityType, entityId, before, after, userId, request } = params;
  prisma.auditLog
    .create({
      data: {
        tenantId: getTenantId(),
        userId: userId ?? (request?.user as any)?.sub ?? null,
        action,
        entityType,
        entityId,
        before: (before ?? null) as any,
        after: (after ?? null) as any,
        ip: request?.ip ?? null,
        userAgent: request?.headers['user-agent'] ?? null,
      },
    })
    .catch((err) => console.error('[audit] failed:', action, err));
};

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { normalizeRole } from '../lib/access.js';
import { getTenantId } from '../lib/tenantContext.js';
import { getAccessDeniedReason, getCurrentUserAccess } from '../lib/userAccess.js';

// Um JWT só vale no tenant que o emitiu: mesmo que duas instâncias compartilhem
// o segredo (não deveriam), o claim tenantId impede o replay entre elas.
// Tokens antigos (pré-Fase B, sem o claim) caem aqui e forçam novo login.
const belongsToCurrentTenant = (user: { tenantId?: string }) =>
  user.tenantId === getTenantId();

export const hasExplicitUnexpiredJwt = (user: { exp?: number }) =>
  typeof user.exp === 'number'
  && Number.isFinite(user.exp)
  && user.exp > Math.floor(Date.now() / 1_000);

export const registerAuth = (app: FastifyInstance) => {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      if (!hasExplicitUnexpiredJwt(request.user) || !belongsToCurrentTenant(request.user)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Desativação/bloqueio vale mesmo com JWT ainda válido; 401 força o
    // logout automático no frontend.
    const denied = await getAccessDeniedReason(request.user.sub);
    if (denied) {
      return reply.code(401).send({ error: denied });
    }
  });

  app.decorate('requireCoordinator', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      if (!hasExplicitUnexpiredJwt(request.user) || !belongsToCurrentTenant(request.user)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const currentUser = await getCurrentUserAccess(request.user.sub);
    if (!currentUser || !currentUser.active) {
      return reply.code(401).send({ error: 'Conta desativada. Fale com a coordenação.' });
    }
    if (normalizeRole(currentUser.role) !== 'COORDENADOR') {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  });
};

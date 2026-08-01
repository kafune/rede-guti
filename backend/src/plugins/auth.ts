import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { normalizeRole } from '../lib/access.js';
import { getTenantId } from '../lib/tenantContext.js';
import { getAccessDeniedReason } from '../lib/userAccess.js';

// Um JWT só vale no tenant que o emitiu: mesmo que duas instâncias compartilhem
// o segredo (não deveriam), o claim tenantId impede o replay entre elas.
// Tokens antigos (pré-Fase B, sem o claim) caem aqui e forçam novo login.
const belongsToCurrentTenant = (user: { tenantId?: string }) =>
  user.tenantId === getTenantId();

export const registerAuth = (app: FastifyInstance) => {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      if (!belongsToCurrentTenant(request.user)) {
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
      if (!belongsToCurrentTenant(request.user)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      if (normalizeRole(request.user.role) !== 'COORDENADOR') {
        return reply.code(403).send({ error: 'Forbidden' });
      }
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const denied = await getAccessDeniedReason(request.user.sub);
    if (denied) {
      return reply.code(401).send({ error: denied });
    }
  });
};

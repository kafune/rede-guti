import { timingSafeEqual } from 'node:crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { normalizeRole } from '../lib/access.js';
import { getTenantId } from '../lib/tenantContext.js';

const matchesAutomationToken = (header: string | undefined) => {
  if (!config.automationToken || !header?.startsWith('Bearer ')) {
    return false;
  }

  const provided = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(config.automationToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
};

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
  });

  // Server-to-server access for scheduled jobs (n8n crons).
  // Accepts either the static AUTOMATION_API_TOKEN or a coordinator JWT,
  // so the endpoints stay usable manually from an authenticated session.
  app.decorate('requireAutomation', async (request: FastifyRequest, reply: FastifyReply) => {
    if (matchesAutomationToken(request.headers.authorization)) {
      return;
    }

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
  });
};

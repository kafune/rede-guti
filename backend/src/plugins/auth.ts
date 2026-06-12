import { timingSafeEqual } from 'node:crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { normalizeRole } from '../lib/access.js';

const matchesAutomationToken = (header: string | undefined) => {
  if (!config.automationToken || !header?.startsWith('Bearer ')) {
    return false;
  }

  const provided = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(config.automationToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
};

export const registerAuth = (app: FastifyInstance) => {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.decorate('requireCoordinator', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
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
      if (normalizeRole(request.user.role) !== 'COORDENADOR') {
        return reply.code(403).send({ error: 'Forbidden' });
      }
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
};

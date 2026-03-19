import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { normalizeRole } from '../lib/access.js';

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
};

import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../../config.js';
import { processUazapiWebhook } from '../../whatsapp/services/webhook-service.js';

function suppliedSecret(request: FastifyRequest) {
  const header = request.headers['x-webhook-secret'];
  if (typeof header === 'string') return header;
  if (Array.isArray(header) && typeof header[0] === 'string') return header[0];
  const query = request.query as { secret?: unknown };
  return typeof query?.secret === 'string' ? query.secret : '';
}

function validSecret(provided: string, expected: string | null) {
  if (expected === null) return false;
  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export async function publicWhatsAppWebhookRoutes(app: FastifyInstance) {
  app.post('/public/whatsapp/webhook', {
    onRequest: (request, reply, done) => {
      if (!validSecret(suppliedSecret(request), config.uazapiWebhookSecret)) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }
      done();
    },
  }, async (request, reply) => {
    const result = await processUazapiWebhook(request.body);
    return reply.code(202).send(result);
  });
}

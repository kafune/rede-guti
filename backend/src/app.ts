import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';
import { config } from './config.js';
import { registerAuth } from './plugins/auth.js';
import { atividadeRoutes } from './routes/atividades.js';
import { authRoutes } from './routes/auth.js';
import { automationRoutes } from './routes/automation.js';
import { churchRoutes } from './routes/churches.js';
import { engagementRoutes } from './routes/engagement.js';
import { equipeRoutes } from './routes/equipes.js';
import { eventoRoutes } from './routes/eventos.js';
import { healthRoutes } from './routes/health.js';
import { indicationRoutes } from './routes/indications.js';
import { metaRoutes } from './routes/metas.js';
import { municipalityRoutes } from './routes/municipalities.js';
import { publicRoutes } from './routes/public.js';
import { settingsRoutes } from './routes/settings.js';
import { userRoutes } from './routes/users.js';
import { whatsappRoutes } from './routes/whatsapp/index.js';

export interface BuildAppOptions {
  logger?: boolean | Record<string, unknown>;
}

const REDACTED = '[REDACTED]';

function redactSecretQuery(url: string | undefined) {
  return url?.replace(/([?&]secret=)[^&]*/gi, `$1${REDACTED}`);
}

function safeRequestLog(request: any) {
  const headers = { ...(request.headers ?? {}) };
  for (const name of ['authorization', 'x-webhook-secret']) {
    if (headers[name] !== undefined) headers[name] = REDACTED;
  }
  return {
    method: request.method,
    url: redactSecretQuery(request.url),
    host: request.hostname ?? headers.host,
    remoteAddress: request.ip ?? request.socket?.remoteAddress,
    headers,
  };
}

function loggerOptions(input: BuildAppOptions['logger']) {
  if (input === false) return false;
  const supplied = input !== null && typeof input === 'object' ? input : {};
  return {
    ...supplied,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-webhook-secret"]',
        'headers.authorization',
        'headers["x-webhook-secret"]',
      ],
      censor: REDACTED,
    },
    serializers: { req: safeRequestLog },
  };
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: loggerOptions(options.logger) as any });

  await app.register(cors, { origin: true });
  await app.register(sensible);
  await app.register(rateLimit, { global: false });
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(multipart, {
    limits: { files: 1, fileSize: config.whatsappUploadMaxMb * 1024 * 1024 + 1 },
  });

  registerAuth(app);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(churchRoutes);
  await app.register(municipalityRoutes);
  await app.register(indicationRoutes);
  await app.register(publicRoutes);
  await app.register(settingsRoutes);
  await app.register(eventoRoutes);
  await app.register(atividadeRoutes);
  await app.register(metaRoutes);
  await app.register(equipeRoutes);
  await app.register(engagementRoutes);
  await app.register(automationRoutes);
  await app.register(whatsappRoutes);

  return app;
}

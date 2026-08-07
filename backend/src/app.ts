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
import { churchRoutes } from './routes/churches.js';
import { engagementRoutes } from './routes/engagement.js';
import { equipeRoutes } from './routes/equipes.js';
import { eventoRoutes } from './routes/eventos.js';
import { healthRoutes } from './routes/health.js';
import { igrejaRoutes } from './routes/igrejas.js';
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
const REQUIRED_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-webhook-secret"]',
  'headers.authorization',
  'headers["x-webhook-secret"]',
];

function redactSecretQuery(url: string | undefined) {
  if (url === undefined) return undefined;
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const fragmentStart = url.indexOf('#', queryStart);
  const prefix = url.slice(0, queryStart + 1);
  const query = url.slice(queryStart + 1, fragmentStart === -1 ? undefined : fragmentStart);
  const fragment = fragmentStart === -1 ? '' : url.slice(fragmentStart);
  const redacted = query.split('&').map((parameter) => {
    const separator = parameter.indexOf('=');
    const encodedName = separator === -1 ? parameter : parameter.slice(0, separator);
    let decodedName: string;
    try {
      decodedName = decodeURIComponent(encodedName.replace(/\+/g, ' '));
    } catch {
      return parameter;
    }
    if (decodedName.toLowerCase() !== 'secret') return parameter;
    return `${encodedName}=${REDACTED}`;
  }).join('&');
  return `${prefix}${redacted}${fragment}`;
}

function safeRequestLog(request: any) {
  return {
    id: request.id,
    method: request.method,
    url: redactSecretQuery(request.url),
    host: request.hostname ?? request.headers?.host,
    remoteAddress: request.ip ?? request.socket?.remoteAddress,
    remotePort: request.socket?.remotePort,
  };
}

function mergedRedact(value: unknown) {
  if (Array.isArray(value)) {
    return { paths: [...new Set([...value, ...REQUIRED_REDACT_PATHS])], censor: REDACTED };
  }
  if (value !== null && typeof value === 'object') {
    const configured = value as { paths?: unknown; [key: string]: unknown };
    const paths = Array.isArray(configured.paths) ? configured.paths : [];
    return { ...configured, paths: [...new Set([...paths, ...REQUIRED_REDACT_PATHS])] };
  }
  return { paths: REQUIRED_REDACT_PATHS, censor: REDACTED };
}

function loggerOptions(input: BuildAppOptions['logger']) {
  if (input === false) return false;
  const supplied = input !== null && typeof input === 'object' ? input : {};
  const serializers = supplied.serializers !== null && typeof supplied.serializers === 'object'
    ? supplied.serializers as Record<string, unknown>
    : {};
  return {
    ...supplied,
    redact: mergedRedact(supplied.redact),
    serializers: { ...serializers, req: safeRequestLog },
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
  await app.register(igrejaRoutes);
  await app.register(engagementRoutes);
  await app.register(whatsappRoutes);

  return app;
}

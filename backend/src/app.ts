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
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? true });

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

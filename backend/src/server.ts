import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { config } from './config.js';
import { registerAuth } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { churchRoutes } from './routes/churches.js';
import { municipalityRoutes } from './routes/municipalities.js';
import { indicationRoutes } from './routes/indications.js';
import { userRoutes } from './routes/users.js';
import { healthRoutes } from './routes/health.js';
import { publicRoutes } from './routes/public.js';
import { settingsRoutes } from './routes/settings.js';
import { eventoRoutes } from './routes/eventos.js';
import { atividadeRoutes } from './routes/atividades.js';
import { metaRoutes } from './routes/metas.js';
import { engagementRoutes } from './routes/engagement.js';
import { automationRoutes } from './routes/automation.js';

const app = Fastify({
  logger: true
});

await app.register(cors, { origin: true });
await app.register(sensible);
// Rate limit only on routes that opt in via config.rateLimit (public forms).
await app.register(rateLimit, { global: false });
await app.register(jwt, { secret: config.jwtSecret });

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
await app.register(engagementRoutes);
await app.register(automationRoutes);

const start = async () => {
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

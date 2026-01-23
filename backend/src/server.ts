import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
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

const app = Fastify({
  logger: true
});

await app.register(cors, { origin: true });
await app.register(sensible);
await app.register(jwt, { secret: config.jwtSecret });

registerAuth(app);

await app.register(healthRoutes);
await app.register(authRoutes);
await app.register(userRoutes);
await app.register(churchRoutes);
await app.register(municipalityRoutes);
await app.register(indicationRoutes);
await app.register(publicRoutes);

const start = async () => {
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

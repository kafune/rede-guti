import { buildApp } from './app.js';
import { config } from './config.js';
import { resolveTenantFromEnv } from './lib/tenant.js';

const start = async () => {
  const app = await buildApp();
  try {
    // Multi-tenant: o tenant do processo precisa estar resolvido antes de
    // qualquer query — a extensão do Prisma recusa operar sem ele.
    const tenant = await resolveTenantFromEnv();
    app.log.info({ tenant: tenant.slug }, 'tenant resolved');
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

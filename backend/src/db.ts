import 'dotenv/config';
import prismaClient from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { getTenantId } from './lib/tenantContext.js';

const { PrismaClient } = prismaClient;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set.');
}

const pool = new Pool({ connectionString });
// Session advisory locks must not consume the Prisma adapter pool: a waiting
// lock holder then executes Prisma work and needs that pool to stay available.
const advisoryLockPool = new Pool({ connectionString, max: 5, allowExitOnIdle: true });
const adapter = new PrismaPg(pool);

export async function withAdvisoryLocks<T>(keys: string[], action: () => Promise<T>): Promise<T> {
  const client = await advisoryLockPool.connect();
  const locked: string[] = [];
  const ordered = [...new Set(keys)].sort();
  try {
    for (const key of ordered) {
      await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key]);
      locked.push(key);
    }
    return await action();
  } finally {
    let releaseError: Error | undefined;
    for (const key of locked.reverse()) {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key]);
      } catch {
        releaseError = new Error('Unable to release PostgreSQL advisory lock.');
        break;
      }
    }
    client.release(releaseError);
  }
}

export async function withAdvisoryLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  return withAdvisoryLocks([key], action);
}

// Cliente SEM escopo de tenant. Uso restrito ao bootstrap (resolver o tenant
// pelo slug) e a scripts administrativos que operam entre tenants
// (scripts/create-tenant.ts). Todo o código de rotas/serviços deve usar o
// `prisma` exportado abaixo.
export const basePrisma = new PrismaClient({ adapter });

// Extensão de isolamento multi-tenant: injeta o tenant do processo em todas as
// operações de todos os models (exceto Tenant). É a garantia de que nenhuma
// query — atual ou futura — lê ou grava dados de outro tenant, mesmo que o
// call site esqueça o filtro. O scoping explícito em lib/access.ts continua
// existindo como documentação e defesa em profundidade.
//
// Como funciona por operação:
// - find*/count/aggregate/groupBy/updateMany/deleteMany: AND com { tenantId }.
// - findUnique/update/delete/upsert: acrescenta tenantId ao where único
//   (extendedWhereUnique: campos não-únicos são aceitos como filtro extra);
//   um id de outro tenant vira "not found" (P2025).
// - create/createMany/upsert.create: sobrescreve data.tenantId com o tenant do
//   processo — o chamador não consegue gravar em outro tenant.
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (model === 'Tenant') {
          return query(args);
        }

        const tenantId = getTenantId();
        const scoped: any = { ...(args as Record<string, unknown>) };

        switch (operation) {
          case 'findUnique':
          case 'findUniqueOrThrow':
          case 'update':
          case 'delete':
          case 'upsert':
            scoped.where = { ...scoped.where, tenantId };
            break;
          case 'findFirst':
          case 'findFirstOrThrow':
          case 'findMany':
          case 'count':
          case 'aggregate':
          case 'groupBy':
          case 'updateMany':
          case 'deleteMany':
            scoped.where = { AND: [scoped.where ?? {}, { tenantId }] };
            break;
          case 'create':
            scoped.data = { ...scoped.data, tenantId };
            break;
          case 'createMany':
          case 'createManyAndReturn':
            scoped.data = Array.isArray(scoped.data)
              ? scoped.data.map((item: Record<string, unknown>) => ({ ...item, tenantId }))
              : { ...scoped.data, tenantId };
            break;
          default:
            break;
        }

        if (operation === 'upsert') {
          scoped.create = { ...scoped.create, tenantId };
        }

        return query(scoped);
      },
    },
  },
});

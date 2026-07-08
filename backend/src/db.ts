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
const adapter = new PrismaPg(pool);

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

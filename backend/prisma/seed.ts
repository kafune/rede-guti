import prismaClient from '@prisma/client';
import type { Role as RoleType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.ts';
import { resolveTenantFromEnv } from '../src/lib/tenant.ts';
import { GUARULHOS_ZONES, GUARULHOS_ZONE_SOURCE, buildBairroZonaRows } from '../src/lib/territory.ts';

const { Role } = prismaClient;

// Semeia Zonas Eleitorais + dicionário bairro→zona de Guarulhos (idempotente).
// Gate: TERRITORY_SEED=false desliga (instâncias que não são Guarulhos).
async function seedTerritory(tenantId: string) {
  if ((process.env.TERRITORY_SEED ?? 'true').toLowerCase() === 'false') return;

  for (const zone of GUARULHOS_ZONES) {
    await prisma.electoralZone.upsert({
      where: { tenantId_number: { tenantId, number: zone.number } },
      update: { color: zone.color, eleitores: zone.eleitores },
      create: { tenantId, number: zone.number, color: zone.color, eleitores: zone.eleitores },
    });
  }

  const rows = buildBairroZonaRows();
  for (const row of rows) {
    await prisma.bairroZona.upsert({
      where: {
        tenantId_bairroNormalized_zoneNumber: {
          tenantId,
          bairroNormalized: row.bairroNormalized,
          zoneNumber: row.zoneNumber,
        },
      },
      update: { bairroLabel: row.bairroLabel, source: GUARULHOS_ZONE_SOURCE },
      create: { tenantId, ...row },
    });
  }

  // Configurações territoriais padrão (raio de geofence etc.).
  const settings = await prisma.territorySettings.findUnique({ where: { tenantId } });
  if (!settings) await prisma.territorySettings.create({ data: { tenantId } });

  console.log(`[seed] Território: ${GUARULHOS_ZONES.length} zonas, ${rows.length} bairros mapeados.`);
}

async function upsertUser(
  tenantId: string,
  email: string,
  password: string,
  role: RoleType,
  indicatedByUserId?: string
) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { tenantId_email: { tenantId, email } },
    update: { passwordHash, role, indicatedByUserId },
    create: { tenantId, email, passwordHash, role, indicatedByUserId }
  });
}

async function main() {
  // Seed é por instância: resolve o tenant do TENANT_SLUG (default 'default')
  // antes de tocar no banco.
  const tenant = await resolveTenantFromEnv();

  const coordinatorEmail = (process.env.COORD_EMAIL ?? process.env.ADMIN_EMAIL)?.toLowerCase();
  const coordinatorPassword = process.env.COORD_PASSWORD ?? process.env.ADMIN_PASSWORD;
  const regionalEmail = process.env.LR_EMAIL?.toLowerCase();
  const regionalPassword = process.env.LR_PASSWORD;

  if (!coordinatorEmail || !coordinatorPassword) {
    throw new Error('Missing coordinator credentials. Set COORD_EMAIL/COORD_PASSWORD or ADMIN_EMAIL/ADMIN_PASSWORD.');
  }

  const coordinator = await upsertUser(tenant.id, coordinatorEmail, coordinatorPassword, Role.COORDENADOR);

  if (regionalEmail && regionalPassword) {
    await upsertUser(tenant.id, regionalEmail, regionalPassword, Role.LIDER_REGIONAL, coordinator.id);
  }

  await seedTerritory(tenant.id);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

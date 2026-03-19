import prismaClient from '@prisma/client';
import type { Role as RoleType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.ts';

const { Role } = prismaClient;

const getRequiredEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

async function upsertUser(email: string, password: string, role: RoleType, indicatedByUserId?: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash, role, indicatedByUserId },
    create: { email, passwordHash, role, indicatedByUserId }
  });
}

async function main() {
  const coordinatorEmail = (process.env.COORD_EMAIL ?? process.env.ADMIN_EMAIL)?.toLowerCase();
  const coordinatorPassword = process.env.COORD_PASSWORD ?? process.env.ADMIN_PASSWORD;
  const regionalEmail = process.env.LR_EMAIL?.toLowerCase();
  const regionalPassword = process.env.LR_PASSWORD;
  const localEmail = process.env.LL_EMAIL?.toLowerCase();
  const localPassword = process.env.LL_PASSWORD;

  if (!coordinatorEmail || !coordinatorPassword) {
    throw new Error('Missing coordinator credentials. Set COORD_EMAIL/COORD_PASSWORD or ADMIN_EMAIL/ADMIN_PASSWORD.');
  }

  const coordinator = await upsertUser(coordinatorEmail, coordinatorPassword, Role.COORDENADOR);

  let regionalId = coordinator.id;
  if (regionalEmail && regionalPassword) {
    const regional = await upsertUser(regionalEmail, regionalPassword, Role.LIDER_REGIONAL, coordinator.id);
    regionalId = regional.id;
  }

  if (localEmail && localPassword) {
    await upsertUser(localEmail, localPassword, Role.LIDER_LOCAL, regionalId);
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

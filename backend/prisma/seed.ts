import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.ts';

const getRequiredEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

async function upsertUser(email: string, password: string, role: Role) {
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role },
    create: { email, passwordHash, role }
  });
}

async function main() {
  const adminEmail = getRequiredEnv('ADMIN_EMAIL');
  const adminPassword = getRequiredEnv('ADMIN_PASSWORD');
  const viewerEmail = process.env.VIEWER_EMAIL;
  const viewerPassword = process.env.VIEWER_PASSWORD;

  await upsertUser(adminEmail.toLowerCase(), adminPassword, Role.ADMIN);

  if (viewerEmail && viewerPassword) {
    await upsertUser(viewerEmail.toLowerCase(), viewerPassword, Role.VIEWER);
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

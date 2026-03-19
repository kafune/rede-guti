import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../src/db.ts';

const helpText = `
Uso:
  bun run create:coordinator -- --email coord@exemplo.com --password "Senha123!" [--name "Nome"] [--devzapp "https://..."]

Tambem aceita fallback via ambiente:
  COORD_EMAIL
  COORD_PASSWORD
  COORD_NAME
  COORD_DEVZAPP_LINK
`.trim();

type ParsedArgs = {
  email?: string;
  password?: string;
  name?: string;
  devzappLink?: string;
  help?: boolean;
};

const inputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2).optional(),
  devzappLink: z.string().min(3).optional()
});

const parseArgs = (argv: string[]): ParsedArgs => {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Argumento invalido: ${arg}`);
    }

    const key = arg.slice(2);
    const nextValue = argv[index + 1];
    if (!nextValue || nextValue.startsWith('--')) {
      throw new Error(`Valor ausente para --${key}`);
    }

    switch (key) {
      case 'email':
        parsed.email = nextValue;
        break;
      case 'password':
        parsed.password = nextValue;
        break;
      case 'name':
        parsed.name = nextValue;
        break;
      case 'devzapp':
      case 'devzappLink':
        parsed.devzappLink = nextValue;
        break;
      default:
        throw new Error(`Argumento nao suportado: --${key}`);
    }

    index += 1;
  }

  return parsed;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(helpText);
    return;
  }

  const rawInput = {
    email: args.email ?? process.env.COORD_EMAIL,
    password: args.password ?? process.env.COORD_PASSWORD,
    name: args.name ?? process.env.COORD_NAME,
    devzappLink: args.devzappLink ?? process.env.COORD_DEVZAPP_LINK
  };

  const parsed = inputSchema.safeParse({
    email: rawInput.email?.trim().toLowerCase(),
    password: rawInput.password,
    name: rawInput.name?.trim() || undefined,
    devzappLink: rawInput.devzappLink?.trim() || undefined
  });

  if (!parsed.success) {
    console.error('Parametros invalidos.');
    console.error(helpText);
    process.exitCode = 1;
    return;
  }

  const { email, password, name, devzappLink } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      name: true
    }
  });

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: Role.COORDENADOR,
        passwordHash,
        name: name ?? existing.name,
        devzappLink: devzappLink ?? undefined,
        indicatedByUserId: null
      },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        devzappLink: true
      }
    });

    console.log('Usuario promovido/atualizado como coordenador:');
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  const created = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: Role.COORDENADOR,
      name,
      devzappLink,
      indicatedByUserId: null
    },
    select: {
      id: true,
      email: true,
      role: true,
      name: true,
      devzappLink: true
    }
  });

  console.log('Coordenador criado com sucesso:');
  console.log(JSON.stringify(created, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

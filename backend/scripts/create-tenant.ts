import 'dotenv/config';
import { z } from 'zod';
import { basePrisma } from '../src/db.ts';

// Provisiona um tenant no banco compartilhado (Fase B). Usa o basePrisma
// (sem escopo) de propósito: é a única operação legítima entre tenants.
//
// Uso:
//   bun run create:tenant -- --slug regional-sul --name "Regional Sul"
//
// Depois, suba a instância com TENANT_SLUG=regional-sul e rode o seed para
// criar o coordenador daquele tenant.

const helpText = `
Uso:
  bun run create:tenant -- --slug <slug> --name "<Nome do tenant>"
`.trim();

const inputSchema = z.object({
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug deve ter apenas letras minúsculas, números e hífens'),
  name: z.string().min(2)
});

const parseArgs = (argv: string[]) => {
  const parsed: { slug?: string; name?: string; help?: boolean } = {};

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
      case 'slug':
        parsed.slug = nextValue;
        break;
      case 'name':
        parsed.name = nextValue;
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

  const parsed = inputSchema.safeParse({
    slug: args.slug?.trim().toLowerCase(),
    name: args.name?.trim()
  });

  if (!parsed.success) {
    console.error('Parametros invalidos:', parsed.error.issues[0]?.message ?? '');
    console.error(helpText);
    process.exitCode = 1;
    return;
  }

  const { slug, name } = parsed.data;

  const existing = await basePrisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    console.log('Tenant ja existe:');
    console.log(JSON.stringify(existing, null, 2));
    return;
  }

  const created = await basePrisma.tenant.create({ data: { slug, name } });
  console.log('Tenant criado com sucesso:');
  console.log(JSON.stringify(created, null, 2));
  console.log(`\nProximos passos: suba a instancia com TENANT_SLUG=${slug} e rode o seed para criar o coordenador.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await basePrisma.$disconnect();
  });

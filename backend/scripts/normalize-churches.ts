import 'dotenv/config';
import { prisma } from '../src/db.js';

// ─────────────────────────────────────────────────────────────────────────────
// Normalização de igrejas "Missão Global"
//
// Une todas as variações de nome (ex.: "Missao global", "Igreja Profética
// missão Global", "Missao global(bispo Ivan)"...) numa única igreja canônica
// "Missão Global": reaponta todos os apoiadores das variações para a canônica e
// remove as igrejas duplicadas.
//
// USO (rodar no servidor, na pasta backend, com DATABASE_URL configurada):
//   bun run normalize:churches            # SIMULAÇÃO — só lista, não altera nada
//   bun run normalize:churches -- --apply # APLICA a fusão (faça backup antes!)
//
// É idempotente: rodar de novo após aplicar não causa efeito.
// ─────────────────────────────────────────────────────────────────────────────

const CANONICAL_NAME = 'Missão Global';

// Critério automático: toda igreja cujo nome (sem acentos, minúsculo) contém
// "global" é considerada variação de "Missão Global".
const matchesGlobal = (name: string) => normalize(name).includes('global');

// Variações ligadas ao Bispo Ivan também são Missão Global (inclui o erro de
// digitação "invan", ex.: "Bispo invan esclbri", "Missao global(bispo Ivan)").
const matchesBishopIvan = (name: string) => {
  const n = normalize(name);
  return n.includes('ivan') || n.includes('invan');
};

// Nomes EXATOS (como estão no banco) que você quer FORÇAR a entrar na fusão,
// caso apareça alguma variação que não contenha "global" nem "ivan". Os nomes
// do Bispo Ivan já entram automaticamente pelo critério acima.
const EXTRA_NAMES: string[] = [];

// Nomes EXATOS que NÃO devem ser fundidos (proteção contra falso-positivo, caso
// exista alguma igreja com "global" no nome que não seja a Missão Global).
const EXCLUDE_NAMES: string[] = [];

const APPLY = process.argv.includes('--apply');

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const excludeSet = new Set(EXCLUDE_NAMES.map(normalize));
  const extraSet = new Set(EXTRA_NAMES.map(normalize));

  const churches = await prisma.church.findMany({
    select: { id: true, name: true, _count: { select: { indications: true } } },
    orderBy: { name: 'asc' }
  });

  // Igrejas que serão consideradas variações da Missão Global.
  const targets = churches.filter((c) => {
    const n = normalize(c.name);
    if (excludeSet.has(n)) return false;
    return matchesGlobal(c.name) || matchesBishopIvan(c.name) || extraSet.has(n);
  });

  if (targets.length === 0) {
    console.log('Nenhuma igreja correspondente a "Missão Global" foi encontrada.');
    return;
  }

  // Define a igreja canônica: prioriza o nome exato; senão, a com mais apoiadores.
  const exactCanonical = churches.find((c) => c.name === CANONICAL_NAME) ?? null;
  const canonical =
    exactCanonical ??
    [...targets].sort((a, b) => b._count.indications - a._count.indications)[0];

  const duplicates = targets.filter((c) => c.id !== canonical.id);
  const totalToMove = duplicates.reduce((sum, c) => sum + c._count.indications, 0);

  console.log('─'.repeat(70));
  console.log(`Modo: ${APPLY ? 'APLICAÇÃO (--apply)' : 'SIMULAÇÃO (dry-run)'}`);
  console.log(`Igreja canônica: "${canonical.name}" (${canonical._count.indications} apoiadores)` +
    (exactCanonical ? '' : '  ⚠ nome exato não encontrado; usando a maior como base'));
  console.log('─'.repeat(70));

  if (duplicates.length === 0) {
    console.log('Nada a fazer: já existe apenas a igreja canônica.');
    return;
  }

  console.log(`Variações a fundir (${duplicates.length}):`);
  for (const d of duplicates) {
    console.log(`  • "${d.name}"  →  ${d._count.indications} apoiadores`);
  }
  console.log('─'.repeat(70));
  console.log(`Total de apoiadores que serão remapeados: ${totalToMove}`);
  console.log(
    `Apoiadores na "${canonical.name}" depois da fusão: ` +
      `${canonical._count.indications + totalToMove}`
  );
  console.log('─'.repeat(70));

  if (!APPLY) {
    console.log('SIMULAÇÃO — nada foi alterado.');
    console.log('Para aplicar de fato, rode: bun run normalize:churches -- --apply');
    return;
  }

  // Aplicação real — tudo dentro de uma transação para garantir consistência.
  await prisma.$transaction(async (tx) => {
    let canonicalId = canonical.id;

    // Garante que a igreja canônica exista com o nome correto.
    if (!exactCanonical) {
      const fixed = await tx.church.update({
        where: { id: canonical.id },
        data: { name: CANONICAL_NAME }
      });
      canonicalId = fixed.id;
    }

    for (const d of duplicates) {
      await tx.indication.updateMany({
        where: { churchId: d.id },
        data: { churchId: canonicalId }
      });
      await tx.church.delete({ where: { id: d.id } });
    }
  });

  console.log(`✔ Fusão concluída. ${duplicates.length} igrejas removidas, ` +
    `${totalToMove} apoiadores remapeados para "${CANONICAL_NAME}".`);
}

main()
  .catch((err) => {
    console.error('[normalize-churches] falhou:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

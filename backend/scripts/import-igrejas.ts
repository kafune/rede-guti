import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { prisma } from '../src/db.ts';
import { resolveTenantFromEnv } from '../src/lib/tenant.ts';

/**
 * Importa a base de igrejas (CSV) para o módulo de cadastro de igrejas,
 * associando cada uma à sua liderança quando houver usuário correspondente.
 *
 * Uso:
 *   bun run import:igrejas                 # importa scripts/data/igrejas-import.csv
 *   bun run import:igrejas -- --dry-run    # só relatório, sem gravar
 *   bun run import:igrejas -- --file /caminho/arquivo.csv
 *
 * Idempotente: pula igrejas já existentes (mesmo nome + endereço no tenant).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV = resolve(__dirname, 'data/igrejas-import.csv');

// ── Parser CSV (RFC 4180: aspas, vírgulas e quebras de linha dentro de campos) ─
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, ''); // remove BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      // Ignora linhas totalmente vazias.
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

const normalize = (v: string) =>
  (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const numOrNull = (v: string): number | null => {
  const t = (v ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
};
const intOrNull = (v: string): number | null => {
  const t = (v ?? '').replace(/\D/g, '');
  return t === '' ? null : parseInt(t, 10);
};

// "Auto:Pr. Bernard - Zona 176" -> { label: "Pr. Bernard - Zona 176", leader: "bernard" }
// "Importação PDF" / "Autocadastro" / "Equipe" -> sem liderança específica.
function parseLideranca(raw: string): { label: string | null; leader: string | null } {
  const v = (raw ?? '').trim();
  if (!v || /^(importa|autocadastro$|equipe$)/i.test(v)) return { label: null, leader: null };
  const label = v.replace(/^auto:\s*/i, '').trim();
  let leader = label.split(/\s*[-/]\s*/)[0];
  leader = leader.replace(/\bzona\b.*$/i, '').trim();
  leader = leader.replace(/^(pr\.?|pastor|pra\.?|ap\.?|bispo|dr\.?|dra\.?|padre)\s+/i, '').trim();
  return { label, leader: leader ? normalize(leader) : null };
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const fileIdx = argv.indexOf('--file');
  const csvPath = fileIdx !== -1 ? argv[fileIdx + 1] : DEFAULT_CSV;

  const tenant = await resolveTenantFromEnv();
  console.log(`Tenant: ${tenant.slug} (${tenant.id})`);
  console.log(`Arquivo: ${csvPath}${dryRun ? '  [DRY-RUN]' : ''}`);

  const rows = parseCsv(readFileSync(csvPath, 'utf-8'));
  if (rows.length < 2) throw new Error('CSV vazio ou sem linhas de dados.');
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => normalize(h) === normalize(name));
  const col = {
    nome: idx('Nome'),
    denominacao: idx('Denominação'),
    pastor: idx('Pastor'),
    endereco: idx('Endereço'),
    bairro: idx('Bairro'),
    cidade: idx('Cidade'),
    estado: idx('Estado'),
    telefone: idx('Telefone'),
    email: idx('Email'),
    latitude: idx('Latitude'),
    longitude: idx('Longitude'),
    observacoes: idx('Observações'),
    cadastradoPor: idx('Cadastrado por')
  };
  if (col.nome === -1) throw new Error('Coluna "Nome" não encontrada no CSV.');

  // Lideranças existentes (para associar por nome) — escopo de tenant automático.
  const users = await prisma.user.findMany({
    where: { role: { in: ['LIDER_REGIONAL', 'COORDENADOR'] } },
    select: { id: true, name: true, email: true }
  });
  const equipes = await prisma.equipe.findMany({ select: { id: true, liderId: true, createdAt: true } });
  const equipeByLider = new Map<string, string>();
  for (const e of equipes.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (!equipeByLider.has(e.liderId)) equipeByLider.set(e.liderId, e.id);
  }

  // Resolve um nome de líder (normalizado) para um usuário, por token exato ou substring.
  const matchLeader = (leader: string | null): { id: string; name: string } | null => {
    if (!leader || leader.length < 3) return null;
    for (const u of users) {
      const tokens = normalize(u.name ?? '').split(' ');
      if (tokens.includes(leader)) return { id: u.id, name: u.name ?? u.email };
    }
    for (const u of users) {
      if (normalize(u.name ?? '').includes(leader)) return { id: u.id, name: u.name ?? u.email };
    }
    return null;
  };

  // Idempotência: chaves (nome+endereço) já existentes no tenant.
  const existing = await prisma.igrejaCadastro.findMany({ select: { nome: true, endereco: true } });
  const seen = new Set(existing.map((e) => `${normalize(e.nome)}||${normalize(e.endereco)}`));

  let created = 0;
  let skipped = 0;
  let linked = 0;
  const perLeader = new Map<string, number>();
  const unmatchedLabels = new Map<string, number>();

  const cell = (r: string[], i: number) => (i === -1 ? '' : (r[i] ?? '').trim());

  for (const r of rows.slice(1)) {
    const nome = cell(r, col.nome);
    if (!nome) continue;
    const endereco = cell(r, col.endereco);
    const key = `${normalize(nome)}||${normalize(endereco)}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);

    const { label, leader } = parseLideranca(cell(r, col.cadastradoPor));
    const match = matchLeader(leader);
    const leaderKey = match?.name ?? label ?? '(sem liderança)';
    perLeader.set(leaderKey, (perLeader.get(leaderKey) ?? 0) + 1);
    if (label && !match) unmatchedLabels.set(label, (unmatchedLabels.get(label) ?? 0) + 1);

    if (dryRun) {
      created += 1;
      continue;
    }

    const equipeId = match ? equipeByLider.get(match.id) ?? null : null;
    await prisma.igrejaCadastro.create({
      data: {
        tenantId: tenant.id,
        nome,
        denominacao: cell(r, col.denominacao),
        pastor: cell(r, col.pastor),
        endereco,
        bairro: cell(r, col.bairro),
        cidade: cell(r, col.cidade) || 'Guarulhos',
        estado: cell(r, col.estado) || 'SP',
        telefone: cell(r, col.telefone),
        email: cell(r, col.email),
        latitude: numOrNull(cell(r, col.latitude)),
        longitude: numOrNull(cell(r, col.longitude)),
        observacoes: cell(r, col.observacoes),
        membrosEstimados: null,
        zonaEleitoral: intOrNull(label ?? ''),
        origem: 'import',
        liderancaLabel: label,
        createdById: match?.id ?? null,
        ...(equipeId ? { equipes: { create: { equipeId, tenantId: tenant.id } } } : {})
      }
    });
    created += 1;
    if (equipeId) linked += 1;
  }

  console.log('\n=== Resumo ===');
  console.log(`${dryRun ? 'Seriam criadas' : 'Criadas'}: ${created}`);
  console.log(`Puladas (já existiam): ${skipped}`);
  console.log(`Vinculadas a equipe: ${linked}`);
  console.log('\nPor liderança:');
  for (const [k, n] of [...perLeader.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${k}`);
  }
  if (unmatchedLabels.size) {
    console.log('\nLideranças do CSV SEM usuário correspondente (rótulo preservado em liderancaLabel):');
    for (const [k, n] of [...unmatchedLabels.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${k}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

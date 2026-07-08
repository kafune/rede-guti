import 'dotenv/config';
import { scanAndAlertInactiveLeaders } from '../src/lib/engagementService.js';
import { prisma } from '../src/db.js';
import { resolveTenantFromEnv } from '../src/lib/tenant.js';

// Standalone runner for the daily inactive-leader scan.
// Usage:
//   bun run scan:inactive
// or directly:
//   tsx scripts/scan-inactive.ts
//
// Exits 0 on success, 1 on unexpected failure. Idempotent: safe to run more
// than once per day; the 7-day ledger cooldown deduplicates alerts.

async function main() {
  const startedAt = Date.now();
  await resolveTenantFromEnv();
  const result = await scanAndAlertInactiveLeaders();
  const ms = Date.now() - startedAt;

  console.log(
    `[scan-inactive] scanned=${result.scanned} alerted=${result.alerted} ` +
      `skippedNoPhone=${result.skippedNoPhone} skippedDeduped=${result.skippedDeduped} ` +
      `skippedRoles=${result.skippedRoles} durationMs=${ms}`
  );
}

main()
  .catch((err) => {
    console.error('[scan-inactive] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

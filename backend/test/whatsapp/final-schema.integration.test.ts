import { expect, test } from 'bun:test';
import { Client } from 'pg';

const DATABASE = 'rede_guti_uazapi_final_schema';
const backendDirectory = new URL('../../', import.meta.url).pathname;

function urls() {
  const source = new URL(
    process.env.DATABASE_URL
      ?? 'postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public',
  );
  const admin = new URL(source);
  admin.pathname = '/postgres';
  admin.searchParams.delete('schema');
  const clean = new URL(source);
  clean.pathname = `/${DATABASE}`;
  clean.searchParams.set('schema', 'public');
  return { admin: admin.toString(), clean: clean.toString() };
}

async function recreateDatabase(adminUrl: string) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [DATABASE],
    );
    await client.query(`DROP DATABASE IF EXISTS "${DATABASE}"`);
    await client.query(`CREATE DATABASE "${DATABASE}"`);
  } finally {
    await client.end();
  }
}

async function dropDatabase(adminUrl: string) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [DATABASE],
    );
    await client.query(`DROP DATABASE IF EXISTS "${DATABASE}"`);
  } finally {
    await client.end();
  }
}

test('clean migration exposes canceling and webhook/campaign idempotency constraints', async () => {
  const { admin, clean } = urls();
  await recreateDatabase(admin);
  try {
    const migrated = Bun.spawnSync({
      cmd: [process.execPath, 'run', 'prisma:deploy'],
      cwd: backendDirectory,
      env: { ...process.env, DATABASE_URL: clean },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (migrated.exitCode !== 0) {
      throw new Error(`${migrated.stdout.toString()}\n${migrated.stderr.toString()}`);
    }

    const client = new Client({ connectionString: clean });
    await client.connect();
    try {
      const enumValues = await client.query<{ enumlabel: string }>(`
        SELECT enumlabel
        FROM pg_enum
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
        WHERE pg_type.typname = 'WhatsAppCampaignStatus'
        ORDER BY enumsortorder
      `);
      expect(enumValues.rows.map(({ enumlabel }) => enumlabel)).toContain('CANCELING');

      const columns = await client.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'whatsapp_campaigns'
      `);
      expect(columns.rows.map(({ column_name }) => column_name)).toEqual(expect.arrayContaining([
        'idempotency_key', 'retry_of_campaign_id',
      ]));

      const recipientColumns = await client.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'whatsapp_recipients'
      `);
      expect(recipientColumns.rows.map(({ column_name }) => column_name)).toContain(
        'processed_webhook_event_ids',
      );

      const constraints = await client.query<{ definition: string }>(`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'public.whatsapp_campaigns'::regclass
          AND contype IN ('u', 'f')
      `);
      const definitions = constraints.rows.map(({ definition }) => definition).join('\n');
      expect(definitions).toContain('UNIQUE (tenant_id, idempotency_key)');
      expect(definitions).toContain('UNIQUE (tenant_id, retry_of_campaign_id)');
      expect(definitions).toContain('FOREIGN KEY (retry_of_campaign_id) REFERENCES whatsapp_campaigns(id)');
    } finally {
      await client.end();
    }
  } finally {
    await dropDatabase(admin);
  }
}, 120_000);

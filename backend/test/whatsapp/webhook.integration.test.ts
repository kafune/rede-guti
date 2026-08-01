import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { Writable } from 'node:stream';

if (process.env.WEBHOOK_SCENARIO_CHILD !== '1') {
  test('runs the webhook and suppression integration scenario in an isolated process', () => {
    const result = Bun.spawnSync({
      cmd: [process.execPath, 'test', 'test/whatsapp/webhook.integration.test.ts'],
      cwd: new URL('../../', import.meta.url).pathname,
      env: { ...process.env, WEBHOOK_SCENARIO_CHILD: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (result.exitCode !== 0) {
      throw new Error(`${result.stdout.toString()}\n${result.stderr.toString()}`);
    }
    expect(result.exitCode).toBe(0);
  }, 30_000);
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL
    ?? 'postgresql://postgres:postgres@127.0.0.1:5432/rede_evangelica_uazapi_task4_codex?schema=public';
  process.env.JWT_SECRET = 'webhook-test-jwt-secret';
  process.env.UAZAPI_WEBHOOK_SECRET = 'webhook-secret-with-symbols/%';

  let app: FastifyInstance;
  let basePrisma: any;
  let prisma: any;
  let buildAppFactory: any;
  let coordinatorToken: string;
  const tenant = { id: 'webhook-tenant', slug: 'webhook-tenant', name: 'Webhook Tenant' };
  const otherTenant = { id: 'webhook-other-tenant', slug: 'webhook-other-tenant', name: 'Other Tenant' };
  const coordinatorId = 'webhook-coordinator';
  const otherCoordinatorId = 'webhook-other-coordinator';
  const mainPhone = '5511987654321';

  const content = { primary: { type: 'text', text: 'Mensagem' }, sequence: [] };

  beforeAll(async () => {
    const [{ buildApp }, db, tenantContext] = await Promise.all([
      import('../../src/app.js'),
      import('../../src/db.js'),
      import('../../src/lib/tenantContext.js'),
    ]);
    basePrisma = db.basePrisma;
    prisma = db.prisma;
    buildAppFactory = buildApp;
    for (const tenantId of [tenant.id, otherTenant.id]) {
      await basePrisma.whatsAppInteraction.deleteMany({ where: { tenantId } });
      await basePrisma.whatsAppRecipient.deleteMany({ where: { tenantId } });
      await basePrisma.whatsAppCampaign.deleteMany({ where: { tenantId } });
      await basePrisma.whatsAppSuppression.deleteMany({ where: { tenantId } });
      await basePrisma.whatsAppConfig.deleteMany({ where: { tenantId } });
      await basePrisma.user.deleteMany({ where: { tenantId } });
    }
    await basePrisma.tenant.upsert({ where: { id: tenant.id }, update: tenant, create: tenant });
    await basePrisma.tenant.upsert({ where: { id: otherTenant.id }, update: otherTenant, create: otherTenant });
    await basePrisma.user.createMany({ data: [
      {
        id: coordinatorId, tenantId: tenant.id, email: 'coord@webhook.test',
        passwordHash: 'unused', role: 'COORDENADOR', active: true,
      },
      {
        id: otherCoordinatorId, tenantId: otherTenant.id, email: 'coord@webhook-other.test',
        passwordHash: 'unused', role: 'COORDENADOR', active: true,
      },
    ] });
    tenantContext.setCurrentTenant(tenant);
    app = await buildApp({ logger: false });
    coordinatorToken = app.jwt.sign({ sub: coordinatorId, role: 'COORDENADOR', tenantId: tenant.id });

    await createCampaign('webhook-campaign-quoted', coordinatorId, 'SENDING');
    await createRecipient({
      id: 'webhook-recipient-quoted', campaignId: 'webhook-campaign-quoted',
      phone: mainPhone, status: 'SENT', externalMessageIds: ['outbound-quoted'],
      sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    await createCampaign('webhook-campaign-newer', coordinatorId, 'SENDING');
    await createRecipient({
      id: 'webhook-recipient-newer', campaignId: 'webhook-campaign-newer',
      phone: mainPhone, status: 'SENT', externalMessageIds: ['outbound-newer'],
      sentAt: new Date(Date.now() - 60 * 60 * 1000),
    });
  });

  afterAll(async () => {
    await app?.close();
    await basePrisma?.$disconnect();
  });

  async function createCampaign(id: string, createdById: string, status: string = 'QUEUED', tenantId = tenant.id) {
    return basePrisma.whatsAppCampaign.create({ data: {
      id, tenantId, createdById, name: id, status, category: 'UTILITY',
      audienceFilter: { type: 'SUPPORTERS', selectedIds: [] }, content,
      consentAt: new Date(), validRecipients: 1, queuedCount: 1,
    } });
  }

  async function createRecipient(input: {
    id: string;
    campaignId: string;
    phone: string;
    status: string;
    tenantId?: string;
    externalMessageIds?: string[];
    sentAt?: Date;
  }) {
    return basePrisma.whatsAppRecipient.create({ data: {
      id: input.id, tenantId: input.tenantId ?? tenant.id, campaignId: input.campaignId,
      origin: 'MANUAL', personName: input.id, phoneOriginal: input.phone,
      phoneNormalized: input.phone, personalizedContent: content, isValid: true,
      status: input.status, externalMessageIds: input.externalMessageIds ?? [], sentAt: input.sentAt,
    } });
  }

  const auth = () => ({ authorization: `Bearer ${coordinatorToken}` });
  const secretHeader = { 'x-webhook-secret': 'webhook-secret-with-symbols/%' };

  async function webhook(payload: unknown, headers: Record<string, string> = secretHeader, query = '') {
    return app.inject({
      method: 'POST', url: `/public/whatsapp/webhook${query}`,
      headers, payload,
    });
  }

  describe('public Uazapi webhook', () => {
    test('rejects a bad secret in onRequest before parsing the body and accepts header or query secret', async () => {
      const before = await prisma.whatsAppInteraction.count();
      const rejected = await app.inject({
        method: 'POST', url: '/public/whatsapp/webhook',
        headers: { 'content-type': 'application/json', 'x-webhook-secret': 'wrong' },
        payload: '{not-json',
      });
      expect(rejected.statusCode).toBe(401);
      expect(rejected.json()).toEqual({ error: 'Unauthorized' });
      expect(await prisma.whatsAppInteraction.count()).toBe(before);

      const accepted = await webhook({ event: 'messages', eventId: 'standalone-query-secret', data: {
        messageid: 'standalone-query-message', sender: '5511911111111', text: 'Olá', fromMe: false,
      } }, {}, '?secret=webhook-secret-with-symbols%2F%25');
      expect(accepted.statusCode).toBe(202);
      expect(accepted.json()).toEqual({ accepted: true, processed: false, duplicate: false });
    });

    test('redacts query/header secrets and authorization from real Fastify request logs', async () => {
      const chunks: string[] = [];
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(chunk.toString());
          callback();
        },
      });
      const loggedApp = await buildAppFactory({ logger: { stream } } as any);
      const bearer = `Bearer ${coordinatorToken}`;
      await loggedApp.inject({
        method: 'POST',
        url: '/public/whatsapp/webhook?secret=webhook-secret-with-symbols%2F%25',
        payload: { event: 'messages', eventId: 'logger-query-event', data: {
          messageid: 'logger-query-message', sender: '5511911111111', text: 'Olá', fromMe: false,
        } },
      });
      await loggedApp.inject({
        method: 'POST', url: '/public/whatsapp/webhook',
        headers: secretHeader,
        payload: { event: 'messages', eventId: 'logger-header-event', data: {
          messageid: 'logger-header-message', sender: '5511911111111', text: 'Olá', fromMe: false,
        } },
      });
      await loggedApp.inject({ method: 'GET', url: '/whatsapp/campaigns', headers: auth() });
      await loggedApp.close();

      const logs = chunks.join('');
      expect(logs).not.toContain('webhook-secret-with-symbols');
      expect(logs).not.toContain(coordinatorToken);
      expect(logs).not.toContain(bearer);
      expect(logs).toContain('[REDACTED]');
      expect(logs).toContain('secret=[REDACTED]');
    });

    test('deduplicates explicit and stable fallback ids while delivery states only advance', async () => {
      const delivered = {
        event: 'messages_update', eventId: 'delivery-event-explicit', data: {
          messageid: 'outbound-quoted', chatid: `${mainPhone}@s.whatsapp.net`, sender: mainPhone,
          status: 'Delivered', timestamp: '2026-08-01T10:00:00.000Z',
        },
      };
      const first = await webhook(delivered);
      const duplicate = await webhook(delivered);
      expect(first.statusCode).toBe(202);
      expect(duplicate.json()).toEqual({ accepted: true, processed: false, duplicate: true });
      expect(await prisma.whatsAppInteraction.count({ where: { externalId: 'delivery-event-explicit' } })).toBe(1);

      const readWithoutEventId = {
        event: 'messages_update', data: {
          messageid: 'outbound-quoted', sender: mainPhone, status: 'Read',
          timestamp: '2026-08-01T10:01:00.000Z',
        },
      };
      await webhook(readWithoutEventId);
      await webhook(readWithoutEventId);
      await webhook({ event: 'messages_update', data: {
        messageid: 'outbound-quoted', sender: mainPhone, status: 'Delivered',
        timestamp: '2026-08-01T10:02:00.000Z',
      } });
      await webhook({ event: 'messages_update', data: {
        messageid: 'outbound-quoted', sender: mainPhone, status: 'Played',
        timestamp: '2026-08-01T10:03:00.000Z',
      } });

      const recipient = await prisma.whatsAppRecipient.findUnique({ where: { id: 'webhook-recipient-quoted' } });
      expect(recipient).toMatchObject({ status: 'PLAYED' });
      expect(recipient.deliveredAt.toISOString()).toBe('2026-08-01T10:00:00.000Z');
      expect(recipient.readAt.toISOString()).toBe('2026-08-01T10:01:00.000Z');
      expect(recipient.playedAt.toISOString()).toBe('2026-08-01T10:03:00.000Z');
      const campaign = await prisma.whatsAppCampaign.findUnique({ where: { id: 'webhook-campaign-quoted' } });
      expect(campaign).toMatchObject({ sentCount: 1, deliveredCount: 1, readCount: 1, playedCount: 1 });
      expect(await prisma.whatsAppInteraction.count({ where: { recipientId: 'webhook-recipient-quoted' } })).toBe(4);
    });

    test('associates inbound replies by quoted id first, then recent sent phone, and ignores standalone messages', async () => {
      const quoted = await webhook({ event: 'messages', eventId: 'reply-quoted-event', data: {
        messageid: 'reply-quoted-message', sender: mainPhone, fromMe: false, text: 'Tenho interesse',
        quoted: { messageid: 'outbound-quoted' }, timestamp: new Date().toISOString(),
      } });
      expect(quoted.statusCode).toBe(202);
      expect(quoted.json()).toEqual({ accepted: true, processed: true, duplicate: false });
      expect(await prisma.whatsAppInteraction.findUnique({
        where: { tenantId_externalId: { tenantId: tenant.id, externalId: 'reply-quoted-event' } },
      })).toMatchObject({
        campaignId: 'webhook-campaign-quoted', recipientId: 'webhook-recipient-quoted', direction: 'INBOUND', status: 'PROCESSED',
      });

      await webhook({ event: 'messages', eventId: 'reply-fallback-event', data: {
        messageid: 'reply-fallback-message', sender: mainPhone, fromMe: false, text: 'Sem citação',
        timestamp: new Date().toISOString(),
      } });
      expect(await prisma.whatsAppInteraction.findUnique({
        where: { tenantId_externalId: { tenantId: tenant.id, externalId: 'reply-fallback-event' } },
      })).toMatchObject({
        campaignId: 'webhook-campaign-newer', recipientId: 'webhook-recipient-newer',
      });

      const before = await prisma.whatsAppInteraction.count();
      const standalone = await webhook({ event: 'messages', eventId: 'reply-standalone-event', data: {
        messageid: 'reply-standalone-message', sender: '5511912345678', fromMe: false, text: 'Oi',
        timestamp: new Date().toISOString(),
      } });
      expect(standalone.json()).toEqual({ accepted: true, processed: false, duplicate: false });
      expect(await prisma.whatsAppInteraction.count()).toBe(before);
    });

    test('SAIR activates one suppression and cancels only pending or queued recipients of that phone in this tenant', async () => {
      await createCampaign('webhook-optout-pending', coordinatorId);
      await createCampaign('webhook-optout-queued', coordinatorId);
      await createRecipient({ id: 'optout-pending-same', campaignId: 'webhook-optout-pending', phone: mainPhone, status: 'PENDING' });
      await createRecipient({ id: 'optout-queued-same', campaignId: 'webhook-optout-queued', phone: mainPhone, status: 'QUEUED' });
      await createRecipient({ id: 'optout-queued-other-phone', campaignId: 'webhook-optout-queued', phone: '5511977777777', status: 'QUEUED' });

      await createCampaign('webhook-other-campaign', otherCoordinatorId, 'QUEUED', otherTenant.id);
      await createRecipient({
        id: 'optout-other-tenant', campaignId: 'webhook-other-campaign', phone: mainPhone,
        status: 'QUEUED', tenantId: otherTenant.id,
      });

      const optOut = { event: 'messages', eventId: 'optout-event', data: {
        messageid: 'optout-message', sender: mainPhone, fromMe: false, text: '  sair!  ',
        timestamp: new Date().toISOString(),
      } };
      const response = await webhook(optOut);
      await webhook(optOut);
      expect(response.json()).toEqual({ accepted: true, processed: true, duplicate: false });

      const suppression = await prisma.whatsAppSuppression.findUnique({
        where: { tenantId_phoneNormalized: { tenantId: tenant.id, phoneNormalized: mainPhone } },
      });
      expect(suppression).toMatchObject({ active: true, source: 'WEBHOOK', reason: 'SAIR' });
      expect(await prisma.whatsAppSuppression.count({ where: { phoneNormalized: mainPhone } })).toBe(1);
      expect(await prisma.whatsAppInteraction.count({ where: { externalId: 'optout-event' } })).toBe(1);
      expect((await prisma.whatsAppRecipient.findUnique({ where: { id: 'optout-pending-same' } })).status).toBe('CANCELED');
      expect((await prisma.whatsAppRecipient.findUnique({ where: { id: 'optout-queued-same' } })).status).toBe('CANCELED');
      expect((await prisma.whatsAppRecipient.findUnique({ where: { id: 'optout-queued-other-phone' } })).status).toBe('QUEUED');
      expect((await basePrisma.whatsAppRecipient.findUnique({ where: { id: 'optout-other-tenant' } })).status).toBe('QUEUED');
    });

    test('atomically keeps READ over concurrent DELIVERED and never overwrites a completed SAIR cancellation', async () => {
      await basePrisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_delay_webhook_delivery_trigger ON whatsapp_interactions');
      await basePrisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS test_delay_webhook_delivery()');
      await basePrisma.$executeRawUnsafe(`
        CREATE FUNCTION test_delay_webhook_delivery() RETURNS trigger AS $$
        BEGIN
          IF NEW.external_id IN ('concurrent-delivered', 'delivery-after-optout') THEN
            PERFORM pg_sleep(0.2);
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      await basePrisma.$executeRawUnsafe(`
        CREATE TRIGGER test_delay_webhook_delivery_trigger
        BEFORE INSERT ON whatsapp_interactions
        FOR EACH ROW EXECUTE FUNCTION test_delay_webhook_delivery()
      `);
      const concurrentPhone = '5511961111111';
      await createCampaign('webhook-concurrent-campaign', coordinatorId, 'SENDING');
      await createRecipient({
        id: 'webhook-concurrent-recipient', campaignId: 'webhook-concurrent-campaign',
        phone: concurrentPhone, status: 'SENT', externalMessageIds: ['concurrent-outbound'],
        sentAt: new Date(Date.now() - 60_000),
      });
      const staleDelivered = webhook({ event: 'messages_update', eventId: 'concurrent-delivered', data: {
          messageid: 'concurrent-outbound', sender: concurrentPhone, status: 'Delivered',
        } });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const freshRead = webhook({ event: 'messages_update', eventId: 'concurrent-read', data: {
        messageid: 'concurrent-outbound', sender: concurrentPhone, status: 'Read',
      } });
      await Promise.all([staleDelivered, freshRead]);
      expect(await prisma.whatsAppRecipient.findUnique({
        where: { id: 'webhook-concurrent-recipient' },
      })).toMatchObject({ status: 'READ' });

      const canceledPhone = '5511962222222';
      await createCampaign('webhook-canceled-campaign', coordinatorId, 'QUEUED');
      await createRecipient({
        id: 'webhook-canceled-recipient', campaignId: 'webhook-canceled-campaign',
        phone: canceledPhone, status: 'QUEUED', externalMessageIds: ['canceled-outbound'],
      });
      const staleAfterOptOut = webhook({
        event: 'messages_update', eventId: 'delivery-after-optout', data: {
          messageid: 'canceled-outbound', sender: canceledPhone, status: 'Delivered',
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const optOut = webhook({ event: 'messages', eventId: 'concurrent-optout', data: {
        messageid: 'concurrent-optout-message', sender: canceledPhone, fromMe: false, text: 'SAIR.',
      } });
      await Promise.all([staleAfterOptOut, optOut]);
      expect(await prisma.whatsAppRecipient.findUnique({
        where: { id: 'webhook-canceled-recipient' },
      })).toMatchObject({ status: 'CANCELED' });
      await basePrisma.$executeRawUnsafe('DROP TRIGGER test_delay_webhook_delivery_trigger ON whatsapp_interactions');
      await basePrisma.$executeRawUnsafe('DROP FUNCTION test_delay_webhook_delivery()');
    });

    test('rolls back marker and effects together so a failed event can retry exactly once', async () => {
      const rollbackPhone = '5511963333333';
      await createCampaign('webhook-rollback-campaign', coordinatorId, 'SENDING');
      await createRecipient({
        id: 'webhook-rollback-recipient', campaignId: 'webhook-rollback-campaign',
        phone: rollbackPhone, status: 'SENT', externalMessageIds: ['rollback-outbound'],
        sentAt: new Date(Date.now() - 60_000),
      });
      await basePrisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_fail_webhook_processed_trigger ON whatsapp_interactions');
      await basePrisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS test_fail_webhook_processed()');
      await basePrisma.$executeRawUnsafe(`
        CREATE FUNCTION test_fail_webhook_processed() RETURNS trigger AS $$
        BEGIN
          IF NEW.external_id = 'rollback-event' AND NEW.status = 'PROCESSED' THEN
            RAISE EXCEPTION 'deterministic webhook effect failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      await basePrisma.$executeRawUnsafe(`
        CREATE TRIGGER test_fail_webhook_processed_trigger
        BEFORE UPDATE ON whatsapp_interactions
        FOR EACH ROW EXECUTE FUNCTION test_fail_webhook_processed()
      `);
      const payload = { event: 'messages', eventId: 'rollback-event', data: {
        messageid: 'rollback-inbound', sender: rollbackPhone, fromMe: false,
        text: 'Quero responder', quoted: { messageid: 'rollback-outbound' },
      } };
      let failed;
      try {
        failed = await webhook(payload);
      } finally {
        await basePrisma.$executeRawUnsafe('DROP TRIGGER test_fail_webhook_processed_trigger ON whatsapp_interactions');
        await basePrisma.$executeRawUnsafe('DROP FUNCTION test_fail_webhook_processed()');
      }
      expect(failed.statusCode).toBe(500);
      expect(await prisma.whatsAppInteraction.count({ where: { externalId: 'rollback-event' } })).toBe(0);
      expect(await prisma.whatsAppCampaign.findUnique({
        where: { id: 'webhook-rollback-campaign' },
      })).toMatchObject({ replyCount: 0 });

      const retried = await webhook(payload);
      expect(retried.json()).toEqual({ accepted: true, processed: true, duplicate: false });
      expect(await prisma.whatsAppInteraction.count({ where: { externalId: 'rollback-event' } })).toBe(1);
      expect(await prisma.whatsAppCampaign.findUnique({
        where: { id: 'webhook-rollback-campaign' },
      })).toMatchObject({ replyCount: 1 });
    });

    test('phone fallback requires a real sentAt and ignores null-only candidates', async () => {
      const fallbackPhone = '5511964444444';
      await createCampaign('webhook-fallback-real-campaign', coordinatorId, 'SENDING');
      await createRecipient({
        id: 'webhook-fallback-real', campaignId: 'webhook-fallback-real-campaign',
        phone: fallbackPhone, status: 'SENT', sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      });
      await createCampaign('webhook-fallback-null-campaign', coordinatorId, 'SENDING');
      await createRecipient({
        id: 'webhook-fallback-null', campaignId: 'webhook-fallback-null-campaign',
        phone: fallbackPhone, status: 'SENT',
      });
      await webhook({ event: 'messages', eventId: 'fallback-real-event', data: {
        messageid: 'fallback-real-message', sender: fallbackPhone, fromMe: false, text: 'Resposta',
      } });
      expect(await prisma.whatsAppInteraction.findUnique({
        where: { tenantId_externalId: { tenantId: tenant.id, externalId: 'fallback-real-event' } },
      })).toMatchObject({ recipientId: 'webhook-fallback-real', campaignId: 'webhook-fallback-real-campaign' });

      const nullOnlyPhone = '5511965555555';
      await createCampaign('webhook-null-only-campaign', coordinatorId, 'SENDING');
      await createRecipient({
        id: 'webhook-null-only-recipient', campaignId: 'webhook-null-only-campaign',
        phone: nullOnlyPhone, status: 'SENT',
      });
      const before = await prisma.whatsAppInteraction.count();
      const ignored = await webhook({ event: 'messages', eventId: 'fallback-null-only-event', data: {
        messageid: 'fallback-null-only-message', sender: nullOnlyPhone, fromMe: false, text: 'Sem envio real',
      } });
      expect(ignored.json()).toEqual({ accepted: true, processed: false, duplicate: false });
      expect(await prisma.whatsAppInteraction.count()).toBe(before);
    });
  });

  describe('suppression audit routes', () => {
    test('requires a manual reason and explicit consent to record coordinator reauthorization', async () => {
      const missingReason = await app.inject({
        method: 'POST', url: '/whatsapp/suppressions', headers: auth(), payload: { phone: '(21) 99876-5432' },
      });
      expect(missingReason.statusCode).toBe(400);

      const created = await app.inject({
        method: 'POST', url: '/whatsapp/suppressions', headers: auth(),
        payload: { phone: '(21) 99876-5432', reason: 'Pedido por telefone' },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().suppression).toMatchObject({
        phoneNormalized: '5521998765432', active: true,
        reason: 'Pedido por telefone', source: 'MANUAL', createdById: coordinatorId,
      });
      const suppressionId = created.json().suppression.id;

      const denied = await app.inject({
        method: 'POST', url: `/whatsapp/suppressions/${suppressionId}/reauthorize`, headers: auth(),
        payload: { consentimentoConfirmado: false },
      });
      expect(denied.statusCode).toBe(400);

      const reauthorized = await app.inject({
        method: 'POST', url: `/whatsapp/suppressions/${suppressionId}/reauthorize`, headers: auth(),
        payload: { consentimentoConfirmado: true },
      });
      expect(reauthorized.statusCode).toBe(200);
      expect(reauthorized.json().suppression).toMatchObject({
        id: suppressionId, active: false, reauthorizedById: coordinatorId,
      });
      expect(reauthorized.json().suppression.reauthorizedAt).toBeString();

      const audit = await app.inject({ method: 'GET', url: '/whatsapp/suppressions', headers: auth() });
      expect(audit.statusCode).toBe(200);
      expect(audit.json().suppressions.some((item: any) => item.id === suppressionId)).toBe(true);
    });
  });
}

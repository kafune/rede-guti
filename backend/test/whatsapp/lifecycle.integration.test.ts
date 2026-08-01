import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';

if (process.env.LIFECYCLE_SCENARIO_CHILD !== '1') {
  test('runs the campaign lifecycle integration scenario in an isolated process', () => {
    const result = Bun.spawnSync({
      cmd: [process.execPath, 'test', 'test/whatsapp/lifecycle.integration.test.ts'],
      cwd: new URL('../../', import.meta.url).pathname,
      env: { ...process.env, LIFECYCLE_SCENARIO_CHILD: '1' },
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
  process.env.JWT_SECRET = 'lifecycle-test-secret';
  process.env.WHATSAPP_ENCRYPTION_KEY = '44'.repeat(32);
  process.env.PUBLIC_API_URL = 'https://api.example.test';
  process.env.UAZAPI_WEBHOOK_SECRET = 'lifecycle-webhook-secret';

  let upstream: FastifyInstance;
  let app: FastifyInstance;
  let basePrisma: any;
  let prisma: any;
  let coordinatorToken: string;
  let retryCoordinatorToken: string;
  const tenant = { id: 'lifecycle-tenant', slug: 'lifecycle-tenant', name: 'Lifecycle Tenant' };
  const coordinatorId = 'lifecycle-coordinator';
  const retryCoordinatorId = 'lifecycle-retry-coordinator';
  const requests: Array<{ method: string; url: string; body: any }> = [];
  let nextFolder = 1;
  let failNextAdvanced = false;
  let failStopFolder: string | null = null;
  let concurrentStopGate: {
    folderId: string;
    entered: number;
    firstEntered: ReturnType<typeof deferred>;
    bothEntered: ReturnType<typeof deferred>;
  } | null = null;
  let raceAfterEdit: { folderId: string; campaignId: string; status: 'COMPLETED' | 'CANCELED' } | null = null;
  let messagesBarrier: {
    folderId: string;
    entered: Promise<void>;
    markEntered: () => void;
    released: Promise<void>;
    release: () => void;
  } | null = null;

  const content = {
    primary: { type: 'text', text: 'Olá, {{primeiro_nome}}' },
    sequence: [],
  };

  const folderStatuses = new Map<string, string>([
    ['folder-sync', 'done'],
    ['folder-canceled-terminal', 'sending'],
    ['folder-completed-terminal', 'sending'],
  ]);
  const folderMessages = new Map<string, unknown[]>();

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
  }

  function messagesFor(folderId: string, offset: number) {
    if (folderId !== 'folder-sync') return offset === 0 ? folderMessages.get(folderId) ?? [] : [];
    if (offset === 0) {
      return [
        {
          messageid: 'message-read', chatid: '5511987654321@s.whatsapp.net',
          sender: '5511987654321', status: 'Read', timestamp: '2026-08-01T10:03:00.000Z',
        },
        {
          messageid: 'message-scheduled-late', chatid: '5511987654321@s.whatsapp.net',
          sender: '5511987654321', status: 'Scheduled', timestamp: '2026-08-01T10:04:00.000Z',
        },
        ...Array.from({ length: 998 }, (_, index) => ({
          messageid: `noise-${index}`, chatid: `5599${String(index).padStart(9, '0')}@s.whatsapp.net`,
          sender: `5599${String(index).padStart(9, '0')}`, status: 'Scheduled',
        })),
      ];
    }
    if (offset === 1000) {
      return [{
        messageid: 'message-sent', chatid: '5511976543210@s.whatsapp.net',
        sender: '5511976543210', status: 'Sent',
        messageTimestamp: '2026-08-01T11:05:00.000Z',
        timestamp: '2020-01-01T00:00:00.000Z',
      }];
    }
    return [];
  }

  beforeAll(async () => {
    upstream = Fastify({ logger: false });
    upstream.get('/sender/listfolders', async (request) => {
      requests.push({ method: request.method, url: request.url, body: request.body });
      return [...folderStatuses].map(([id, status]) => ({ folder_id: id, status }));
    });
    upstream.post('/sender/listmessages', async (request) => {
      requests.push({ method: request.method, url: request.url, body: request.body });
      const body = request.body as { folder_id: string; offset?: number };
      if (messagesBarrier?.folderId === body.folder_id && (body.offset ?? 0) === 0) {
        messagesBarrier.markEntered();
        await messagesBarrier.released;
      }
      const messages = messagesFor(body.folder_id, body.offset ?? 0);
      return { messages, total: body.folder_id === 'folder-sync' ? 1001 : messages.length };
    });
    upstream.post('/sender/edit', async (request, reply) => {
      requests.push({ method: request.method, url: request.url, body: request.body });
      const body = request.body as { folder_id: string; action: 'stop' | 'continue' | 'delete' };
      if (body.action === 'stop' && concurrentStopGate?.folderId === body.folder_id) {
        concurrentStopGate.entered += 1;
        if (concurrentStopGate.entered === 1) concurrentStopGate.firstEntered.resolve();
        if (concurrentStopGate.entered === 2) concurrentStopGate.bothEntered.resolve();
        await Promise.race([
          concurrentStopGate.bothEntered.promise,
          new Promise<void>((resolve) => setTimeout(resolve, 100)),
        ]);
      }
      if (body.action === 'stop' && body.folder_id === failStopFolder) {
        failStopFolder = null;
        return reply.code(500).send({ error: 'stop failed' });
      }
      const status = body.action === 'stop' ? 'paused' : body.action === 'continue' ? 'scheduled' : 'deleting';
      folderStatuses.set(body.folder_id, status);
      if (raceAfterEdit?.folderId === body.folder_id) {
        await basePrisma.whatsAppCampaign.update({
          where: { id: raceAfterEdit.campaignId },
          data: {
            status: raceAfterEdit.status,
            ...(raceAfterEdit.status === 'COMPLETED' ? { completedAt: new Date() } : { canceledAt: new Date() }),
          },
        });
        folderStatuses.set(body.folder_id, raceAfterEdit.status === 'COMPLETED' ? 'done' : 'deleting');
        raceAfterEdit = null;
      }
      return reply.send({ folder_id: body.folder_id, status });
    });
    upstream.post('/sender/advanced', async (request, reply) => {
      requests.push({ method: request.method, url: request.url, body: request.body });
      if (failNextAdvanced) {
        failNextAdvanced = false;
        return reply.code(500).send({ error: 'replacement failed' });
      }
      const folderId = `folder-new-${nextFolder++}`;
      folderStatuses.set(folderId, 'scheduled');
      return { folder_id: folderId, status: 'scheduled', created_at: '2026-08-01T12:00:00.000Z' };
    });
    await upstream.listen({ host: '127.0.0.1', port: 0 });
    const address = upstream.server.address();
    if (!address || typeof address === 'string') throw new Error('missing upstream address');
    process.env.UAZAPI_BASE_URL = `http://127.0.0.1:${address.port}`;

    const [{ buildApp }, db, tenantContext, crypto] = await Promise.all([
      import('../../src/app.js'),
      import('../../src/db.js'),
      import('../../src/lib/tenantContext.js'),
      import('../../src/whatsapp/domain/crypto.js'),
    ]);
    basePrisma = db.basePrisma;
    prisma = db.prisma;
    await basePrisma.whatsAppInteraction.deleteMany({ where: { tenantId: tenant.id } });
    await basePrisma.whatsAppRecipient.deleteMany({ where: { tenantId: tenant.id } });
    await basePrisma.whatsAppCampaign.deleteMany({ where: { tenantId: tenant.id } });
    await basePrisma.whatsAppSuppression.deleteMany({ where: { tenantId: tenant.id } });
    await basePrisma.whatsAppConfig.deleteMany({ where: { tenantId: tenant.id } });
    await basePrisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await basePrisma.tenant.upsert({ where: { id: tenant.id }, update: tenant, create: tenant });
    await basePrisma.user.create({ data: {
      id: coordinatorId, tenantId: tenant.id, email: 'coord@lifecycle.test',
      passwordHash: 'unused', role: 'COORDENADOR', active: true,
    } });
    await basePrisma.user.create({ data: {
      id: retryCoordinatorId, tenantId: tenant.id, email: 'retry-coord@lifecycle.test',
      passwordHash: 'unused', role: 'COORDENADOR', active: true,
    } });
    await basePrisma.whatsAppConfig.create({ data: {
      tenantId: tenant.id,
      instanceId: 'lifecycle-instance', instanceName: 'Lifecycle', status: 'connected',
      instanceTokenEncrypted: crypto.encryptSecret('lifecycle-instance-token', process.env.WHATSAPP_ENCRYPTION_KEY!),
    } });
    tenantContext.setCurrentTenant(tenant);
    app = await buildApp({ logger: false });
    coordinatorToken = app.jwt.sign(
      { sub: coordinatorId, role: 'COORDENADOR', tenantId: tenant.id },
      { expiresIn: '8h' },
    );
    retryCoordinatorToken = app.jwt.sign(
      { sub: retryCoordinatorId, role: 'COORDENADOR', tenantId: tenant.id },
      { expiresIn: '8h' },
    );
  });

  afterAll(async () => {
    await app?.close();
    await upstream?.close();
    await basePrisma?.$disconnect();
  });

  const auth = () => ({ authorization: `Bearer ${coordinatorToken}` });

  async function createCampaign(input: {
    id: string;
    status?: string;
    remoteFolderId?: string;
    scheduledAt?: Date;
    name?: string;
    content?: typeof content | { primary: { type: 'image'; mediaId: string }; sequence: [] };
  }) {
    return basePrisma.whatsAppCampaign.create({ data: {
      id: input.id,
      tenantId: tenant.id,
      createdById: coordinatorId,
      name: input.name ?? input.id,
      category: 'UTILITY',
      audienceFilter: { type: 'SUPPORTERS', selectedIds: [] },
      content: input.content ?? content,
      consentAt: new Date('2026-08-01T08:00:00.000Z'),
      scheduledAt: input.scheduledAt,
      status: input.status ?? 'QUEUED',
      failedCount: input.status === 'FAILED' ? 1 : 0,
      remoteFolderId: input.remoteFolderId,
      validRecipients: 2,
      queuedCount: 2,
      queuedAt: new Date('2026-08-01T09:00:00.000Z'),
    } });
  }

  async function createRecipient(input: {
    id: string;
    campaignId: string;
    phone: string;
    status?: string;
    externalMessageIds?: string[];
    name?: string;
  }) {
    return basePrisma.whatsAppRecipient.create({ data: {
      id: input.id,
      tenantId: tenant.id,
      campaignId: input.campaignId,
      origin: 'MANUAL',
      personName: input.name ?? input.id,
      phoneOriginal: input.phone,
      phoneNormalized: input.phone,
      personalizedContent: { primary: { type: 'text', text: `Olá, ${input.name ?? input.id}` }, sequence: [] },
      status: input.status ?? 'QUEUED',
      externalMessageIds: input.externalMessageIds ?? [],
      isValid: true,
    } });
  }

  describe.serial('campaign synchronization', () => {
    test('paginates remote messages, stores ids, advances recipient states and counts recipients only', async () => {
      await createCampaign({ id: 'campaign-sync', status: 'SENDING', remoteFolderId: 'folder-sync' });
      await createRecipient({ id: 'recipient-read', campaignId: 'campaign-sync', phone: '5511987654321', status: 'READ' });
      await createRecipient({ id: 'recipient-sent', campaignId: 'campaign-sync', phone: '5511976543210', status: 'QUEUED' });

      const response = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-sync/sync', headers: auth(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().campaign).toMatchObject({
        id: 'campaign-sync', status: 'COMPLETED', remoteFolderStatus: 'done',
        queuedCount: 2, sentCount: 2, deliveredCount: 1, readCount: 1, playedCount: 0,
      });

      const recipients = await prisma.whatsAppRecipient.findMany({
        where: { campaignId: 'campaign-sync' }, orderBy: { id: 'asc' },
      });
      expect(recipients.map((recipient: any) => ({
        id: recipient.id, status: recipient.status, externalMessageIds: recipient.externalMessageIds,
      }))).toEqual([
        {
          id: 'recipient-read', status: 'READ',
          externalMessageIds: ['message-read', 'message-scheduled-late'],
        },
        { id: 'recipient-sent', status: 'SENT', externalMessageIds: ['message-sent'] },
      ]);
      expect(recipients.find(({ id }: { id: string }) => id === 'recipient-sent')?.sentAt.toISOString())
        .toBe('2026-08-01T11:05:00.000Z');
      expect(requests.filter(({ url }) => url === '/sender/listmessages').slice(-2).map(({ body }) => body)).toEqual([
        { folder_id: 'folder-sync', limit: 1000, offset: 0 },
        { folder_id: 'folder-sync', limit: 1000, offset: 1000 },
      ]);

      folderStatuses.set('folder-sync', 'sending');
      const delayedFolder = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-sync/sync', headers: auth(),
      });
      expect(delayedFolder.json().campaign).toMatchObject({
        status: 'COMPLETED', remoteFolderStatus: 'done', sentCount: 2, readCount: 1,
      });
    });

    test('never reopens terminal campaigns and batch sync touches active campaigns only', async () => {
      await createCampaign({ id: 'campaign-canceled-terminal', status: 'CANCELED', remoteFolderId: 'folder-canceled-terminal' });
      await createCampaign({ id: 'campaign-completed-terminal', status: 'COMPLETED', remoteFolderId: 'folder-completed-terminal' });
      await createCampaign({ id: 'campaign-active-batch', status: 'QUEUED', remoteFolderId: 'folder-active-batch' });
      folderStatuses.set('folder-active-batch', 'sending');
      const beforeMessages = requests.filter(({ url }) => url === '/sender/listmessages').length;

      const response = await app.inject({ method: 'POST', url: '/whatsapp/campaigns/sync', headers: auth() });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ synced: 1, campaignIds: ['campaign-active-batch'] });
      expect(requests.filter(({ url }) => url === '/sender/listmessages')).toHaveLength(beforeMessages + 1);
      expect((await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-canceled-terminal' } })).status).toBe('CANCELED');
      expect((await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-completed-terminal' } })).status).toBe('COMPLETED');
    });

    test('does not regress a READ webhook that lands while remote sync is waiting', async () => {
      await createCampaign({ id: 'campaign-sync-race', status: 'SENDING', remoteFolderId: 'folder-sync-race' });
      await createRecipient({
        id: 'recipient-sync-race', campaignId: 'campaign-sync-race', phone: '5511988888888',
        status: 'QUEUED', externalMessageIds: ['message-sync-race'],
      });
      folderStatuses.set('folder-sync-race', 'sending');
      folderMessages.set('folder-sync-race', [{
        messageid: 'message-sync-race', chatid: '5511988888888@s.whatsapp.net',
        sender: '5511988888888', status: 'Sent', timestamp: '2026-08-01T10:04:00.000Z',
      }]);
      const entered = deferred();
      const released = deferred();
      messagesBarrier = {
        folderId: 'folder-sync-race', entered: entered.promise, markEntered: entered.resolve,
        released: released.promise, release: released.resolve,
      };

      const syncing = app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-sync-race/sync', headers: auth(),
      });
      await messagesBarrier.entered;
      const webhook = await app.inject({
        method: 'POST', url: '/public/whatsapp/webhook?secret=lifecycle-webhook-secret',
        payload: {
          event: 'messages_update',
          data: {
            messageid: 'message-sync-race', chatid: '5511988888888@s.whatsapp.net',
            sender_pn: '5511988888888', status: 'Read', wasSentByApi: true,
            messageTimestamp: 1785578700,
          },
        },
      });
      expect(webhook.statusCode).toBe(202);
      messagesBarrier.release();
      const response = await syncing;
      messagesBarrier = null;

      expect(response.statusCode).toBe(200);
      expect((await prisma.whatsAppRecipient.findUnique({ where: { id: 'recipient-sync-race' } })).status)
        .toBe('READ');
      expect((await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-sync-race' } })).readCount)
        .toBeGreaterThanOrEqual(1);
    });

    test('atomically preserves message ids added after a sync snapshot was read', async () => {
      await createCampaign({
        id: 'campaign-sync-id-race', status: 'SENDING', remoteFolderId: 'folder-sync-id-race',
      });
      await createRecipient({
        id: 'recipient-sync-id-race', campaignId: 'campaign-sync-id-race',
        phone: '5511987878787', status: 'QUEUED', externalMessageIds: ['existing-message-id'],
      });
      folderStatuses.set('folder-sync-id-race', 'sending');
      folderMessages.set('folder-sync-id-race', [{
        messageid: 'remote-message-id', chatid: '5511987878787@s.whatsapp.net',
        sender: '5511987878787', status: 'Sent', messageTimestamp: '2026-08-01T11:15:00.000Z',
      }]);
      const entered = deferred();
      const released = deferred();
      messagesBarrier = {
        folderId: 'folder-sync-id-race', entered: entered.promise, markEntered: entered.resolve,
        released: released.promise, release: released.resolve,
      };

      const syncing = app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-sync-id-race/sync', headers: auth(),
      });
      await messagesBarrier.entered;
      await prisma.whatsAppRecipient.update({
        where: { id: 'recipient-sync-id-race' },
        data: { externalMessageIds: { push: 'concurrent-message-id' } },
      });
      messagesBarrier.release();
      const response = await syncing;
      messagesBarrier = null;

      expect(response.statusCode).toBe(200);
      expect((await prisma.whatsAppRecipient.findUnique({
        where: { id: 'recipient-sync-id-race' },
      })).externalMessageIds).toEqual([
        'existing-message-id', 'concurrent-message-id', 'remote-message-id',
      ]);
    });

    test('preserves a concurrent completion, terminal folder metadata, and counter maxima during sync', async () => {
      await createCampaign({
        id: 'campaign-sync-complete-race', status: 'SENDING',
        remoteFolderId: 'folder-sync-complete-race',
      });
      await createRecipient({
        id: 'recipient-sync-complete-race', campaignId: 'campaign-sync-complete-race',
        phone: '5511988888877', status: 'QUEUED',
      });
      folderStatuses.set('folder-sync-complete-race', 'sending');
      folderMessages.set('folder-sync-complete-race', [{
        messageid: 'message-sync-complete-race', chatid: '5511988888877@s.whatsapp.net',
        sender: '5511988888877', status: 'Sent', timestamp: '2026-08-01T10:04:00.000Z',
      }]);
      const entered = deferred();
      const released = deferred();
      messagesBarrier = {
        folderId: 'folder-sync-complete-race', entered: entered.promise, markEntered: entered.resolve,
        released: released.promise, release: released.resolve,
      };

      const syncing = app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-sync-complete-race/sync', headers: auth(),
      });
      await messagesBarrier.entered;
      const completedAt = new Date('2026-08-01T10:10:00.000Z');
      await basePrisma.whatsAppCampaign.update({
        where: { id: 'campaign-sync-complete-race' },
        data: {
          status: 'COMPLETED', remoteFolderStatus: 'done', completedAt,
          queuedCount: 9, sentCount: 8, failedCount: 7, deliveredCount: 6,
          readCount: 5, playedCount: 4,
        },
      });
      messagesBarrier.release();
      const response = await syncing;
      messagesBarrier = null;

      expect(response.statusCode).toBe(200);
      expect(response.json().campaign).toMatchObject({
        status: 'COMPLETED', remoteFolderStatus: 'done',
        queuedCount: 9, sentCount: 8, failedCount: 7, deliveredCount: 6,
        readCount: 5, playedCount: 4, completedAt: completedAt.toISOString(),
      });
    });

    test('serializes cancellation after an in-flight sync and preserves deleting metadata', async () => {
      await createCampaign({
        id: 'campaign-sync-cancel-race', status: 'SENDING',
        remoteFolderId: 'folder-sync-cancel-race',
      });
      await createRecipient({
        id: 'recipient-sync-cancel-race', campaignId: 'campaign-sync-cancel-race',
        phone: '5511988888866', status: 'QUEUED',
      });
      folderStatuses.set('folder-sync-cancel-race', 'sending');
      folderMessages.set('folder-sync-cancel-race', [{
        messageid: 'message-sync-cancel-race', chatid: '5511988888866@s.whatsapp.net',
        sender: '5511988888866', status: 'Sent', timestamp: '2026-08-01T10:04:00.000Z',
      }]);
      const entered = deferred();
      const released = deferred();
      messagesBarrier = {
        folderId: 'folder-sync-cancel-race', entered: entered.promise, markEntered: entered.resolve,
        released: released.promise, release: released.resolve,
      };

      const syncing = app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-sync-cancel-race/sync', headers: auth(),
      });
      await messagesBarrier.entered;
      const cancelingRequest = app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-sync-cancel-race/cancel', headers: auth(),
      });
      messagesBarrier.release();
      const response = await syncing;
      const canceling = await cancelingRequest;
      messagesBarrier = null;

      expect(response.statusCode).toBe(200);
      expect(canceling.json().campaign).toMatchObject({
        status: 'CANCELING', remoteFolderStatus: 'deleting',
      });
      expect(await prisma.whatsAppCampaign.findUnique({
        where: { id: 'campaign-sync-cancel-race' },
      })).toMatchObject({ status: 'CANCELING', remoteFolderStatus: 'deleting' });
      expect((await prisma.whatsAppRecipient.findUnique({
        where: { id: 'recipient-sync-cancel-race' },
      })).status).toBe('SENT');

      folderStatuses.delete('folder-sync-cancel-race');
      const confirmed = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-sync-cancel-race/sync', headers: auth(),
      });
      expect(confirmed.json().campaign.status).toBe('CANCELED');
      expect((await prisma.whatsAppRecipient.findUnique({
        where: { id: 'recipient-sync-cancel-race' },
      })).status).toBe('SENT');
    });
  });

  describe.serial('campaign controls', () => {
    test('uses official pause/resume states and confirms deleting cancellation only after the folder disappears', async () => {
      for (const [id, status, folder] of [
        ['campaign-pause', 'SENDING', 'folder-pause'],
        ['campaign-resume', 'PAUSED', 'folder-resume'],
        ['campaign-cancel', 'QUEUED', 'folder-cancel'],
      ] as const) {
        await createCampaign({ id, status, remoteFolderId: folder });
      }
      await createRecipient({ id: 'recipient-cancel', campaignId: 'campaign-cancel', phone: '5511966666666' });

      const pause = await app.inject({ method: 'POST', url: '/whatsapp/campaigns/campaign-pause/pause', headers: auth() });
      const resume = await app.inject({ method: 'POST', url: '/whatsapp/campaigns/campaign-resume/resume', headers: auth() });
      const cancel = await app.inject({ method: 'POST', url: '/whatsapp/campaigns/campaign-cancel/cancel', headers: auth() });
      expect([pause.statusCode, resume.statusCode, cancel.statusCode]).toEqual([200, 200, 200]);
      expect([pause.json().campaign.status, resume.json().campaign.status, cancel.json().campaign.status]).toEqual([
        'PAUSED', 'SCHEDULED', 'CANCELING',
      ]);
      expect(requests.filter(({ url }) => url === '/sender/edit').slice(-3).map(({ body }) => body)).toEqual([
        { folder_id: 'folder-pause', action: 'stop' },
        { folder_id: 'folder-resume', action: 'continue' },
        { folder_id: 'folder-cancel', action: 'delete' },
      ]);
      expect((await prisma.whatsAppRecipient.findUnique({ where: { id: 'recipient-cancel' } })).status).toBe('QUEUED');

      const deleting = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-cancel/sync', headers: auth(),
      });
      expect(deleting.json().campaign.status).toBe('CANCELING');
      folderStatuses.delete('folder-cancel');
      const confirmed = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-cancel/sync', headers: auth(),
      });
      expect(confirmed.json().campaign.status).toBe('CANCELED');
      expect((await prisma.whatsAppRecipient.findUnique({ where: { id: 'recipient-cancel' } })).status).toBe('CANCELED');
    });

    test('rejects controls that would reopen a terminal campaign before calling Uazapi', async () => {
      await createCampaign({ id: 'campaign-terminal-control', status: 'COMPLETED', remoteFolderId: 'folder-terminal-control' });
      const beforeRemote = requests.length;
      const response = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-terminal-control/pause', headers: auth(),
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'Campaign is terminal.' });
      expect(requests).toHaveLength(beforeRemote);
      expect((await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-terminal-control' } })).status).toBe('COMPLETED');
    });

    test('rejects edit and reschedule while asynchronous cancellation is in progress', async () => {
      await createCampaign({
        id: 'campaign-canceling-edit', status: 'CANCELING',
        remoteFolderId: 'folder-canceling-edit', scheduledAt: new Date('2099-01-02T10:00:00.000Z'),
      });
      const beforeRemote = requests.length;
      const edit = await app.inject({
        method: 'PATCH', url: '/whatsapp/campaigns/campaign-canceling-edit', headers: auth(),
        payload: { name: 'Não deve editar' },
      });
      const reschedule = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-canceling-edit/reschedule', headers: auth(),
        payload: { scheduledAt: '2099-01-03T10:00:00.000Z' },
      });

      expect([edit.statusCode, reschedule.statusCode]).toEqual([409, 409]);
      expect(requests).toHaveLength(beforeRemote);
      expect(await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-canceling-edit' } }))
        .toMatchObject({ status: 'CANCELING', remoteFolderId: 'folder-canceling-edit' });
    });

    test('reschedules and edits only unstarted campaigns by stopping, replacing, consolidating and then deleting old', async () => {
      await createCampaign({ id: 'campaign-reschedule', status: 'SCHEDULED', remoteFolderId: 'folder-reschedule', scheduledAt: new Date('2099-01-02T10:00:00.000Z') });
      await createRecipient({ id: 'recipient-reschedule', campaignId: 'campaign-reschedule', phone: '5511955555555', name: 'Maria Silva' });
      const reschedule = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-reschedule/reschedule', headers: auth(),
        payload: { scheduledAt: '2099-02-03T12:30:00.000Z' },
      });
      expect(reschedule.statusCode).toBe(200);
      expect(reschedule.json().campaign).toMatchObject({
        id: 'campaign-reschedule', status: 'SCHEDULED', remoteFolderId: 'folder-new-1',
        scheduledAt: '2099-02-03T12:30:00.000Z',
      });
      expect(requests.slice(-3).map(({ url, body }) => ({ url, body }))).toEqual([
        { url: '/sender/edit', body: { folder_id: 'folder-reschedule', action: 'stop' } },
        { url: '/sender/advanced', body: expect.any(Object) },
        { url: '/sender/edit', body: { folder_id: 'folder-reschedule', action: 'delete' } },
      ]);
      expect(requests.filter(({ url }) => url === '/sender/advanced').at(-1)?.body).toMatchObject({
        info: 'campaign-reschedule', scheduled_for: 4073805000000,
        messages: [{ number: '5511955555555', type: 'text', text: 'Olá, Maria' }],
      });

      const edit = await app.inject({
        method: 'PATCH', url: '/whatsapp/campaigns/campaign-reschedule', headers: auth(),
        payload: {
          name: 'Campanha editada',
          content: { primary: { type: 'text', text: 'Novo texto para {{primeiro_nome}}' }, sequence: [] },
        },
      });
      expect(edit.statusCode).toBe(200);
      expect(edit.json().campaign).toMatchObject({
        name: 'Campanha editada', remoteFolderId: 'folder-new-2',
        content: { primary: { type: 'text', text: 'Novo texto para {{primeiro_nome}}' }, sequence: [] },
      });
      expect(requests.slice(-3).map(({ url, body }) => ({ url, body }))).toEqual([
        { url: '/sender/edit', body: { folder_id: 'folder-new-1', action: 'stop' } },
        { url: '/sender/advanced', body: expect.any(Object) },
        { url: '/sender/edit', body: { folder_id: 'folder-new-1', action: 'delete' } },
      ]);
      expect(requests.filter(({ url }) => url === '/sender/advanced').at(-1)?.body).toMatchObject({
        info: 'Campanha editada',
        messages: [{ number: '5511955555555', type: 'text', text: 'Novo texto para Maria' }],
      });

      await createCampaign({ id: 'campaign-started-edit', status: 'SENDING', remoteFolderId: 'folder-started-edit' });
      await createRecipient({ id: 'recipient-started-edit', campaignId: 'campaign-started-edit', phone: '5511944444444', status: 'SENT' });
      const beforeRemote = requests.length;
      const denied = await app.inject({
        method: 'PATCH', url: '/whatsapp/campaigns/campaign-started-edit', headers: auth(),
        payload: { name: 'Não pode editar' },
      });
      expect(denied.statusCode).toBe(409);
      expect(denied.json()).toEqual({ error: 'Campaign has already started.' });
      expect(requests).toHaveLength(beforeRemote);
    });

    test('resumes the old stopped folder when replacement creation fails', async () => {
      await createCampaign({
        id: 'campaign-replace-remote-fail', status: 'SCHEDULED',
        remoteFolderId: 'folder-replace-remote-fail', scheduledAt: new Date('2099-01-02T10:00:00.000Z'),
      });
      await createRecipient({
        id: 'recipient-replace-remote-fail', campaignId: 'campaign-replace-remote-fail',
        phone: '5511911111111',
      });
      folderStatuses.set('folder-replace-remote-fail', 'scheduled');
      failNextAdvanced = true;
      const response = await app.inject({
        method: 'PATCH', url: '/whatsapp/campaigns/campaign-replace-remote-fail', headers: auth(),
        payload: { name: 'Não consolidada' },
      });

      expect(response.statusCode).toBe(500);
      expect(requests.filter(({ url }) => url === '/sender/edit').slice(-2).map(({ body }) => body)).toEqual([
        { folder_id: 'folder-replace-remote-fail', action: 'stop' },
        { folder_id: 'folder-replace-remote-fail', action: 'continue' },
      ]);
      expect(await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-replace-remote-fail' } })).toMatchObject({
        name: 'campaign-replace-remote-fail', remoteFolderId: 'folder-replace-remote-fail', status: 'SCHEDULED',
      });
      expect(folderStatuses.get('folder-replace-remote-fail')).toBe('scheduled');
    });

    test('deletes the replacement and resumes old when local consolidation fails', async () => {
      await createCampaign({
        id: 'campaign-replace-local-fail', status: 'SCHEDULED',
        remoteFolderId: 'folder-replace-local-fail', scheduledAt: new Date('2099-01-02T10:00:00.000Z'),
      });
      await createRecipient({
        id: 'recipient-replace-local-fail', campaignId: 'campaign-replace-local-fail',
        phone: '5511911111122',
      });
      folderStatuses.set('folder-replace-local-fail', 'scheduled');
      await basePrisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION reject_replacement_consolidation() RETURNS trigger AS $$
        BEGIN
          IF OLD.id = 'campaign-replace-local-fail' AND NEW.remote_folder_id <> OLD.remote_folder_id THEN
            RAISE EXCEPTION 'deterministic consolidation failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      await basePrisma.$executeRawUnsafe(`
        CREATE TRIGGER reject_replacement_consolidation_trigger
        BEFORE UPDATE ON whatsapp_campaigns
        FOR EACH ROW EXECUTE FUNCTION reject_replacement_consolidation()
      `);

      let response;
      try {
        response = await app.inject({
          method: 'PATCH', url: '/whatsapp/campaigns/campaign-replace-local-fail', headers: auth(),
          payload: { name: 'Não persistida' },
        });
      } finally {
        await basePrisma.$executeRawUnsafe(
          'DROP TRIGGER reject_replacement_consolidation_trigger ON whatsapp_campaigns',
        );
        await basePrisma.$executeRawUnsafe('DROP FUNCTION reject_replacement_consolidation()');
      }

      expect(response.statusCode).toBe(503);
      const replacementId = requests.filter(({ url }) => url === '/sender/advanced').at(-1)?.body;
      expect(replacementId).toBeDefined();
      expect(requests.filter(({ url }) => url === '/sender/edit').slice(-3).map(({ body }) => body)).toEqual([
        { folder_id: 'folder-replace-local-fail', action: 'stop' },
        { folder_id: expect.stringMatching(/^folder-new-/), action: 'delete' },
        { folder_id: 'folder-replace-local-fail', action: 'continue' },
      ]);
      expect(await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-replace-local-fail' } })).toMatchObject({
        name: 'campaign-replace-local-fail', remoteFolderId: 'folder-replace-local-fail', status: 'SCHEDULED',
      });
      expect([...folderStatuses].filter(([, status]) => ['scheduled', 'sending', 'paused'].includes(status))
        .map(([id]) => id)).toContain('folder-replace-local-fail');
    });

    test('serializes edit with pause so local status matches the surviving remote folder', async () => {
      await createCampaign({
        id: 'campaign-edit-pause-race', status: 'SENDING',
        remoteFolderId: 'folder-edit-pause-race',
      });
      await createRecipient({
        id: 'recipient-edit-pause-race', campaignId: 'campaign-edit-pause-race',
        phone: '5511925252525', status: 'QUEUED',
      });
      folderStatuses.set('folder-edit-pause-race', 'sending');
      concurrentStopGate = {
        folderId: 'folder-edit-pause-race', entered: 0,
        firstEntered: deferred(), bothEntered: deferred(),
      };

      let edit;
      let pause;
      try {
        edit = app.inject({
          method: 'PATCH', url: '/whatsapp/campaigns/campaign-edit-pause-race', headers: auth(),
          payload: { name: 'Campanha editada antes da pausa' },
        });
        await concurrentStopGate.firstEntered.promise;
        pause = app.inject({
          method: 'POST', url: '/whatsapp/campaigns/campaign-edit-pause-race/pause', headers: auth(),
        });
        [edit, pause] = await Promise.all([edit, pause]);
      } finally {
        concurrentStopGate = null;
      }

      expect([edit.statusCode, pause.statusCode]).toEqual([200, 200]);
      const campaign = await prisma.whatsAppCampaign.findUnique({
        where: { id: 'campaign-edit-pause-race' },
      });
      const survivingFolderId = campaign.remoteFolderId;
      expect(campaign).toMatchObject({
        name: 'Campanha editada antes da pausa', status: 'PAUSED',
        remoteFolderId: expect.stringMatching(/^folder-new-/), remoteFolderStatus: 'paused',
      });
      expect([...folderStatuses]).toContainEqual([survivingFolderId, 'paused']);
      expect([...folderStatuses].filter(([folderId]) =>
        folderId === 'folder-edit-pause-race' || folderId === survivingFolderId)).toEqual([
        ['folder-edit-pause-race', 'deleting'],
        [survivingFolderId, 'paused'],
      ]);
    });

    test('reconciles instead of overwriting a concurrent terminal transition after remote pause', async () => {
      await createCampaign({ id: 'campaign-pause-race', status: 'SENDING', remoteFolderId: 'folder-pause-race' });
      folderStatuses.set('folder-pause-race', 'sending');
      raceAfterEdit = {
        folderId: 'folder-pause-race', campaignId: 'campaign-pause-race', status: 'COMPLETED',
      };

      const response = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-pause-race/pause', headers: auth(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().campaign.status).toBe('COMPLETED');
      expect((await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-pause-race' } })).status)
        .toBe('COMPLETED');
    });

    test('retries failed recipients as a new audit campaign and leaves the terminal original immutable', async () => {
      await createCampaign({ id: 'campaign-retry', status: 'FAILED', remoteFolderId: 'folder-failed' });
      await createRecipient({ id: 'recipient-retry-failed', campaignId: 'campaign-retry', phone: '5511933333333', status: 'FAILED', name: 'Falhou' });
      await createRecipient({ id: 'recipient-retry-read', campaignId: 'campaign-retry', phone: '5511922222222', status: 'READ', name: 'Sucesso', externalMessageIds: ['successful-message'] });
      const originalBefore = await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-retry' } });

      const response = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-retry/retry-failed',
        headers: { authorization: `Bearer ${retryCoordinatorToken}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().campaign).toMatchObject({
        name: 'campaign-retry (retry)', status: 'QUEUED', remoteFolderId: expect.stringMatching(/^folder-new-/),
        createdById: retryCoordinatorId,
        retryOfCampaignId: 'campaign-retry',
        audienceFilter: { type: 'RETRY', retryOfCampaignId: 'campaign-retry' },
        totalRecipients: 1, validRecipients: 1, queuedCount: 1, failedCount: 0,
      });
      expect(response.json().campaign.id).not.toBe('campaign-retry');
      expect(requests.filter(({ url }) => url === '/sender/advanced').at(-1)?.body).toMatchObject({
        info: 'campaign-retry (retry)',
        messages: [{ number: '5511933333333', type: 'text', text: 'Olá, Falhou' }],
      });
      expect(await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-retry' } })).toEqual(originalBefore);
      expect(await prisma.whatsAppRecipient.findUnique({ where: { id: 'recipient-retry-failed' } })).toMatchObject({
        status: 'FAILED',
      });
      expect(await prisma.whatsAppRecipient.findUnique({ where: { id: 'recipient-retry-read' } })).toMatchObject({
        status: 'READ', externalMessageIds: ['successful-message'],
      });
      const retryRecipients = await prisma.whatsAppRecipient.findMany({
        where: { campaignId: response.json().campaign.id },
      });
      expect(retryRecipients).toHaveLength(1);
      expect(retryRecipients[0]).toMatchObject({
        phoneNormalized: '5511933333333', personName: 'Falhou', status: 'QUEUED',
        externalMessageIds: [],
      });
    });

    test('serializes concurrent retries of one parent and returns the same child', async () => {
      await createCampaign({ id: 'campaign-retry-concurrent', status: 'FAILED' });
      await createRecipient({
        id: 'recipient-retry-concurrent', campaignId: 'campaign-retry-concurrent',
        phone: '5511911110001', status: 'FAILED', name: 'Concorrente',
      });
      const beforeAdvanced = requests.filter(({ url }) => url === '/sender/advanced').length;
      const invoke = () => app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-retry-concurrent/retry-failed',
        headers: {
          authorization: `Bearer ${retryCoordinatorToken}`,
          'idempotency-key': 'retry-concurrent-idempotency-key',
        },
      });

      const responses = await Promise.all([invoke(), invoke()]);

      expect(responses.map(({ statusCode }) => statusCode)).toEqual([200, 200]);
      expect(responses[0].json().campaign.id).toBe(responses[1].json().campaign.id);
      expect(responses[0].json().campaign).toMatchObject({
        retryOfCampaignId: 'campaign-retry-concurrent',
        idempotencyKey: 'retry-concurrent-idempotency-key',
      });
      expect(requests.filter(({ url }) => url === '/sender/advanced')).toHaveLength(beforeAdvanced + 1);
      expect(await prisma.whatsAppCampaign.count({
        where: { retryOfCampaignId: 'campaign-retry-concurrent' },
      })).toBe(1);
    });

    test('preflights configuration before creating a retry audit', async () => {
      await createCampaign({ id: 'campaign-retry-preflight', status: 'FAILED' });
      await createRecipient({
        id: 'recipient-retry-preflight', campaignId: 'campaign-retry-preflight',
        phone: '5511911110002', status: 'FAILED', name: 'Preflight',
      });
      const storedConfig = await basePrisma.whatsAppConfig.findUniqueOrThrow({
        where: { tenantId: tenant.id },
      });
      await basePrisma.whatsAppConfig.delete({ where: { tenantId: tenant.id } });
      let response;
      try {
        response = await app.inject({
          method: 'POST', url: '/whatsapp/campaigns/campaign-retry-preflight/retry-failed',
          headers: { authorization: `Bearer ${retryCoordinatorToken}` },
        });
      } finally {
        await basePrisma.whatsAppConfig.create({ data: storedConfig });
      }

      expect(response.statusCode).toBe(503);
      expect(await prisma.whatsAppCampaign.count({
        where: { name: 'campaign-retry-preflight (retry)' },
      })).toBe(0);
    });

    test('preflights frozen media before creating a retry audit', async () => {
      await createCampaign({
        id: 'campaign-retry-media-preflight', status: 'FAILED',
        content: { primary: { type: 'image', mediaId: 'missing-retry-media' }, sequence: [] },
      });
      await createRecipient({
        id: 'recipient-retry-media-preflight', campaignId: 'campaign-retry-media-preflight',
        phone: '5511911110092', status: 'FAILED', name: 'Media preflight',
      });
      const beforeAdvanced = requests.filter(({ url }) => url === '/sender/advanced').length;

      const response = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-retry-media-preflight/retry-failed',
        headers: { authorization: `Bearer ${retryCoordinatorToken}` },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Campaign media is no longer available.' });
      expect(await prisma.whatsAppCampaign.count({
        where: { retryOfCampaignId: 'campaign-retry-media-preflight' },
      })).toBe(0);
      expect(requests.filter(({ url }) => url === '/sender/advanced')).toHaveLength(beforeAdvanced);
    });

    test('marks the child failed if local consolidation fails after remote acceptance', async () => {
      await createCampaign({ id: 'campaign-retry-local-fail', status: 'FAILED' });
      await createRecipient({
        id: 'recipient-retry-local-fail', campaignId: 'campaign-retry-local-fail',
        phone: '5511911110003', status: 'FAILED', name: 'Local fail',
      });
      await basePrisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION reject_retry_queue_consolidation() RETURNS trigger AS $$
        BEGIN
          IF NEW.name = 'campaign-retry-local-fail (retry)' AND NEW.status = 'QUEUED' THEN
            RAISE EXCEPTION 'deterministic retry consolidation failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      await basePrisma.$executeRawUnsafe(`
        CREATE TRIGGER reject_retry_queue_consolidation_trigger
        BEFORE UPDATE ON whatsapp_campaigns
        FOR EACH ROW EXECUTE FUNCTION reject_retry_queue_consolidation()
      `);
      let response;
      try {
        response = await app.inject({
          method: 'POST', url: '/whatsapp/campaigns/campaign-retry-local-fail/retry-failed',
          headers: { authorization: `Bearer ${retryCoordinatorToken}` },
        });
      } finally {
        await basePrisma.$executeRawUnsafe(
          'DROP TRIGGER reject_retry_queue_consolidation_trigger ON whatsapp_campaigns',
        );
        await basePrisma.$executeRawUnsafe('DROP FUNCTION reject_retry_queue_consolidation()');
      }

      expect(response.statusCode).toBe(503);
      const child = await prisma.whatsAppCampaign.findFirstOrThrow({
        where: { retryOfCampaignId: 'campaign-retry-local-fail' },
        include: { recipients: true },
      });
      expect(child).toMatchObject({ status: 'FAILED', failedCount: 1 });
      expect(child.recipients).toHaveLength(1);
      expect(child.recipients[0].status).toBe('FAILED');
    });

    test('allows a terminal failed retry child to be retried as a new parent', async () => {
      await createCampaign({ id: 'campaign-retry-remote-fail', status: 'FAILED' });
      await createRecipient({
        id: 'recipient-retry-remote-fail', campaignId: 'campaign-retry-remote-fail',
        phone: '5511911110004', status: 'FAILED', name: 'Remote fail',
      });
      failNextAdvanced = true;
      const failedResponse = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-retry-remote-fail/retry-failed',
        headers: {
          authorization: `Bearer ${retryCoordinatorToken}`,
          'idempotency-key': 'retry-failed-child-key',
        },
      });
      expect(failedResponse.statusCode).toBe(502);
      const failedChild = await prisma.whatsAppCampaign.findFirstOrThrow({
        where: { retryOfCampaignId: 'campaign-retry-remote-fail' },
      });
      expect(failedChild).toMatchObject({ status: 'FAILED', idempotencyKey: 'retry-failed-child-key' });

      const retried = await app.inject({
        method: 'POST', url: `/whatsapp/campaigns/${failedChild.id}/retry-failed`,
        headers: {
          authorization: `Bearer ${retryCoordinatorToken}`,
          'idempotency-key': 'retry-grandchild-key',
        },
      });
      expect(retried.statusCode).toBe(200);
      expect(retried.json().campaign).toMatchObject({
        status: 'QUEUED', retryOfCampaignId: failedChild.id, idempotencyKey: 'retry-grandchild-key',
      });
    });
  });

  describe.serial('remote suppression reconciliation', () => {
    test('rebuilds a mixed queued folder without the suppressed or already sent contacts', async () => {
      const suppressedPhone = '5511991111001';
      const remainingPhone = '5511991111002';
      const sentPhone = '5511991111003';
      await createCampaign({ id: 'campaign-suppression-mixed', status: 'QUEUED', remoteFolderId: 'folder-suppression-mixed' });
      await createRecipient({ id: 'suppression-mixed-target', campaignId: 'campaign-suppression-mixed', phone: suppressedPhone, status: 'QUEUED' });
      await createRecipient({
        id: 'suppression-mixed-remaining', campaignId: 'campaign-suppression-mixed',
        phone: remainingPhone, status: 'PENDING', externalMessageIds: ['old-remaining-message'],
      });
      await createRecipient({ id: 'suppression-mixed-sent', campaignId: 'campaign-suppression-mixed', phone: sentPhone, status: 'SENT' });
      folderStatuses.set('folder-suppression-mixed', 'sending');
      const before = requests.length;

      const response = await app.inject({
        method: 'POST', url: '/whatsapp/suppressions', headers: auth(),
        payload: { phone: suppressedPhone, reason: 'Pedido manual' },
      });

      expect(response.statusCode).toBe(201);
      expect(requests.slice(before).map(({ url, body }) => ({ url, body }))).toEqual([
        { url: '/sender/edit', body: { folder_id: 'folder-suppression-mixed', action: 'stop' } },
        { url: '/sender/advanced', body: expect.objectContaining({
          messages: [{ number: remainingPhone, type: 'text', text: 'Olá, suppression-mixed-remaining' }],
        }) },
        { url: '/sender/edit', body: { folder_id: 'folder-suppression-mixed', action: 'delete' } },
      ]);
      expect((await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-suppression-mixed' } })).remoteFolderId)
        .toMatch(/^folder-new-/);
      expect((await prisma.whatsAppRecipient.findUnique({ where: { id: 'suppression-mixed-target' } })).status)
        .toBe('CANCELED');
      expect(await prisma.whatsAppRecipient.findUnique({
        where: { id: 'suppression-mixed-remaining' },
      })).toMatchObject({
        status: 'QUEUED', externalMessageIds: [], externalChatId: null,
        queuedAt: expect.any(Date),
      });
      expect((await prisma.whatsAppRecipient.findUnique({ where: { id: 'suppression-mixed-sent' } })).status)
        .toBe('SENT');
    });

    test('serializes two phone suppressions in one campaign and builds only one safe replacement', async () => {
      const firstPhone = '5511993333001';
      const secondPhone = '5511993333002';
      const remainingPhone = '5511993333003';
      await createCampaign({
        id: 'campaign-suppression-concurrent', status: 'QUEUED',
        remoteFolderId: 'folder-suppression-concurrent',
      });
      await createRecipient({
        id: 'suppression-concurrent-first', campaignId: 'campaign-suppression-concurrent',
        phone: firstPhone, status: 'QUEUED',
      });
      await createRecipient({
        id: 'suppression-concurrent-second', campaignId: 'campaign-suppression-concurrent',
        phone: secondPhone, status: 'QUEUED',
      });
      await createRecipient({
        id: 'suppression-concurrent-remaining', campaignId: 'campaign-suppression-concurrent',
        phone: remainingPhone, status: 'PENDING',
      });
      await prisma.whatsAppSuppression.createMany({ data: [
        {
          tenantId: tenant.id, phoneNormalized: firstPhone, active: true,
          reason: 'SAIR', source: 'WEBHOOK', firstOptOutAt: new Date(), lastOptOutAt: new Date(),
        },
        {
          tenantId: tenant.id, phoneNormalized: secondPhone, active: true,
          reason: 'SAIR', source: 'WEBHOOK', firstOptOutAt: new Date(), lastOptOutAt: new Date(),
        },
      ] });
      folderStatuses.set('folder-suppression-concurrent', 'sending');
      concurrentStopGate = {
        folderId: 'folder-suppression-concurrent', entered: 0,
        firstEntered: deferred(), bothEntered: deferred(),
      };
      const before = requests.length;
      const { reconcileSuppressedPhone } = await import('../../src/whatsapp/services/campaign-service.js');

      let results;
      try {
        results = await Promise.allSettled([
          reconcileSuppressedPhone(firstPhone),
          reconcileSuppressedPhone(secondPhone),
        ]);
      } finally {
        concurrentStopGate = null;
      }

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      expect(requests.slice(before).map(({ url, body }) => ({ url, body }))).toEqual([
        {
          url: '/sender/edit',
          body: { folder_id: 'folder-suppression-concurrent', action: 'stop' },
        },
        {
          url: '/sender/advanced',
          body: expect.objectContaining({
            messages: [{ number: remainingPhone, type: 'text', text: 'Olá, suppression-concurrent-remaining' }],
          }),
        },
        {
          url: '/sender/edit',
          body: { folder_id: 'folder-suppression-concurrent', action: 'delete' },
        },
      ]);
      expect(await prisma.whatsAppRecipient.findMany({
        where: { campaignId: 'campaign-suppression-concurrent' }, orderBy: { id: 'asc' },
        select: { id: true, status: true },
      })).toEqual([
        { id: 'suppression-concurrent-first', status: 'CANCELED' },
        { id: 'suppression-concurrent-remaining', status: 'QUEUED' },
        { id: 'suppression-concurrent-second', status: 'CANCELED' },
      ]);
    });

    test('processes more simultaneous route suppressions than the advisory pool capacity', async () => {
      const phones = Array.from({ length: 6 }, (_, index) => `551195550000${index + 1}`);
      const remainingPhone = '5511955500009';
      await createCampaign({
        id: 'campaign-suppression-pool', status: 'QUEUED',
        remoteFolderId: 'folder-suppression-pool',
      });
      for (const [index, phone] of phones.entries()) {
        await createRecipient({
          id: `suppression-pool-${index + 1}`, campaignId: 'campaign-suppression-pool',
          phone, status: 'QUEUED',
        });
      }
      await createRecipient({
        id: 'suppression-pool-remaining', campaignId: 'campaign-suppression-pool',
        phone: remainingPhone, status: 'PENDING',
      });
      folderStatuses.set('folder-suppression-pool', 'sending');

      // Hold all five outer phone-lock connections long enough for them to
      // reach reconciliation together. A nested campaign-lock acquisition
      // then deterministically exhausts the advisory pool.
      await basePrisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION whatsapp_test_delay_pool_suppression()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.reason = 'Teste concorrente do pool' THEN
            PERFORM pg_sleep(0.2);
          END IF;
          RETURN NEW;
        END;
        $$
      `);
      await basePrisma.$executeRawUnsafe(`
        CREATE TRIGGER whatsapp_test_delay_pool_suppression
        BEFORE INSERT OR UPDATE ON whatsapp_suppressions
        FOR EACH ROW EXECUTE FUNCTION whatsapp_test_delay_pool_suppression()
      `);

      let responses;
      try {
        responses = await Promise.all(phones.map((phone) => app.inject({
          method: 'POST', url: '/whatsapp/suppressions', headers: auth(),
          payload: { phone, reason: 'Teste concorrente do pool' },
        })));
      } finally {
        await basePrisma.$executeRawUnsafe(
          'DROP TRIGGER IF EXISTS whatsapp_test_delay_pool_suppression ON whatsapp_suppressions',
        );
        await basePrisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS whatsapp_test_delay_pool_suppression()');
      }

      expect(responses.map(({ statusCode }) => statusCode)).toEqual(Array(6).fill(201));
      expect(await prisma.whatsAppRecipient.findMany({
        where: { campaignId: 'campaign-suppression-pool' }, orderBy: { id: 'asc' },
        select: { id: true, status: true },
      })).toEqual([
        ...phones.map((_, index) => ({ id: `suppression-pool-${index + 1}`, status: 'CANCELED' })),
        { id: 'suppression-pool-remaining', status: 'QUEUED' },
      ]);
    });

    test('waits for remote deletion confirmation when no non-suppressed pending recipient remains', async () => {
      const suppressedPhone = '5511992222001';
      await createCampaign({ id: 'campaign-suppression-empty', status: 'QUEUED', remoteFolderId: 'folder-suppression-empty' });
      await createRecipient({ id: 'suppression-empty-target', campaignId: 'campaign-suppression-empty', phone: suppressedPhone, status: 'QUEUED' });
      await createRecipient({ id: 'suppression-empty-sent', campaignId: 'campaign-suppression-empty', phone: '5511992222002', status: 'READ' });
      folderStatuses.set('folder-suppression-empty', 'sending');
      const advancedBefore = requests.filter(({ url }) => url === '/sender/advanced').length;

      const response = await app.inject({
        method: 'POST', url: '/whatsapp/suppressions', headers: auth(),
        payload: { phone: suppressedPhone, reason: 'Pedido manual' },
      });

      expect(response.statusCode).toBe(201);
      expect(requests.filter(({ url }) => url === '/sender/advanced')).toHaveLength(advancedBefore);
      expect(requests.filter(({ url }) => url === '/sender/edit').slice(-2).map(({ body }) => body)).toEqual([
        { folder_id: 'folder-suppression-empty', action: 'stop' },
        { folder_id: 'folder-suppression-empty', action: 'delete' },
      ]);
      expect(await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-suppression-empty' } })).toMatchObject({
        status: 'CANCELING', remoteFolderId: 'folder-suppression-empty', remoteFolderStatus: 'deleting',
      });
      expect((await prisma.whatsAppRecipient.findUnique({ where: { id: 'suppression-empty-target' } })).status)
        .toBe('CANCELED');
      expect((await prisma.whatsAppRecipient.findUnique({ where: { id: 'suppression-empty-sent' } })).status)
        .toBe('READ');

      folderStatuses.delete('folder-suppression-empty');
      const confirmed = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-suppression-empty/sync', headers: auth(),
      });
      expect(confirmed.json().campaign.status).toBe('CANCELED');
    });

    test('records a reconciliable error and does not claim local cancellation when remote stop fails', async () => {
      const suppressedPhone = '5511993333001';
      await createCampaign({ id: 'campaign-suppression-stop-fail', status: 'QUEUED', remoteFolderId: 'folder-suppression-stop-fail' });
      await createRecipient({ id: 'suppression-stop-fail-target', campaignId: 'campaign-suppression-stop-fail', phone: suppressedPhone, status: 'QUEUED' });
      folderStatuses.set('folder-suppression-stop-fail', 'sending');
      failStopFolder = 'folder-suppression-stop-fail';

      const response = await app.inject({
        method: 'POST', url: '/whatsapp/suppressions', headers: auth(),
        payload: { phone: suppressedPhone, reason: 'Pedido manual' },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: 'Suppression recorded; remote campaign reconciliation is pending.',
      });
      expect((await prisma.whatsAppRecipient.findUnique({ where: { id: 'suppression-stop-fail-target' } })).status)
        .toBe('QUEUED');
      expect(await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-suppression-stop-fail' } })).toMatchObject({
        remoteFolderId: 'folder-suppression-stop-fail',
        lastError: 'Suppression recorded; remote campaign reconciliation is pending.',
      });
      expect(await prisma.whatsAppSuppression.findUnique({
        where: { tenantId_phoneNormalized: { tenantId: tenant.id, phoneNormalized: suppressedPhone } },
      })).toMatchObject({ active: true });
    });
  });
}

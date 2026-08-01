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

  const content = {
    primary: { type: 'text', text: 'Olá, {{primeiro_nome}}' },
    sequence: [],
  };

  const folderStatuses = new Map<string, string>([
    ['folder-sync', 'Completed'],
    ['folder-canceled-terminal', 'Active'],
    ['folder-completed-terminal', 'Active'],
  ]);

  function messagesFor(folderId: string, offset: number) {
    if (folderId !== 'folder-sync') return [];
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
        sender: '5511976543210', status: 'Sent', timestamp: '2026-08-01T10:05:00.000Z',
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
      return { messages: messagesFor(body.folder_id, body.offset ?? 0), total: body.folder_id === 'folder-sync' ? 1001 : 0 };
    });
    upstream.post('/sender/edit', async (request) => {
      requests.push({ method: request.method, url: request.url, body: request.body });
      return { success: true };
    });
    upstream.post('/sender/advanced', async (request) => {
      requests.push({ method: request.method, url: request.url, body: request.body });
      const folderId = `folder-new-${nextFolder++}`;
      folderStatuses.set(folderId, 'Active');
      return { folder_id: folderId, status: 'Active', created_at: '2026-08-01T12:00:00.000Z' };
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
    coordinatorToken = app.jwt.sign({ sub: coordinatorId, role: 'COORDENADOR', tenantId: tenant.id });
    retryCoordinatorToken = app.jwt.sign({ sub: retryCoordinatorId, role: 'COORDENADOR', tenantId: tenant.id });
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
  }) {
    return basePrisma.whatsAppCampaign.create({ data: {
      id: input.id,
      tenantId: tenant.id,
      createdById: coordinatorId,
      name: input.name ?? input.id,
      category: 'UTILITY',
      audienceFilter: { type: 'SUPPORTERS', selectedIds: [] },
      content,
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

  describe('campaign synchronization', () => {
    test('paginates remote messages, stores ids, advances recipient states and counts recipients only', async () => {
      await createCampaign({ id: 'campaign-sync', status: 'SENDING', remoteFolderId: 'folder-sync' });
      await createRecipient({ id: 'recipient-read', campaignId: 'campaign-sync', phone: '5511987654321', status: 'READ' });
      await createRecipient({ id: 'recipient-sent', campaignId: 'campaign-sync', phone: '5511976543210', status: 'QUEUED' });

      const response = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-sync/sync', headers: auth(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().campaign).toMatchObject({
        id: 'campaign-sync', status: 'COMPLETED', remoteFolderStatus: 'Completed',
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
      expect(requests.filter(({ url }) => url === '/sender/listmessages').slice(-2).map(({ body }) => body)).toEqual([
        { folder_id: 'folder-sync', limit: 1000, offset: 0 },
        { folder_id: 'folder-sync', limit: 1000, offset: 1000 },
      ]);

      folderStatuses.set('folder-sync', 'Active');
      const delayedFolder = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/campaign-sync/sync', headers: auth(),
      });
      expect(delayedFolder.json().campaign).toMatchObject({
        status: 'COMPLETED', remoteFolderStatus: 'Completed', sentCount: 2, readCount: 1,
      });
    });

    test('never reopens terminal campaigns and batch sync touches active campaigns only', async () => {
      await createCampaign({ id: 'campaign-canceled-terminal', status: 'CANCELED', remoteFolderId: 'folder-canceled-terminal' });
      await createCampaign({ id: 'campaign-completed-terminal', status: 'COMPLETED', remoteFolderId: 'folder-completed-terminal' });
      await createCampaign({ id: 'campaign-active-batch', status: 'QUEUED', remoteFolderId: 'folder-active-batch' });
      folderStatuses.set('folder-active-batch', 'Active');
      const beforeMessages = requests.filter(({ url }) => url === '/sender/listmessages').length;

      const response = await app.inject({ method: 'POST', url: '/whatsapp/campaigns/sync', headers: auth() });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ synced: 1, campaignIds: ['campaign-active-batch'] });
      expect(requests.filter(({ url }) => url === '/sender/listmessages')).toHaveLength(beforeMessages + 1);
      expect((await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-canceled-terminal' } })).status).toBe('CANCELED');
      expect((await prisma.whatsAppCampaign.findUnique({ where: { id: 'campaign-completed-terminal' } })).status).toBe('COMPLETED');
    });
  });

  describe('campaign controls', () => {
    test('maps pause, resume and cancel to stop, continue and delete and keeps cancellation local', async () => {
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
        'PAUSED', 'SENDING', 'CANCELED',
      ]);
      expect(requests.filter(({ url }) => url === '/sender/edit').slice(-3).map(({ body }) => body)).toEqual([
        { folder_id: 'folder-pause', action: 'stop' },
        { folder_id: 'folder-resume', action: 'continue' },
        { folder_id: 'folder-cancel', action: 'delete' },
      ]);
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

    test('reschedules and edits only unstarted campaigns by deleting and recreating their folder', async () => {
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
      expect(requests.filter(({ url }) => url === '/sender/edit').at(-1)?.body).toEqual({
        folder_id: 'folder-reschedule', action: 'delete',
      });
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
      expect(requests.filter(({ url }) => url === '/sender/edit').at(-1)?.body).toEqual({
        folder_id: 'folder-new-1', action: 'delete',
      });
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
        name: 'campaign-retry (retry)', status: 'QUEUED', remoteFolderId: 'folder-new-3',
        createdById: retryCoordinatorId,
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
  });
}

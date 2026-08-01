import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';

if (process.env.CAMPAIGN_CREATE_SCENARIO_CHILD !== '1') {
  test('runs the campaign creation integration scenario in an isolated process', () => {
    const result = Bun.spawnSync({
      cmd: [process.execPath, 'test', 'test/whatsapp/campaign-create.integration.test.ts'],
      cwd: new URL('../../', import.meta.url).pathname,
      env: { ...process.env, CAMPAIGN_CREATE_SCENARIO_CHILD: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (result.exitCode !== 0) {
      throw new Error(`${result.stdout.toString()}\n${result.stderr.toString()}`);
    }
    expect(result.exitCode).toBe(0);
  }, 30_000);
} else {
const databaseUrl = process.env.DATABASE_URL
  ?? 'postgresql://postgres:postgres@localhost:5432/rede_evangelica_uazapi_task3_codex?schema=public';
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'campaign-create-test-secret';
process.env.WHATSAPP_ENCRYPTION_KEY = '22'.repeat(32);
process.env.PUBLIC_API_URL = 'https://api.example.test';
process.env.WHATSAPP_DELAY_MIN = '7';
process.env.WHATSAPP_DELAY_MAX = '13';
process.env.WHATSAPP_MASS_MAX_RECIPIENTS = '1000';

let upstream: FastifyInstance;
let app: FastifyInstance;
let basePrisma: any;
let prisma: any;
let coordinatorToken: string;
let leaderToken: string;
let verifierToken: string;
const requests: Array<{ url: string; headers: any; body: any }> = [];
let upstreamFailure = false;

const tenantA = { id: 'campaign-create-tenant-a', slug: 'campaign-create-a', name: 'Campaign Create A' };
const tenantB = { id: 'campaign-create-tenant-b', slug: 'campaign-create-b', name: 'Campaign Create B' };
const campaignContent = {
  primary: { type: 'text', text: 'Olá, {{primeiro_nome}}' },
  sequence: [{ type: 'image', mediaId: 'image-1', caption: 'Imagem para {{nome}}' }],
};
const audienceFilter = {
  type: 'SUPPORTERS',
  selectedIds: [
    'campaign-supporter-a', 'campaign-supporter-bad',
    'campaign-supporter-duplicate', 'campaign-supporter-suppressed',
  ],
};

beforeAll(async () => {
  upstream = Fastify({ logger: false });
  upstream.post('/sender/advanced', async (request, reply) => {
    requests.push({ url: request.url, headers: request.headers, body: request.body });
    if (upstreamFailure) {
      return reply.code(500).send({ error: 'token=plain-instance-token; banco interno indisponível' });
    }
    return { folder_id: 'folder-campaign-1', status: 'scheduled', created_at: '2026-08-01T12:00:00Z', token: 'remote-secret' };
  });
  upstream.post('/sender/edit', async (request) => {
    requests.push({ url: request.url, headers: request.headers, body: request.body });
    const body = request.body as { folder_id: string; action: 'stop' | 'continue' | 'delete' };
    return {
      folder_id: body.folder_id,
      status: body.action === 'stop' ? 'paused' : body.action === 'continue' ? 'scheduled' : 'deleting',
    };
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
  await basePrisma.tenant.createMany({ data: [tenantA, tenantB], skipDuplicates: true });
  tenantContext.setCurrentTenant(tenantA);

  const testTenants = { in: [tenantA.id, tenantB.id] };
  await basePrisma.whatsAppInteraction.deleteMany({ where: { tenantId: testTenants } });
  await basePrisma.whatsAppRecipient.deleteMany({ where: { tenantId: testTenants } });
  await basePrisma.whatsAppCampaign.deleteMany({ where: { tenantId: testTenants } });
  await basePrisma.whatsAppSuppression.deleteMany({ where: { tenantId: testTenants } });
  await basePrisma.whatsAppConfig.deleteMany({ where: { tenantId: testTenants } });
  await basePrisma.whatsAppMedia.deleteMany({ where: { tenantId: testTenants } });
  await basePrisma.whatsAppTemplate.deleteMany({ where: { tenantId: testTenants } });
  await basePrisma.indication.deleteMany({ where: { tenantId: testTenants } });
  await basePrisma.church.deleteMany({ where: { tenantId: testTenants } });
  await basePrisma.municipality.deleteMany({ where: { tenantId: testTenants } });
  await basePrisma.user.deleteMany({ where: { tenantId: testTenants } });

  await basePrisma.user.createMany({ data: [
    { id: 'campaign-coordinator', tenantId: tenantA.id, email: 'coord@campaign.test', name: 'Coordenador', passwordHash: 'unused', role: 'COORDENADOR', active: true },
    { id: 'campaign-leader', tenantId: tenantA.id, email: 'leader@campaign.test', name: 'Líder', passwordHash: 'unused', role: 'LIDER_REGIONAL', active: true },
    { id: 'campaign-verifier', tenantId: tenantA.id, email: 'verifier@campaign.test', name: 'Verificadora', passwordHash: 'unused', role: 'VERIFICADORA', active: true },
    { id: 'campaign-coordinator-b', tenantId: tenantB.id, email: 'coord@campaign-b.test', name: 'Outro', passwordHash: 'unused', role: 'COORDENADOR', active: true },
  ], skipDuplicates: true });
  await basePrisma.church.create({ data: { id: 'campaign-church', tenantId: tenantA.id, name: 'Igreja Campanha' } });
  await basePrisma.municipality.createMany({ data: [
    { id: 'campaign-city', tenantId: tenantA.id, name: 'Cidade Campanha', stateCode: 'SP' },
    { id: 'campaign-bulk-city', tenantId: tenantA.id, name: 'Cidade Volume', stateCode: 'SP' },
  ], skipDuplicates: true });
  await basePrisma.indication.createMany({ data: [
    {
      id: 'campaign-supporter-a', tenantId: tenantA.id, name: 'Maria Congelada', phone: '(11) 98765-4321', status: 'ATIVO',
      indicatedBy: 'Líder',
      createdById: 'campaign-leader', indicatedByUserId: 'campaign-leader', churchId: 'campaign-church', municipalityId: 'campaign-city',
    },
    {
      id: 'campaign-supporter-bad', tenantId: tenantA.id, name: 'Sem Telefone', phone: '123', status: 'ATIVO',
      indicatedBy: 'Líder',
      createdById: 'campaign-leader', indicatedByUserId: 'campaign-leader', churchId: 'campaign-church', municipalityId: 'campaign-city',
    },
    {
      id: 'campaign-supporter-duplicate', tenantId: tenantA.id, name: 'Maria Duplicada', phone: '+55 11 98765-4321', status: 'ATIVO',
      indicatedBy: 'Líder',
      createdById: 'campaign-leader', indicatedByUserId: 'campaign-leader', churchId: 'campaign-church', municipalityId: 'campaign-city',
    },
    {
      id: 'campaign-supporter-suppressed', tenantId: tenantA.id, name: 'Pessoa Suprimida', phone: '(11) 97654-3210', status: 'ATIVO',
      indicatedBy: 'Líder',
      createdById: 'campaign-leader', indicatedByUserId: 'campaign-leader', churchId: 'campaign-church', municipalityId: 'campaign-city',
    },
  ], skipDuplicates: true });
  await basePrisma.whatsAppSuppression.create({ data: {
    tenantId: tenantA.id, phoneNormalized: '5511976543210', active: true, reason: 'Opt-out',
  } });
  await basePrisma.whatsAppConfig.upsert({
    where: { tenantId: tenantA.id }, update: {},
    create: {
      tenantId: tenantA.id, instanceId: 'instance-campaign', instanceName: 'Campanhas', status: 'connected',
      instanceTokenEncrypted: crypto.encryptSecret('plain-instance-token', process.env.WHATSAPP_ENCRYPTION_KEY!),
    },
  });
  await basePrisma.whatsAppMedia.create({
    data: {
      id: 'image-1', tenantId: tenantA.id, uploadedById: 'campaign-coordinator',
      filename: 'campanha.png', mimeType: 'image/png', sizeBytes: 3,
      bytes: new Uint8Array([1, 2, 3]), publicToken: 'campaign-media-opaque-public-token',
    },
  });

  app = await buildApp({ logger: false });
  coordinatorToken = app.jwt.sign({ sub: 'campaign-coordinator', role: 'COORDENADOR', tenantId: tenantA.id });
  leaderToken = app.jwt.sign({ sub: 'campaign-leader', role: 'LIDER_REGIONAL', tenantId: tenantA.id });
  verifierToken = app.jwt.sign({ sub: 'campaign-verifier', role: 'VERIFICADORA', tenantId: tenantA.id });
});

afterAll(async () => {
  await app?.close();
  await upstream?.close();
  await basePrisma?.$disconnect();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('campaign preview and test send', () => {
  test('forbids leaders and verifiers and previews all audit rows with frozen personalized samples', async () => {
    for (const token of [leaderToken, verifierToken]) {
      const denied = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns/preview', headers: auth(token),
        payload: { category: 'MARKETING', audienceFilter, content: campaignContent },
      });
      expect(denied.statusCode).toBe(403);
    }

    const response = await app.inject({
      method: 'POST', url: '/whatsapp/campaigns/preview', headers: auth(coordinatorToken),
      payload: { category: 'MARKETING', audienceFilter, content: campaignContent },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().totals).toEqual({ source: 4, valid: 1, invalid: 1, duplicate: 1, suppressed: 1 });
    expect(response.json().samples).toEqual([{
      sourceId: 'campaign-supporter-a', personName: 'Maria Congelada', phoneNormalized: '5511987654321',
      content: {
        primary: { type: 'text', text: 'Olá, Maria' },
        sequence: [{
          type: 'image', mediaId: 'image-1',
          caption: 'Imagem para Maria Congelada\n\nPara não receber mais mensagens, responda SAIR.',
        }],
      },
    }]);
  });

  test('sends one normalized Brazilian test number without creating campaign audit rows', async () => {
    const beforeCampaigns = await prisma.whatsAppCampaign.count();
    const beforeRecipients = await prisma.whatsAppRecipient.count();
    const response = await app.inject({
      method: 'POST', url: '/whatsapp/campaigns/test', headers: auth(coordinatorToken),
      payload: { phone: '(21) 99876-5432', name: 'João Teste', category: 'UTILITY', content: campaignContent },
    });

    expect(response.statusCode).toBe(200);
    expect(requests.at(-1)).toMatchObject({
      url: '/sender/advanced',
      body: {
        delayMin: 7,
        delayMax: 13,
        info: 'Envio de teste',
        messages: [
          { number: '5521998765432', type: 'text', text: 'Olá, João' },
          {
            number: '5521998765432', type: 'image', file: 'https://api.example.test/public/whatsapp/media/campaign-media-opaque-public-token',
            text: 'Imagem para João Teste',
          },
        ],
      },
    });
    expect(await prisma.whatsAppCampaign.count()).toBe(beforeCampaigns);
    expect(await prisma.whatsAppRecipient.count()).toBe(beforeRecipients);
  });
});

describe('campaign creation', () => {
  test('requires only literal consentimentoConfirmado true before persisting or calling Uazapi', async () => {
    const beforeRequests = requests.length;
    for (const consentFields of [
      {},
      { consentimentoConfirmado: false },
      { consent: true },
    ]) {
      const response = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns', headers: auth(coordinatorToken),
        payload: {
          name: 'Sem consentimento', category: 'UTILITY', audienceFilter, content: campaignContent,
          ...consentFields,
        },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(requests).toHaveLength(beforeRequests);
    expect(await prisma.whatsAppCampaign.count({ where: { name: 'Sem consentimento' } })).toBe(0);
  });

  test('persists frozen audit rows and sends every personalized item through v2.1.1 with UTC milliseconds', async () => {
    const scheduledAt = '2026-08-02T09:30:00-03:00';
    const response = await app.inject({
      method: 'POST', url: '/whatsapp/campaigns', headers: auth(coordinatorToken),
      payload: {
        name: 'Campanha agendada', category: 'MARKETING', audienceFilter, content: campaignContent,
        consentimentoConfirmado: true, scheduledAt,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().campaign).toMatchObject({
      name: 'Campanha agendada', status: 'SCHEDULED', remoteFolderId: 'folder-campaign-1',
      remoteFolderStatus: 'scheduled', totalRecipients: 4, validRecipients: 1, excludedRecipients: 3,
      queuedCount: 1,
    });

    expect(requests.at(-1)).toMatchObject({
      url: '/sender/advanced',
      headers: { token: 'plain-instance-token' },
      body: {
        delayMin: 7,
        delayMax: 13,
        info: 'Campanha agendada',
        scheduled_for: 1785673800000,
        messages: [
          { number: '5511987654321', type: 'text', text: 'Olá, Maria' },
          {
            number: '5511987654321', type: 'image', file: 'https://api.example.test/public/whatsapp/media/campaign-media-opaque-public-token',
            text: 'Imagem para Maria Congelada\n\nPara não receber mais mensagens, responda SAIR.',
          },
        ],
      },
    });

    const campaign = await prisma.whatsAppCampaign.findUnique({
      where: { id: response.json().campaign.id }, include: { recipients: { orderBy: { sourceId: 'asc' } } },
    });
    expect(campaign.createdById).toBe('campaign-coordinator');
    expect(campaign.consentAt).toBeInstanceOf(Date);
    expect(campaign.scheduledAt.toISOString()).toBe('2026-08-02T12:30:00.000Z');
    expect(campaign.recipients.map((recipient: any) => ({
      sourceId: recipient.sourceId, isValid: recipient.isValid, reason: recipient.exclusionReason,
      status: recipient.status, content: recipient.personalizedContent,
    }))).toEqual([
      {
        sourceId: 'campaign-supporter-a', isValid: true, reason: null, status: 'QUEUED',
        content: {
          primary: { type: 'text', text: 'Olá, Maria' },
          sequence: [{
            type: 'image', mediaId: 'image-1',
            caption: 'Imagem para Maria Congelada\n\nPara não receber mais mensagens, responda SAIR.',
          }],
        },
      },
      {
        sourceId: 'campaign-supporter-bad', isValid: false, reason: 'INVALID_LENGTH', status: 'PENDING',
        content: {
          primary: { type: 'text', text: 'Olá, Sem' },
          sequence: [{
            type: 'image', mediaId: 'image-1',
            caption: 'Imagem para Sem Telefone\n\nPara não receber mais mensagens, responda SAIR.',
          }],
        },
      },
      {
        sourceId: 'campaign-supporter-duplicate', isValid: false, reason: 'DUPLICATE', status: 'PENDING',
        content: {
          primary: { type: 'text', text: 'Olá, Maria' },
          sequence: [{
            type: 'image', mediaId: 'image-1',
            caption: 'Imagem para Maria Duplicada\n\nPara não receber mais mensagens, responda SAIR.',
          }],
        },
      },
      {
        sourceId: 'campaign-supporter-suppressed', isValid: false, reason: 'SUPPRESSED', status: 'PENDING',
        content: {
          primary: { type: 'text', text: 'Olá, Pessoa' },
          sequence: [{
            type: 'image', mediaId: 'image-1',
            caption: 'Imagem para Pessoa Suprimida\n\nPara não receber mais mensagens, responda SAIR.',
          }],
        },
      },
    ]);

    await prisma.indication.update({ where: { id: 'campaign-supporter-a' }, data: { name: 'Nome Alterado' } });
    const frozen = await prisma.whatsAppRecipient.findFirst({
      where: { campaignId: campaign.id, sourceId: 'campaign-supporter-a' },
    });
    expect(frozen.personName).toBe('Maria Congelada');
    expect(frozen.personalizedContent.primary.text).toBe('Olá, Maria');
  });

  test('rejects invalid or non-future scheduledAt before persistence and remote calls', async () => {
    const beforeRequests = requests.length;
    const beforeCampaigns = await prisma.whatsAppCampaign.count();
    for (const [name, scheduledAt] of [
      ['Agendamento passado', new Date(Date.now() - 60_000).toISOString()],
      ['Agendamento inválido', 'amanhã às nove'],
    ] as const) {
      const response = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns', headers: auth(coordinatorToken),
        payload: {
          name, category: 'UTILITY', audienceFilter, content: campaignContent,
          consentimentoConfirmado: true, scheduledAt,
        },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(requests).toHaveLength(beforeRequests);
    expect(await prisma.whatsAppCampaign.count()).toBe(beforeCampaigns);
  });

  test('uses current epoch milliseconds for an immediate manual campaign', async () => {
    const before = Date.now();
    const response = await app.inject({
      method: 'POST', url: '/whatsapp/campaigns', headers: auth(coordinatorToken),
      payload: {
        name: 'Campanha imediata', category: 'UTILITY', audienceFilter, content: campaignContent,
        consentimentoConfirmado: true,
      },
    });
    const after = Date.now();
    expect(response.statusCode).toBe(201);
    const scheduledFor = requests.at(-1)?.body.scheduled_for;
    expect(scheduledFor).toBeGreaterThanOrEqual(before);
    expect(scheduledFor).toBeLessThanOrEqual(after);
    expect(response.json().campaign.status).toBe('QUEUED');
  });

  test('returns one campaign and dispatches once for concurrent requests with the same idempotency key', async () => {
    const beforeRequests = requests.length;
    const idempotencyKey = 'campaign-create-concurrent-key';
    const request = () => app.inject({
      method: 'POST', url: '/whatsapp/campaigns',
      headers: { ...auth(coordinatorToken), 'idempotency-key': idempotencyKey },
      payload: {
        name: 'Campanha idempotente', category: 'UTILITY', audienceFilter, content: campaignContent,
        consentimentoConfirmado: true,
      },
    });

    const responses = await Promise.all([request(), request()]);

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([201, 201]);
    expect(responses[0].json().campaign.id).toBe(responses[1].json().campaign.id);
    expect(responses[0].json().campaign.idempotencyKey).toBe(idempotencyKey);
    expect(requests).toHaveLength(beforeRequests + 1);
    expect(await prisma.whatsAppCampaign.count({ where: { idempotencyKey } })).toBe(1);
  });

  test('revalidates suppression after preview and does not dispatch a newly suppressed recipient', async () => {
    const campaignName = 'Campanha com supressão concorrente';
    const beforeRequests = requests.length;
    await basePrisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_suppress_after_campaign_preview() RETURNS trigger AS $$
      BEGIN
        IF NEW.name = '${campaignName}' THEN
          INSERT INTO whatsapp_suppressions
            (id, tenant_id, phone_normalized, active, reason, source, first_opt_out_at,
             last_opt_out_at, created_at, updated_at)
          VALUES
            ('campaign-suppression-race', NEW.tenant_id, '5511987654321', true,
             'Supressão concorrente', 'MANUAL', NOW(), NOW(), NOW(), NOW())
          ON CONFLICT (tenant_id, phone_normalized)
          DO UPDATE SET active = true, updated_at = NOW();
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await basePrisma.$executeRawUnsafe(`
      CREATE TRIGGER test_suppress_after_campaign_preview_trigger
      AFTER INSERT ON whatsapp_campaigns
      FOR EACH ROW EXECUTE FUNCTION test_suppress_after_campaign_preview()
    `);

    let response;
    try {
      response = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns', headers: auth(coordinatorToken),
        payload: {
          name: campaignName, category: 'UTILITY', audienceFilter, content: campaignContent,
          consentimentoConfirmado: true,
        },
      });
    } finally {
      await basePrisma.$executeRawUnsafe(
        'DROP TRIGGER test_suppress_after_campaign_preview_trigger ON whatsapp_campaigns',
      );
      await basePrisma.$executeRawUnsafe('DROP FUNCTION test_suppress_after_campaign_preview()');
      await basePrisma.whatsAppSuppression.deleteMany({
        where: { tenantId: tenantA.id, phoneNormalized: '5511987654321' },
      });
    }

    expect(response.statusCode).toBe(201);
    expect(response.json().campaign).toMatchObject({ status: 'CANCELED', queuedCount: 0 });
    expect(response.json().campaign.remoteFolderId).toBeNull();
    expect(requests).toHaveLength(beforeRequests);
    const recipients = await prisma.whatsAppRecipient.findMany({
      where: { campaignId: response.json().campaign.id },
    });
    expect(recipients.find(({ isValid }: any) => isValid)).toMatchObject({ status: 'CANCELED' });
  });

  test('rejects a zero-valid audience before campaign persistence or upstream dispatch', async () => {
    const beforeRequests = requests.length;
    const beforeCampaigns = await prisma.whatsAppCampaign.count();
    const beforeRecipients = await prisma.whatsAppRecipient.count();
    const response = await app.inject({
      method: 'POST', url: '/whatsapp/campaigns', headers: auth(coordinatorToken),
      payload: {
        name: 'Campanha sem destinatários válidos', category: 'UTILITY',
        audienceFilter: { type: 'SUPPORTERS', selectedIds: ['campaign-supporter-bad'] },
        content: campaignContent, consentimentoConfirmado: true,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Campaign requires at least one valid recipient.' });
    expect(requests).toHaveLength(beforeRequests);
    expect(await prisma.whatsAppCampaign.count()).toBe(beforeCampaigns);
    expect(await prisma.whatsAppRecipient.count()).toBe(beforeRecipients);
  });

  test('rejects campaign media that is not stored before persistence or upstream dispatch', async () => {
    const beforeRequests = requests.length;
    const beforeCampaigns = await prisma.whatsAppCampaign.count();
    const response = await app.inject({
      method: 'POST', url: '/whatsapp/campaigns', headers: auth(coordinatorToken),
      payload: {
        name: 'Campanha com mídia ausente', category: 'UTILITY', audienceFilter,
        content: {
          primary: { type: 'image', mediaId: 'missing-campaign-media', caption: 'Arquivo ausente' },
          sequence: [],
        },
        consentimentoConfirmado: true,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Campaign media is no longer available.' });
    expect(requests).toHaveLength(beforeRequests);
    expect(await prisma.whatsAppCampaign.count()).toBe(beforeCampaigns);
  });

  test('preserves campaign and recipients as failed with a sanitized message when Uazapi fails', async () => {
    upstreamFailure = true;
    const idempotencyKey = 'campaign-upstream-failure-key';
    const payload = {
      name: 'Campanha com falha', category: 'UTILITY', audienceFilter, content: campaignContent,
      consentimentoConfirmado: true,
    };
    let response;
    try {
      response = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns',
        headers: { ...auth(coordinatorToken), 'idempotency-key': idempotencyKey },
        payload,
      });
    } finally {
      upstreamFailure = false;
    }

    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('plain-instance-token');
    expect(response.body).not.toContain('banco interno');
    const campaign = await prisma.whatsAppCampaign.findFirst({
      where: { name: 'Campanha com falha' }, include: { recipients: { orderBy: { sourceId: 'asc' } } },
    });
    expect(campaign.status).toBe('FAILED');
    expect(campaign.lastError).toBe('Uazapi service unavailable.');
    expect(JSON.stringify(campaign)).not.toContain('plain-instance-token');
    expect(campaign.recipients.map((recipient: any) => recipient.status)).toEqual([
      'FAILED', 'PENDING', 'PENDING', 'PENDING',
    ]);

    const requestsAfterFailure = requests.length;
    const replay = await app.inject({
      method: 'POST', url: '/whatsapp/campaigns',
      headers: { ...auth(coordinatorToken), 'idempotency-key': idempotencyKey },
      payload,
    });
    expect(replay.statusCode).toBe(502);
    expect(replay.json()).toEqual({ error: 'Uazapi service unavailable.' });
    expect(requests).toHaveLength(requestsAfterFailure);
    expect(await prisma.whatsAppCampaign.count({ where: { idempotencyKey } })).toBe(1);
  });

  test('compensates the remote folder and records a failed audit when local persistence fails after acceptance', async () => {
    const beforeRequests = requests.length;
    const idempotencyKey = 'campaign-indeterminate-failure-key';
    const payload = {
      name: 'Campanha aceita com estado local incerto', category: 'UTILITY',
      audienceFilter, content: campaignContent, consentimentoConfirmado: true,
    };
    await basePrisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_reject_recipient_queue() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'QUEUED' AND OLD.status = 'PENDING' THEN
          RAISE EXCEPTION 'deterministic local queue failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await basePrisma.$executeRawUnsafe(`
      CREATE TRIGGER test_reject_recipient_queue_trigger
      BEFORE UPDATE ON whatsapp_recipients
      FOR EACH ROW EXECUTE FUNCTION test_reject_recipient_queue()
    `);

    let response;
    try {
      response = await app.inject({
        method: 'POST', url: '/whatsapp/campaigns',
        headers: { ...auth(coordinatorToken), 'idempotency-key': idempotencyKey },
        payload,
      });
    } finally {
      await basePrisma.$executeRawUnsafe(
        'DROP TRIGGER test_reject_recipient_queue_trigger ON whatsapp_recipients',
      );
      await basePrisma.$executeRawUnsafe('DROP FUNCTION test_reject_recipient_queue()');
    }

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: 'Uazapi accepted the campaign, but local state could not be confirmed. Do not retry automatically.',
    });
    expect(requests.slice(beforeRequests).map(({ url, body }) => ({ url, body }))).toEqual([
      { url: '/sender/advanced', body: expect.any(Object) },
      { url: '/sender/edit', body: { folder_id: 'folder-campaign-1', action: 'stop' } },
      { url: '/sender/edit', body: { folder_id: 'folder-campaign-1', action: 'delete' } },
    ]);
    const campaign = await prisma.whatsAppCampaign.findFirst({
      where: { name: 'Campanha aceita com estado local incerto' },
      include: { recipients: true },
    });
    expect(campaign).toMatchObject({
      status: 'FAILED', remoteFolderId: 'folder-campaign-1', remoteFolderStatus: 'deleting',
      lastError: 'Uazapi accepted the campaign, but local state could not be confirmed. Do not retry automatically.',
    });
    expect(campaign.recipients.filter((recipient: any) => recipient.isValid)
      .every((recipient: any) => recipient.status === 'FAILED')).toBe(true);

    const requestsAfterCompensation = requests.length;
    const replay = await app.inject({
      method: 'POST', url: '/whatsapp/campaigns',
      headers: { ...auth(coordinatorToken), 'idempotency-key': idempotencyKey },
      payload,
    });
    expect(replay.statusCode).toBe(503);
    expect(replay.json()).toEqual({
      error: 'Uazapi accepted the campaign, but local state could not be confirmed. Do not retry automatically.',
    });
    expect(requests).toHaveLength(requestsAfterCompensation);
  });

  test('rejects 1,001 valid unique phones with 400 but keeps excluded rows outside that limit', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      id: `bulk-supporter-${String(index).padStart(4, '0')}`,
      tenantId: tenantA.id,
      name: `Volume ${index}`,
      phone: `11${String(900000000 + index)}`,
      indicatedBy: 'Líder',
      status: 'ATIVO',
      createdById: 'campaign-leader',
      indicatedByUserId: 'campaign-leader',
      churchId: 'campaign-church',
      municipalityId: 'campaign-bulk-city',
    }));
    await basePrisma.indication.createMany({ data: rows, skipDuplicates: true });

    const response = await app.inject({
      method: 'POST', url: '/whatsapp/campaigns/preview', headers: auth(coordinatorToken),
      payload: {
        category: 'UTILITY', audienceFilter: { type: 'SUPPORTERS', municipalityIds: ['campaign-bulk-city'] },
        content: campaignContent,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Audience exceeds the limit of 1000 valid recipients.' });
  });

  test('lists and gets only tenant-scoped campaigns with their frozen recipients', async () => {
    await basePrisma.whatsAppCampaign.create({ data: {
      tenantId: tenantB.id, createdById: 'campaign-coordinator-b', name: 'Outro tenant', status: 'DRAFT',
      category: 'UTILITY', audienceFilter: {}, content: campaignContent, consentAt: new Date(),
    } });

    const listed = await app.inject({
      method: 'GET', url: '/whatsapp/campaigns', headers: auth(coordinatorToken),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().campaigns.length).toBeGreaterThanOrEqual(3);
    expect(listed.json().campaigns.map((item: any) => item.name)).not.toContain('Outro tenant');

    const id = listed.json().campaigns[0].id;
    const detail = await app.inject({
      method: 'GET', url: `/whatsapp/campaigns/${id}`, headers: auth(coordinatorToken),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().campaign.id).toBe(id);
    expect(Array.isArray(detail.json().campaign.recipients)).toBe(true);
  });
});
}

import { afterAll, beforeAll, expect, test } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { Writable } from 'node:stream';
import { Client } from 'pg';

const FULL_FLOW_DATABASE = 'rede_guti_uazapi_full_flow_integration';
const backendDirectory = new URL('../../', import.meta.url).pathname;

function databaseUrls() {
  const source = new URL(
    process.env.DATABASE_URL
      ?? 'postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public',
  );
  const admin = new URL(source);
  admin.pathname = '/postgres';
  admin.searchParams.delete('schema');
  const clean = new URL(source);
  clean.pathname = `/${FULL_FLOW_DATABASE}`;
  clean.searchParams.set('schema', 'public');
  return { admin: admin.toString(), clean: clean.toString() };
}

async function recreateCleanDatabase(adminUrl: string) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [FULL_FLOW_DATABASE],
    );
    await client.query(`DROP DATABASE IF EXISTS "${FULL_FLOW_DATABASE}"`);
    await client.query(`CREATE DATABASE "${FULL_FLOW_DATABASE}"`);
  } finally {
    await client.end();
  }
}

async function dropCleanDatabase(adminUrl: string) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [FULL_FLOW_DATABASE],
    );
    await client.query(`DROP DATABASE IF EXISTS "${FULL_FLOW_DATABASE}"`);
  } finally {
    await client.end();
  }
}

if (process.env.WHATSAPP_FULL_FLOW_CHILD !== '1') {
  test('runs the complete WhatsApp flow against a clean migrated PostgreSQL database', async () => {
    const urls = databaseUrls();
    await recreateCleanDatabase(urls.admin);
    try {
      const migrated = Bun.spawnSync({
        cmd: [process.execPath, 'run', 'prisma:deploy'],
        cwd: backendDirectory,
        env: { ...process.env, DATABASE_URL: urls.clean },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (migrated.exitCode !== 0) {
        throw new Error(`${migrated.stdout.toString()}\n${migrated.stderr.toString()}`);
      }

      const scenario = Bun.spawnSync({
        cmd: [process.execPath, 'test', 'test/whatsapp/full-flow.integration.test.ts'],
        cwd: backendDirectory,
        env: {
          ...process.env,
          DATABASE_URL: urls.clean,
          WHATSAPP_FULL_FLOW_CHILD: '1',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (scenario.exitCode !== 0) {
        throw new Error(`${scenario.stdout.toString()}\n${scenario.stderr.toString()}`);
      }
      expect(scenario.exitCode).toBe(0);
    } finally {
      await dropCleanDatabase(urls.admin);
    }
  }, 120_000);
} else {
  const ADMIN_TOKEN = 'full-flow-admin-token-sentinel';
  const INSTANCE_TOKEN = 'full-flow-instance-token-sentinel';
  const ENCRYPTION_KEY = 'ab'.repeat(32);
  const WEBHOOK_SECRET = 'full-flow-webhook-secret/% sentinel';
  const secrets = [ADMIN_TOKEN, INSTANCE_TOKEN, ENCRYPTION_KEY, WEBHOOK_SECRET];

  process.env.JWT_SECRET = 'full-flow-jwt-secret';
  process.env.UAZAPI_ADMIN_TOKEN = ADMIN_TOKEN;
  process.env.UAZAPI_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.WHATSAPP_ENCRYPTION_KEY = ENCRYPTION_KEY;
  process.env.PUBLIC_API_URL = 'https://api.full-flow.test';
  process.env.WHATSAPP_DELAY_MIN = '5';
  process.env.WHATSAPP_DELAY_MAX = '15';
  process.env.WHATSAPP_UPLOAD_MAX_MB = '2';
  process.env.WHATSAPP_MASS_MAX_RECIPIENTS = '1000';

  let upstream: FastifyInstance;
  let app: FastifyInstance;
  let basePrisma: any;
  let prisma: any;
  let coordinatorToken: string;
  let leaderToken: string;
  let verifierToken: string;
  let otherTenantToken: string;
  let failNextAdvancedSend = false;
  let nextFolder = 1;

  const responseBodies: string[] = [];
  const errorBodies: string[] = [];
  const logChunks: string[] = [];
  const upstreamRequests: Array<{
    method: string;
    url: string;
    headers: Record<string, unknown>;
    body: any;
  }> = [];
  const folderStatuses = new Map<string, string>();
  const folderMessages = new Map<string, unknown[]>();

  const tenant = { id: 'full-flow-tenant', slug: 'full-flow', name: 'Full Flow' };
  const otherTenant = { id: 'full-flow-other-tenant', slug: 'full-flow-other', name: 'Full Flow Other' };
  const coordinatorId = 'full-flow-coordinator';
  const leaderId = 'full-flow-leader';
  const otherCoordinatorId = 'full-flow-other-coordinator';
  const supporterPhone = '5511987654321';

  const campaignContent = {
    primary: { type: 'text', text: 'Olá, {{primeiro_nome}}' },
    sequence: [],
  };
  const supporterAudience = {
    type: 'SUPPORTERS',
    selectedIds: ['full-flow-supporter'],
  };

  function recordUpstream(request: any) {
    upstreamRequests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
    });
  }

  beforeAll(async () => {
    upstream = Fastify({ logger: false });
    upstream.post('/instance/create', async (request) => {
      recordUpstream(request);
      return {
        instance: {
          id: 'full-flow-instance', name: 'Rede Guti Full Flow', status: 'disconnected',
          adminToken: ADMIN_TOKEN,
        },
        token: INSTANCE_TOKEN,
        encryptionKey: ENCRYPTION_KEY,
        webhookSecret: WEBHOOK_SECRET,
      };
    });
    upstream.post('/webhook', async (request) => {
      recordUpstream(request);
      return { enabled: true, token: INSTANCE_TOKEN };
    });
    upstream.get('/instance/status', async (request) => {
      recordUpstream(request);
      return {
        instance: {
          id: 'full-flow-instance', name: 'Rede Guti Full Flow', status: 'connected',
          token: INSTANCE_TOKEN,
        },
        status: {
          connected: true, loggedIn: true,
          jid: { user: supporterPhone, auth: ADMIN_TOKEN },
        },
      };
    });
    upstream.post('/instance/connect', async (request) => {
      recordUpstream(request);
      return {
        connected: false,
        loggedIn: false,
        instance: {
          id: 'full-flow-instance', name: 'Rede Guti Full Flow', status: 'connecting',
          qrcode: 'data:image/png;base64,full-flow-qr', paircode: 'PAIR-FULL-FLOW',
          token: INSTANCE_TOKEN, password: ENCRYPTION_KEY,
        },
      };
    });
    upstream.post('/instance/disconnect', async (request) => {
      recordUpstream(request);
      return { response: 'Disconnected' };
    });
    upstream.delete('/instance', async (request, reply) => {
      recordUpstream(request);
      return reply.code(204).send();
    });
    upstream.post('/sender/advanced', async (request, reply) => {
      recordUpstream(request);
      if (failNextAdvancedSend) {
        failNextAdvancedSend = false;
        return reply.code(500).send({
          error: `unsafe ${ADMIN_TOKEN} ${INSTANCE_TOKEN} ${ENCRYPTION_KEY} ${WEBHOOK_SECRET}`,
        });
      }
      const folderId = `full-flow-folder-${nextFolder++}`;
      folderStatuses.set(folderId, 'Active');
      return {
        folder_id: folderId,
        status: 'Active',
        created_at: '2026-08-01T12:00:00.000Z',
        token: INSTANCE_TOKEN,
      };
    });
    upstream.get('/sender/listfolders', async (request) => {
      recordUpstream(request);
      return [...folderStatuses].map(([folder_id, status]) => ({ folder_id, status }));
    });
    upstream.post('/sender/listmessages', async (request) => {
      recordUpstream(request);
      const body = request.body as { folder_id: string };
      const messages = folderMessages.get(body.folder_id) ?? [];
      return { messages, total: messages.length };
    });
    upstream.post('/sender/edit', async (request, reply) => {
      recordUpstream(request);
      const body = request.body as { folder_id?: unknown; action?: unknown };
      if (
        typeof body?.folder_id !== 'string'
        || !['stop', 'continue', 'delete'].includes(String(body.action))
        || Object.keys(body).sort().join(',') !== 'action,folder_id'
      ) {
        return reply.code(400).send({ error: 'Invalid sender/edit payload.' });
      }
      folderStatuses.set(
        body.folder_id,
        body.action === 'stop' ? 'Stopped' : body.action === 'continue' ? 'Active' : 'Deleted',
      );
      return { success: true };
    });
    await upstream.listen({ host: '127.0.0.1', port: 0 });
    const address = upstream.server.address();
    if (!address || typeof address === 'string') throw new Error('missing Uazapi stub address');
    process.env.UAZAPI_BASE_URL = `http://127.0.0.1:${address.port}`;

    const [{ buildApp }, db, tenantContext] = await Promise.all([
      import('../../src/app.js'),
      import('../../src/db.js'),
      import('../../src/lib/tenantContext.js'),
    ]);
    basePrisma = db.basePrisma;
    prisma = db.prisma;
    tenantContext.setCurrentTenant(tenant);

    await basePrisma.tenant.createMany({ data: [tenant, otherTenant] });
    await basePrisma.user.createMany({ data: [
      {
        id: coordinatorId, tenantId: tenant.id, email: 'coord@full-flow.test', name: 'Coordenação',
        devzappLink: '(11) 90000-0001', passwordHash: 'unused', role: 'COORDENADOR', active: true,
      },
      {
        id: leaderId, tenantId: tenant.id, email: 'leader@full-flow.test', name: 'Líder Full Flow',
        devzappLink: '(11) 91111-1111', passwordHash: 'unused', role: 'LIDER_REGIONAL', active: true,
      },
      {
        id: 'full-flow-verifier', tenantId: tenant.id, email: 'verifier@full-flow.test',
        name: 'Verificadora', passwordHash: 'unused', role: 'VERIFICADORA', active: true,
      },
      {
        id: otherCoordinatorId, tenantId: otherTenant.id, email: 'coord@full-flow-other.test',
        name: 'Outra Coordenação', passwordHash: 'unused', role: 'COORDENADOR', active: true,
      },
    ] });
    await basePrisma.church.create({ data: {
      id: 'full-flow-church', tenantId: tenant.id, name: 'Igreja Full Flow',
    } });
    await basePrisma.municipality.create({ data: {
      id: 'full-flow-city', tenantId: tenant.id, name: 'Cidade Full Flow', stateCode: 'SP',
    } });
    await basePrisma.indication.create({ data: {
      id: 'full-flow-supporter', tenantId: tenant.id, name: 'Maria Full Flow',
      phone: '(11) 98765-4321', status: 'ATIVO', indicatedBy: 'Líder Full Flow',
      indicatedByUserId: leaderId, createdById: leaderId,
      churchId: 'full-flow-church', municipalityId: 'full-flow-city',
    } });
    await basePrisma.evento.create({ data: {
      id: 'full-flow-event', tenantId: tenant.id, nome: 'Evento Full Flow',
      data: new Date('2099-01-10T00:00:00.000Z'), hora: '19:00', local: 'Auditório',
    } });
    await basePrisma.eventoIndicado.create({ data: {
      id: 'full-flow-guest', tenantId: tenant.id, eventoId: 'full-flow-event',
      nome: 'Convidada Full Flow', telefone: '(11) 92222-2222', liderId: leaderId,
      status: 'CONFIRMADO',
    } });
    await basePrisma.equipe.create({ data: {
      id: 'full-flow-team', tenantId: tenant.id, liderId: leaderId, nome: 'Equipe Full Flow',
      motoristaNome: 'Motorista Full Flow', motoristaCnh: 'CNH-FULL-FLOW',
      motoristaTelefone: '(11) 93333-3333', carroPlaca: 'ABC1D23', carroModelo: 'Sedan',
      carroCor: 'Azul', status: 'ATIVA',
    } });
    await basePrisma.equipeMembro.create({ data: {
      id: 'full-flow-member', tenantId: tenant.id, equipeId: 'full-flow-team',
      nome: 'Membro Full Flow', telefone: '(11) 94444-4444', ordem: 1,
    } });
    await basePrisma.whatsAppTemplate.create({ data: {
      id: 'full-flow-foreign-template', tenantId: otherTenant.id,
      createdById: otherCoordinatorId, name: 'Template de outro tenant', category: 'UTILITY',
      content: campaignContent,
    } });
    await basePrisma.whatsAppCampaign.create({ data: {
      id: 'full-flow-foreign-campaign', tenantId: otherTenant.id,
      createdById: otherCoordinatorId, name: 'Campanha de outro tenant', category: 'UTILITY',
      audienceFilter: supporterAudience, content: campaignContent, consentAt: new Date(),
    } });

    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logChunks.push(chunk.toString());
        callback();
      },
    });
    app = await buildApp({ logger: { stream } });
    coordinatorToken = app.jwt.sign({ sub: coordinatorId, role: 'COORDENADOR', tenantId: tenant.id });
    leaderToken = app.jwt.sign({ sub: leaderId, role: 'LIDER_REGIONAL', tenantId: tenant.id });
    verifierToken = app.jwt.sign({
      sub: 'full-flow-verifier', role: 'VERIFICADORA', tenantId: tenant.id,
    });
    otherTenantToken = app.jwt.sign({
      sub: otherCoordinatorId, role: 'COORDENADOR', tenantId: otherTenant.id,
    });
  });

  afterAll(async () => {
    await app?.close();
    await upstream?.close();
    await basePrisma?.$disconnect();
  });

  const auth = (token = coordinatorToken) => ({ authorization: `Bearer ${token}` });

  async function inject(options: any) {
    const response = await app.inject(options);
    responseBodies.push(response.body);
    if (response.statusCode >= 400) errorBodies.push(response.body);
    return response;
  }

  function multipartFile(filename: string, mimeType: string, bytes: Uint8Array) {
    const boundary = '----rede-guti-full-flow-boundary';
    const prefix = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    );
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    return {
      payload: Buffer.concat([prefix, Buffer.from(bytes), suffix]),
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  }

  test('covers resources, audiences, campaigns, webhooks, isolation and credential safety end to end', async () => {
    const noAuth = await inject({ method: 'GET', url: '/whatsapp/templates' });
    const wrongRole = await inject({
      method: 'GET', url: '/whatsapp/templates', headers: auth(leaderToken),
    });
    const wrongVerifierRole = await inject({
      method: 'GET', url: '/whatsapp/templates', headers: auth(verifierToken),
    });
    const wrongTenant = await inject({
      method: 'GET', url: '/whatsapp/templates', headers: auth(otherTenantToken),
    });
    expect([
      noAuth.statusCode, wrongRole.statusCode, wrongVerifierRole.statusCode, wrongTenant.statusCode,
    ]).toEqual([401, 403, 403, 401]);

    const createdInstance = await inject({
      method: 'POST', url: '/whatsapp/instance', headers: auth(),
      payload: { name: 'Rede Guti Full Flow' },
    });
    expect(createdInstance.statusCode).toBe(201);
    expect(createdInstance.json()).toEqual({
      configured: true,
      instanceId: 'full-flow-instance',
      name: 'Rede Guti Full Flow',
      status: 'disconnected',
      connected: false,
    });
    const storedConfig = await prisma.whatsAppConfig.findUnique({ where: { tenantId: tenant.id } });
    expect(storedConfig.instanceTokenEncrypted).toStartWith('v1:');
    expect(storedConfig.instanceTokenEncrypted).not.toContain(INSTANCE_TOKEN);
    expect(storedConfig.webhookConfiguredAt).toBeInstanceOf(Date);

    const createAndWebhook = upstreamRequests.slice(-2);
    expect(createAndWebhook.map(({ method, url }) => ({ method, url }))).toEqual([
      { method: 'POST', url: '/instance/create' },
      { method: 'POST', url: '/webhook' },
    ]);
    expect(createAndWebhook[0].headers).toMatchObject({ admintoken: ADMIN_TOKEN });
    expect(createAndWebhook[0].headers.token).toBeUndefined();
    expect(createAndWebhook[1].headers).toMatchObject({ token: INSTANCE_TOKEN });
    expect(createAndWebhook[1].headers.admintoken).toBeUndefined();
    expect(createAndWebhook[1].body).toEqual({
      enabled: true,
      url: `https://api.full-flow.test/public/whatsapp/webhook?secret=${encodeURIComponent(WEBHOOK_SECRET)}`,
      events: ['messages', 'messages_update', 'sender'],
      excludeMessages: ['wasSentByApi'],
    });

    const status = await inject({ method: 'GET', url: '/whatsapp/instance', headers: auth() });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({
      configured: true,
      instanceId: 'full-flow-instance',
      name: 'Rede Guti Full Flow',
      phone: supporterPhone,
      status: 'connected',
      connection: { connected: true, loggedIn: true, jid: { user: supporterPhone } },
    });
    const connect = await inject({
      method: 'POST', url: '/whatsapp/instance/connect', headers: auth(),
    });
    expect(connect.statusCode).toBe(200);
    expect(connect.json()).toEqual({
      connected: false,
      loggedIn: false,
      qrcode: 'data:image/png;base64,full-flow-qr',
      paircode: 'PAIR-FULL-FLOW',
      instance: {
        id: 'full-flow-instance', name: 'Rede Guti Full Flow', status: 'connecting',
      },
    });

    const mediaBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0, 255, 10]);
    const multipart = multipartFile('homologacao.pdf', 'application/pdf', mediaBytes);
    const uploaded = await inject({
      method: 'POST', url: '/whatsapp/media',
      headers: { ...auth(), 'content-type': multipart.contentType }, payload: multipart.payload,
    });
    expect(uploaded.statusCode).toBe(201);
    const media = uploaded.json().media;
    expect(media).toMatchObject({
      filename: 'homologacao.pdf', mimeType: 'application/pdf', sizeBytes: mediaBytes.length,
    });
    const downloaded = await inject({
      method: 'GET', url: new URL(media.publicUrl).pathname,
    });
    expect(downloaded.statusCode).toBe(200);
    expect(Buffer.from(downloaded.rawPayload)).toEqual(Buffer.from(mediaBytes));

    const templateCreated = await inject({
      method: 'POST', url: '/whatsapp/templates', headers: auth(),
      payload: {
        name: 'Template Full Flow', category: 'UTILITY', purpose: 'Homologação',
        content: campaignContent,
      },
    });
    expect(templateCreated.statusCode).toBe(201);
    const templateId = templateCreated.json().template.id;
    const templateUpdated = await inject({
      method: 'PATCH', url: `/whatsapp/templates/${templateId}`, headers: auth(),
      payload: { purpose: 'Homologação atualizada' },
    });
    expect(templateUpdated.json().template).toMatchObject({
      purpose: 'Homologação atualizada', version: 2,
    });
    const templateFavorite = await inject({
      method: 'PATCH', url: `/whatsapp/templates/${templateId}/favorite`, headers: auth(),
      payload: { favorite: true },
    });
    expect(templateFavorite.json().template).toMatchObject({ favorite: true, version: 3 });
    const templateDuplicate = await inject({
      method: 'POST', url: `/whatsapp/templates/${templateId}/duplicate`, headers: auth(),
      payload: { name: 'Template Full Flow Cópia' },
    });
    expect(templateDuplicate.statusCode).toBe(201);
    const duplicateId = templateDuplicate.json().template.id;
    const templates = await inject({ method: 'GET', url: '/whatsapp/templates', headers: auth() });
    expect(templates.json().templates.map((item: any) => item.name).sort()).toEqual([
      'Template Full Flow', 'Template Full Flow Cópia',
    ]);
    expect(await inject({
      method: 'DELETE', url: `/whatsapp/templates/${duplicateId}`, headers: auth(),
    }).then((response) => response.statusCode)).toBe(204);

    const previews = [
      { type: 'LEADERS', selectedIds: [leaderId], roles: ['LIDER_REGIONAL'], active: true },
      { type: 'SUPPORTERS', selectedIds: ['full-flow-supporter'], statuses: ['ATIVO'] },
      {
        type: 'EVENT_GUESTS', eventId: 'full-flow-event', selectedIds: ['full-flow-guest'],
        statuses: ['CONFIRMADO'],
      },
      {
        type: 'TEAM_CONTACTS', teamIds: ['full-flow-team'], statuses: ['ATIVA'],
        contactKinds: ['DRIVER', 'MEMBER'], selectedIds: ['full-flow-team', 'full-flow-member'],
      },
    ];
    const previewResults: unknown[] = [];
    for (const audienceFilter of previews) {
      const preview = await inject({
        method: 'POST', url: '/whatsapp/campaigns/preview', headers: auth(),
        payload: { category: 'UTILITY', audienceFilter, content: campaignContent },
      });
      expect(preview.statusCode).toBe(200);
      const body = preview.json();
      previewResults.push({
        totals: body.totals,
        recipients: body.recipients.map((recipient: any) => ({
          origin: recipient.origin,
          sourceId: recipient.sourceId,
          sourceName: recipient.sourceName,
          personName: recipient.personName,
          phoneOriginal: recipient.phoneOriginal,
          phoneNormalized: recipient.phoneNormalized,
          isValid: recipient.isValid,
          exclusionReason: recipient.exclusionReason,
        })),
        samples: body.samples,
      });
    }
    expect(previewResults).toEqual([
      {
        totals: { source: 1, valid: 1, invalid: 0, duplicate: 0, suppressed: 0 },
        recipients: [{
          origin: 'MANUAL', sourceId: 'full-flow-leader', sourceName: 'Líder Full Flow',
          personName: 'Líder Full Flow', phoneOriginal: '(11) 91111-1111',
          phoneNormalized: '5511911111111', isValid: true, exclusionReason: null,
        }],
        samples: [{
          sourceId: 'full-flow-leader', personName: 'Líder Full Flow',
          phoneNormalized: '5511911111111',
          content: { primary: { type: 'text', text: 'Olá, Líder' }, sequence: [] },
        }],
      },
      {
        totals: { source: 1, valid: 1, invalid: 0, duplicate: 0, suppressed: 0 },
        recipients: [{
          origin: 'INDICATION', sourceId: 'full-flow-supporter', sourceName: 'Maria Full Flow',
          personName: 'Maria Full Flow', phoneOriginal: '(11) 98765-4321',
          phoneNormalized: '5511987654321', isValid: true, exclusionReason: null,
        }],
        samples: [{
          sourceId: 'full-flow-supporter', personName: 'Maria Full Flow',
          phoneNormalized: '5511987654321',
          content: { primary: { type: 'text', text: 'Olá, Maria' }, sequence: [] },
        }],
      },
      {
        totals: { source: 1, valid: 1, invalid: 0, duplicate: 0, suppressed: 0 },
        recipients: [{
          origin: 'EVENT_GUEST', sourceId: 'full-flow-guest', sourceName: 'Convidada Full Flow',
          personName: 'Convidada Full Flow', phoneOriginal: '(11) 92222-2222',
          phoneNormalized: '5511922222222', isValid: true, exclusionReason: null,
        }],
        samples: [{
          sourceId: 'full-flow-guest', personName: 'Convidada Full Flow',
          phoneNormalized: '5511922222222',
          content: { primary: { type: 'text', text: 'Olá, Convidada' }, sequence: [] },
        }],
      },
      {
        totals: { source: 2, valid: 2, invalid: 0, duplicate: 0, suppressed: 0 },
        recipients: [
          {
            origin: 'TEAM_MEMBER', sourceId: 'full-flow-member', sourceName: 'Equipe Full Flow',
            personName: 'Membro Full Flow', phoneOriginal: '(11) 94444-4444',
            phoneNormalized: '5511944444444', isValid: true, exclusionReason: null,
          },
          {
            origin: 'TEAM_DRIVER', sourceId: 'full-flow-team', sourceName: 'Equipe Full Flow',
            personName: 'Motorista Full Flow', phoneOriginal: '(11) 93333-3333',
            phoneNormalized: '5511933333333', isValid: true, exclusionReason: null,
          },
        ],
        samples: [
          {
            sourceId: 'full-flow-member', personName: 'Membro Full Flow',
            phoneNormalized: '5511944444444',
            content: { primary: { type: 'text', text: 'Olá, Membro' }, sequence: [] },
          },
          {
            sourceId: 'full-flow-team', personName: 'Motorista Full Flow',
            phoneNormalized: '5511933333333',
            content: { primary: { type: 'text', text: 'Olá, Motorista' }, sequence: [] },
          },
        ],
      },
    ]);

    const testSend = await inject({
      method: 'POST', url: '/whatsapp/campaigns/test', headers: auth(),
      payload: {
        phone: '(21) 99876-5432', name: 'Teste Integrado', category: 'UTILITY',
        content: campaignContent,
      },
    });
    expect(testSend.statusCode).toBe(200);
    expect(testSend.json()).toEqual({ sent: true });
    expect(upstreamRequests.at(-1)).toMatchObject({
      method: 'POST', url: '/sender/advanced', headers: { token: INSTANCE_TOKEN },
      body: {
        delayMin: 5, delayMax: 15, info: 'Envio de teste',
        messages: [{ number: '5521998765432', type: 'text', text: 'Olá, Teste' }],
      },
    });

    const immediate = await inject({
      method: 'POST', url: '/whatsapp/campaigns', headers: auth(),
      payload: {
        name: 'Campanha imediata Full Flow', category: 'UTILITY',
        audienceFilter: supporterAudience, content: campaignContent, consentimentoConfirmado: true,
      },
    });
    expect(immediate.statusCode).toBe(201);
    expect(immediate.json().campaign).toMatchObject({ status: 'QUEUED', validRecipients: 1 });
    const immediateCampaignId = immediate.json().campaign.id;
    const immediateFolderId = immediate.json().campaign.remoteFolderId;

    const futureAt = '2099-02-01T12:00:00.000Z';
    const futureCreateRequestStart = upstreamRequests.length;
    const future = await inject({
      method: 'POST', url: '/whatsapp/campaigns', headers: auth(),
      payload: {
        name: 'Campanha futura Full Flow', category: 'UTILITY',
        audienceFilter: supporterAudience, content: campaignContent,
        consentimentoConfirmado: true, scheduledAt: futureAt,
      },
    });
    expect(future.statusCode).toBe(201);
    expect(future.json().campaign).toMatchObject({
      status: 'SCHEDULED', scheduledAt: futureAt, validRecipients: 1,
    });
    const futureCampaignId = future.json().campaign.id;
    const futureFolderId = future.json().campaign.remoteFolderId;
    expect(upstreamRequests.slice(futureCreateRequestStart).map(({ method, url, body }) => ({
      method, url, body,
    }))).toEqual([{
      method: 'POST', url: '/sender/advanced', body: {
        delayMin: 5, delayMax: 15, info: 'Campanha futura Full Flow',
        scheduled_for: 4073630400000,
        messages: [{ number: supporterPhone, type: 'text', text: 'Olá, Maria' }],
      },
    }]);

    failNextAdvancedSend = true;
    const failed = await inject({
      method: 'POST', url: '/whatsapp/campaigns', headers: auth(),
      payload: {
        name: 'Campanha falha Full Flow', category: 'UTILITY',
        audienceFilter: supporterAudience, content: campaignContent, consentimentoConfirmado: true,
      },
    });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toEqual({ error: 'Uazapi service unavailable.' });
    const failedCampaign = await prisma.whatsAppCampaign.findFirstOrThrow({
      where: { name: 'Campanha falha Full Flow' }, include: { recipients: true },
    });
    expect(failedCampaign).toMatchObject({ status: 'FAILED', lastError: 'Uazapi service unavailable.' });
    expect(failedCampaign.recipients).toHaveLength(1);
    expect(failedCampaign.recipients[0].status).toBe('FAILED');
    const retried = await inject({
      method: 'POST', url: `/whatsapp/campaigns/${failedCampaign.id}/retry-failed`, headers: auth(),
    });
    expect(retried.statusCode).toBe(200);
    expect(retried.json().campaign).toMatchObject({
      status: 'QUEUED', validRecipients: 1,
      audienceFilter: { type: 'RETRY', retryOfCampaignId: failedCampaign.id },
    });
    expect(retried.json().campaign.id).not.toBe(failedCampaign.id);

    const futureMutationRequestStart = upstreamRequests.length;
    const rescheduledAt = '2099-03-01T15:30:00.000Z';
    const rescheduled = await inject({
      method: 'POST', url: `/whatsapp/campaigns/${futureCampaignId}/reschedule`, headers: auth(),
      payload: { scheduledAt: rescheduledAt },
    });
    expect(rescheduled.statusCode).toBe(200);
    expect(rescheduled.json().campaign).toMatchObject({
      status: 'SCHEDULED', scheduledAt: rescheduledAt,
    });
    const rescheduledFolderId = rescheduled.json().campaign.remoteFolderId;
    expect(rescheduledFolderId).not.toBe(futureFolderId);
    const edited = await inject({
      method: 'PATCH', url: `/whatsapp/campaigns/${futureCampaignId}`, headers: auth(),
      payload: {
        name: 'Campanha futura editada',
        content: { primary: { type: 'text', text: 'Texto editado para {{primeiro_nome}}' }, sequence: [] },
      },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().campaign).toMatchObject({
      name: 'Campanha futura editada',
      content: { primary: { type: 'text', text: 'Texto editado para {{primeiro_nome}}' }, sequence: [] },
    });
    const editedFolderId = edited.json().campaign.remoteFolderId;
    expect(editedFolderId).not.toBe(rescheduledFolderId);
    expect(upstreamRequests.slice(futureMutationRequestStart)
      .filter(({ url }) => ['/sender/edit', '/sender/advanced'].includes(url))
      .map(({ method, url, body }) => ({ method, url, body }))).toEqual([
      {
        method: 'POST', url: '/sender/edit',
        body: { folder_id: futureFolderId, action: 'delete' },
      },
      {
        method: 'POST', url: '/sender/advanced', body: {
          delayMin: 5, delayMax: 15, info: 'Campanha futura Full Flow',
          scheduled_for: 4076062200000,
          messages: [{ number: supporterPhone, type: 'text', text: 'Olá, Maria' }],
        },
      },
      {
        method: 'POST', url: '/sender/edit',
        body: { folder_id: rescheduledFolderId, action: 'delete' },
      },
      {
        method: 'POST', url: '/sender/advanced', body: {
          delayMin: 5, delayMax: 15, info: 'Campanha futura editada',
          scheduled_for: 4076062200000,
          messages: [{ number: supporterPhone, type: 'text', text: 'Texto editado para Maria' }],
        },
      },
    ]);

    const controlRequestStart = upstreamRequests.length;
    const paused = await inject({
      method: 'POST', url: `/whatsapp/campaigns/${immediateCampaignId}/pause`, headers: auth(),
    });
    expect(paused.statusCode).toBe(200);
    expect(await prisma.whatsAppCampaign.findUniqueOrThrow({
      where: { id: immediateCampaignId },
    })).toMatchObject({ status: 'PAUSED', pausedAt: expect.any(Date) });
    const resumed = await inject({
      method: 'POST', url: `/whatsapp/campaigns/${immediateCampaignId}/resume`, headers: auth(),
    });
    expect(resumed.statusCode).toBe(200);
    expect([paused.json().campaign.status, resumed.json().campaign.status]).toEqual(['PAUSED', 'SENDING']);
    expect(await prisma.whatsAppCampaign.findUniqueOrThrow({
      where: { id: immediateCampaignId },
    })).toMatchObject({ status: 'SENDING', pausedAt: null });
    folderMessages.set(immediateFolderId, [{
      messageid: 'full-flow-outbound-message',
      chatid: `${supporterPhone}@s.whatsapp.net`, sender: supporterPhone, status: 'Sent',
      timestamp: '2026-08-01T12:10:00.000Z',
    }]);
    const synced = await inject({
      method: 'POST', url: `/whatsapp/campaigns/${immediateCampaignId}/sync`, headers: auth(),
    });
    expect(synced.statusCode).toBe(200);
    expect(synced.json().campaign).toMatchObject({ status: 'SENDING', sentCount: 1 });
    const syncedRecipient = await prisma.whatsAppRecipient.findFirstOrThrow({
      where: { campaignId: immediateCampaignId },
    });
    expect(syncedRecipient).toMatchObject({
      status: 'SENT', externalMessageIds: ['full-flow-outbound-message'],
    });

    const canceled = await inject({
      method: 'POST', url: `/whatsapp/campaigns/${futureCampaignId}/cancel`, headers: auth(),
    });
    expect(canceled.statusCode).toBe(200);
    expect(canceled.json().campaign.status).toBe('CANCELED');
    const canceledStored = await prisma.whatsAppCampaign.findUniqueOrThrow({
      where: { id: futureCampaignId }, include: { recipients: true },
    });
    expect(canceledStored).toMatchObject({ status: 'CANCELED', canceledAt: expect.any(Date) });
    expect(canceledStored.recipients).toHaveLength(1);
    expect(canceledStored.recipients[0]).toMatchObject({
      status: 'CANCELED', canceledAt: expect.any(Date),
    });
    expect(upstreamRequests.slice(controlRequestStart)
      .filter(({ url }) => url === '/sender/edit')
      .map(({ method, url, body }) => ({ method, url, body }))).toEqual([
      { method: 'POST', url: '/sender/edit', body: { folder_id: immediateFolderId, action: 'stop' } },
      { method: 'POST', url: '/sender/edit', body: { folder_id: immediateFolderId, action: 'continue' } },
      { method: 'POST', url: '/sender/edit', body: { folder_id: editedFolderId, action: 'delete' } },
    ]);

    async function webhook(payload: unknown, useQuerySecret = false) {
      return inject({
        method: 'POST',
        url: useQuerySecret
          ? `/public/whatsapp/webhook?secret=${encodeURIComponent(WEBHOOK_SECRET)}`
          : '/public/whatsapp/webhook',
        headers: useQuerySecret ? {} : { 'x-webhook-secret': WEBHOOK_SECRET },
        payload,
      });
    }

    const deliveryPayload = {
      event: 'messages_update', eventId: 'full-flow-delivery-event', data: {
        messageid: 'full-flow-outbound-message', sender: supporterPhone,
        status: 'Delivered', timestamp: '2026-08-01T12:11:00.000Z',
      },
    };
    const delivery = await webhook(deliveryPayload, true);
    const deliveryDuplicate = await webhook(deliveryPayload);
    expect(delivery.json()).toEqual({ accepted: true, processed: true, duplicate: false });
    expect(deliveryDuplicate.json()).toEqual({ accepted: true, processed: false, duplicate: true });

    const readPayload = {
      event: 'messages_update', eventId: 'full-flow-read-event', data: {
        messageid: 'full-flow-outbound-message', sender: supporterPhone,
        status: 'Read', timestamp: '2026-08-01T12:12:00.000Z',
      },
    };
    expect((await webhook(readPayload)).json()).toMatchObject({ processed: true, duplicate: false });
    expect((await webhook(readPayload)).json()).toMatchObject({ processed: false, duplicate: true });

    const replyPayload = {
      event: 'messages', eventId: 'full-flow-reply-event', data: {
        messageid: 'full-flow-reply-message', sender: supporterPhone, fromMe: false,
        text: 'Recebido', quoted: { messageid: 'full-flow-outbound-message' },
        timestamp: '2026-08-01T12:13:00.000Z',
      },
    };
    expect((await webhook(replyPayload)).json()).toMatchObject({ processed: true, duplicate: false });
    expect((await webhook(replyPayload)).json()).toMatchObject({ processed: false, duplicate: true });

    const exitPayload = {
      event: 'messages', eventId: 'full-flow-exit-event', data: {
        messageid: 'full-flow-exit-message', sender: supporterPhone, fromMe: false,
        text: 'SAIR', quoted: { messageid: 'full-flow-outbound-message' },
        timestamp: '2026-08-01T12:14:00.000Z',
      },
    };
    expect((await webhook(exitPayload)).json()).toMatchObject({ processed: true, duplicate: false });
    expect((await webhook(exitPayload)).json()).toMatchObject({ processed: false, duplicate: true });

    const webhookCampaign = await prisma.whatsAppCampaign.findUniqueOrThrow({
      where: { id: immediateCampaignId },
    });
    expect(webhookCampaign).toMatchObject({
      sentCount: 1, deliveredCount: 1, readCount: 1, replyCount: 1, optOutCount: 1,
    });
    expect(await prisma.whatsAppInteraction.count({ where: { campaignId: immediateCampaignId } })).toBe(4);
    expect(await prisma.whatsAppSuppression.findUnique({
      where: { tenantId_phoneNormalized: { tenantId: tenant.id, phoneNormalized: supporterPhone } },
    })).toMatchObject({ active: true, reason: 'SAIR', source: 'WEBHOOK' });

    const manualSuppression = await inject({
      method: 'POST', url: '/whatsapp/suppressions', headers: auth(),
      payload: { phone: '(31) 99999-9999', reason: 'Pedido manual' },
    });
    expect(manualSuppression.statusCode).toBe(201);
    expect(manualSuppression.json().suppression).toMatchObject({
      phoneNormalized: '5531999999999', active: true, source: 'MANUAL', reason: 'Pedido manual',
    });
    const reauthorized = await inject({
      method: 'POST',
      url: `/whatsapp/suppressions/${manualSuppression.json().suppression.id}/reauthorize`,
      headers: auth(), payload: { consentimentoConfirmado: true },
    });
    expect(reauthorized.statusCode).toBe(200);
    expect(reauthorized.json().suppression).toMatchObject({
      active: false, reauthorizedById: coordinatorId,
    });

    const foreignCampaign = await inject({
      method: 'GET', url: '/whatsapp/campaigns/full-flow-foreign-campaign', headers: auth(),
    });
    expect(foreignCampaign.statusCode).toBe(404);
    expect(foreignCampaign.json()).toEqual({ error: 'Campaign not found.' });

    const persistedErrors = JSON.stringify(await prisma.whatsAppCampaign.findMany({
      select: { id: true, lastError: true, recipients: { select: { error: true } } },
    }));
    const responses = responseBodies.join('\n');
    const errors = `${errorBodies.join('\n')}\n${persistedErrors}`;
    const logs = logChunks.join('');
    for (const secret of secrets) {
      expect(responses).not.toContain(secret);
      expect(errors).not.toContain(secret);
      expect(logs).not.toContain(secret);
    }
    expect(logs).toContain('secret=[REDACTED]');
  }, 120_000);
}

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';

const databaseUrl = process.env.DATABASE_URL
  ?? 'postgresql://postgres:postgres@localhost:5432/rede_evangelica_uazapi_task2?schema=public';
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'whatsapp-resource-test-secret';
process.env.WHATSAPP_ENCRYPTION_KEY = '11'.repeat(32);
process.env.UAZAPI_ADMIN_TOKEN = 'admin-test-token';
process.env.UAZAPI_WEBHOOK_SECRET = 'webhook secret/with symbols';
process.env.PUBLIC_API_URL = 'https://api.example.test';
process.env.WHATSAPP_UPLOAD_MAX_MB = '1';

let upstream: FastifyInstance;
let app: FastifyInstance;
let basePrisma: any;
let prisma: any;
let runtimeConfig: any;
let setCurrentTenant: (tenant: { id: string; slug: string; name: string }) => void;
let coordinatorToken: string;
let leaderToken: string;
let verifierToken: string;
let coordinatorId: string;
const upstreamRequests: Array<{ method: string; url: string; headers: unknown; body: unknown }> = [];
let webhookShouldFail = false;

const tenantA = { id: 'whatsapp-tenant-a', slug: 'whatsapp-a', name: 'WhatsApp A' };
const tenantB = { id: 'whatsapp-tenant-b', slug: 'whatsapp-b', name: 'WhatsApp B' };

beforeAll(async () => {
  upstream = Fastify({ logger: false });
  upstream.post('/instance/create', async (request) => {
    upstreamRequests.push({ method: request.method, url: request.url, headers: request.headers, body: request.body });
    return {
      instance: { id: 'remote-instance-1', name: 'Rede Guti', status: 'disconnected' },
      connected: false,
      loggedIn: false,
      token: 'plain-instance-token',
    };
  });
  upstream.post('/webhook', async (request, reply) => {
    upstreamRequests.push({ method: request.method, url: request.url, headers: request.headers, body: request.body });
    if (webhookShouldFail) {
      return reply.code(500).type('text/html').send('<p>unsafe webhook failure</p>');
    }
    return { enabled: true };
  });
  upstream.get('/instance/status', async (request) => {
    upstreamRequests.push({ method: request.method, url: request.url, headers: request.headers, body: request.body });
    return {
      instance: {
        id: 'remote-instance-1', name: 'Rede Guti', status: 'connected', profileName: 'Rede',
        token: 'remote-response-token',
      },
      status: {
        connected: true, loggedIn: true,
        jid: { user: '5511987654321', token: 'nested-response-token' },
      },
    };
  });
  upstream.post('/instance/connect', async (request) => {
    upstreamRequests.push({ method: request.method, url: request.url, headers: request.headers, body: request.body });
    return {
      connected: false,
      loggedIn: false,
      instance: {
        id: 'remote-instance-1',
        name: 'Rede Guti',
        status: 'connecting',
        qrcode: 'data:image/png;base64,official-qr',
        paircode: 'PAIR-1234',
        token: 'nested-connect-token',
        auth: { password: 'nested-connect-password' },
      },
    };
  });
  upstream.post('/instance/disconnect', async (request) => {
    upstreamRequests.push({ method: request.method, url: request.url, headers: request.headers, body: request.body });
    return { response: 'Disconnected' };
  });
  upstream.delete('/instance', async (request, reply) => {
    upstreamRequests.push({ method: request.method, url: request.url, headers: request.headers, body: request.body });
    return reply.code(204).send();
  });
  await upstream.listen({ host: '127.0.0.1', port: 0 });
  const address = upstream.server.address();
  if (!address || typeof address === 'string') throw new Error('missing upstream address');
  process.env.UAZAPI_BASE_URL = `http://127.0.0.1:${address.port}`;

  const [{ buildApp }, db, tenantContext, configModule] = await Promise.all([
    import('../../src/app.js'),
    import('../../src/db.js'),
    import('../../src/lib/tenantContext.js'),
    import('../../src/config.js'),
  ]);
  basePrisma = db.basePrisma;
  prisma = db.prisma;
  setCurrentTenant = tenantContext.setCurrentTenant;
  runtimeConfig = configModule.config;

  await basePrisma.tenant.upsert({ where: { id: tenantA.id }, update: tenantA, create: tenantA });
  await basePrisma.tenant.upsert({ where: { id: tenantB.id }, update: tenantB, create: tenantB });
  setCurrentTenant(tenantA);
  const testTenants = { in: [tenantA.id, tenantB.id] };
  await basePrisma.whatsAppMedia.deleteMany({ where: { tenantId: testTenants } });
  await basePrisma.whatsAppTemplate.deleteMany({ where: { tenantId: testTenants } });
  await basePrisma.whatsAppConfig.deleteMany({ where: { tenantId: testTenants } });
  await basePrisma.user.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });

  const users = await Promise.all([
    basePrisma.user.create({ data: {
      tenantId: tenantA.id, email: 'coord-whatsapp@example.test', passwordHash: 'unused', role: 'COORDENADOR', active: true,
    } }),
    basePrisma.user.create({ data: {
      tenantId: tenantA.id, email: 'leader-whatsapp@example.test', passwordHash: 'unused', role: 'LIDER_REGIONAL', active: true,
    } }),
    basePrisma.user.create({ data: {
      tenantId: tenantA.id, email: 'verifier-whatsapp@example.test', passwordHash: 'unused', role: 'VERIFICADORA', active: true,
    } }),
  ]);
  coordinatorId = users[0].id;

  app = await buildApp({ logger: false });
  coordinatorToken = app.jwt.sign({ sub: users[0].id, role: users[0].role, tenantId: tenantA.id });
  leaderToken = app.jwt.sign({ sub: users[1].id, role: users[1].role, tenantId: tenantA.id });
  verifierToken = app.jwt.sign({ sub: users[2].id, role: users[2].role, tenantId: tenantA.id });
});

afterAll(async () => {
  await app?.close();
  await upstream?.close();
  await basePrisma?.$disconnect();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

function multipartFile(filename: string, mimeType: string, bytes: Uint8Array) {
  const boundary = '----rede-guti-whatsapp-boundary';
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([prefix, Buffer.from(bytes), suffix]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe('WhatsApp instance resource', () => {
  test('requires public webhook settings before creating any remote or local instance', async () => {
    for (const key of ['publicApiUrl', 'uazapiWebhookSecret'] as const) {
      const original = runtimeConfig[key];
      const requestCount = upstreamRequests.length;
      runtimeConfig[key] = null;
      try {
        const response = await app.inject({
          method: 'POST', url: '/whatsapp/instance', headers: auth(coordinatorToken),
          payload: { name: 'Sem webhook' },
        });
        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({ error: 'WhatsApp integration is not configured.' });
        expect(upstreamRequests).toHaveLength(requestCount);
        expect(await prisma.whatsAppConfig.findUnique({ where: { tenantId: tenantA.id } })).toBeNull();
      } finally {
        runtimeConfig[key] = original;
      }
    }
  });

  test('allows only a coordinator to create the encrypted, webhook-configured instance', async () => {
    for (const token of [leaderToken, verifierToken]) {
      const denied = await app.inject({
        method: 'POST', url: '/whatsapp/instance', headers: auth(token), payload: { name: 'Rede Guti' },
      });
      expect(denied.statusCode).toBe(403);
    }

    const response = await app.inject({
      method: 'POST', url: '/whatsapp/instance', headers: auth(coordinatorToken), payload: { name: 'Rede Guti' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      configured: true,
      instanceId: 'remote-instance-1',
      name: 'Rede Guti',
      status: 'disconnected',
      connected: false,
    });
    expect(response.body).not.toContain('plain-instance-token');
    expect(response.body).not.toContain('admin-test-token');

    const stored = await prisma.whatsAppConfig.findUnique({ where: { tenantId: tenantA.id } });
    expect(stored.instanceTokenEncrypted).toStartWith('v1:');
    expect(stored.instanceTokenEncrypted).not.toContain('plain-instance-token');
    expect(JSON.stringify(stored)).not.toContain('plain-instance-token');

    expect(upstreamRequests.slice(-2).map(({ url, headers, body }) => ({
      url,
      admintoken: (headers as Record<string, string>).admintoken,
      token: (headers as Record<string, string>).token,
      body,
    }))).toEqual([
      {
        url: '/instance/create', admintoken: 'admin-test-token', token: undefined,
        body: { name: 'Rede Guti' },
      },
      {
        url: '/webhook', admintoken: undefined, token: 'plain-instance-token',
        body: {
          enabled: true,
          url: 'https://api.example.test/public/whatsapp/webhook?secret=webhook%20secret%2Fwith%20symbols',
          events: ['messages', 'messages_update', 'sender'],
          excludeMessages: ['wasSentByApi'],
        },
      },
    ]);
  });

  test('returns safe connection data and requests QR connection without a phone', async () => {
    const status = await app.inject({
      method: 'GET', url: '/whatsapp/instance', headers: auth(coordinatorToken),
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({
      configured: true,
      instanceId: 'remote-instance-1',
      name: 'Rede Guti',
      phone: '5511987654321',
      status: 'connected',
      connection: { connected: true, loggedIn: true, jid: { user: '5511987654321' } },
    });
    expect(status.body).not.toContain('token');

    const connect = await app.inject({
      method: 'POST', url: '/whatsapp/instance/connect', headers: auth(coordinatorToken),
    });
    expect(connect.statusCode).toBe(200);
    expect(connect.json()).toEqual({
      connected: false,
      loggedIn: false,
      qrcode: 'data:image/png;base64,official-qr',
      paircode: 'PAIR-1234',
      instance: { id: 'remote-instance-1', name: 'Rede Guti', status: 'connecting' },
    });
    expect(connect.body).not.toContain('nested-connect-token');
    expect(connect.body).not.toContain('nested-connect-password');
    expect(upstreamRequests.at(-1)).toMatchObject({ url: '/instance/connect', body: {} });

    const disconnect = await app.inject({
      method: 'POST', url: '/whatsapp/instance/disconnect', headers: auth(coordinatorToken),
    });
    expect(disconnect.statusCode).toBe(200);
    expect(disconnect.json()).toEqual({ response: 'Disconnected' });
  });

  test('compensates a webhook failure and leaves no partially configured local instance', async () => {
    await prisma.whatsAppConfig.deleteMany();
    const firstRequest = upstreamRequests.length;
    webhookShouldFail = true;
    let response;
    try {
      response = await app.inject({
        method: 'POST', url: '/whatsapp/instance', headers: auth(coordinatorToken),
        payload: { name: 'Falha webhook' },
      });
    } finally {
      webhookShouldFail = false;
    }

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('plain-instance-token');
    expect(response.body).not.toContain('unsafe webhook failure');
    expect(await prisma.whatsAppConfig.findUnique({ where: { tenantId: tenantA.id } })).toBeNull();
    expect(upstreamRequests.slice(firstRequest).map(({ method, url, headers }) => ({
      method,
      url,
      admintoken: (headers as Record<string, string>).admintoken,
      token: (headers as Record<string, string>).token,
    }))).toEqual([
      { method: 'POST', url: '/instance/create', admintoken: 'admin-test-token', token: undefined },
      { method: 'POST', url: '/webhook', admintoken: undefined, token: 'plain-instance-token' },
      { method: 'DELETE', url: '/instance', admintoken: undefined, token: 'plain-instance-token' },
    ]);
  });

  test('compensates when local persistence fails after external create and webhook setup', async () => {
    const firstRequest = upstreamRequests.length;
    await basePrisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION reject_whatsapp_config_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'deterministic config persistence failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await basePrisma.$executeRawUnsafe(`
      CREATE TRIGGER reject_whatsapp_config_insert_trigger
      BEFORE INSERT ON whatsapp_configs
      FOR EACH ROW EXECUTE FUNCTION reject_whatsapp_config_insert()
    `);
    let response;
    try {
      response = await app.inject({
        method: 'POST', url: '/whatsapp/instance', headers: auth(coordinatorToken),
        payload: { name: 'Falha de persistência' },
      });
    } finally {
      await basePrisma.$executeRawUnsafe(
        'DROP TRIGGER reject_whatsapp_config_insert_trigger ON whatsapp_configs',
      );
      await basePrisma.$executeRawUnsafe('DROP FUNCTION reject_whatsapp_config_insert()');
    }

    expect(response.statusCode).toBe(503);
    expect(await prisma.whatsAppConfig.findUnique({ where: { tenantId: tenantA.id } })).toBeNull();
    expect(upstreamRequests.slice(firstRequest).map(({ method, url }) => ({ method, url }))).toEqual([
      { method: 'POST', url: '/instance/create' },
      { method: 'POST', url: '/webhook' },
      { method: 'DELETE', url: '/instance' },
    ]);
  });

  test('serializes concurrent provisioning and returns conflict without another external instance', async () => {
    const firstRequest = upstreamRequests.length;
    const invoke = () => app.inject({
      method: 'POST', url: '/whatsapp/instance', headers: auth(coordinatorToken),
      payload: { name: 'Instância concorrente' },
    });

    const concurrent = await Promise.all([invoke(), invoke()]);

    expect(concurrent.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
    expect(upstreamRequests.slice(firstRequest).map(({ url }) => url)).toEqual([
      '/instance/create', '/webhook',
    ]);
    expect(await prisma.whatsAppConfig.count()).toBe(1);

    const beforeConflict = upstreamRequests.length;
    const conflict = await invoke();
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: 'WhatsApp instance is already configured.' });
    expect(upstreamRequests).toHaveLength(beforeConflict);
  });
});

describe('WhatsApp template resource', () => {
  const content = {
    primary: { type: 'text', text: 'Olá, {{primeiro_nome}}' },
    sequence: [{ type: 'image', mediaId: 'media-1', caption: 'Para {{nome}}' }],
  };

  test('validates content and performs tenant-scoped versioned CRUD, duplicate and favorite operations', async () => {
    const invalid = await app.inject({
      method: 'POST', url: '/whatsapp/templates', headers: auth(coordinatorToken),
      payload: { name: 'Inválido', category: 'MARKETING', content: {
        primary: { type: 'text', text: 'Olá, {{email}}' }, sequence: [],
      } },
    });
    expect(invalid.statusCode).toBe(400);

    const created = await app.inject({
      method: 'POST', url: '/whatsapp/templates', headers: auth(coordinatorToken),
      payload: {
        name: 'Boas-vindas', category: 'MARKETING',
        purpose: 'Boas-vindas a novos apoiadores', content,
      },
    });
    expect(created.statusCode).toBe(201);
    const template = created.json().template;
    expect(template).toMatchObject({
      name: 'Boas-vindas', category: 'MARKETING',
      purpose: 'Boas-vindas a novos apoiadores', content, favorite: false, version: 1,
    });

    await basePrisma.whatsAppTemplate.create({ data: {
      tenantId: tenantB.id,
      createdById: (await basePrisma.user.create({ data: {
        tenantId: tenantB.id, email: 'coord-b@example.test', passwordHash: 'unused', role: 'COORDENADOR', active: true,
      } })).id,
      name: 'Tenant B only', category: 'UTILITY', content,
    } });

    const listed = await app.inject({
      method: 'GET', url: '/whatsapp/templates', headers: auth(coordinatorToken),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().templates).toHaveLength(1);
    expect(listed.json().templates[0]).toMatchObject({
      name: 'Boas-vindas', purpose: 'Boas-vindas a novos apoiadores',
    });

    const updated = await app.inject({
      method: 'PATCH', url: `/whatsapp/templates/${template.id}`, headers: auth(coordinatorToken),
      payload: { name: 'Boas-vindas 2026', purpose: 'Mobilização de apoiadores em 2026' },
    });
    expect(updated.json().template).toMatchObject({
      name: 'Boas-vindas 2026', purpose: 'Mobilização de apoiadores em 2026', version: 2,
    });

    const favorited = await app.inject({
      method: 'PATCH', url: `/whatsapp/templates/${template.id}/favorite`, headers: auth(coordinatorToken),
      payload: { favorite: true },
    });
    expect(favorited.json().template).toMatchObject({ favorite: true, version: 3 });

    const duplicated = await app.inject({
      method: 'POST', url: `/whatsapp/templates/${template.id}/duplicate`, headers: auth(coordinatorToken),
      payload: { name: 'Boas-vindas cópia' },
    });
    expect(duplicated.statusCode).toBe(201);
    const copy = duplicated.json().template;
    expect(copy).toMatchObject({
      name: 'Boas-vindas cópia', category: 'MARKETING',
      purpose: 'Mobilização de apoiadores em 2026', content, favorite: false, version: 1,
    });

    const removed = await app.inject({
      method: 'DELETE', url: `/whatsapp/templates/${copy.id}`, headers: auth(coordinatorToken),
    });
    expect(removed.statusCode).toBe(204);
    expect(await prisma.whatsAppTemplate.findUnique({ where: { id: copy.id } })).toBeNull();
  });
});

describe('WhatsApp media resource', () => {
  test('streams allowed files to storage and serves exact bytes by opaque tenant-scoped token', async () => {
    const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 255, 10]);
    const multipart = multipartFile('guia campanha.pdf', 'application/pdf', bytes);
    const uploaded = await app.inject({
      method: 'POST', url: '/whatsapp/media', headers: {
        ...auth(coordinatorToken), 'content-type': multipart.contentType,
      }, payload: multipart.payload,
    });
    expect(uploaded.statusCode).toBe(201);
    const media = uploaded.json().media;
    expect(media).toMatchObject({ filename: 'guia campanha.pdf', mimeType: 'application/pdf', sizeBytes: bytes.length });
    expect(media.publicUrl).toMatch(/^https:\/\/api\.example\.test\/public\/whatsapp\/media\/[A-Za-z0-9_-]{40,}$/);
    expect(media).not.toHaveProperty('bytes');
    expect(media).not.toHaveProperty('publicToken');

    const downloaded = await app.inject({ method: 'GET', url: new URL(media.publicUrl).pathname });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.headers['content-type']).toBe('application/pdf');
    expect(downloaded.headers['content-length']).toBe(String(bytes.length));
    expect(downloaded.headers['content-disposition']).toBe('inline; filename="guia campanha.pdf"');
    expect(Buffer.from(downloaded.rawPayload)).toEqual(Buffer.from(bytes));

    const foreign = await basePrisma.whatsAppMedia.create({ data: {
      tenantId: tenantB.id,
      uploadedById: (await basePrisma.user.findFirstOrThrow({ where: { tenantId: tenantB.id } })).id,
      filename: 'foreign.pdf', mimeType: 'application/pdf', sizeBytes: 1,
      bytes: Buffer.from([7]), publicToken: 'foreign-opaque-token-tenant-b',
    } });
    const invisible = await app.inject({ method: 'GET', url: `/public/whatsapp/media/${foreign.publicToken}` });
    expect(invisible.statusCode).toBe(404);
  });

  test('rejects forbidden MIME, oversized streams and non-coordinator uploads', async () => {
    const forbidden = multipartFile('script.html', 'text/html', Buffer.from('<script></script>'));
    const forbiddenResponse = await app.inject({
      method: 'POST', url: '/whatsapp/media', headers: {
        ...auth(coordinatorToken), 'content-type': forbidden.contentType,
      }, payload: forbidden.payload,
    });
    expect(forbiddenResponse.statusCode).toBe(415);

    const oversized = multipartFile('large.pdf', 'application/pdf', Buffer.alloc(1024 * 1024 + 1, 1));
    const oversizedResponse = await app.inject({
      method: 'POST', url: '/whatsapp/media', headers: {
        ...auth(coordinatorToken), 'content-type': oversized.contentType,
      }, payload: oversized.payload,
    });
    expect(oversizedResponse.statusCode).toBe(413);

    const allowed = multipartFile('small.pdf', 'application/pdf', Buffer.from('ok'));
    const denied = await app.inject({
      method: 'POST', url: '/whatsapp/media', headers: {
        ...auth(leaderToken), 'content-type': allowed.contentType,
      }, payload: allowed.payload,
    });
    expect(denied.statusCode).toBe(403);
  });
});

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  UazapiClient,
  UazapiError,
} from '../../src/whatsapp/uazapi/client.js';

let upstream: FastifyInstance;
let baseUrl: string;
const requests: Array<{
  method: string;
  url: string;
  admintoken?: string;
  token?: string;
  body: unknown;
}> = [];

beforeAll(async () => {
  upstream = Fastify({ logger: false });
  upstream.all('/*', async (request, reply) => {
    requests.push({
      method: request.method,
      url: request.url,
      admintoken: request.headers.admintoken as string | undefined,
      token: request.headers.token as string | undefined,
      body: request.body,
    });

    if (request.headers.token === 'slow-token') {
      await Bun.sleep(75);
      return { ok: true };
    }
    if (typeof request.headers.token === 'string' && request.headers.token.startsWith('error-')) {
      const status = Number(request.headers.token.slice('error-'.length));
      return reply.code(status).send({
        error: 'unsafe upstream detail',
        token: 'instance-secret',
        nested: { admintoken: 'admin-secret', password: 'password-secret' },
      });
    }
    if (typeof request.headers.token === 'string' && request.headers.token.startsWith('nonjson-')) {
      const [, statusText, bodyKind] = request.headers.token.split('-');
      const body = bodyKind === 'empty' ? '' : bodyKind === 'html' ? '<html>upstream failed</html>' : 'busy';
      return reply
        .code(Number(statusText))
        .type(bodyKind === 'html' ? 'text/html' : 'text/plain')
        .send(body);
    }
    if (request.headers.token === 'malformed-token') {
      return reply.type('application/json').send('{not-json');
    }
    if (request.headers.token === 'sanitize-token') {
      return {
        ok: true,
        token: 'top-level-secret',
        nested: [{ password: 'nested-secret', label: 'kept' }],
      };
    }
    if (request.url === '/instance/create') {
      return {
        instance: {
          id: 'instance-1',
          name: 'Rede Guti',
          token: 'nested-instance-token',
          auth: { password: 'nested-password' },
          metadata: { label: 'kept' },
        },
        token: 'created-token',
        auth: 'top-level-auth',
      };
    }
    return { ok: true };
  });
  await upstream.listen({ host: '127.0.0.1', port: 0 });
  const address = upstream.server.address();
  if (!address || typeof address === 'string') throw new Error('missing test server address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await upstream.close();
});

describe('UazapiClient credential isolation', () => {
  test('uses only admintoken to create an instance and only token on instance calls', async () => {
    requests.length = 0;
    const admin = UazapiClient.forAdmin({ baseUrl, adminToken: 'admin-secret' });
    const instance = UazapiClient.forInstance({ baseUrl, token: 'instance-secret' });

    expect(await admin.createInstance({ name: 'Rede Guti' })).toEqual({
      instance: {
        id: 'instance-1',
        name: 'Rede Guti',
        token: '[REDACTED]',
        auth: '[REDACTED]',
        metadata: { label: 'kept' },
      },
      token: 'created-token',
      auth: '[REDACTED]',
    });
    expect(await instance.getInstanceStatus()).toEqual({ ok: true });

    expect(requests).toEqual([
      {
        method: 'POST', url: '/instance/create', admintoken: 'admin-secret', token: undefined,
        body: { name: 'Rede Guti' },
      },
      {
        method: 'GET', url: '/instance/status', admintoken: undefined, token: 'instance-secret',
        body: undefined,
      },
    ]);
  });

  test('maps every supported operation to the v2.1.1 method, path and payload', async () => {
    requests.length = 0;
    const client = UazapiClient.forInstance({ baseUrl, token: 'instance-secret' });

    await client.connectInstance();
    await client.disconnectInstance();
    await client.deleteInstance();
    await client.getWebhook();
    await client.setWebhook({
      enabled: true,
      url: 'https://api.example.test/public/whatsapp/webhook?secret=safe',
      events: ['messages', 'messages_update', 'sender'],
      excludeMessages: ['wasSentByApi'],
    });
    await client.sendAdvanced({
      delayMin: 5,
      delayMax: 15,
      messages: [{ number: '5511987654321', type: 'text', text: 'Olá' }],
    });
    await client.listFolders('sending');
    await client.listMessages({ folder_id: 'folder-1', messageStatus: 'Sent', limit: 50, offset: 5 });
    await client.editFolder({ folder_id: 'folder-1', action: 'stop' });

    expect(requests.map(({ method, url, body }) => ({ method, url, body }))).toEqual([
      { method: 'POST', url: '/instance/connect', body: {} },
      { method: 'POST', url: '/instance/disconnect', body: undefined },
      { method: 'DELETE', url: '/instance', body: undefined },
      { method: 'GET', url: '/webhook', body: undefined },
      {
        method: 'POST', url: '/webhook', body: {
          enabled: true,
          url: 'https://api.example.test/public/whatsapp/webhook?secret=safe',
          events: ['messages', 'messages_update', 'sender'],
          excludeMessages: ['wasSentByApi'],
        },
      },
      {
        method: 'POST', url: '/sender/advanced', body: {
          delayMin: 5,
          delayMax: 15,
          messages: [{ number: '5511987654321', type: 'text', text: 'Olá' }],
        },
      },
      { method: 'GET', url: '/sender/listfolders?status=sending', body: undefined },
      {
        method: 'POST', url: '/sender/listmessages', body: {
          folder_id: 'folder-1', messageStatus: 'Sent', limit: 50, offset: 5,
        },
      },
      { method: 'POST', url: '/sender/edit', body: { folder_id: 'folder-1', action: 'stop' } },
    ]);
  });

  test('translates request timeouts without exposing credentials', async () => {
    const client = UazapiClient.forInstance({
      baseUrl,
      token: 'slow-token',
      timeoutMs: 10,
    });

    try {
      await client.getInstanceStatus();
      throw new Error('expected timeout');
    } catch (error) {
      expect(error).toBeInstanceOf(UazapiError);
      expect(error).toMatchObject({
        code: 'UAZAPI_TIMEOUT',
        status: 504,
        message: 'Uazapi request timed out.',
      });
      expect(JSON.stringify(error)).not.toContain('instance-secret');
    }
  });

  test('recursively sanitizes credential fields in regular successful responses', async () => {
    const client = UazapiClient.forInstance({ baseUrl, token: 'sanitize-token' });
    expect(await client.getInstanceStatus()).toEqual({
      ok: true,
      token: '[REDACTED]',
      nested: [{ password: '[REDACTED]', label: 'kept' }],
    });
  });

  for (const [status, code, message] of [
    [401, 'UAZAPI_UNAUTHORIZED', 'Uazapi authentication failed.'],
    [429, 'UAZAPI_RATE_LIMITED', 'Uazapi rate limit exceeded.'],
    [500, 'UAZAPI_UPSTREAM_ERROR', 'Uazapi service unavailable.'],
  ] as const) {
    test(`returns a recursively sanitized safe error for ${status}`, async () => {
      const client = UazapiClient.forInstance({ baseUrl, token: `error-${status}` });

      try {
        await client.getInstanceStatus();
        throw new Error('expected request failure');
      } catch (error) {
        expect(error).toBeInstanceOf(UazapiError);
        expect(error).toMatchObject({ code, status, message });
        const serialized = JSON.stringify(error);
        expect(serialized).not.toContain('instance-secret');
        expect(serialized).not.toContain('admin-secret');
        expect(serialized).not.toContain('password-secret');
        expect(serialized).not.toContain('unsafe upstream detail');
      }
    });
  }

  for (const [token, status, code, message] of [
    ['nonjson-401-empty', 401, 'UAZAPI_UNAUTHORIZED', 'Uazapi authentication failed.'],
    ['nonjson-429-text', 429, 'UAZAPI_RATE_LIMITED', 'Uazapi rate limit exceeded.'],
    ['nonjson-500-html', 500, 'UAZAPI_UPSTREAM_ERROR', 'Uazapi service unavailable.'],
  ] as const) {
    test(`translates ${status} before parsing its ${token.split('-').at(-1)} body`, async () => {
      const client = UazapiClient.forInstance({ baseUrl, token });
      expect(client.getInstanceStatus()).rejects.toMatchObject({ code, status, message });
    });
  }

  test('rejects malformed success JSON with a safe gateway error', async () => {
    const client = UazapiClient.forInstance({ baseUrl, token: 'malformed-token' });
    expect(client.getInstanceStatus()).rejects.toMatchObject({
      code: 'UAZAPI_INVALID_RESPONSE',
      status: 502,
      message: 'Uazapi returned an invalid response.',
    });
  });
});

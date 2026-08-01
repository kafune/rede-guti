import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { getTenantId } from '../../lib/tenantContext.js';
import { encryptSecret } from '../../whatsapp/domain/crypto.js';
import {
  getAdminUazapiClient,
  getConfiguredUazapiClient,
} from '../../whatsapp/services/config-service.js';
import { UazapiClient, UazapiError } from '../../whatsapp/uazapi/client.js';

const createSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();

type RemoteRecord = Record<string, unknown>;

const record = (value: unknown): RemoteRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RemoteRecord
    : {};

const optionalString = (value: unknown) => typeof value === 'string' && value ? value : null;
const optionalBoolean = (value: unknown) => typeof value === 'boolean' ? value : undefined;

function safeJid(value: unknown) {
  const jid = record(value);
  return Object.fromEntries(['user', 'agent', 'device', 'server']
    .filter((key) => typeof jid[key] === 'string' || typeof jid[key] === 'number')
    .map((key) => [key, jid[key]]));
}

function sendRouteError(reply: FastifyReply, error: unknown) {
  if (error instanceof UazapiError) {
    return reply.code(error.status).send({ error: error.message, code: error.code });
  }
  const message = error instanceof Error && error.message === 'WhatsApp integration is not configured.'
    ? error.message
    : 'Unable to process WhatsApp instance request.';
  return reply.code(503).send({ error: message });
}

function safeConnectResponse(value: unknown) {
  const response = record(value);
  const instance = record(response.instance);
  const jid = safeJid(response.jid);
  return {
    ...(optionalBoolean(response.connected) === undefined ? {} : { connected: response.connected }),
    ...(optionalBoolean(response.loggedIn) === undefined ? {} : { loggedIn: response.loggedIn }),
    ...(Object.keys(jid).length === 0 ? {} : { jid }),
    ...(optionalString(response.qrcode) === null ? {} : { qrcode: response.qrcode }),
    ...(optionalString(response.pairingCode) === null ? {} : { pairingCode: response.pairingCode }),
    ...(Object.keys(instance).length === 0 ? {} : {
      instance: {
        ...(optionalString(instance.id) === null ? {} : { id: instance.id }),
        ...(optionalString(instance.name) === null ? {} : { name: instance.name }),
        ...(optionalString(instance.status) === null ? {} : { status: instance.status }),
      },
    }),
  };
}

async function configureWebhook(client: UazapiClient) {
  if (!config.publicApiUrl || !config.uazapiWebhookSecret) return false;
  await client.setWebhook({
    enabled: true,
    url: `${config.publicApiUrl}/public/whatsapp/webhook?secret=${encodeURIComponent(config.uazapiWebhookSecret)}`,
    events: ['messages', 'messages_update', 'sender'],
    excludeMessages: ['wasSentByApi'],
  });
  return true;
}

export async function whatsappInstanceRoutes(app: FastifyInstance) {
  app.get('/instance', async (_request, reply) => {
    const stored = await prisma.whatsAppConfig.findUnique({
      where: { tenantId: getTenantId() },
      select: { instanceId: true, instanceName: true, instanceTokenEncrypted: true, phone: true, status: true },
    });
    if (!stored?.instanceTokenEncrypted) return { configured: false };

    try {
      const client = await getConfiguredUazapiClient();
      const remote = record(await client.getInstanceStatus());
      const instance = record(remote.instance);
      const connection = record(remote.status);
      const jid = safeJid(connection.jid);
      const phone = optionalString(jid.user) ?? stored.phone;
      const status = optionalString(instance.status) ?? stored.status;
      const name = optionalString(instance.name) ?? stored.instanceName;
      const instanceId = optionalString(instance.id) ?? stored.instanceId;

      await prisma.whatsAppConfig.update({
        where: { tenantId: getTenantId() },
        data: { phone, status, instanceName: name, instanceId },
      });

      return {
        configured: true,
        instanceId,
        name,
        phone,
        status,
        connection: {
          connected: connection.connected === true,
          loggedIn: connection.loggedIn === true,
          ...(Object.keys(jid).length === 0 ? {} : { jid }),
        },
      };
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.post('/instance', async (request, reply) => {
    const input = createSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'Invalid payload' });
    if (!config.whatsappEncryptionKey || !config.uazapiBaseUrl) {
      return reply.code(503).send({ error: 'WhatsApp integration is not configured.' });
    }

    try {
      const created = await getAdminUazapiClient().createInstance({ name: input.data.name });
      const instance = record(created.instance);
      const token = optionalString(created.token);
      const instanceId = optionalString(instance.id);
      const name = optionalString(instance.name) ?? optionalString(created.name) ?? input.data.name;
      const status = optionalString(instance.status) ?? 'disconnected';
      if (!token || !instanceId) {
        return reply.code(502).send({ error: 'Uazapi returned an invalid instance response.' });
      }

      const encryptedToken = encryptSecret(token, config.whatsappEncryptionKey);
      await prisma.whatsAppConfig.upsert({
        where: { tenantId: getTenantId() },
        update: {
          instanceId,
          instanceName: name,
          instanceTokenEncrypted: encryptedToken,
          phone: null,
          status,
          webhookConfiguredAt: null,
        },
        create: {
          tenantId: getTenantId(),
          instanceId,
          instanceName: name,
          instanceTokenEncrypted: encryptedToken,
          status,
        },
      });

      const instanceClient = UazapiClient.forInstance({ baseUrl: config.uazapiBaseUrl, token });
      if (await configureWebhook(instanceClient)) {
        await prisma.whatsAppConfig.update({
          where: { tenantId: getTenantId() },
          data: { webhookConfiguredAt: new Date() },
        });
      }

      return reply.code(201).send({
        configured: true,
        instanceId,
        name,
        status,
        connected: created.connected === true,
      });
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.post('/instance/connect', async (_request, reply) => {
    try {
      const response = await (await getConfiguredUazapiClient()).connectInstance();
      return reply.send(safeConnectResponse(response));
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.post('/instance/disconnect', async (_request, reply) => {
    try {
      const response = record(await (await getConfiguredUazapiClient()).disconnectInstance());
      return reply.send({
        ...(optionalString(response.response) === null ? {} : { response: response.response }),
        ...(optionalString(response.info) === null ? {} : { info: response.info }),
      });
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });
}

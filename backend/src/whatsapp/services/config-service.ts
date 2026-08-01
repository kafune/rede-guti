import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { getTenantId } from '../../lib/tenantContext.js';
import { decryptSecret } from '../domain/crypto.js';
import { UazapiClient } from '../uazapi/client.js';

const missingConfiguration = () => new Error('WhatsApp integration is not configured.');

export function getAdminUazapiClient(): UazapiClient {
  if (!config.uazapiBaseUrl || !config.uazapiAdminToken) throw missingConfiguration();
  return UazapiClient.forAdmin({
    baseUrl: config.uazapiBaseUrl,
    adminToken: config.uazapiAdminToken,
  });
}

export async function getConfiguredUazapiClient(): Promise<UazapiClient> {
  if (!config.uazapiBaseUrl || !config.whatsappEncryptionKey) throw missingConfiguration();
  const stored = await prisma.whatsAppConfig.findUnique({
    where: { tenantId: getTenantId() },
    select: { instanceTokenEncrypted: true },
  });
  if (!stored?.instanceTokenEncrypted) throw missingConfiguration();

  return UazapiClient.forInstance({
    baseUrl: config.uazapiBaseUrl,
    token: decryptSecret(stored.instanceTokenEncrypted, config.whatsappEncryptionKey),
  });
}

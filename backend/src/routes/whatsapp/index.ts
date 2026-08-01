import type { FastifyInstance } from 'fastify';
import { normalizeRole } from '../../lib/access.js';
import { getTenantId } from '../../lib/tenantContext.js';
import { getAccessDeniedReason } from '../../lib/userAccess.js';
import { whatsappInstanceRoutes } from './instance.js';
import { publicWhatsAppMediaRoutes, whatsappMediaRoutes } from './media.js';
import { whatsappTemplateRoutes } from './templates.js';

export async function whatsappRoutes(app: FastifyInstance) {
  await app.register(async (whatsapp) => {
    whatsapp.addHook('preHandler', async (request) => {
      try {
        await request.jwtVerify();
      } catch {
        throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
      }
      if (request.user.tenantId !== getTenantId()) {
        throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
      }
      if (normalizeRole(request.user.role) !== 'COORDENADOR') {
        throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
      }
      const denied = await getAccessDeniedReason(request.user.sub);
      if (denied) throw Object.assign(new Error(denied), { statusCode: 401 });
    });

    await whatsapp.register(whatsappInstanceRoutes);
    await whatsapp.register(whatsappTemplateRoutes);
    await whatsapp.register(whatsappMediaRoutes);
  }, { prefix: '/whatsapp' });

  await app.register(publicWhatsAppMediaRoutes);
}

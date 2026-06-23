import type { IndicationStatus as IndicationStatusType, Prisma, Role as RoleType } from '@prisma/client';
import prismaClient from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  AuthenticatedUser,
  canCreateSupporters,
  canDeleteSupporters,
  canUpdateSupporterStatus,
  canViewSupporterIdentities,
  isOwnIndication,
  normalizeRole,
  visibleIndicationsWhere
} from '../lib/access.js';
import {
  buildSupporterHierarchyPath,
  getUserDisplayName,
  serializeUserSummary,
  userHierarchySelect,
  userSummarySelect
} from '../lib/hierarchy.js';
import { validateAndNormalizeBrazilWhatsapp } from '../lib/public-registration.js';
import { incrementLeaderIndication } from '../lib/engagementService.js';

const { IndicationStatus } = prismaClient;

const createSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6).optional(),
  email: z.string().email().optional(),
  churchId: z.string().min(1),
  municipalityId: z.string().min(1),
  indicatedBy: z.string().min(2).optional()
});

const querySchema = z.object({
  churchId: z.string().optional(),
  municipalityId: z.string().optional(),
  indicatedBy: z.string().optional(),
  q: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

const paramsSchema = z.object({
  id: z.string().min(1)
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(IndicationStatus)
});

const parseDate = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const indicationQuerySelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  status: true,
  indicatedBy: true,
  indicatedByUserId: true,
  createdAt: true,
  createdById: true,
  church: true,
  municipality: true,
  createdBy: {
    select: userSummarySelect
  },
  indicatedByUser: {
    select: userHierarchySelect
  }
} as const;

const serializeIndicationRecord = (indication: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: IndicationStatusType;
  indicatedBy: string | null;
  indicatedByUserId: string | null;
  createdAt: Date;
  createdById: string;
  church: { id: string; name: string; createdAt: Date };
  municipality: { id: string; name: string; stateCode: string; createdAt: Date };
  createdBy: {
    id: string;
    email: string;
    name: string | null;
    role: RoleType;
  };
  indicatedByUser?: {
    id: string;
    email: string;
    name: string | null;
    role: RoleType;
    indicatedByUser?: any;
  } | null;
}, options?: { redactSupporterIdentity?: boolean; redactContact?: boolean }) => {
  const redactSupporterIdentity = options?.redactSupporterIdentity ?? false;
  // Quando a identidade é totalmente ocultada, o contato também é. Líderes veem
  // o nome dos próprios cadastros, mas nunca o telefone/e-mail (redactContact).
  const redactContact = redactSupporterIdentity || (options?.redactContact ?? false);

  return {
    id: indication.id,
    name: redactSupporterIdentity ? 'Apoiador oculto' : indication.name,
    identityHidden: redactSupporterIdentity,
    phone: redactContact ? null : indication.phone,
    email: redactContact ? null : indication.email,
    status: indication.status,
    indicatedBy:
      indication.indicatedBy ??
      (indication.indicatedByUser ? getUserDisplayName(indication.indicatedByUser) : null),
    indicatedByUserId: indication.indicatedByUserId,
    createdAt: indication.createdAt,
    createdById: indication.createdById,
    createdBy: serializeUserSummary(indication.createdBy),
    indicatedByUser: serializeUserSummary(indication.indicatedByUser),
    church: indication.church,
    municipality: indication.municipality,
    hierarchyPath: redactSupporterIdentity ? null : buildSupporterHierarchyPath(indication)
  };
};

/**
 * Define como cada registro deve ser serializado para o ator:
 * - COORDENADOR / VERIFICADORA: identidade e contato completos.
 * - LIDER_REGIONAL nos próprios cadastros (link dele): nome visível, sem contato.
 * - Demais casos (ex.: cadastros da sub-rede): identidade totalmente oculta.
 */
const indicationRedactionFor = (
  actor: AuthenticatedUser,
  indication: { createdById?: string | null; indicatedByUserId?: string | null }
): { redactSupporterIdentity?: boolean; redactContact?: boolean } => {
  if (canViewSupporterIdentities(actor.role)) {
    return {};
  }

  if (normalizeRole(actor.role) === 'LIDER_REGIONAL' && isOwnIndication(actor, indication)) {
    return { redactContact: true };
  }

  return { redactSupporterIdentity: true };
};

export async function indicationRoutes(app: FastifyInstance) {
  app.get('/indications', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query' });
    }

    const { churchId, municipalityId, indicatedBy, q, dateFrom, dateTo } = parsed.data;
    const from = parseDate(dateFrom);
    const to = parseDate(dateTo);

    if (from === null || to === null) {
      return reply.code(400).send({ error: 'Invalid date range' });
    }

    const filters: Prisma.IndicationWhereInput[] = [visibleIndicationsWhere(request.user)];

    if (churchId) {
      filters.push({ churchId });
    }

    if (municipalityId) {
      filters.push({ municipalityId });
    }

    if (indicatedBy) {
      filters.push({
        OR: [
          { indicatedBy: { contains: indicatedBy, mode: 'insensitive' } },
          { indicatedByUser: { name: { contains: indicatedBy, mode: 'insensitive' } } },
          { indicatedByUser: { email: { contains: indicatedBy, mode: 'insensitive' } } }
        ]
      });
    }

    if (from || to) {
      filters.push({
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {})
        }
      });
    }

    if (q) {
      filters.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { indicatedBy: { contains: q, mode: 'insensitive' } },
          { indicatedByUser: { name: { contains: q, mode: 'insensitive' } } },
          { indicatedByUser: { email: { contains: q, mode: 'insensitive' } } }
        ]
      });
    }

    const indications = await prisma.indication.findMany({
      where: {
        AND: filters
      },
      select: indicationQuerySelect,
      orderBy: { createdAt: 'desc' }
    });

    return {
      indications: indications.map((indication) =>
        serializeIndicationRecord(indication, indicationRedactionFor(request.user, indication))
      )
    };
  });

  app.post('/indications', { preHandler: app.authenticate }, async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    if (!canCreateSupporters(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const actor = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    if (!actor) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const phoneInput = body.data.phone?.trim();
    const normalizedPhone = phoneInput ? validateAndNormalizeBrazilWhatsapp(phoneInput) : undefined;
    if (normalizedPhone && 'error' in normalizedPhone) {
      return reply.code(400).send({ error: normalizedPhone.error });
    }

    const normalizedName = body.data.name.trim();
    const emailInput = body.data.email?.toLowerCase().trim() || undefined;

    const [nameDup, phoneDup, emailDup] = await Promise.all([
      prisma.indication.findFirst({
        where: { name: { equals: normalizedName, mode: 'insensitive' } },
        select: { id: true }
      }),
      normalizedPhone && !('error' in normalizedPhone)
        ? prisma.indication.findFirst({ where: { phone: normalizedPhone.normalized }, select: { id: true } })
        : Promise.resolve(null),
      emailInput
        ? prisma.indication.findFirst({ where: { email: { equals: emailInput, mode: 'insensitive' } }, select: { id: true } })
        : Promise.resolve(null)
    ]);

    if (nameDup) return reply.code(409).send({ error: 'Apoiador com esse nome ja existe.' });
    if (phoneDup) return reply.code(409).send({ error: 'Esse WhatsApp ja esta cadastrado.' });
    if (emailDup) return reply.code(409).send({ error: 'Esse e-mail ja esta cadastrado.' });

    const indication = await prisma.indication.create({
      data: {
        name: body.data.name.trim(),
        phone: normalizedPhone?.normalized,
        email: body.data.email?.toLowerCase().trim(),
        indicatedBy: getUserDisplayName(actor),
        indicatedByUserId: actor.id,
        churchId: body.data.churchId,
        municipalityId: body.data.municipalityId,
        createdById: actor.id
      },
      select: indicationQuerySelect
    });

    // Non-critical: engagement points must not block the main response.
    // Credit goes to indicatedByUserId (falling back to createdById per the
    // current project rule that both fields point to the same leader).
    const leaderId = indication.indicatedByUserId ?? indication.createdById;
    incrementLeaderIndication(leaderId, 'supporter.created', {
      indicationId: indication.id,
      supporterName: indication.name,
      churchId: indication.church.id,
      municipalityId: indication.municipality.id,
    }).catch((err) => console.error('[engagement] supporter.created failed:', err));

    return reply.code(201).send({
      indication: serializeIndicationRecord(indication, indicationRedactionFor(request.user, indication))
    });
  });

  app.delete('/indications/:id', { preHandler: app.authenticate }, async (request, reply) => {
    if (!canDeleteSupporters(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid id' });
    }

    await prisma.indication.delete({ where: { id: params.data.id } });
    return reply.code(204).send();
  });

  app.patch('/indications/:id/status', { preHandler: app.authenticate }, async (request, reply) => {
    if (!canUpdateSupporterStatus(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid id' });
    }

    const body = updateStatusSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const existing = await prisma.indication.findUnique({
      where: { id: params.data.id },
      select: { id: true }
    });

    if (!existing) {
      return reply.code(404).send({ error: 'Indication not found' });
    }

    const indication = await prisma.indication.update({
      where: { id: params.data.id },
      data: { status: body.data.status },
      select: indicationQuerySelect
    });

    return {
      indication: serializeIndicationRecord(indication, indicationRedactionFor(request.user, indication))
    };
  });
}

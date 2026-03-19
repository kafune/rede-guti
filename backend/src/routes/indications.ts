import type { Prisma } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { canCreateSupporters, canDeleteSupporters, visibleIndicationsWhere } from '../lib/access.js';
import {
  buildSupporterHierarchyPath,
  getUserDisplayName,
  serializeUserSummary,
  userHierarchySelect,
  userSummarySelect
} from '../lib/hierarchy.js';

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
    role: 'COORDENADOR' | 'LIDER_REGIONAL' | 'LIDER_LOCAL';
  };
  indicatedByUser?: {
    id: string;
    email: string;
    name: string | null;
    role: 'COORDENADOR' | 'LIDER_REGIONAL' | 'LIDER_LOCAL';
    indicatedByUser?: any;
  } | null;
}) => ({
  id: indication.id,
  name: indication.name,
  phone: indication.phone,
  email: indication.email,
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
  hierarchyPath: buildSupporterHierarchyPath(indication)
});

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

    return { indications: indications.map(serializeIndicationRecord) };
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

    const indication = await prisma.indication.create({
      data: {
        name: body.data.name.trim(),
        phone: body.data.phone?.trim(),
        email: body.data.email?.toLowerCase().trim(),
        indicatedBy: getUserDisplayName(actor),
        indicatedByUserId: actor.id,
        churchId: body.data.churchId,
        municipalityId: body.data.municipalityId,
        createdById: actor.id
      },
      select: indicationQuerySelect
    });

    return reply.code(201).send({ indication: serializeIndicationRecord(indication) });
  });

  app.delete('/indications/:id', { preHandler: app.authenticate }, async (request, reply) => {
    if (!canDeleteSupporters(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid id' });
    }

    await prisma.indication.delete({ where: { id: params.data.id } });
    return reply.code(204).send();
  });
}

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  buildSupporterHierarchyPath,
  getUserDisplayName,
  serializeUserSummary,
  userHierarchySelect,
  userSummarySelect
} from '../lib/hierarchy.js';

const createPublicSchema = z
  .object({
    name: z.string().min(2),
    phone: z.string().min(6),
    email: z.string().email(),
    churchName: z.string().min(2),
    municipalityName: z.string().min(2),
    indicatedBy: z.string().min(2).optional(),
    indicatedByUserId: z.string().min(1).optional()
  })
  .refine((data) => Boolean(data.indicatedBy?.trim() || data.indicatedByUserId?.trim()), {
    message: 'Indicator is required'
  });

const normalizeText = (value: string) => value.trim();

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

export async function publicRoutes(app: FastifyInstance) {
  app.get('/public/options', async () => {
    const [churches, municipalities, settings] = await Promise.all([
      prisma.church.findMany({
        select: { name: true },
        orderBy: { name: 'asc' }
      }),
      prisma.municipality.findMany({
        select: { name: true },
        orderBy: { name: 'asc' }
      }),
      prisma.appConfig.findUnique({
        where: { id: 'default' },
        select: { whatsappGroupLink: true }
      })
    ]);

    return {
      churches: churches.map((c) => c.name),
      municipalities: municipalities.map((m) => m.name),
      whatsappGroupLink: settings?.whatsappGroupLink ?? null
    };
  });

  app.post('/public/indications', async (request, reply) => {
    const body = createPublicSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const data = body.data;
    const name = normalizeText(data.name);
    const phone = normalizeText(data.phone);
    const email = data.email.toLowerCase().trim();
    const churchName = normalizeText(data.churchName);
    const municipalityName = normalizeText(data.municipalityName);
    const indicatedBy = data.indicatedBy ? normalizeText(data.indicatedBy) : undefined;
    const indicatedByUserId = data.indicatedByUserId?.trim();

    const indicator = indicatedByUserId
      ? await prisma.user.findUnique({
          where: { id: indicatedByUserId },
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        })
      : await prisma.user.findFirst({
          where: {
            OR: [
              { name: { equals: indicatedBy ?? '', mode: 'insensitive' } },
              { email: { equals: (indicatedBy ?? '').toLowerCase() } }
            ]
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        });

    if (!indicator) {
      return reply.code(409).send({ error: 'Indicador nao encontrado.' });
    }

    let church = await prisma.church.findFirst({
      where: { name: { equals: churchName, mode: 'insensitive' } }
    });
    if (!church) {
      church = await prisma.church.create({ data: { name: churchName } });
    }

    let municipality = await prisma.municipality.findFirst({
      where: { name: { equals: municipalityName, mode: 'insensitive' }, stateCode: 'SP' }
    });
    if (!municipality) {
      municipality = await prisma.municipality.create({
        data: { name: municipalityName, stateCode: 'SP' }
      });
    }

    const indication = await prisma.indication.create({
      data: {
        name,
        phone,
        email,
        indicatedBy: getUserDisplayName(indicator),
        indicatedByUserId: indicator.id,
        churchId: church.id,
        municipalityId: municipality.id,
        createdById: indicator.id
      },
      select: indicationQuerySelect
    });

    return reply.code(201).send({ indication: serializeIndicationRecord(indication) });
  });
}

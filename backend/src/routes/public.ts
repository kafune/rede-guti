import type { IndicationStatus as IndicationStatusType, Role as RoleType } from '@prisma/client';
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
import {
  getPublicMunicipalityOptions,
  normalizeMunicipalityName,
  normalizeText,
  validateAndNormalizeBrazilWhatsapp
} from '../lib/public-registration.js';

const createPublicSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe seu nome completo.'),
    phone: z.string().trim().min(1, 'Informe seu WhatsApp.'),
    email: z.string().trim().email('Informe um e-mail valido.'),
    churchName: z.string().trim().min(2, 'Informe sua igreja.'),
    municipalityName: z.string().trim().min(2, 'Informe seu municipio.'),
    indicatedBy: z.string().trim().min(2).optional(),
    indicatedByUserId: z.string().trim().min(1).optional()
  })
  .refine((data) => Boolean(data.indicatedBy?.trim() || data.indicatedByUserId?.trim()), {
    message: 'Indicador obrigatorio.'
  });

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
}) => ({
  id: indication.id,
  name: indication.name,
  phone: indication.phone,
  email: indication.email,
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
  hierarchyPath: buildSupporterHierarchyPath(indication)
});

export async function publicRoutes(app: FastifyInstance) {
  app.get('/public/options', async () => {
    const [churches, settings] = await Promise.all([
      prisma.church.findMany({
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
      municipalities: getPublicMunicipalityOptions(),
      whatsappGroupLink: settings?.whatsappGroupLink ?? null
    };
  });

  app.post('/public/indications', async (request, reply) => {
    const body = createPublicSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados invalidos.' });
    }

    const data = body.data;
    const name = normalizeText(data.name);
    const phoneResult = validateAndNormalizeBrazilWhatsapp(data.phone);
    if ('error' in phoneResult) {
      return reply.code(400).send({ error: phoneResult.error });
    }

    const email = data.email.toLowerCase().trim();
    const churchName = normalizeText(data.churchName);
    const municipalityName = normalizeMunicipalityName(data.municipalityName);
    if (!municipalityName) {
      return reply.code(400).send({ error: 'Selecione um municipio valido da lista.' });
    }

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
      where: {
        name: { equals: municipalityName, mode: 'insensitive' },
        stateCode: 'SP'
      }
    });
    if (!municipality) {
      municipality = await prisma.municipality.create({
        data: { name: municipalityName, stateCode: 'SP' }
      });
    }

    const indication = await prisma.indication.create({
      data: {
        name,
        phone: phoneResult.normalized,
        email,
        indicatedBy: getUserDisplayName(indicator),
        indicatedByUserId: indicator.id,
        churchId: church.id,
        municipalityId: municipality.id,
        createdById: indicator.id
      },
      select: indicationQuerySelect
    });

    const record = serializeIndicationRecord(indication);

    const sheetsUrl = process.env.SHEETS_WEBHOOK_URL;
    if (sheetsUrl) {
      fetch(sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      }).catch(() => {});
    }

    return reply.code(201).send({ indication: record });
  });
}

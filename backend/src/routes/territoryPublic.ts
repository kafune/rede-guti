import { createHash } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { getTenantId } from '../lib/tenantContext.js';
import { haversineMeters, classifyGeofence } from '../lib/geo.js';
import { getTerritorySettings } from '../lib/territorySettings.js';
import { recordAudit } from '../lib/audit.js';
import { VISIT_STATUS } from './territory.js';

const tokenParams = z.object({ token: z.string().min(10) });

// Payload público (mínimo) da visita — só o necessário para o motorista.
const buildPublicVisit = (v: any, settings: any) => ({
  visitNumber: v.visitNumber,
  status: v.status,
  scheduledDate: v.scheduledDate ? v.scheduledDate.toISOString() : null,
  scheduledStartTime: v.scheduledStartTime ?? null,
  tokenRevoked: v.tokenRevoked,
  hasPhoto: Boolean(v.photoUrl),
  checkinAt: v.checkinAt ? v.checkinAt.toISOString() : null,
  church: {
    name: v.church?.name ?? '',
    denomination: v.church?.denomination ?? null,
    pastorName: v.church?.pastorName ?? null,
    formattedAddress: v.church?.formattedAddress ?? null,
    street: v.church?.street ?? null,
    number: v.church?.number ?? null,
    district: v.church?.district ?? null,
    city: v.church?.city ?? null,
    latitude: v.church?.latitude ?? null,
    longitude: v.church?.longitude ?? null,
    zoneNumber: v.church?.electoralZone?.number ?? null,
  },
  team: v.team ? { name: v.team.name } : null,
  settings: {
    requirePhoto: settings.requirePhoto,
    checkinRadiusMeters: settings.checkinRadiusMeters,
    checkinWarnMeters: settings.checkinWarnMeters,
  },
});

const visitInclude = {
  church: { select: { name: true, denomination: true, pastorName: true, formattedAddress: true, street: true, number: true, district: true, city: true, latitude: true, longitude: true, electoralZone: { select: { number: true } } } },
  team: { select: { name: true } },
} as const;

const loadVisitByToken = async (token: string) =>
  prisma.visit.findUnique({ where: { publicToken: token }, include: visitInclude });

export async function territoryPublicRoutes(app: FastifyInstance) {
  // ── GET visit by token ────────────────────────────────────────────────────────
  app.get('/public/visits/:token', async (request, reply) => {
    const p = tokenParams.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: 'Token inválido.' });
    const visit = await loadVisitByToken(p.data.token);
    if (!visit || visit.tokenRevoked) return reply.code(404).send({ error: 'Visita não encontrada ou link revogado.' });
    const settings = await getTerritorySettings();
    return { visit: buildPublicVisit(visit, settings) };
  });

  // ── CHECK-IN (GPS) ──────────────────────────────────────────────────────────────
  const checkinSchema = z.object({
    latitude: z.number(),
    longitude: z.number(),
    accuracy: z.number().nullable().optional(),
    deviceTimestamp: z.string().nullable().optional(),
    justification: z.string().trim().max(500).nullable().optional(),
  });

  app.post('/public/visits/:token/checkin', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const p = tokenParams.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: 'Token inválido.' });
    const body = checkinSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados de localização inválidos.' });

    const visit = await loadVisitByToken(p.data.token);
    if (!visit || visit.tokenRevoked) return reply.code(404).send({ error: 'Visita não encontrada ou link revogado.' });

    const settings = await getTerritorySettings();
    const { latitude, longitude, accuracy, deviceTimestamp, justification } = body.data;

    let distance: number | null = null;
    if (visit.church?.latitude != null && visit.church?.longitude != null) {
      distance = Math.round(haversineMeters(latitude, longitude, visit.church.latitude, visit.church.longitude));
    }
    const geofenceStatus = classifyGeofence(distance, accuracy ?? null, {
      radiusMeters: settings.checkinRadiusMeters,
      warnMeters: settings.checkinWarnMeters,
    });

    const needsJustification = geofenceStatus === 'fora' && !justification?.trim();

    // Append-only: toda tentativa de check-in vira evidência (nunca sobrescreve).
    await prisma.visitCheckin.create({
      data: {
        tenantId: getTenantId(),
        visitId: visit.id,
        latitude, longitude,
        accuracy: accuracy ?? null,
        deviceTimestamp: deviceTimestamp ? new Date(deviceTimestamp) : null,
        distanceFromChurch: distance,
        geofenceStatus,
        withinGeofence: geofenceStatus === 'confirmado',
        justification: justification ?? null,
      },
    });

    const nextStatus = needsJustification ? VISIT_STATUS.PENDENTE_VALIDACAO : VISIT_STATUS.CHECKIN;
    await prisma.visit.update({
      where: { id: visit.id },
      data: {
        status: nextStatus,
        checkinAt: new Date(),
        checkinLatitude: latitude,
        checkinLongitude: longitude,
        checkinAccuracy: accuracy ?? null,
        checkinDeviceTimestamp: deviceTimestamp ? new Date(deviceTimestamp) : null,
        distanceFromChurch: distance,
        geofenceStatus,
        justification: justification ?? visit.justification,
      },
    });

    recordAudit({ action: 'visit.checkin', entityType: 'visit', entityId: visit.id, after: { latitude, longitude, accuracy, distance, geofenceStatus }, request });

    return {
      ok: !needsJustification,
      needsJustification,
      geofenceStatus,
      distanceFromChurch: distance,
      radiusMeters: settings.checkinRadiusMeters,
    };
  });

  // ── PHOTO (base64 data URL; MVP storage) ──────────────────────────────────────────
  const photoSchema = z.object({ photo: z.string().min(32) });
  app.post('/public/visits/:token/photo', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    bodyLimit: 12 * 1024 * 1024,
  }, async (request, reply) => {
    const p = tokenParams.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: 'Token inválido.' });
    const body = photoSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Foto inválida.' });
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/.test(body.data.photo)) {
      return reply.code(400).send({ error: 'Formato de imagem não suportado.' });
    }

    const visit = await loadVisitByToken(p.data.token);
    if (!visit || visit.tokenRevoked) return reply.code(404).send({ error: 'Visita não encontrada ou link revogado.' });

    const hash = createHash('sha256').update(body.data.photo).digest('hex');
    const uploadedAt = new Date();
    await prisma.visit.update({
      where: { id: visit.id },
      data: { photoUrl: body.data.photo, photoHash: hash, photoUploadedAt: uploadedAt },
    });
    // Anexa ao último check-in (evidência vinculada).
    const lastCheckin = await prisma.visitCheckin.findFirst({ where: { visitId: visit.id }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (lastCheckin) {
      await prisma.visitCheckin.update({ where: { id: lastCheckin.id }, data: { photoUrl: body.data.photo, photoHash: hash } });
    }
    recordAudit({ action: 'visit.photo', entityType: 'visit', entityId: visit.id, after: { photoHash: hash }, request });
    return { ok: true, photoHash: hash };
  });

  // ── OUTCOME (prestação de contas + conclusão) ───────────────────────────────────
  const outcomeSchema = z.object({
    happened: z.enum(['sim', 'nao', 'parcialmente']),
    outcome: z.string().trim().max(120).optional(),
    responsibleContacted: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(1000).optional(),
    nextAction: z.string().trim().max(500).optional(),
    followUpDate: z.string().nullable().optional(),
  });

  app.post('/public/visits/:token/outcome', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const p = tokenParams.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: 'Token inválido.' });
    const body = outcomeSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados do resultado inválidos.' });

    const visit = await loadVisitByToken(p.data.token);
    if (!visit || visit.tokenRevoked) return reply.code(404).send({ error: 'Visita não encontrada ou link revogado.' });
    if (!visit.checkinAt) return reply.code(409).send({ error: 'Faça o check-in antes de concluir.' });

    const settings = await getTerritorySettings();
    if (settings.requirePhoto && !visit.photoUrl) {
      return reply.code(409).send({ error: 'A foto do local é obrigatória para concluir.' });
    }

    const status = body.data.happened === 'nao' ? VISIT_STATUS.NAO_REALIZADA : VISIT_STATUS.REALIZADA;
    const updated = await prisma.visit.update({
      where: { id: visit.id },
      data: {
        status,
        checkoutAt: new Date(),
        outcomeHappened: body.data.happened,
        outcome: body.data.outcome,
        responsibleContacted: body.data.responsibleContacted,
        notes: body.data.notes,
        nextAction: body.data.nextAction,
        followUpDate: body.data.followUpDate ? new Date(body.data.followUpDate) : null,
      },
      include: visitInclude,
    });
    recordAudit({ action: 'visit.outcome', entityType: 'visit', entityId: visit.id, after: { happened: body.data.happened, status }, request });
    return { ok: true, visit: buildPublicVisit(updated, settings) };
  });
}

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { normalizeRole } from '../lib/access.js';
import { getTenantId } from '../lib/tenantContext.js';
import { resolveZoneByBairro } from '../lib/zoneResolver.js';
import { newVisitToken } from '../lib/visitToken.js';
import { recordAudit } from '../lib/audit.js';
import { SENTINEL_CHURCH_NAME } from '../lib/church.js';
import { getTerritorySettings } from '../lib/territorySettings.js';

// ── Vocabulário de status da visita (String, não enum: configurável no futuro) ─
export const VISIT_STATUS = {
  AGUARDANDO: 'aguardando_agendamento',
  AGENDADA: 'agendada',
  EM_ROTA: 'em_rota',
  CHECKIN: 'checkin_realizado',
  REALIZADA: 'visita_realizada',
  NAO_REALIZADA: 'nao_realizada',
  AUSENTE: 'ausente',
  REAGENDADA: 'reagendada',
  CANCELADA: 'cancelada',
  PENDENTE_VALIDACAO: 'pendente_validacao',
} as const;

const ACTIVE_SCHEDULED = [
  VISIT_STATUS.AGENDADA,
  VISIT_STATUS.REAGENDADA,
  VISIT_STATUS.EM_ROTA,
  VISIT_STATUS.CHECKIN,
];

const requireCoordinator = (request: FastifyRequest, reply: FastifyReply): boolean => {
  if (normalizeRole(request.user.role) !== 'COORDENADOR') {
    reply.code(403).send({ error: 'Apenas a coordenação pode alterar dados territoriais.' });
    return false;
  }
  return true;
};

// ── Serializers ───────────────────────────────────────────────────────────────
const churchListSelect = {
  id: true, name: true, denomination: true, pastorName: true, phone: true,
  whatsapp: true, email: true, street: true, number: true, complement: true,
  district: true, city: true, state: true, postalCode: true, formattedAddress: true,
  latitude: true, longitude: true, geocodingProvider: true, geocodingConfidence: true,
  electoralZoneId: true, zoneClassificationMethod: true, zoneConfidenceScore: true,
  zoneSource: true, zoneRequiresReview: true, zoneValidatedAt: true,
  currentTeamId: true, status: true, priority: true, verificationStatus: true,
  notes: true, createdAt: true, updatedAt: true,
  electoralZone: { select: { id: true, number: true, name: true, color: true } },
  currentTeam: { select: { id: true, name: true } },
} as const;

const serializeChurch = (c: any) => ({
  id: c.id,
  name: c.name,
  denomination: c.denomination ?? null,
  pastorName: c.pastorName ?? null,
  phone: c.phone ?? null,
  whatsapp: c.whatsapp ?? null,
  email: c.email ?? null,
  street: c.street ?? null,
  number: c.number ?? null,
  complement: c.complement ?? null,
  district: c.district ?? null,
  city: c.city ?? null,
  state: c.state ?? null,
  postalCode: c.postalCode ?? null,
  formattedAddress: c.formattedAddress ?? null,
  latitude: c.latitude ?? null,
  longitude: c.longitude ?? null,
  geocodingProvider: c.geocodingProvider ?? null,
  geocodingConfidence: c.geocodingConfidence ?? null,
  electoralZoneId: c.electoralZoneId ?? null,
  zoneNumber: c.electoralZone?.number ?? null,
  zoneColor: c.electoralZone?.color ?? null,
  zoneClassificationMethod: c.zoneClassificationMethod ?? null,
  zoneConfidenceScore: c.zoneConfidenceScore ?? null,
  zoneSource: c.zoneSource ?? null,
  zoneRequiresReview: c.zoneRequiresReview ?? false,
  zoneValidatedAt: c.zoneValidatedAt ? c.zoneValidatedAt.toISOString?.() ?? c.zoneValidatedAt : null,
  currentTeamId: c.currentTeamId ?? null,
  currentTeamName: c.currentTeam?.name ?? null,
  status: c.status ?? 'ativa',
  priority: c.priority ?? null,
  verificationStatus: c.verificationStatus ?? 'nao_verificada',
  notes: c.notes ?? null,
  createdAt: c.createdAt?.toISOString?.() ?? c.createdAt,
  updatedAt: c.updatedAt?.toISOString?.() ?? c.updatedAt,
});

const serializeVisit = (v: any) => ({
  id: v.id,
  churchId: v.churchId,
  churchName: v.church?.name ?? undefined,
  teamId: v.teamId ?? null,
  teamName: v.team?.name ?? null,
  driverUserId: v.driverUserId ?? null,
  visitNumber: v.visitNumber,
  scheduledDate: v.scheduledDate ? v.scheduledDate.toISOString() : null,
  scheduledStartTime: v.scheduledStartTime ?? null,
  scheduledEndTime: v.scheduledEndTime ?? null,
  status: v.status,
  publicToken: v.publicToken,
  tokenRevoked: v.tokenRevoked,
  checkinAt: v.checkinAt ? v.checkinAt.toISOString() : null,
  checkinLatitude: v.checkinLatitude ?? null,
  checkinLongitude: v.checkinLongitude ?? null,
  checkinAccuracy: v.checkinAccuracy ?? null,
  distanceFromChurch: v.distanceFromChurch ?? null,
  geofenceStatus: v.geofenceStatus ?? null,
  justification: v.justification ?? null,
  checkoutAt: v.checkoutAt ? v.checkoutAt.toISOString() : null,
  outcome: v.outcome ?? null,
  outcomeHappened: v.outcomeHappened ?? null,
  responsibleContacted: v.responsibleContacted ?? null,
  nextAction: v.nextAction ?? null,
  followUpDate: v.followUpDate ? v.followUpDate.toISOString() : null,
  notes: v.notes ?? null,
  hasPhoto: Boolean(v.photoUrl),
  photoUrl: v.photoUrl ?? null,
  createdAt: v.createdAt?.toISOString?.() ?? v.createdAt,
  updatedAt: v.updatedAt?.toISOString?.() ?? v.updatedAt,
});

// Settings do tenant (criadas sob demanda) — implementação em lib/territorySettings.
const loadSettings = getTerritorySettings;

export async function territoryRoutes(app: FastifyInstance) {
  // ── SETTINGS ──────────────────────────────────────────────────────────────
  app.get('/territory/settings', { preHandler: app.authenticate }, async () => {
    const s = await loadSettings();
    return { settings: s };
  });

  const settingsSchema = z.object({
    checkinRadiusMeters: z.number().int().min(10).max(2000).optional(),
    checkinWarnMeters: z.number().int().min(10).max(5000).optional(),
    requirePhoto: z.boolean().optional(),
    visitsPerChurch: z.number().int().min(1).max(6).optional(),
  });

  app.patch('/territory/settings', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const body = settingsSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados inválidos.' });
    const current = await loadSettings();
    const s = await prisma.territorySettings.update({
      where: { id: current.id },
      data: body.data,
    });
    return { settings: s };
  });

  // ── ZONES ───────────────────────────────────────────────────────────────────
  app.get('/territory/zones', { preHandler: app.authenticate }, async () => {
    const zones = await prisma.electoralZone.findMany({ orderBy: { number: 'asc' } });
    return { zones };
  });

  // ── CHURCHES: list with filters ───────────────────────────────────────────────
  const listQuery = z.object({
    q: z.string().optional(),
    zone: z.string().optional(), // number
    teamId: z.string().optional(),
    assigned: z.enum(['true', 'false']).optional(),
    needsReview: z.enum(['true', 'false']).optional(),
    hasCoords: z.enum(['true', 'false']).optional(),
    denomination: z.string().optional(),
  });

  app.get('/territory/churches', { preHandler: app.authenticate }, async (request, reply) => {
    const query = listQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Query inválida.' });
    const f = query.data;

    const where: any = { AND: [{ name: { not: SENTINEL_CHURCH_NAME } }] };
    if (f.q) {
      where.AND.push({
        OR: [
          { name: { contains: f.q, mode: 'insensitive' } },
          { district: { contains: f.q, mode: 'insensitive' } },
          { pastorName: { contains: f.q, mode: 'insensitive' } },
          { denomination: { contains: f.q, mode: 'insensitive' } },
        ],
      });
    }
    if (f.zone) where.AND.push({ electoralZone: { number: f.zone } });
    if (f.teamId) where.AND.push({ currentTeamId: f.teamId });
    if (f.assigned === 'true') where.AND.push({ currentTeamId: { not: null } });
    if (f.assigned === 'false') where.AND.push({ currentTeamId: null });
    if (f.needsReview === 'true') {
      where.AND.push({ OR: [{ zoneRequiresReview: true }, { electoralZoneId: null }] });
    }
    if (f.hasCoords === 'true') where.AND.push({ latitude: { not: null } });
    if (f.hasCoords === 'false') where.AND.push({ latitude: null });
    if (f.denomination) where.AND.push({ denomination: { contains: f.denomination, mode: 'insensitive' } });

    const churches = await prisma.church.findMany({
      where,
      select: churchListSelect,
      orderBy: { name: 'asc' },
    });
    return { churches: churches.map(serializeChurch) };
  });

  // ── CHURCHES: detail (+ visits) ────────────────────────────────────────────────
  app.get('/territory/churches/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const id = (request.params as any).id as string;
    const church = await prisma.church.findUnique({ where: { id }, select: churchListSelect });
    if (!church) return reply.code(404).send({ error: 'Igreja não encontrada.' });
    const visits = await prisma.visit.findMany({
      where: { churchId: id },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { visitNumber: 'asc' },
    });
    return { church: serializeChurch(church), visits: visits.map(serializeVisit) };
  });

  const churchInputSchema = z.object({
    name: z.string().trim().min(2),
    denomination: z.string().trim().optional(),
    pastorName: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    whatsapp: z.string().trim().optional(),
    email: z.string().trim().optional(),
    street: z.string().trim().optional(),
    number: z.string().trim().optional(),
    complement: z.string().trim().optional(),
    district: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    postalCode: z.string().trim().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    status: z.string().trim().optional(),
    priority: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  });

  // Resolve a zona pelo bairro e devolve os campos de classificação para gravar.
  const zoneFieldsForDistrict = async (district?: string | null) => {
    const res = await resolveZoneByBairro(district);
    let electoralZoneId: string | null = null;
    if (res.zoneNumber) {
      const zone = await prisma.electoralZone.findFirst({
        where: { number: res.zoneNumber },
        select: { id: true },
      });
      electoralZoneId = zone?.id ?? null;
    }
    return {
      electoralZoneId,
      zoneClassificationMethod: res.method,
      zoneConfidenceScore: res.confidence,
      zoneSource: res.source,
      zoneRequiresReview: res.requiresReview,
      resolution: res,
    };
  };

  // ── CHURCHES: create ───────────────────────────────────────────────────────────
  app.post('/territory/churches', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const body = churchInputSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
    const d = body.data;

    const zoneFields = await zoneFieldsForDistrict(d.district);
    try {
      const church = await prisma.church.create({
        data: {
          tenantId: getTenantId(),
          name: d.name,
          denomination: d.denomination,
          pastorName: d.pastorName,
          phone: d.phone,
          whatsapp: d.whatsapp,
          email: d.email,
          street: d.street,
          number: d.number,
          complement: d.complement,
          district: d.district,
          city: d.city ?? 'Guarulhos',
          state: d.state ?? 'SP',
          postalCode: d.postalCode,
          latitude: d.latitude,
          longitude: d.longitude,
          status: d.status ?? 'ativa',
          priority: d.priority,
          notes: d.notes,
          electoralZoneId: zoneFields.electoralZoneId,
          zoneClassificationMethod: zoneFields.zoneClassificationMethod,
          zoneConfidenceScore: zoneFields.zoneConfidenceScore,
          zoneSource: zoneFields.zoneSource,
          zoneRequiresReview: zoneFields.zoneRequiresReview,
        },
        select: churchListSelect,
      });
      recordAudit({ action: 'church.create', entityType: 'church', entityId: church.id, after: church, request });
      return reply.code(201).send({ church: serializeChurch(church), zoneResolution: zoneFields.resolution });
    } catch (err: any) {
      if (err?.code === 'P2002') return reply.code(409).send({ error: 'Já existe uma igreja com esse nome.' });
      throw err;
    }
  });

  // ── CHURCHES: update ───────────────────────────────────────────────────────────
  app.patch('/territory/churches/:id', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const id = (request.params as any).id as string;
    const body = churchInputSchema.partial().safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados inválidos.' });

    const before = await prisma.church.findUnique({ where: { id }, select: churchListSelect });
    if (!before) return reply.code(404).send({ error: 'Igreja não encontrada.' });

    const d = body.data;
    const data: any = { ...d };

    // Se o bairro mudou, reclassifica a zona (mantendo auditoria).
    if (d.district !== undefined && d.district !== before.district) {
      const zoneFields = await zoneFieldsForDistrict(d.district);
      data.electoralZoneId = zoneFields.electoralZoneId;
      data.zoneClassificationMethod = zoneFields.zoneClassificationMethod;
      data.zoneConfidenceScore = zoneFields.zoneConfidenceScore;
      data.zoneSource = zoneFields.zoneSource;
      data.zoneRequiresReview = zoneFields.zoneRequiresReview;
      data.zoneValidatedById = null;
      data.zoneValidatedAt = null;
    }

    const church = await prisma.church.update({ where: { id }, data, select: churchListSelect });

    const addrChanged = ['street', 'number', 'district', 'latitude', 'longitude'].some(
      (k) => (d as any)[k] !== undefined
    );
    if (addrChanged) {
      recordAudit({ action: 'church.address_change', entityType: 'church', entityId: id, before, after: church, request });
    }
    return { church: serializeChurch(church) };
  });

  // ── CHURCHES: manual zone override (validação administrativa) ────────────────────
  const zoneOverrideSchema = z.object({ zoneNumber: z.string().min(1) });
  app.post('/territory/churches/:id/zone', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const id = (request.params as any).id as string;
    const body = zoneOverrideSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Zona inválida.' });

    const before = await prisma.church.findUnique({ where: { id }, select: churchListSelect });
    if (!before) return reply.code(404).send({ error: 'Igreja não encontrada.' });

    const zone = await prisma.electoralZone.findFirst({ where: { number: body.data.zoneNumber } });
    if (!zone) return reply.code(400).send({ error: 'Zona não cadastrada.' });

    const church = await prisma.church.update({
      where: { id },
      data: {
        electoralZoneId: zone.id,
        zoneClassificationMethod: 'manual',
        zoneConfidenceScore: 1,
        zoneSource: 'Validação manual da coordenação',
        zoneRequiresReview: false,
        zoneValidatedById: (request.user as any).sub,
        zoneValidatedAt: new Date(),
      },
      select: churchListSelect,
    });
    recordAudit({ action: 'church.zone_change', entityType: 'church', entityId: id, before, after: church, request });
    return { church: serializeChurch(church) };
  });

  // ── CHURCHES: reclassify by bairro (re-run resolver) ────────────────────────────
  app.post('/territory/churches/:id/reclassify', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const id = (request.params as any).id as string;
    const before = await prisma.church.findUnique({ where: { id }, select: churchListSelect });
    if (!before) return reply.code(404).send({ error: 'Igreja não encontrada.' });
    const zoneFields = await zoneFieldsForDistrict(before.district);
    const church = await prisma.church.update({
      where: { id },
      data: {
        electoralZoneId: zoneFields.electoralZoneId,
        zoneClassificationMethod: zoneFields.zoneClassificationMethod,
        zoneConfidenceScore: zoneFields.zoneConfidenceScore,
        zoneSource: zoneFields.zoneSource,
        zoneRequiresReview: zoneFields.zoneRequiresReview,
      },
      select: churchListSelect,
    });
    return { church: serializeChurch(church), zoneResolution: zoneFields.resolution };
  });

  // ── CHURCHES: bulk import (pré-visualização vem do frontend; aqui persiste) ──────
  const importSchema = z.object({
    churches: z.array(churchInputSchema).min(1).max(2000),
  });
  app.post('/territory/churches/import', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const body = importSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Payload de importação inválido.' });

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const d of body.data.churches) {
      const exists = await prisma.church.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' } }, select: { id: true } });
      if (exists) { skipped++; continue; }
      try {
        const zoneFields = await zoneFieldsForDistrict(d.district);
        await prisma.church.create({
          data: {
            tenantId: getTenantId(),
            name: d.name, denomination: d.denomination, pastorName: d.pastorName,
            phone: d.phone, whatsapp: d.whatsapp, email: d.email, street: d.street,
            number: d.number, complement: d.complement, district: d.district,
            city: d.city ?? 'Guarulhos', state: d.state ?? 'SP', postalCode: d.postalCode,
            latitude: d.latitude, longitude: d.longitude, notes: d.notes,
            electoralZoneId: zoneFields.electoralZoneId,
            zoneClassificationMethod: zoneFields.zoneClassificationMethod,
            zoneConfidenceScore: zoneFields.zoneConfidenceScore,
            zoneSource: zoneFields.zoneSource,
            zoneRequiresReview: zoneFields.zoneRequiresReview,
          },
        });
        created++;
      } catch (e: any) {
        errors.push(`${d.name}: ${e?.message ?? 'erro'}`);
      }
    }
    return { created, skipped, errors };
  });

  // ── VISITS: generate the N default visits for a church ──────────────────────────
  app.post('/territory/churches/:id/visits/generate', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const id = (request.params as any).id as string;
    const church = await prisma.church.findUnique({ where: { id }, select: { id: true, currentTeamId: true } });
    if (!church) return reply.code(404).send({ error: 'Igreja não encontrada.' });
    const settings = await loadSettings();
    const existing = await prisma.visit.findMany({ where: { churchId: id }, select: { visitNumber: true } });
    const have = new Set(existing.map((v) => v.visitNumber));
    const toCreate: number[] = [];
    for (let n = 1; n <= settings.visitsPerChurch; n++) if (!have.has(n)) toCreate.push(n);

    for (const n of toCreate) {
      await prisma.visit.create({
        data: {
          tenantId: getTenantId(),
          churchId: id,
          teamId: church.currentTeamId,
          visitNumber: n,
          status: VISIT_STATUS.AGUARDANDO,
          publicToken: newVisitToken(),
        },
      });
    }
    const visits = await prisma.visit.findMany({
      where: { churchId: id },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { visitNumber: 'asc' },
    });
    return { visits: visits.map(serializeVisit), createdCount: toCreate.length };
  });

  // ── VISITS: list with filters ──────────────────────────────────────────────────
  const visitQuery = z.object({
    zone: z.string().optional(),
    teamId: z.string().optional(),
    status: z.string().optional(),
    visitNumber: z.string().optional(),
    late: z.enum(['true']).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  });
  app.get('/territory/visits', { preHandler: app.authenticate }, async (request, reply) => {
    const q = visitQuery.safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: 'Query inválida.' });
    const f = q.data;
    const where: any = { AND: [] as any[] };
    if (f.teamId) where.AND.push({ teamId: f.teamId });
    if (f.status) where.AND.push({ status: f.status });
    if (f.visitNumber) where.AND.push({ visitNumber: Number(f.visitNumber) });
    if (f.zone) where.AND.push({ church: { electoralZone: { number: f.zone } } });
    if (f.from) where.AND.push({ scheduledDate: { gte: new Date(f.from) } });
    if (f.to) where.AND.push({ scheduledDate: { lte: new Date(f.to) } });
    if (f.late === 'true') {
      where.AND.push({ scheduledDate: { lt: new Date() } });
      where.AND.push({ status: { notIn: [VISIT_STATUS.REALIZADA, VISIT_STATUS.CANCELADA] } });
    }

    const visits = await prisma.visit.findMany({
      where,
      include: { team: { select: { id: true, name: true } }, church: { select: { name: true } } },
      orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
      take: 1000,
    });
    return { visits: visits.map(serializeVisit) };
  });

  // ── VISITS: schedule / reassign / status ────────────────────────────────────────
  const visitPatchSchema = z.object({
    scheduledDate: z.string().nullable().optional(),
    scheduledStartTime: z.string().nullable().optional(),
    scheduledEndTime: z.string().nullable().optional(),
    teamId: z.string().nullable().optional(),
    driverUserId: z.string().nullable().optional(),
    status: z.string().optional(),
    notes: z.string().optional(),
  });
  app.patch('/territory/visits/:id', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const id = (request.params as any).id as string;
    const body = visitPatchSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados inválidos.' });

    const before = await prisma.visit.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: 'Visita não encontrada.' });

    const d = body.data;
    const data: any = {};
    if (d.scheduledDate !== undefined) data.scheduledDate = d.scheduledDate ? new Date(d.scheduledDate) : null;
    if (d.scheduledStartTime !== undefined) data.scheduledStartTime = d.scheduledStartTime;
    if (d.scheduledEndTime !== undefined) data.scheduledEndTime = d.scheduledEndTime;
    if (d.teamId !== undefined) data.teamId = d.teamId;
    if (d.driverUserId !== undefined) data.driverUserId = d.driverUserId;
    if (d.notes !== undefined) data.notes = d.notes;
    if (d.status !== undefined) data.status = d.status;

    // Agendar automaticamente move de "aguardando" para "agendada".
    if (d.scheduledDate && (before.status === VISIT_STATUS.AGUARDANDO) && d.status === undefined) {
      data.status = VISIT_STATUS.AGENDADA;
    }

    const visit = await prisma.visit.update({
      where: { id },
      data,
      include: { team: { select: { id: true, name: true } }, church: { select: { name: true } } },
    });

    if (d.status !== undefined && d.status !== before.status) {
      recordAudit({ action: 'visit.status_change', entityType: 'visit', entityId: id, before: { status: before.status }, after: { status: d.status }, request });
    }
    if (d.teamId !== undefined && d.teamId !== before.teamId) {
      recordAudit({ action: 'visit.team_change', entityType: 'visit', entityId: id, before: { teamId: before.teamId }, after: { teamId: d.teamId }, request });
    }
    if (d.scheduledDate !== undefined) {
      recordAudit({ action: 'visit.reschedule', entityType: 'visit', entityId: id, before: { scheduledDate: before.scheduledDate }, after: { scheduledDate: data.scheduledDate }, request });
    }
    return { visit: serializeVisit(visit) };
  });

  // ── VISITS: revoke public token (rotate) ────────────────────────────────────────
  app.post('/territory/visits/:id/revoke-token', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const id = (request.params as any).id as string;
    const visit = await prisma.visit.update({
      where: { id },
      data: { publicToken: newVisitToken(), tokenRevoked: false },
      include: { team: { select: { id: true, name: true } }, church: { select: { name: true } } },
    });
    recordAudit({ action: 'visit.token_rotate', entityType: 'visit', entityId: id, request });
    return { visit: serializeVisit(visit) };
  });

  // ── TEAMS ───────────────────────────────────────────────────────────────────────
  app.get('/territory/teams', { preHandler: app.authenticate }, async () => {
    const teams = await prisma.team.findMany({
      include: {
        electoralZone: { select: { id: true, number: true, name: true, color: true } },
        leader: { select: { id: true, name: true, email: true } },
        driver: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { churches: true } },
      },
      orderBy: { name: 'asc' },
    });
    return {
      teams: teams.map((t: any) => ({
        id: t.id,
        name: t.name,
        electoralZoneId: t.electoralZoneId,
        zoneNumber: t.electoralZone?.number ?? null,
        zoneColor: t.electoralZone?.color ?? null,
        leaderUserId: t.leaderUserId,
        leaderName: t.leader?.name ?? t.leader?.email ?? null,
        driverUserId: t.driverUserId,
        driverName: t.driver?.name ?? t.driver?.email ?? null,
        vehicle: t.vehicle ?? null,
        status: t.status,
        notes: t.notes ?? null,
        churchCount: t._count?.churches ?? 0,
        members: t.members.map((m: any) => ({ userId: m.userId, name: m.user?.name ?? m.user?.email, role: m.role ?? null })),
        createdAt: t.createdAt.toISOString(),
      })),
    };
  });

  const teamSchema = z.object({
    name: z.string().trim().min(2),
    electoralZoneId: z.string().nullable().optional(),
    leaderUserId: z.string().nullable().optional(),
    driverUserId: z.string().nullable().optional(),
    vehicle: z.string().trim().nullable().optional(),
    status: z.string().trim().optional(),
    notes: z.string().trim().nullable().optional(),
  });

  app.post('/territory/teams', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const body = teamSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
    const team = await prisma.team.create({ data: { tenantId: getTenantId(), ...body.data } as any });
    return reply.code(201).send({ team });
  });

  app.patch('/territory/teams/:id', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const id = (request.params as any).id as string;
    const body = teamSchema.partial().safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados inválidos.' });
    const existing = await prisma.team.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: 'Equipe não encontrada.' });
    const team = await prisma.team.update({ where: { id }, data: body.data });
    return { team };
  });

  app.delete('/territory/teams/:id', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const id = (request.params as any).id as string;
    const existing = await prisma.team.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: 'Equipe não encontrada.' });
    // Solta as igrejas e visitas (FK SET NULL) antes de remover.
    await prisma.church.updateMany({ where: { currentTeamId: id }, data: { currentTeamId: null } });
    await prisma.team.delete({ where: { id } });
    return reply.code(204).send();
  });

  // Membros da equipe
  const memberSchema = z.object({ userId: z.string().min(1), role: z.string().optional() });
  app.post('/territory/teams/:id/members', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const id = (request.params as any).id as string;
    const body = memberSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados inválidos.' });
    try {
      await prisma.teamMember.create({ data: { tenantId: getTenantId(), teamId: id, userId: body.data.userId, role: body.data.role } });
    } catch (e: any) {
      if (e?.code === 'P2002') return reply.code(409).send({ error: 'Membro já está na equipe.' });
      throw e;
    }
    return reply.code(201).send({ ok: true });
  });

  app.delete('/territory/teams/:id/members/:userId', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const { id, userId } = request.params as any;
    await prisma.teamMember.deleteMany({ where: { teamId: id, userId } });
    return reply.code(204).send();
  });

  // ── ASSIGN churches → team ──────────────────────────────────────────────────────
  const assignSchema = z.object({ churchIds: z.array(z.string()).min(1).max(500), teamId: z.string().nullable() });
  app.post('/territory/assign', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const body = assignSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados inválidos.' });
    const { churchIds, teamId } = body.data;

    if (teamId) {
      const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
      if (!team) return reply.code(400).send({ error: 'Equipe não encontrada.' });
    }

    await prisma.church.updateMany({ where: { id: { in: churchIds } }, data: { currentTeamId: teamId } });
    // Propaga a equipe às visitas ainda não realizadas dessas igrejas.
    await prisma.visit.updateMany({
      where: { churchId: { in: churchIds }, status: { notIn: [VISIT_STATUS.REALIZADA, VISIT_STATUS.CANCELADA] } },
      data: { teamId },
    });
    if (teamId) {
      for (const churchId of churchIds) {
        await prisma.teamChurchAssignment.create({
          data: { tenantId: getTenantId(), teamId, churchId, assignedById: (request.user as any).sub },
        });
      }
    }
    recordAudit({ action: 'church.assign_team', entityType: 'team', entityId: teamId ?? 'none', after: { churchIds, teamId }, request });
    return { updated: churchIds.length };
  });

  // ── REVIEW QUEUE (check-ins para revisão) ────────────────────────────────────────
  app.get('/territory/review', { preHandler: app.authenticate }, async () => {
    const visits = await prisma.visit.findMany({
      where: {
        OR: [
          { geofenceStatus: { in: ['atencao', 'fora'] } },
          { status: VISIT_STATUS.PENDENTE_VALIDACAO },
          { justification: { not: null } },
        ],
        checkinAt: { not: null },
      },
      include: { team: { select: { id: true, name: true } }, church: { select: { name: true } } },
      orderBy: { checkinAt: 'desc' },
      take: 500,
    });
    return { visits: visits.map(serializeVisit) };
  });

  const reviewSchema = z.object({ decision: z.enum(['aprovar', 'rejeitar', 'corrigir']), notes: z.string().optional() });
  app.post('/territory/visits/:id/review', { preHandler: app.authenticate }, async (request, reply) => {
    if (!requireCoordinator(request, reply)) return;
    const id = (request.params as any).id as string;
    const body = reviewSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Decisão inválida.' });
    const before = await prisma.visit.findUnique({ where: { id }, select: { status: true } });
    if (!before) return reply.code(404).send({ error: 'Visita não encontrada.' });
    const status =
      body.data.decision === 'aprovar' ? VISIT_STATUS.REALIZADA
      : body.data.decision === 'rejeitar' ? VISIT_STATUS.NAO_REALIZADA
      : VISIT_STATUS.PENDENTE_VALIDACAO;
    const visit = await prisma.visit.update({
      where: { id },
      data: { status },
      include: { team: { select: { id: true, name: true } }, church: { select: { name: true } } },
    });
    recordAudit({ action: 'visit.review', entityType: 'visit', entityId: id, before, after: { decision: body.data.decision, status, notes: body.data.notes }, request });
    return { visit: serializeVisit(visit) };
  });

  // ── DASHBOARD (funil + por zona + por equipe) ────────────────────────────────────
  app.get('/territory/dashboard', { preHandler: app.authenticate }, async () => {
    const [churches, visits, zones, teams] = await Promise.all([
      prisma.church.findMany({
        where: { name: { not: SENTINEL_CHURCH_NAME } },
        select: { id: true, electoralZoneId: true, currentTeamId: true, zoneRequiresReview: true },
      }),
      prisma.visit.findMany({
        select: { churchId: true, visitNumber: true, status: true, scheduledDate: true, teamId: true, church: { select: { electoralZoneId: true } } },
      }),
      prisma.electoralZone.findMany({ orderBy: { number: 'asc' } }),
      prisma.team.findMany({ select: { id: true, name: true, electoralZoneId: true } }),
    ]);

    const now = new Date();
    const isDone = (s: string) => s === VISIT_STATUS.REALIZADA;
    const isScheduled = (s: string) => ACTIVE_SCHEDULED.includes(s as any);
    const isLate = (v: any) => v.scheduledDate && v.scheduledDate < now && !isDone(v.status) && v.status !== VISIT_STATUS.CANCELADA;

    const churchesTotal = churches.length;
    const churchesWithZone = churches.filter((c) => c.electoralZoneId).length;
    const pendingClassification = churches.filter((c) => !c.electoralZoneId || c.zoneRequiresReview).length;
    const assigned = churches.filter((c) => c.currentTeamId).length;

    const v1 = visits.filter((v) => v.visitNumber === 1);
    const v2 = visits.filter((v) => v.visitNumber === 2);
    const visitsScheduled = visits.filter((v) => isScheduled(v.status)).length;
    const visitsDone = visits.filter((v) => isDone(v.status)).length;
    const visitsLate = visits.filter(isLate).length;

    // Ciclo completo: igrejas com TODAS as visitas realizadas (>=2).
    const byChurch = new Map<string, { total: number; done: number }>();
    for (const v of visits) {
      const e = byChurch.get(v.churchId) ?? { total: 0, done: 0 };
      e.total++;
      if (isDone(v.status)) e.done++;
      byChurch.set(v.churchId, e);
    }
    const cycleComplete = [...byChurch.values()].filter((e) => e.total >= 2 && e.done >= 2).length;

    const funnel = {
      cadastradas: churchesTotal,
      classificadas: churchesWithZone,
      atribuidas: assigned,
      v1Agendada: v1.filter((v) => isScheduled(v.status)).length,
      v1Concluida: v1.filter((v) => isDone(v.status)).length,
      v2Agendada: v2.filter((v) => isScheduled(v.status)).length,
      cicloCompleto: cycleComplete,
    };

    // Por zona
    const zoneById = new Map(zones.map((z) => [z.id, z]));
    const byZone = zones.map((z) => {
      const zChurches = churches.filter((c) => c.electoralZoneId === z.id);
      const zVisits = visits.filter((v) => v.church?.electoralZoneId === z.id);
      const zv1 = zVisits.filter((v) => v.visitNumber === 1);
      const zv2 = zVisits.filter((v) => v.visitNumber === 2);
      return {
        zoneId: z.id, number: z.number, color: z.color, eleitores: z.eleitores,
        churches: zChurches.length,
        assigned: zChurches.filter((c) => c.currentTeamId).length,
        unassigned: zChurches.filter((c) => !c.currentTeamId).length,
        v1Done: zv1.filter((v) => isDone(v.status)).length,
        v1Scheduled: zv1.filter((v) => isScheduled(v.status)).length,
        v2Done: zv2.filter((v) => isDone(v.status)).length,
        v2Scheduled: zv2.filter((v) => isScheduled(v.status)).length,
        late: zVisits.filter(isLate).length,
      };
    });

    // Por equipe
    const byTeam = teams.map((t) => {
      const tVisits = visits.filter((v) => v.teamId === t.id);
      const tv1 = tVisits.filter((v) => v.visitNumber === 1);
      const tv2 = tVisits.filter((v) => v.visitNumber === 2);
      const churchesOfTeam = churches.filter((c) => c.currentTeamId === t.id).length;
      const done = tVisits.filter((v) => isDone(v.status)).length;
      return {
        teamId: t.id, name: t.name,
        zoneNumber: t.electoralZoneId ? zoneById.get(t.electoralZoneId)?.number ?? null : null,
        churches: churchesOfTeam,
        v1Done: tv1.filter((v) => isDone(v.status)).length,
        v2Done: tv2.filter((v) => isDone(v.status)).length,
        late: tVisits.filter(isLate).length,
        pct: tVisits.length ? Math.round((done / tVisits.length) * 100) : 0,
      };
    });

    return {
      cards: {
        churchesTotal, churchesWithZone, pendingClassification, assigned,
        visitsScheduled, visitsDone, visitsLate, cycleComplete,
      },
      funnel,
      byZone,
      byTeam,
    };
  });
}

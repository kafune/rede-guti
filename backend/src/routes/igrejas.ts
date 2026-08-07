import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { canCreateSupporters, normalizeRole } from '../lib/access.js';
import { getTenantId } from '../lib/tenantContext.js';

const paramsSchema = z.object({ id: z.string().min(1) });

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Campos livres com default ''. email validado só quando preenchido.
const baseIgrejaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da igreja.'),
  denominacao: z.string().trim().max(160).optional().default(''),
  pastor: z.string().trim().max(160).optional().default(''),
  endereco: z.string().trim().max(300).optional().default(''),
  bairro: z.string().trim().max(160).optional().default(''),
  cidade: z.string().trim().max(160).optional().default('Guarulhos'),
  estado: z.string().trim().max(40).optional().default('SP'),
  telefone: z.string().trim().max(40).optional().default(''),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .default('')
    .refine((v) => v === '' || emailRegex.test(v), 'E-mail inválido.'),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  observacoes: z.string().trim().max(4000).optional().default(''),
  membrosEstimados: z.number().int().min(0).nullable().optional(),
  zonaEleitoral: z.number().int().min(0).nullable().optional()
});

const createIgrejaSchema = baseIgrejaSchema.extend({
  // Atribuição opcional a uma equipe já no cadastro admin.
  equipeId: z.string().trim().min(1).optional()
});

const publicIgrejaSchema = baseIgrejaSchema.extend({
  // O link público carrega a equipe dona (team_id): obrigatório e vira vínculo.
  equipeId: z.string().trim().min(1, 'Equipe obrigatória.')
});

const updateIgrejaSchema = baseIgrejaSchema.partial();

const igrejaInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  equipes: { include: { equipe: { select: { id: true, nome: true } } } }
} as const;

type IgrejaRecord = Prisma.IgrejaCadastroGetPayload<{ include: typeof igrejaInclude }>;

const serializeIgreja = (i: IgrejaRecord) => ({
  id: i.id,
  nome: i.nome,
  denominacao: i.denominacao,
  pastor: i.pastor,
  endereco: i.endereco,
  bairro: i.bairro,
  cidade: i.cidade,
  estado: i.estado,
  telefone: i.telefone,
  email: i.email,
  latitude: i.latitude,
  longitude: i.longitude,
  observacoes: i.observacoes,
  membrosEstimados: i.membrosEstimados,
  zonaEleitoral: i.zonaEleitoral,
  origem: i.origem,
  createdById: i.createdById,
  createdByNome: i.createdBy ? i.createdBy.name ?? i.createdBy.email : null,
  equipes: i.equipes.map((a) => ({
    assignmentId: a.id,
    equipeId: a.equipeId,
    equipeNome: a.equipe.nome,
    dataAgendada: a.dataAgendada ? a.dataAgendada.toISOString().slice(0, 10) : null
  })),
  createdAt: i.createdAt.toISOString()
});

// Dados escalares comuns aos cadastros admin e público.
const igrejaScalarData = (data: z.infer<typeof baseIgrejaSchema>) => ({
  nome: data.nome,
  denominacao: data.denominacao ?? '',
  pastor: data.pastor ?? '',
  endereco: data.endereco ?? '',
  bairro: data.bairro ?? '',
  cidade: data.cidade ?? 'Guarulhos',
  estado: data.estado ?? 'SP',
  telefone: data.telefone ?? '',
  email: data.email ?? '',
  latitude: data.latitude ?? null,
  longitude: data.longitude ?? null,
  observacoes: data.observacoes ?? '',
  membrosEstimados: data.membrosEstimados ?? null,
  zonaEleitoral: data.zonaEleitoral ?? null
});

export async function igrejaRoutes(app: FastifyInstance) {
  // ── PUBLIC: AUTOCADASTRO POR LINK DE EQUIPE ─────────────────────────────────
  app.post(
    '/public/igrejas',
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = publicIgrejaSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
      }

      const equipe = await prisma.equipe.findUnique({
        where: { id: body.data.equipeId },
        select: { id: true }
      });
      if (!equipe) return reply.code(404).send({ error: 'Equipe não encontrada.' });

      const igreja = await prisma.igrejaCadastro.create({
        data: {
          ...igrejaScalarData(body.data),
          origem: 'public',
          tenantId: getTenantId(),
          equipes: {
            create: { equipeId: equipe.id, tenantId: getTenantId() }
          }
        },
        include: igrejaInclude
      });

      return reply.code(201).send({ igreja: serializeIgreja(igreja) });
    }
  );

  // ── LIST (autenticado) ──────────────────────────────────────────────────────
  app.get('/igrejas', { preHandler: app.authenticate }, async (request, reply) => {
    const role = normalizeRole(request.user.role);
    if (!role) return reply.code(403).send({ error: 'Forbidden' });

    const igrejas = await prisma.igrejaCadastro.findMany({
      include: igrejaInclude,
      orderBy: { nome: 'asc' }
    });

    return { igrejas: igrejas.map(serializeIgreja) };
  });

  // ── CREATE (autenticado: coordenador ou líder) ──────────────────────────────
  app.post('/igrejas', { preHandler: app.authenticate }, async (request, reply) => {
    if (!canCreateSupporters(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const body = createIgrejaSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
    }

    // Vínculo opcional com equipe: valida existência no tenant.
    let equipeId: string | null = null;
    if (body.data.equipeId) {
      const equipe = await prisma.equipe.findUnique({
        where: { id: body.data.equipeId },
        select: { id: true }
      });
      if (!equipe) return reply.code(404).send({ error: 'Equipe não encontrada.' });
      equipeId = equipe.id;
    }

    const igreja = await prisma.igrejaCadastro.create({
      data: {
        ...igrejaScalarData(body.data),
        origem: 'admin',
        tenantId: getTenantId(),
        createdById: request.user.sub,
        ...(equipeId
          ? { equipes: { create: { equipeId, tenantId: getTenantId() } } }
          : {})
      },
      include: igrejaInclude
    });

    return reply.code(201).send({ igreja: serializeIgreja(igreja) });
  });

  // ── UPDATE (autor ou coordenador) ───────────────────────────────────────────
  app.put('/igrejas/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const body = updateIgrejaSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
    }

    const existing = await prisma.igrejaCadastro.findUnique({
      where: { id: params.data.id },
      select: { id: true, createdById: true }
    });
    if (!existing) return reply.code(404).send({ error: 'Igreja não encontrada.' });

    const role = normalizeRole(request.user.role);
    if (role !== 'COORDENADOR' && existing.createdById !== request.user.sub) {
      return reply.code(403).send({ error: 'Apenas o autor ou o coordenador pode editar.' });
    }

    const d = body.data;
    const data: Prisma.IgrejaCadastroUpdateInput = {
      ...(d.nome !== undefined && { nome: d.nome }),
      ...(d.denominacao !== undefined && { denominacao: d.denominacao }),
      ...(d.pastor !== undefined && { pastor: d.pastor }),
      ...(d.endereco !== undefined && { endereco: d.endereco }),
      ...(d.bairro !== undefined && { bairro: d.bairro }),
      ...(d.cidade !== undefined && { cidade: d.cidade }),
      ...(d.estado !== undefined && { estado: d.estado }),
      ...(d.telefone !== undefined && { telefone: d.telefone }),
      ...(d.email !== undefined && { email: d.email }),
      ...(d.latitude !== undefined && { latitude: d.latitude }),
      ...(d.longitude !== undefined && { longitude: d.longitude }),
      ...(d.observacoes !== undefined && { observacoes: d.observacoes }),
      ...(d.membrosEstimados !== undefined && { membrosEstimados: d.membrosEstimados }),
      ...(d.zonaEleitoral !== undefined && { zonaEleitoral: d.zonaEleitoral })
    };

    const igreja = await prisma.igrejaCadastro.update({
      where: { id: params.data.id },
      data,
      include: igrejaInclude
    });

    return { igreja: serializeIgreja(igreja) };
  });

  // ── DELETE (autor ou coordenador) ───────────────────────────────────────────
  app.delete('/igrejas/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const existing = await prisma.igrejaCadastro.findUnique({
      where: { id: params.data.id },
      select: { id: true, createdById: true }
    });
    if (!existing) return reply.code(404).send({ error: 'Igreja não encontrada.' });

    const role = normalizeRole(request.user.role);
    if (role !== 'COORDENADOR' && existing.createdById !== request.user.sub) {
      return reply.code(403).send({ error: 'Apenas o autor ou o coordenador pode excluir.' });
    }

    // FK ON DELETE CASCADE remove os vínculos equipe_igrejas junto.
    await prisma.igrejaCadastro.delete({ where: { id: params.data.id } });
    return reply.code(204).send();
  });
}

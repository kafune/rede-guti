import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import {
  canAccessEquipes,
  canManageEquipeValores,
  normalizeRole,
  visibleEquipesWhere
} from '../lib/access.js';
import { getTenantId } from '../lib/tenantContext.js';

const paramsSchema = z.object({ id: z.string().min(1) });

// Placa antiga (ABC1234) e Mercosul (ABC1D23), após normalização (uppercase,
// sem hífen/espaço): 3 letras + dígito + (dígito|letra) + 2 dígitos.
const placaRegex = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;

const telefoneValido = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
};

const membroSchema = z.object({
  nome: z.string().trim().min(2, 'Nome do apoiador muito curto.'),
  telefone: z
    .string()
    .trim()
    .refine(telefoneValido, 'Telefone do apoiador inválido (use DDD + número).')
});

// valor/valorObservacoes ficam de fora de propósito: z.object() descarta chaves
// desconhecidas, então um líder que envie "valor" no body não grava nada. A
// única escrita é via PATCH /equipes/:id/valor (restrito ao coordenador).
const baseEquipeSchema = z.object({
  nome: z.string().trim().min(2, 'Nome da equipe muito curto.'),
  motoristaNome: z.string().trim().min(2, 'Nome do motorista muito curto.'),
  motoristaCnh: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 11, 'CNH deve ter 11 dígitos.'),
  motoristaTelefone: z
    .string()
    .trim()
    .refine(telefoneValido, 'Telefone do motorista inválido (use DDD + número).'),
  carroPlaca: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
    .refine((v) => placaRegex.test(v), 'Placa inválida (padrão antigo ou Mercosul).'),
  carroModelo: z.string().trim().min(1, 'Modelo do carro obrigatório.'),
  carroCor: z.string().trim().min(1, 'Cor do carro obrigatória.'),
  status: z.enum(['ATIVA', 'INATIVA']).default('ATIVA'),
  membros: z.array(membroSchema).max(4, 'Máximo de 4 apoiadores por equipe.').default([])
});

const createEquipeSchema = baseEquipeSchema.extend({
  // Só o coordenador pode cadastrar em nome de uma liderança; para o líder o
  // campo é ignorado (a rota força o próprio id).
  liderId: z.string().trim().min(1).optional()
});

const updateEquipeSchema = baseEquipeSchema.partial();

const valorSchema = z.object({
  valor: z.number().min(0).nullable(),
  valorObservacoes: z.string().trim().nullable().optional()
});

const equipeInclude = {
  lider: { select: { id: true, name: true, email: true } },
  membros: { orderBy: { ordem: 'asc' as const } }
} as const;

type EquipeRecord = Prisma.EquipeGetPayload<{ include: typeof equipeInclude }>;

const serializeEquipe = (e: EquipeRecord, includeValores: boolean) => ({
  id: e.id,
  liderId: e.liderId,
  liderNome: e.lider.name ?? e.lider.email,
  nome: e.nome,
  motoristaNome: e.motoristaNome,
  motoristaCnh: e.motoristaCnh,
  motoristaTelefone: e.motoristaTelefone,
  carroPlaca: e.carroPlaca,
  carroModelo: e.carroModelo,
  carroCor: e.carroCor,
  status: e.status,
  membros: e.membros.map((m) => ({
    id: m.id,
    nome: m.nome,
    telefone: m.telefone,
    ordem: m.ordem
  })),
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
  // Campos financeiros só para o coordenador (chaves ausentes para os demais).
  ...(includeValores
    ? {
        valor: e.valor === null ? null : e.valor.toString(),
        valorObservacoes: e.valorObservacoes
      }
    : {})
});

// Assinatura tolerante a campos opcionais: o tsconfig da raiz (sem strict)
// infere as chaves do Zod como opcionais; em runtime o schema já garantiu.
const membrosCreateData = (membros: { nome?: string; telefone?: string }[]) =>
  membros.map((membro, index) => ({
    nome: membro.nome ?? '',
    telefone: membro.telefone ?? '',
    ordem: index,
    // A extensão multi-tenant (src/db.ts) injeta tenantId só na operação raiz;
    // em nested create cada linha precisa do tenant explícito.
    tenantId: getTenantId()
  }));

export async function equipeRoutes(app: FastifyInstance) {
  // ── LIST ──────────────────────────────────────────────────────────────────
  app.get('/equipes', { preHandler: app.authenticate }, async (request, reply) => {
    const where = visibleEquipesWhere(request.user);
    if (!where) return reply.code(403).send({ error: 'Forbidden' });

    const equipes = await prisma.equipe.findMany({
      where,
      include: equipeInclude,
      orderBy: [{ lider: { name: 'asc' } }, { createdAt: 'desc' }]
    });

    const includeValores = canManageEquipeValores(request.user.role);
    return { equipes: equipes.map((e) => serializeEquipe(e, includeValores)) };
  });

  // ── CREATE ────────────────────────────────────────────────────────────────
  app.post('/equipes', { preHandler: app.authenticate }, async (request, reply) => {
    const role = normalizeRole(request.user.role);
    if (!canAccessEquipes(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const body = createEquipeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
    }

    // Líder só cria equipe própria; coordenador pode indicar a liderança dona.
    let liderId = request.user.sub;
    if (role === 'COORDENADOR' && body.data.liderId && body.data.liderId !== request.user.sub) {
      const lider = await prisma.user.findUnique({
        where: { id: body.data.liderId },
        select: { id: true, role: true }
      });
      if (!lider || normalizeRole(lider.role) !== 'LIDER_REGIONAL') {
        return reply.code(404).send({ error: 'Liderança não encontrada.' });
      }
      liderId = lider.id;
    }

    const equipe = await prisma.equipe.create({
      data: {
        liderId,
        nome: body.data.nome,
        motoristaNome: body.data.motoristaNome,
        motoristaCnh: body.data.motoristaCnh,
        motoristaTelefone: body.data.motoristaTelefone,
        carroPlaca: body.data.carroPlaca,
        carroModelo: body.data.carroModelo,
        carroCor: body.data.carroCor,
        status: body.data.status,
        tenantId: getTenantId(),
        membros: { create: membrosCreateData(body.data.membros) }
      },
      include: equipeInclude
    });

    const includeValores = canManageEquipeValores(request.user.role);
    return reply.code(201).send({ equipe: serializeEquipe(equipe, includeValores) });
  });

  // ── UPDATE ────────────────────────────────────────────────────────────────
  app.put('/equipes/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    if (!canAccessEquipes(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const body = updateEquipeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
    }

    const existing = await prisma.equipe.findUnique({
      where: { id: params.data.id },
      select: { id: true, liderId: true }
    });
    if (!existing) return reply.code(404).send({ error: 'Equipe não encontrada.' });

    const role = normalizeRole(request.user.role);
    if (role === 'LIDER_REGIONAL' && existing.liderId !== request.user.sub) {
      return reply.code(403).send({ error: 'Apenas a liderança dona ou o coordenador pode editar.' });
    }

    const data: Prisma.EquipeUpdateInput = {
      ...(body.data.nome !== undefined && { nome: body.data.nome }),
      ...(body.data.motoristaNome !== undefined && { motoristaNome: body.data.motoristaNome }),
      ...(body.data.motoristaCnh !== undefined && { motoristaCnh: body.data.motoristaCnh }),
      ...(body.data.motoristaTelefone !== undefined && {
        motoristaTelefone: body.data.motoristaTelefone
      }),
      ...(body.data.carroPlaca !== undefined && { carroPlaca: body.data.carroPlaca }),
      ...(body.data.carroModelo !== undefined && { carroModelo: body.data.carroModelo }),
      ...(body.data.carroCor !== undefined && { carroCor: body.data.carroCor }),
      ...(body.data.status !== undefined && { status: body.data.status })
    };

    // Membros: replace-all na mesma transação (no máximo 4 linhas).
    if (body.data.membros !== undefined) {
      data.membros = {
        deleteMany: {},
        create: membrosCreateData(body.data.membros)
      };
    }

    const equipe = await prisma.equipe.update({
      where: { id: params.data.id },
      data,
      include: equipeInclude
    });

    const includeValores = canManageEquipeValores(request.user.role);
    return { equipe: serializeEquipe(equipe, includeValores) };
  });

  // ── VALOR (restrito ao coordenador) ───────────────────────────────────────
  app.patch('/equipes/:id/valor', { preHandler: app.requireCoordinator }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const body = valorSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
    }

    const existing = await prisma.equipe.findUnique({
      where: { id: params.data.id },
      select: { id: true }
    });
    if (!existing) return reply.code(404).send({ error: 'Equipe não encontrada.' });

    const equipe = await prisma.equipe.update({
      where: { id: params.data.id },
      data: {
        valor: body.data.valor === null ? null : new Prisma.Decimal(body.data.valor),
        ...(body.data.valorObservacoes !== undefined && {
          valorObservacoes: body.data.valorObservacoes || null
        })
      },
      include: equipeInclude
    });

    return { equipe: serializeEquipe(equipe, true) };
  });

  // ── DELETE ────────────────────────────────────────────────────────────────
  app.delete('/equipes/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    if (!canAccessEquipes(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const existing = await prisma.equipe.findUnique({
      where: { id: params.data.id },
      select: { id: true, liderId: true }
    });
    if (!existing) return reply.code(404).send({ error: 'Equipe não encontrada.' });

    const role = normalizeRole(request.user.role);
    if (role === 'LIDER_REGIONAL' && existing.liderId !== request.user.sub) {
      return reply.code(403).send({ error: 'Apenas a liderança dona ou o coordenador pode excluir.' });
    }

    // FK com ON DELETE CASCADE remove os membros junto.
    await prisma.equipe.delete({ where: { id: params.data.id } });
    return reply.code(204).send();
  });
}

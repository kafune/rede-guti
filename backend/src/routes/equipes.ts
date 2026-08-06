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

// Título de eleitor: 12 dígitos (com dígitos verificadores). Seção: 1 a 5 dígitos.
const tituloEleitorSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 12, 'Título de eleitor deve ter 12 dígitos.');

const secaoSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length >= 1 && v.length <= 5, 'Seção inválida (use apenas números).');

const membroSchema = z.object({
  nome: z.string().trim().min(2, 'Nome do apoiador muito curto.'),
  telefone: z
    .string()
    .trim()
    .refine(telefoneValido, 'Telefone do apoiador inválido (use DDD + número).'),
  tituloEleitor: tituloEleitorSchema,
  secao: secaoSchema
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
  motoristaTituloEleitor: tituloEleitorSchema,
  motoristaSecao: secaoSchema,
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

// Autocadastro público: o líder dono vem do link (querystring/rota), não do body.
const publicEquipeSchema = baseEquipeSchema.extend({
  liderId: z.string().trim().min(1, 'Liderança obrigatória.')
});

const updateEquipeSchema = baseEquipeSchema.partial();

const valorSchema = z.object({
  valor: z.number().min(0).nullable(),
  valorObservacoes: z.string().trim().nullable().optional()
});

// Foto opcional: data URL (base64) já redimensionada no cliente. Limite defensivo
// no schema; a rota também eleva o bodyLimit.
const visitaSchema = z.object({
  local: z.string().trim().min(2, 'Informe o local/igreja da visita.'),
  dataHora: z.string().min(1).optional(),
  observacoes: z.string().trim().max(2000).optional().nullable(),
  registradoPor: z.string().trim().max(120).optional().nullable(),
  // ~3MB de data URL (a foto é redimensionada no cliente para bem menos que isso).
  fotoUrl: z
    .string()
    .trim()
    .max(3_000_000, 'Foto muito grande.')
    .refine((v) => v.startsWith('data:image/'), 'Foto inválida.')
    .optional()
    .nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable()
});

const equipeInclude = {
  lider: { select: { id: true, name: true, email: true } },
  membros: { orderBy: { ordem: 'asc' as const } },
  _count: { select: { visitas: true } },
  visitas: { orderBy: { dataHora: 'desc' as const }, take: 1, select: { dataHora: true } }
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
  motoristaTituloEleitor: e.motoristaTituloEleitor,
  motoristaSecao: e.motoristaSecao,
  carroPlaca: e.carroPlaca,
  carroModelo: e.carroModelo,
  carroCor: e.carroCor,
  status: e.status,
  origem: e.origem,
  membros: e.membros.map((m) => ({
    id: m.id,
    nome: m.nome,
    telefone: m.telefone,
    tituloEleitor: m.tituloEleitor,
    secao: m.secao,
    ordem: m.ordem
  })),
  visitasCount: e._count.visitas,
  ultimaVisitaEm: e.visitas[0]?.dataHora.toISOString() ?? null,
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

const serializeVisita = (v: {
  id: string;
  equipeId: string;
  local: string;
  dataHora: Date;
  observacoes: string | null;
  fotoUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  registradoPor: string | null;
  createdAt: Date;
}) => ({
  id: v.id,
  equipeId: v.equipeId,
  local: v.local,
  dataHora: v.dataHora.toISOString(),
  observacoes: v.observacoes,
  fotoUrl: v.fotoUrl,
  latitude: v.latitude,
  longitude: v.longitude,
  registradoPor: v.registradoPor,
  createdAt: v.createdAt.toISOString()
});

// Assinatura tolerante a campos opcionais: o tsconfig da raiz (sem strict)
// infere as chaves do Zod como opcionais; em runtime o schema já garantiu.
const membrosCreateData = (
  membros: { nome?: string; telefone?: string; tituloEleitor?: string; secao?: string }[]
) =>
  membros.map((membro, index) => ({
    nome: membro.nome ?? '',
    telefone: membro.telefone ?? '',
    tituloEleitor: membro.tituloEleitor ?? null,
    secao: membro.secao ?? null,
    ordem: index,
    // A extensão multi-tenant (src/db.ts) injeta tenantId só na operação raiz;
    // em nested create cada linha precisa do tenant explícito.
    tenantId: getTenantId()
  }));

// Cria a equipe a partir do payload validado, para uma dada liderança e origem.
// Formato "unchecked" (liderId/tenantId escalares): a extensão multi-tenant
// (src/db.ts) sobrescreve data.tenantId no create, e usar a relação `tenant`
// junto do escalar faria o Prisma recusar por ambiguidade.
const buildEquipeData = (
  data: z.infer<typeof baseEquipeSchema>,
  liderId: string,
  origem: 'MANUAL' | 'AUTOCADASTRO'
): Prisma.EquipeUncheckedCreateInput => ({
  liderId,
  tenantId: getTenantId(),
  nome: data.nome,
  motoristaNome: data.motoristaNome,
  motoristaCnh: data.motoristaCnh,
  motoristaTelefone: data.motoristaTelefone,
  motoristaTituloEleitor: data.motoristaTituloEleitor,
  motoristaSecao: data.motoristaSecao,
  carroPlaca: data.carroPlaca,
  carroModelo: data.carroModelo,
  carroCor: data.carroCor,
  status: data.status,
  origem,
  membros: { create: membrosCreateData(data.membros) }
});

export async function equipeRoutes(app: FastifyInstance) {
  // ── PUBLIC: INFO DA LIDERANÇA + EQUIPES (para a página de autocadastro) ─────
  app.get('/public/lideres/:id/equipes', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const lider = await prisma.user.findUnique({
      where: { id: params.data.id },
      select: { id: true, role: true }
    });
    const role = normalizeRole(lider?.role);
    if (!lider || (role !== 'LIDER_REGIONAL' && role !== 'COORDENADOR')) {
      return reply.code(404).send({ error: 'Liderança não encontrada.' });
    }

    const equipes = await prisma.equipe.findMany({
      where: { liderId: lider.id },
      include: { _count: { select: { membros: true, visitas: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    // Sem dados sensíveis (CNH, título, telefones): só o resumo público.
    return {
      equipes: equipes.map((e) => ({
        id: e.id,
        nome: e.nome,
        status: e.status,
        totalApoiadores: e._count.membros,
        visitasCount: e._count.visitas,
        createdAt: e.createdAt.toISOString()
      }))
    };
  });

  // ── PUBLIC: CRIAR EQUIPE VIA LINK DA LIDERANÇA ──────────────────────────────
  app.post(
    '/public/equipes',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = publicEquipeSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
      }

      const lider = await prisma.user.findUnique({
        where: { id: body.data.liderId },
        select: { id: true, role: true }
      });
      const role = normalizeRole(lider?.role);
      if (!lider || (role !== 'LIDER_REGIONAL' && role !== 'COORDENADOR')) {
        return reply.code(404).send({ error: 'Liderança não encontrada.' });
      }

      const equipe = await prisma.equipe.create({
        data: buildEquipeData(body.data, lider.id, 'AUTOCADASTRO'),
        include: equipeInclude
      });

      // Público nunca recebe valores.
      return reply.code(201).send({ equipe: serializeEquipe(equipe, false) });
    }
  );

  // ── PUBLIC: INFO DA EQUIPE (para o link de prestação de contas) ─────────────
  app.get('/public/equipes/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const equipe = await prisma.equipe.findUnique({
      where: { id: params.data.id },
      include: {
        lider: { select: { name: true, email: true } },
        _count: { select: { membros: true, visitas: true } }
      }
    });
    if (!equipe) return reply.code(404).send({ error: 'Equipe não encontrada.' });

    return {
      equipe: {
        id: equipe.id,
        nome: equipe.nome,
        status: equipe.status,
        liderNome: equipe.lider.name ?? equipe.lider.email,
        motoristaNome: equipe.motoristaNome,
        totalApoiadores: equipe._count.membros,
        visitasCount: equipe._count.visitas
      }
    };
  });

  // ── PUBLIC: LISTA DE VISITAS DA EQUIPE (confirmação no link) ─────────────────
  app.get('/public/equipes/:id/visitas', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const equipe = await prisma.equipe.findUnique({
      where: { id: params.data.id },
      select: { id: true }
    });
    if (!equipe) return reply.code(404).send({ error: 'Equipe não encontrada.' });

    const visitas = await prisma.equipeVisita.findMany({
      where: { equipeId: params.data.id },
      orderBy: { dataHora: 'desc' },
      take: 30,
      // Sem a foto (payload leve); só o resumo público.
      select: {
        id: true,
        local: true,
        dataHora: true,
        registradoPor: true,
        latitude: true,
        longitude: true
      }
    });

    return {
      visitas: visitas.map((v) => ({
        id: v.id,
        local: v.local,
        dataHora: v.dataHora.toISOString(),
        registradoPor: v.registradoPor,
        temLocalizacao: v.latitude !== null && v.longitude !== null
      }))
    };
  });

  // ── PUBLIC: REGISTRAR VISITA (prestação de contas em campo) ─────────────────
  app.post(
    '/public/equipes/:id/visitas',
    {
      // Foto base64 pode passar do bodyLimit padrão (1MB); elevamos com folga.
      bodyLimit: 4 * 1024 * 1024,
      config: { rateLimit: { max: 15, timeWindow: '1 minute' } }
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

      const body = visitaSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
      }

      const equipe = await prisma.equipe.findUnique({
        where: { id: params.data.id },
        select: { id: true }
      });
      if (!equipe) return reply.code(404).send({ error: 'Equipe não encontrada.' });

      const visita = await prisma.equipeVisita.create({
        data: {
          equipeId: equipe.id,
          tenantId: getTenantId(),
          local: body.data.local,
          dataHora: body.data.dataHora ? new Date(body.data.dataHora) : new Date(),
          observacoes: body.data.observacoes || null,
          registradoPor: body.data.registradoPor || null,
          fotoUrl: body.data.fotoUrl || null,
          latitude: body.data.latitude ?? null,
          longitude: body.data.longitude ?? null
        }
      });

      return reply.code(201).send({ visita: serializeVisita(visita) });
    }
  );

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

  // ── VISITAS DE UMA EQUIPE (autenticado) ─────────────────────────────────────
  app.get('/equipes/:id/visitas', { preHandler: app.authenticate }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    if (!canAccessEquipes(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const equipe = await prisma.equipe.findUnique({
      where: { id: params.data.id },
      select: { id: true, liderId: true }
    });
    if (!equipe) return reply.code(404).send({ error: 'Equipe não encontrada.' });

    const role = normalizeRole(request.user.role);
    if (role === 'LIDER_REGIONAL' && equipe.liderId !== request.user.sub) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const visitas = await prisma.equipeVisita.findMany({
      where: { equipeId: params.data.id },
      orderBy: { dataHora: 'desc' }
    });

    return { visitas: visitas.map(serializeVisita) };
  });

  // ── DELETE VISITA (autenticado: dono ou coordenador) ────────────────────────
  app.delete('/equipes/visitas/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    if (!canAccessEquipes(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const visita = await prisma.equipeVisita.findUnique({
      where: { id: params.data.id },
      select: { id: true, equipe: { select: { liderId: true } } }
    });
    if (!visita) return reply.code(404).send({ error: 'Visita não encontrada.' });

    const role = normalizeRole(request.user.role);
    if (role === 'LIDER_REGIONAL' && visita.equipe.liderId !== request.user.sub) {
      return reply.code(403).send({ error: 'Apenas a liderança dona ou o coordenador pode excluir.' });
    }

    await prisma.equipeVisita.delete({ where: { id: params.data.id } });
    return reply.code(204).send();
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
      data: buildEquipeData(body.data, liderId, 'MANUAL'),
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
      ...(body.data.motoristaTituloEleitor !== undefined && {
        motoristaTituloEleitor: body.data.motoristaTituloEleitor
      }),
      ...(body.data.motoristaSecao !== undefined && { motoristaSecao: body.data.motoristaSecao }),
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

    // FK com ON DELETE CASCADE remove os membros e visitas junto.
    await prisma.equipe.delete({ where: { id: params.data.id } });
    return reply.code(204).send();
  });
}

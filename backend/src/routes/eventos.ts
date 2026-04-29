import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { normalizeRole } from '../lib/access.js';

const createEventoSchema = z.object({
  nome: z.string().trim().min(2),
  data: z.string().min(1),
  hora: z.string().min(1),
  local: z.string().trim().min(2),
  limitePorLider: z.number().int().min(0).default(0),
  observacao: z.string().trim().optional()
});

const updateEventoSchema = z.object({
  nome: z.string().trim().min(2).optional(),
  data: z.string().min(1).optional(),
  hora: z.string().min(1).optional(),
  local: z.string().trim().min(2).optional(),
  limitePorLider: z.number().int().min(0).optional(),
  observacao: z.string().trim().optional()
});

const paramsSchema = z.object({ id: z.string().min(1) });

const indicadoParamsSchema = z.object({
  id: z.string().min(1),
  indicadoId: z.string().min(1)
});

const updateStatusSchema = z.object({
  status: z.enum(['APROVADO', 'RECUSADO', 'INDICADO', 'PRESENTE'])
});

const checkinSchema = z.object({
  telefone: z.string().min(6).optional(),
  nome: z.string().min(2).optional(),
  indicadoId: z.string().min(1).optional()
});

const publicIndicacaoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome completo.'),
  telefone: z.string().trim().min(8, 'Informe seu WhatsApp.'),
  liderId: z.string().trim().min(1, 'Liderança obrigatória.')
});

const publicQuerySchema = z.object({
  lider: z.string().optional()
});

const listIndicadosQuerySchema = z.object({
  status: z.enum(['INDICADO', 'APROVADO', 'RECUSADO', 'PRESENTE']).optional(),
  liderId: z.string().optional(),
  q: z.string().optional()
});

const serializeEvento = (
  evento: {
    id: string;
    nome: string;
    data: Date;
    hora: string;
    local: string;
    limitePorLider: number;
    observacao: string | null;
    encerrado: boolean;
    createdAt: Date;
    indicados: { status: string }[];
  }
) => ({
  id: evento.id,
  nome: evento.nome,
  data: evento.data.toISOString(),
  hora: evento.hora,
  local: evento.local,
  limitePorLider: evento.limitePorLider,
  observacao: evento.observacao,
  encerrado: evento.encerrado,
  createdAt: evento.createdAt.toISOString(),
  totalIndicados: evento.indicados.length,
  totalAprovados: evento.indicados.filter((i) => i.status === 'APROVADO').length,
  totalPresentes: evento.indicados.filter((i) => i.status === 'PRESENTE').length
});

const eventoIndicadosSelect = {
  indicados: {
    select: { status: true }
  }
} as const;

const serializeIndicado = (indicado: {
  id: string;
  eventoId: string;
  nome: string;
  telefone: string;
  liderId: string;
  status: string;
  createdAt: Date;
  lider: { id: string; name: string | null; email: string };
}) => ({
  id: indicado.id,
  eventoId: indicado.eventoId,
  nome: indicado.nome,
  telefone: indicado.telefone,
  liderId: indicado.liderId,
  liderNome: indicado.lider.name ?? indicado.lider.email,
  status: indicado.status,
  createdAt: indicado.createdAt.toISOString()
});

const indicadoSelect = {
  id: true,
  eventoId: true,
  nome: true,
  telefone: true,
  liderId: true,
  status: true,
  createdAt: true,
  lider: { select: { id: true, name: true, email: true } }
} as const;

const normalizeTelefone = (raw: string) => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
};

export async function eventoRoutes(app: FastifyInstance) {
  // ── LIST EVENTS ──────────────────────────────────────────────────────────
  app.get('/eventos', { preHandler: app.authenticate }, async () => {
    const eventos = await prisma.evento.findMany({
      include: eventoIndicadosSelect,
      orderBy: { data: 'desc' }
    });
    return { eventos: eventos.map(serializeEvento) };
  });

  // ── CREATE EVENT ─────────────────────────────────────────────────────────
  app.post('/eventos', { preHandler: app.authenticate }, async (request, reply) => {
    if (normalizeRole(request.user.role) !== 'COORDENADOR') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const body = createEventoSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
    }

    const evento = await prisma.evento.create({
      data: {
        nome: body.data.nome,
        data: new Date(body.data.data),
        hora: body.data.hora,
        local: body.data.local,
        limitePorLider: body.data.limitePorLider,
        observacao: body.data.observacao
      },
      include: eventoIndicadosSelect
    });

    return reply.code(201).send({ evento: serializeEvento(evento) });
  });

  // ── GET EVENT DETAIL ─────────────────────────────────────────────────────
  app.get('/eventos/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const evento = await prisma.evento.findUnique({
      where: { id: params.data.id },
      include: eventoIndicadosSelect
    });

    if (!evento) return reply.code(404).send({ error: 'Evento não encontrado.' });

    return { evento: serializeEvento(evento) };
  });

  // ── UPDATE EVENT ─────────────────────────────────────────────────────────
  app.patch('/eventos/:id', { preHandler: app.authenticate }, async (request, reply) => {
    if (normalizeRole(request.user.role) !== 'COORDENADOR') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const body = updateEventoSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
    }

    const existing = await prisma.evento.findUnique({ where: { id: params.data.id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: 'Evento não encontrado.' });

    const evento = await prisma.evento.update({
      where: { id: params.data.id },
      data: {
        ...(body.data.nome !== undefined && { nome: body.data.nome }),
        ...(body.data.data !== undefined && { data: new Date(body.data.data) }),
        ...(body.data.hora !== undefined && { hora: body.data.hora }),
        ...(body.data.local !== undefined && { local: body.data.local }),
        ...(body.data.limitePorLider !== undefined && { limitePorLider: body.data.limitePorLider }),
        ...(body.data.observacao !== undefined && { observacao: body.data.observacao })
      },
      include: eventoIndicadosSelect
    });

    return { evento: serializeEvento(evento) };
  });

  // ── CLOSE EVENT ───────────────────────────────────────────────────────────
  app.patch('/eventos/:id/encerrar', { preHandler: app.authenticate }, async (request, reply) => {
    if (normalizeRole(request.user.role) !== 'COORDENADOR') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const evento = await prisma.evento.update({
      where: { id: params.data.id },
      data: { encerrado: true },
      include: eventoIndicadosSelect
    });

    return { evento: serializeEvento(evento) };
  });

  // ── LIST INDICADOS ────────────────────────────────────────────────────────
  app.get('/eventos/:id/indicados', { preHandler: app.authenticate }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const query = listIndicadosQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Query inválida.' });

    const role = normalizeRole(request.user.role);

    const where: any = { eventoId: params.data.id };

    if (role === 'LIDER_REGIONAL') {
      where.liderId = request.user.sub;
    } else if (query.data.liderId) {
      where.liderId = query.data.liderId;
    }

    if (query.data.status) {
      where.status = query.data.status;
    }

    if (query.data.q) {
      const q = query.data.q;
      where.OR = [
        { nome: { contains: q, mode: 'insensitive' } },
        { telefone: { contains: q, mode: 'insensitive' } }
      ];
    }

    const indicados = await prisma.eventoIndicado.findMany({
      where,
      select: indicadoSelect,
      orderBy: { createdAt: 'asc' }
    });

    return { indicados: indicados.map(serializeIndicado) };
  });

  // ── UPDATE INDICADO STATUS ────────────────────────────────────────────────
  app.patch(
    '/eventos/:id/indicados/:indicadoId/status',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const role = normalizeRole(request.user.role);
      if (role !== 'COORDENADOR' && role !== 'VERIFICADORA') {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const params = indicadoParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: 'Parâmetros inválidos.' });

      const body = updateStatusSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Status inválido.' });

      const existing = await prisma.eventoIndicado.findFirst({
        where: { id: params.data.indicadoId, eventoId: params.data.id },
        select: { id: true }
      });
      if (!existing) return reply.code(404).send({ error: 'Indicado não encontrado.' });

      const indicado = await prisma.eventoIndicado.update({
        where: { id: params.data.indicadoId },
        data: { status: body.data.status as any },
        select: indicadoSelect
      });

      return { indicado: serializeIndicado(indicado) };
    }
  );

  // ── CHECK-IN ──────────────────────────────────────────────────────────────
  app.post('/eventos/:id/checkin', { preHandler: app.authenticate }, async (request, reply) => {
    const role = normalizeRole(request.user.role);
    if (role !== 'COORDENADOR' && role !== 'VERIFICADORA') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const body = checkinSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Dados inválidos.' });

    let where: any = { eventoId: params.data.id };

    if (body.data.indicadoId) {
      where.id = body.data.indicadoId;
    } else if (body.data.telefone) {
      const normalized = normalizeTelefone(body.data.telefone);
      where.OR = [{ telefone: normalized }, { telefone: body.data.telefone }];
    } else if (body.data.nome) {
      where.nome = { contains: body.data.nome, mode: 'insensitive' };
    } else {
      return reply.code(400).send({ error: 'Informe telefone, nome ou id do indicado.' });
    }

    const existing = await prisma.eventoIndicado.findFirst({
      where,
      select: { id: true, status: true }
    });

    if (!existing) return reply.code(404).send({ error: 'Indicado não encontrado neste evento.' });

    const indicado = await prisma.eventoIndicado.update({
      where: { id: existing.id },
      data: { status: 'PRESENTE' },
      select: indicadoSelect
    });

    return { indicado: serializeIndicado(indicado) };
  });

  // ── PUBLIC: GET EVENT INFO ────────────────────────────────────────────────
  app.get('/public/eventos/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const query = publicQuerySchema.safeParse(request.query);
    const liderId = query.success ? query.data.lider : undefined;

    const evento = await prisma.evento.findUnique({
      where: { id: params.data.id },
      select: {
        id: true,
        nome: true,
        data: true,
        hora: true,
        local: true,
        limitePorLider: true,
        encerrado: true
      }
    });

    if (!evento) return reply.code(404).send({ error: 'Evento não encontrado.' });

    let lider: { id: string; nome: string } | null = null;
    let limiteAtingido = false;

    if (liderId) {
      const user = await prisma.user.findUnique({
        where: { id: liderId },
        select: { id: true, name: true, email: true }
      });
      if (user) {
        lider = { id: user.id, nome: user.name ?? user.email };

        if (evento.limitePorLider > 0) {
          const count = await prisma.eventoIndicado.count({
            where: { eventoId: evento.id, liderId }
          });
          limiteAtingido = count >= evento.limitePorLider;
        }
      }
    }

    return {
      evento: {
        id: evento.id,
        nome: evento.nome,
        data: evento.data.toISOString(),
        hora: evento.hora,
        local: evento.local,
        encerrado: evento.encerrado,
        lider,
        limiteAtingido
      }
    };
  });

  // ── PUBLIC: SUBMIT INDICATION ─────────────────────────────────────────────
  app.post('/public/eventos/:id/indicacao', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const body = publicIndicacaoSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
    }

    const evento = await prisma.evento.findUnique({
      where: { id: params.data.id },
      select: { id: true, encerrado: true, limitePorLider: true }
    });

    if (!evento) return reply.code(404).send({ error: 'Evento não encontrado.' });
    if (evento.encerrado) return reply.code(409).send({ error: 'Este evento está encerrado.' });

    const lider = await prisma.user.findUnique({
      where: { id: body.data.liderId },
      select: { id: true, name: true, email: true }
    });

    if (!lider) return reply.code(404).send({ error: 'Liderança não encontrada.' });

    if (evento.limitePorLider > 0) {
      const count = await prisma.eventoIndicado.count({
        where: { eventoId: evento.id, liderId: lider.id }
      });
      if (count >= evento.limitePorLider) {
        return reply.code(409).send({ error: 'Limite de indicações desta liderança atingido.' });
      }
    }

    const telefone = normalizeTelefone(body.data.telefone);

    const existing = await prisma.eventoIndicado.findUnique({
      where: { eventoId_telefone: { eventoId: evento.id, telefone } }
    });
    if (existing) {
      return reply.code(409).send({ error: 'Este WhatsApp já foi indicado para este evento.' });
    }

    const indicado = await prisma.eventoIndicado.create({
      data: {
        eventoId: evento.id,
        nome: body.data.nome.trim(),
        telefone,
        liderId: lider.id,
        status: 'INDICADO'
      },
      select: indicadoSelect
    });

    return reply.code(201).send({ indicado: serializeIndicado(indicado) });
  });
}

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
  visitas: { orderBy: { dataHora: 'desc' as const }, take: 1, select: { dataHora: true } },
  // Resumo do autocadastro de cada pessoa (sem as imagens dos documentos, que só
  // vêm no endpoint dedicado). Casa por slot: motorista (slot nulo) e apoiadores
  // por ordem.
  cadastros: {
    select: {
      id: true,
      pessoaTipo: true,
      slot: true,
      nomeCompleto: true,
      consentimento: true,
      updatedAt: true,
      _count: { select: { documentos: true } }
    }
  }
} as const;

type EquipeRecord = Prisma.EquipeGetPayload<{ include: typeof equipeInclude }>;

type CadastroResumoRecord = EquipeRecord['cadastros'][number];

const cadastroResumo = (c: CadastroResumoRecord) => ({
  id: c.id,
  preenchido: true,
  nomeCompleto: c.nomeCompleto,
  consentimento: c.consentimento,
  documentosCount: c._count.documentos,
  atualizadoEm: c.updatedAt.toISOString()
});

const serializeEquipe = (e: EquipeRecord, includeValores: boolean) => {
  const motoristaCadastro = e.cadastros.find((c) => c.pessoaTipo === 'MOTORISTA') ?? null;
  const apoiadorCadastro = (ordem: number) =>
    e.cadastros.find((c) => c.pessoaTipo === 'APOIADOR' && c.slot === ordem) ?? null;

  return {
  id: e.id,
  liderId: e.liderId,
  liderNome: e.lider.name ?? e.lider.email,
  nome: e.nome,
  motoristaNome: e.motoristaNome,
  motoristaCnh: e.motoristaCnh,
  motoristaTelefone: e.motoristaTelefone,
  motoristaTituloEleitor: e.motoristaTituloEleitor,
  motoristaSecao: e.motoristaSecao,
  motoristaCadastro: motoristaCadastro ? cadastroResumo(motoristaCadastro) : null,
  carroPlaca: e.carroPlaca,
  carroModelo: e.carroModelo,
  carroCor: e.carroCor,
  status: e.status,
  origem: e.origem,
  membros: e.membros.map((m) => {
    const cad = apoiadorCadastro(m.ordem);
    return {
      id: m.id,
      nome: m.nome,
      telefone: m.telefone,
      tituloEleitor: m.tituloEleitor,
      secao: m.secao,
      ordem: m.ordem,
      cadastro: cad ? cadastroResumo(cad) : null
    };
  }),
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
  };
};

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

// ── Autocadastro individual (motorista / apoiador) ──────────────────────────

const MAX_DOCUMENTOS = 6;

// A pessoa é identificada por um "slot" estável no link público: 'motorista'
// (o motorista, embutido na equipe) ou 'a{ordem}' (apoiador na posição 0..3).
// Não usamos o id do EquipeMembro porque a edição da equipe o recria.
type PessoaRef = { pessoaTipo: 'MOTORISTA' | 'APOIADOR'; slot: number | null };

const parsePessoaRef = (raw: string): PessoaRef | null => {
  if (raw === 'motorista') return { pessoaTipo: 'MOTORISTA', slot: null };
  const match = /^a(\d+)$/.exec(raw);
  if (match) {
    const slot = Number(match[1]);
    if (Number.isInteger(slot) && slot >= 0 && slot < 4) {
      return { pessoaTipo: 'APOIADOR', slot };
    }
  }
  return null;
};

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => v || null);

const documentoSchema = z.object({
  tipo: z.string().trim().max(60).optional(),
  imagemUrl: z
    .string()
    .trim()
    .max(2_000_000, 'Documento muito grande.')
    .refine((v) => v.startsWith('data:image/'), 'Arquivo de documento inválido.')
});

const cadastroSchema = z.object({
  nomeCompleto: z.string().trim().min(2, 'Informe o nome completo.').max(160),
  cpf: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 0 || v.length === 11, 'CPF deve ter 11 dígitos.')
    .optional(),
  rg: optionalText(30),
  dataNascimento: optionalText(20),
  telefone: optionalText(30),
  email: optionalText(160),
  cep: optionalText(12),
  endereco: optionalText(200),
  bairro: optionalText(120),
  cidade: optionalText(120),
  observacoes: optionalText(2000),
  consentimento: z
    .boolean()
    .refine((v) => v === true, 'É necessário aceitar o termo para concluir o cadastro.'),
  documentos: z.array(documentoSchema).max(MAX_DOCUMENTOS).default([])
});

const documentosCreateData = (
  documentos: { tipo?: string; imagemUrl?: string }[]
) =>
  documentos
    .filter((d) => d.imagemUrl)
    .map((d) => ({
      tipo: d.tipo?.trim() || 'Documento',
      imagemUrl: d.imagemUrl as string,
      tenantId: getTenantId()
    }));

const cadastroFullInclude = {
  documentos: { orderBy: { createdAt: 'asc' as const } }
} as const;

type CadastroFullRecord = Prisma.MembroCadastroGetPayload<{ include: typeof cadastroFullInclude }>;

const cadastroDadosPessoais = (c: CadastroFullRecord) => ({
  nomeCompleto: c.nomeCompleto,
  cpf: c.cpf,
  rg: c.rg,
  dataNascimento: c.dataNascimento,
  telefone: c.telefone,
  email: c.email,
  cep: c.cep,
  endereco: c.endereco,
  bairro: c.bairro,
  cidade: c.cidade,
  observacoes: c.observacoes,
  consentimento: c.consentimento,
  consentimentoEm: c.consentimentoEm?.toISOString() ?? null,
  atualizadoEm: c.updatedAt.toISOString()
});

// Versão pública/prefill: dados pessoais + metadados dos documentos, SEM as
// imagens (base64) — o link público nunca devolve os arquivos.
const serializeCadastroPublic = (c: CadastroFullRecord) => ({
  ...cadastroDadosPessoais(c),
  documentosCount: c.documentos.length,
  documentos: c.documentos.map((d) => ({
    id: d.id,
    tipo: d.tipo,
    createdAt: d.createdAt.toISOString()
  }))
});

// Versão para a coordenação (autenticada): inclui as imagens dos documentos.
const serializeCadastroFull = (c: CadastroFullRecord, tipo: string, slot: number | null) => ({
  id: c.id,
  pessoaTipo: tipo,
  slot,
  ...cadastroDadosPessoais(c),
  documentos: c.documentos.map((d) => ({
    id: d.id,
    tipo: d.tipo,
    imagemUrl: d.imagemUrl,
    createdAt: d.createdAt.toISOString()
  }))
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

  // ── PUBLIC: INFO DA PESSOA (motorista/apoiador) PARA O LINK DE AUTOCADASTRO ──
  app.get('/public/equipes/:equipeId/pessoas/:pessoa', async (request, reply) => {
    const equipeId = z.string().min(1).safeParse((request.params as any).equipeId);
    if (!equipeId.success) return reply.code(400).send({ error: 'ID inválido.' });

    const ref = parsePessoaRef(String((request.params as any).pessoa));
    if (!ref) return reply.code(400).send({ error: 'Pessoa inválida.' });

    const equipe = await prisma.equipe.findUnique({
      where: { id: equipeId.data },
      include: {
        lider: { select: { name: true, email: true } },
        membros: { orderBy: { ordem: 'asc' } }
      }
    });
    if (!equipe) return reply.code(404).send({ error: 'Equipe não encontrada.' });

    let nomeIndicado: string;
    let telefone: string;
    if (ref.pessoaTipo === 'MOTORISTA') {
      nomeIndicado = equipe.motoristaNome;
      telefone = equipe.motoristaTelefone;
    } else {
      const membro =
        equipe.membros.find((m) => m.ordem === ref.slot) ?? equipe.membros[ref.slot ?? -1];
      if (!membro) return reply.code(404).send({ error: 'Apoiador não encontrado.' });
      nomeIndicado = membro.nome;
      telefone = membro.telefone;
    }

    const cadastro = await prisma.membroCadastro.findFirst({
      where: { equipeId: equipe.id, pessoaTipo: ref.pessoaTipo, slot: ref.slot },
      include: cadastroFullInclude
    });

    return {
      pessoa: {
        equipeId: equipe.id,
        equipeNome: equipe.nome,
        liderNome: equipe.lider.name ?? equipe.lider.email,
        tipo: ref.pessoaTipo,
        slot: ref.slot,
        nomeIndicado,
        telefone,
        cadastro: cadastro ? serializeCadastroPublic(cadastro) : null
      }
    };
  });

  // ── PUBLIC: ENVIAR AUTOCADASTRO DA PESSOA (dados + documentos) ───────────────
  app.post(
    '/public/equipes/:equipeId/pessoas/:pessoa/cadastro',
    {
      // Vários documentos base64 podem passar do bodyLimit padrão; elevamos com folga.
      bodyLimit: 14 * 1024 * 1024,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
    },
    async (request, reply) => {
      const equipeId = z.string().min(1).safeParse((request.params as any).equipeId);
      if (!equipeId.success) return reply.code(400).send({ error: 'ID inválido.' });

      const ref = parsePessoaRef(String((request.params as any).pessoa));
      if (!ref) return reply.code(400).send({ error: 'Pessoa inválida.' });

      const body = cadastroSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
      }

      const equipe = await prisma.equipe.findUnique({
        where: { id: equipeId.data },
        include: { membros: { orderBy: { ordem: 'asc' } } }
      });
      if (!equipe) return reply.code(404).send({ error: 'Equipe não encontrada.' });

      // Confirma que a pessoa existe na equipe e guarda o id do membro (só como
      // referência informativa — a chave é o slot).
      let membroId: string | null = null;
      if (ref.pessoaTipo === 'APOIADOR') {
        const membro =
          equipe.membros.find((m) => m.ordem === ref.slot) ?? equipe.membros[ref.slot ?? -1];
        if (!membro) return reply.code(404).send({ error: 'Apoiador não encontrado.' });
        membroId = membro.id;
      }

      const novosDocumentos = documentosCreateData(body.data.documentos ?? []);

      const dadosPessoais = {
        nomeCompleto: body.data.nomeCompleto,
        cpf: body.data.cpf || null,
        rg: body.data.rg ?? null,
        dataNascimento: body.data.dataNascimento ?? null,
        telefone: body.data.telefone ?? null,
        email: body.data.email ?? null,
        cep: body.data.cep ?? null,
        endereco: body.data.endereco ?? null,
        bairro: body.data.bairro ?? null,
        cidade: body.data.cidade ?? null,
        observacoes: body.data.observacoes ?? null,
        consentimento: body.data.consentimento,
        consentimentoEm: new Date(),
        membroId
      };

      const existing = await prisma.membroCadastro.findFirst({
        where: { equipeId: equipe.id, pessoaTipo: ref.pessoaTipo, slot: ref.slot },
        select: { id: true, _count: { select: { documentos: true } } }
      });

      let cadastro: CadastroFullRecord;
      if (existing) {
        if (existing._count.documentos + novosDocumentos.length > MAX_DOCUMENTOS) {
          return reply
            .code(400)
            .send({ error: `Máximo de ${MAX_DOCUMENTOS} documentos por pessoa.` });
        }
        cadastro = await prisma.membroCadastro.update({
          where: { id: existing.id },
          data: {
            ...dadosPessoais,
            ...(novosDocumentos.length ? { documentos: { create: novosDocumentos } } : {})
          },
          include: cadastroFullInclude
        });
      } else {
        if (novosDocumentos.length > MAX_DOCUMENTOS) {
          return reply
            .code(400)
            .send({ error: `Máximo de ${MAX_DOCUMENTOS} documentos por pessoa.` });
        }
        cadastro = await prisma.membroCadastro.create({
          data: {
            equipeId: equipe.id,
            tenantId: getTenantId(),
            pessoaTipo: ref.pessoaTipo,
            slot: ref.slot,
            ...dadosPessoais,
            ...(novosDocumentos.length ? { documentos: { create: novosDocumentos } } : {})
          },
          include: cadastroFullInclude
        });
      }

      return reply.code(201).send({ cadastro: serializeCadastroPublic(cadastro) });
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

  // ── AUTOCADASTROS DE UMA EQUIPE (autenticado: dados pessoais + documentos) ───
  app.get('/equipes/:id/cadastros', { preHandler: app.authenticate }, async (request, reply) => {
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

    const cadastros = await prisma.membroCadastro.findMany({
      where: { equipeId: params.data.id },
      include: cadastroFullInclude,
      orderBy: [{ pessoaTipo: 'asc' }, { slot: 'asc' }]
    });

    return {
      cadastros: cadastros.map((c) => serializeCadastroFull(c, c.pessoaTipo, c.slot))
    };
  });

  // ── DELETE DOCUMENTO DE AUTOCADASTRO (autenticado: dono ou coordenador) ──────
  app.delete(
    '/equipes/cadastros/documentos/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

      if (!canAccessEquipes(request.user.role)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const documento = await prisma.membroCadastroDocumento.findUnique({
        where: { id: params.data.id },
        select: { id: true, cadastro: { select: { equipe: { select: { liderId: true } } } } }
      });
      if (!documento) return reply.code(404).send({ error: 'Documento não encontrado.' });

      const role = normalizeRole(request.user.role);
      if (role === 'LIDER_REGIONAL' && documento.cadastro.equipe.liderId !== request.user.sub) {
        return reply
          .code(403)
          .send({ error: 'Apenas a liderança dona ou o coordenador pode excluir.' });
      }

      await prisma.membroCadastroDocumento.delete({ where: { id: params.data.id } });
      return reply.code(204).send();
    }
  );

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

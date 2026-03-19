import prismaClient from '@prisma/client';
import type { Role as RoleType } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import {
  canCreateUserRole,
  canListUsers,
  canManageUsers,
  roleAllowsIndicator,
  visibleUsersWhere
} from '../lib/access.js';
import { buildUserHierarchyPath, serializeUserSummary, userHierarchySelect } from '../lib/hierarchy.js';

const { Role } = prismaClient;

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(6),
  role: z.nativeEnum(Role),
  devzappLink: z.string().min(3).optional()
});

const updateSchema = z
  .object({
    email: z.string().email().optional(),
    name: z.string().min(2).optional(),
    password: z.string().min(6).optional(),
    role: z.nativeEnum(Role).optional(),
    devzappLink: z.string().min(3).nullable().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Invalid payload'
  });

const paramsSchema = z.object({
  id: z.string()
});

const userListSelect = {
  id: true,
  email: true,
  name: true,
  devzappLink: true,
  role: true,
  createdAt: true,
  indicatedByUserId: true,
  indicatedByUser: {
    select: userHierarchySelect
  },
  _count: {
    select: {
      indicatedUsers: true,
      indicatedSupporters: true
    }
  }
} as const;

const serializeUserRecord = (user: {
  id: string;
  email: string;
  name: string | null;
  devzappLink: string | null;
  role: RoleType;
  createdAt: Date;
  indicatedByUserId: string | null;
  indicatedByUser?: {
    id: string;
    email: string;
    name: string | null;
  role: RoleType;
    indicatedByUser?: any;
  } | null;
  _count: {
    indicatedUsers: number;
    indicatedSupporters: number;
  };
}) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  devzappLink: user.devzappLink,
  role: user.role,
  createdAt: user.createdAt,
  indicatedByUserId: user.indicatedByUserId,
  indicatedByUser: serializeUserSummary(user.indicatedByUser),
  hierarchyPath: buildUserHierarchyPath(user),
  directIndicatedUsersCount: user._count.indicatedUsers,
  directSupportersCount: user._count.indicatedSupporters
});

export async function userRoutes(app: FastifyInstance) {
  app.get('/users', { preHandler: app.authenticate }, async (request, reply) => {
    if (!canListUsers(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const where = visibleUsersWhere(request.user);
    if (!where) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const users = await prisma.user.findMany({
      where,
      select: userListSelect,
      orderBy: [{ createdAt: 'asc' }]
    });

    return { users: users.map(serializeUserRecord) };
  });

  app.post('/users', { preHandler: app.authenticate }, async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    if (!canCreateUserRole(request.user.role, body.data.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const passwordHash = await bcrypt.hash(body.data.password, 10);

    try {
      const user = await prisma.user.create({
        data: {
          email: body.data.email.toLowerCase(),
          name: body.data.name.trim(),
          devzappLink: body.data.devzappLink?.trim() || undefined,
          passwordHash,
          role: body.data.role,
          indicatedByUserId: request.user.sub
        },
        select: userListSelect
      });

      return reply.code(201).send({ user: serializeUserRecord(user) });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return reply.code(409).send({ error: 'User already exists' });
      }
      throw error;
    }
  });

  app.patch('/users/:id', { preHandler: app.requireCoordinator }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const body = updateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    if (!canManageUsers(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const existing = await prisma.user.findUnique({
      where: { id: params.data.id },
      select: {
        id: true,
        role: true,
        indicatedByUserId: true,
        indicatedByUser: {
          select: {
            role: true
          }
        }
      }
    });

    if (!existing) {
      return reply.code(404).send({ error: 'User not found' });
    }

    if (body.data.role) {
      if (body.data.role === 'COORDENADOR' && existing.role !== 'COORDENADOR') {
        return reply.code(409).send({ error: 'Coordenadores devem ser criados manualmente.' });
      }

      if (existing.role === 'COORDENADOR' && body.data.role !== 'COORDENADOR') {
        const coordinatorCount = await prisma.user.count({ where: { role: 'COORDENADOR' } });
        if (coordinatorCount <= 1) {
          return reply.code(409).send({ error: 'Nao e possivel remover o ultimo coordenador.' });
        }
      }

      if (!roleAllowsIndicator(body.data.role, existing.indicatedByUser?.role ?? null)) {
        return reply
          .code(409)
          .send({ error: 'A relacao de indicacao atual nao e valida para o perfil informado.' });
      }
    }

    const updateData: {
      email?: string;
      name?: string;
    role?: RoleType;
      passwordHash?: string;
      devzappLink?: string | null;
    } = {};

    if (body.data.email) {
      updateData.email = body.data.email.toLowerCase();
    }

    if (body.data.name) {
      updateData.name = body.data.name.trim();
    }

    if (body.data.role) {
      updateData.role = body.data.role;
    }

    if (body.data.password) {
      updateData.passwordHash = await bcrypt.hash(body.data.password, 10);
    }

    if (body.data.devzappLink !== undefined) {
      updateData.devzappLink = body.data.devzappLink ? body.data.devzappLink.trim() : null;
    }

    try {
      const user = await prisma.user.update({
        where: { id: params.data.id },
        data: updateData,
        select: userListSelect
      });

      return { user: serializeUserRecord(user) };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return reply.code(409).send({ error: 'User already exists' });
      }
      throw error;
    }
  });

  app.delete('/users/:id', { preHandler: app.requireCoordinator }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    if (!canManageUsers(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const existing = await prisma.user.findUnique({
      where: { id: params.data.id },
      select: {
        id: true,
        role: true,
        _count: {
          select: {
            indicatedUsers: true,
            indicatedSupporters: true,
            createdIndications: true
          }
        }
      }
    });

    if (!existing) {
      return reply.code(404).send({ error: 'User not found' });
    }

    if (existing.id === request.user.sub) {
      return reply.code(400).send({ error: 'Nao e possivel excluir o proprio usuario.' });
    }

    if (existing.role === 'COORDENADOR') {
      const coordinatorCount = await prisma.user.count({ where: { role: 'COORDENADOR' } });
      if (coordinatorCount <= 1) {
        return reply.code(409).send({ error: 'Nao e possivel remover o ultimo coordenador.' });
      }
    }

    if (
      existing._count.indicatedUsers > 0 ||
      existing._count.indicatedSupporters > 0 ||
      existing._count.createdIndications > 0
    ) {
      return reply
        .code(409)
        .send({ error: 'Nao e possivel excluir usuario com liderancas ou apoiadores vinculados.' });
    }

    await prisma.user.delete({ where: { id: params.data.id } });
    return reply.code(204).send();
  });
}

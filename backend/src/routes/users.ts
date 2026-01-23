import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'VIEWER']),
  devzappLink: z.string().min(3).optional()
});

const updateSchema = z
  .object({
    email: z.string().email().optional(),
    name: z.string().min(2).optional(),
    password: z.string().min(6).optional(),
    role: z.enum(['ADMIN', 'VIEWER']).optional(),
    devzappLink: z.string().min(3).nullable().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Invalid payload'
  });

const paramsSchema = z.object({
  id: z.string()
});

export async function userRoutes(app: FastifyInstance) {
  app.get('/users', { preHandler: app.requireAdmin }, async () => {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, devzappLink: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    return { users };
  });

  app.post('/users', { preHandler: app.requireAdmin }, async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const passwordHash = await bcrypt.hash(body.data.password, 10);
    try {
      const user = await prisma.user.create({
        data: {
          email: body.data.email.toLowerCase(),
          name: body.data.name.trim(),
          devzappLink: body.data.devzappLink?.trim() || undefined,
          passwordHash,
          role: body.data.role
        },
        select: { id: true, email: true, name: true, devzappLink: true, role: true, createdAt: true }
      });
      return reply.code(201).send({ user });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return reply.code(409).send({ error: 'User already exists' });
      }
      throw error;
    }
  });

  app.patch('/users/:id', { preHandler: app.requireAdmin }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const body = updateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const existing = await prisma.user.findUnique({
      where: { id: params.data.id },
      select: { id: true, role: true }
    });
    if (!existing) {
      return reply.code(404).send({ error: 'User not found' });
    }

    if (body.data.role && existing.role === 'ADMIN' && body.data.role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return reply.code(409).send({ error: 'Nao e possivel remover o ultimo administrador.' });
      }
    }

    const updateData: {
      email?: string;
      name?: string;
      role?: 'ADMIN' | 'VIEWER';
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
        select: { id: true, email: true, name: true, devzappLink: true, role: true, createdAt: true }
      });
      return { user };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return reply.code(409).send({ error: 'User already exists' });
      }
      throw error;
    }
  });

  app.delete('/users/:id', { preHandler: app.requireAdmin }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const existing = await prisma.user.findUnique({
      where: { id: params.data.id },
      select: { id: true, role: true }
    });
    if (!existing) {
      return reply.code(404).send({ error: 'User not found' });
    }

    if (existing.id === request.user.sub) {
      return reply.code(400).send({ error: 'Nao e possivel excluir o proprio usuario.' });
    }

    if (existing.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return reply.code(409).send({ error: 'Nao e possivel remover o ultimo administrador.' });
      }
    }

    try {
      await prisma.user.delete({ where: { id: params.data.id } });
      return reply.code(204).send();
    } catch (error: any) {
      if (error?.code === 'P2003') {
        return reply.code(409).send({ error: 'Nao e possivel excluir usuario com indicacoes.' });
      }
      throw error;
    }
  });
}

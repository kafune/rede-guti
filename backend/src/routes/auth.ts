import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { creatableUserRolesByActor } from '../lib/access.js';
import { buildUserHierarchyPath, serializeUserSummary, userHierarchySelect } from '../lib/hierarchy.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const authUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  indicatedByUserId: true,
  indicatedByUser: {
    select: userHierarchySelect
  }
} as const;

const serializeAuthUser = (user: {
  id: string;
  email: string;
  name: string | null;
  role: 'COORDENADOR' | 'LIDER_REGIONAL' | 'LIDER_LOCAL';
  indicatedByUserId: string | null;
  indicatedByUser?: {
    id: string;
    email: string;
    name: string | null;
    role: 'COORDENADOR' | 'LIDER_REGIONAL' | 'LIDER_LOCAL';
    indicatedByUser?: any;
  } | null;
}) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  indicatedByUserId: user.indicatedByUserId,
  indicatedByUser: serializeUserSummary(user.indicatedByUser),
  hierarchyPath: buildUserHierarchyPath(user),
  allowedUserRolesToCreate: creatableUserRolesByActor[user.role]
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const email = body.data.email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        ...authUserSelect,
        passwordHash: true
      }
    });

    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(body.data.password, user.passwordHash);
    if (!ok) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign({ sub: user.id, role: user.role, email: user.email });
    return reply.send({
      token,
      user: serializeAuthUser(user)
    });
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: authUserSelect
    });

    if (!user) {
      return { user: null };
    }

    return {
      user: serializeAuthUser(user)
    };
  });
}

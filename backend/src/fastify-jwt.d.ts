import type { Role } from '@prisma/client';
import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: Role; email: string };
    user: { sub: string; role: Role; email: string };
  }
}

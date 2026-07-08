import type { Prisma, Role } from '@prisma/client';

export type AuthenticatedUser = {
  sub: string;
  role: Role | 'ADMIN' | 'OPERATOR' | 'VIEWER';
  email: string;
  tenantId: string;
};

export const normalizeRole = (
  role: Role | 'ADMIN' | 'OPERATOR' | 'VIEWER' | string | null | undefined
): Role | null => {
  switch (role) {
    case 'COORDENADOR':
    case 'ADMIN':
      return 'COORDENADOR';
    case 'LIDER_REGIONAL':
    case 'OPERATOR':
      return 'LIDER_REGIONAL';
    case 'VERIFICADORA':
      return 'VERIFICADORA';
    case 'VIEWER':
      return 'VERIFICADORA';
    case 'LIDER_LOCAL':
      return 'LIDER_REGIONAL';
    default:
      return null;
  }
};

export const creatableUserRolesByActor: Record<Role, Role[]> = {
  COORDENADOR: ['LIDER_REGIONAL', 'VERIFICADORA'],
  LIDER_REGIONAL: [],
  VERIFICADORA: []
};

export const canManageUsers = (role: Role | string) => normalizeRole(role) === 'COORDENADOR';

export const canListUsers = (role: Role | string) => {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === 'COORDENADOR' || normalizedRole === 'LIDER_REGIONAL';
};

export const canCreateSupporters = (role: Role | string) => {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === 'COORDENADOR' || normalizedRole === 'LIDER_REGIONAL';
};

export const canDeleteSupporters = (role: Role | string) => normalizeRole(role) === 'COORDENADOR';

export const canViewSupporterIdentities = (role: Role | string) =>
  normalizeRole(role) === 'COORDENADOR' || normalizeRole(role) === 'VERIFICADORA';

export const canUpdateSupporterStatus = (role: Role | string) => {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === 'COORDENADOR' || normalizedRole === 'VERIFICADORA';
};

export const canCreateUserRole = (actorRole: Role | string, targetRole: Role) => {
  const normalizedActorRole = normalizeRole(actorRole);
  if (!normalizedActorRole) {
    return false;
  }

  return creatableUserRolesByActor[normalizedActorRole].includes(targetRole);
};

// Os builders abaixo incluem o tenantId do ator explicitamente. A extensão do
// Prisma (src/db.ts) já injeta o mesmo filtro em toda query — aqui é defesa em
// profundidade e documentação do contrato de visibilidade.
export const visibleUsersWhere = (actor: AuthenticatedUser): Prisma.UserWhereInput | null => {
  const actorRole = normalizeRole(actor.role);

  if (actorRole === 'COORDENADOR') {
    return { tenantId: actor.tenantId };
  }

  if (actorRole === 'LIDER_REGIONAL') {
    return {
      tenantId: actor.tenantId,
      OR: [{ id: actor.sub }, { indicatedByUserId: actor.sub }]
    };
  }

  return null;
};

/**
 * Verdadeiro quando a indicação foi cadastrada pelo próprio ator — seja porque
 * ele a criou (createdById) ou porque foi vinculada ao link dele
 * (indicatedByUserId). Usado para liberar a visualização do nome dos apoiadores
 * que a liderança cadastrou pelo próprio link.
 */
export const isOwnIndication = (
  actor: AuthenticatedUser,
  indication: { createdById?: string | null; indicatedByUserId?: string | null }
) => indication.createdById === actor.sub || indication.indicatedByUserId === actor.sub;

export const visibleIndicationsWhere = (actor: AuthenticatedUser): Prisma.IndicationWhereInput => {
  const actorRole = normalizeRole(actor.role);

  if (actorRole === 'COORDENADOR' || actorRole === 'VERIFICADORA') {
    return { tenantId: actor.tenantId };
  }

  if (actorRole === 'LIDER_REGIONAL') {
    return {
      tenantId: actor.tenantId,
      OR: [
        { createdById: actor.sub },
        { indicatedByUserId: actor.sub },
        { createdBy: { indicatedByUserId: actor.sub } },
        { indicatedByUser: { indicatedByUserId: actor.sub } }
      ]
    };
  }

  return {
    tenantId: actor.tenantId,
    OR: [{ createdById: actor.sub }, { indicatedByUserId: actor.sub }]
  };
};

// --- Engajamento de Lideranças ---

/** COORDENADOR e VERIFICADORA veem o leaderboard geral. */
export const canViewLeaderboard = (role: Role | string) => {
  const r = normalizeRole(role);
  return r === 'COORDENADOR' || r === 'VERIFICADORA';
};

/** COORDENADOR e VERIFICADORA podem consultar stats de qualquer usuário. */
export const canViewUserEngagement = (role: Role | string) => {
  const r = normalizeRole(role);
  return r === 'COORDENADOR' || r === 'VERIFICADORA';
};

/** Somente COORDENADOR pode disparar recálculo de stats. */
export const canRecalculateStats = (role: Role | string) =>
  normalizeRole(role) === 'COORDENADOR';

export const roleAllowsIndicator = (
  role: Role | string,
  indicatorRole: Role | string | null | undefined
) => {
  const normalizedRole = normalizeRole(role);
  const normalizedIndicatorRole = normalizeRole(indicatorRole);

  if (!normalizedRole) {
    return false;
  }

  if (!normalizedIndicatorRole) {
    return normalizedRole === 'COORDENADOR';
  }

  if (normalizedRole === 'VERIFICADORA') {
    return normalizedIndicatorRole === 'COORDENADOR';
  }

  if (normalizedRole === 'LIDER_REGIONAL') {
    return normalizedIndicatorRole === 'COORDENADOR' || normalizedIndicatorRole === 'LIDER_REGIONAL';
  }

  return false;
};

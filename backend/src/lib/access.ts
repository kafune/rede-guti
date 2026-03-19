import { Prisma, Role } from '@prisma/client';

export type AuthenticatedUser = {
  sub: string;
  role: Role | 'ADMIN' | 'OPERATOR' | 'VIEWER';
  email: string;
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
    case 'LIDER_LOCAL':
    case 'VIEWER':
      return 'LIDER_LOCAL';
    default:
      return null;
  }
};

export const creatableUserRolesByActor: Record<Role, Role[]> = {
  COORDENADOR: ['LIDER_REGIONAL', 'LIDER_LOCAL'],
  LIDER_REGIONAL: ['LIDER_LOCAL'],
  LIDER_LOCAL: []
};

export const canManageUsers = (role: Role | string) => normalizeRole(role) === 'COORDENADOR';

export const canListUsers = (role: Role | string) => {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === 'COORDENADOR' || normalizedRole === 'LIDER_REGIONAL';
};

export const canCreateSupporters = (role: Role | string) => {
  const normalizedRole = normalizeRole(role);
  return (
    normalizedRole === 'COORDENADOR' ||
    normalizedRole === 'LIDER_REGIONAL' ||
    normalizedRole === 'LIDER_LOCAL'
  );
};

export const canDeleteSupporters = (role: Role | string) => normalizeRole(role) === 'COORDENADOR';

export const canCreateUserRole = (actorRole: Role | string, targetRole: Role) => {
  const normalizedActorRole = normalizeRole(actorRole);
  if (!normalizedActorRole) {
    return false;
  }

  return creatableUserRolesByActor[normalizedActorRole].includes(targetRole);
};

export const visibleUsersWhere = (actor: AuthenticatedUser): Prisma.UserWhereInput | null => {
  const actorRole = normalizeRole(actor.role);

  if (actorRole === 'COORDENADOR') {
    return {};
  }

  if (actorRole === 'LIDER_REGIONAL') {
    return {
      OR: [{ id: actor.sub }, { role: 'LIDER_LOCAL', indicatedByUserId: actor.sub }]
    };
  }

  return null;
};

export const visibleIndicationsWhere = (actor: AuthenticatedUser): Prisma.IndicationWhereInput => {
  const actorRole = normalizeRole(actor.role);

  if (actorRole === 'COORDENADOR') {
    return {};
  }

  if (actorRole === 'LIDER_REGIONAL') {
    return {
      OR: [
        { createdById: actor.sub },
        { indicatedByUserId: actor.sub },
        { createdBy: { role: 'LIDER_LOCAL', indicatedByUserId: actor.sub } },
        { indicatedByUser: { role: 'LIDER_LOCAL', indicatedByUserId: actor.sub } }
      ]
    };
  }

  return {
    OR: [{ createdById: actor.sub }, { indicatedByUserId: actor.sub }]
  };
};

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

  if (normalizedRole === 'LIDER_REGIONAL') {
    return normalizedIndicatorRole === 'COORDENADOR';
  }

  if (normalizedRole === 'LIDER_LOCAL') {
    return normalizedIndicatorRole === 'COORDENADOR' || normalizedIndicatorRole === 'LIDER_REGIONAL';
  }

  return false;
};

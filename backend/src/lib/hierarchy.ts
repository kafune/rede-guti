import { Role } from '@prisma/client';

type UserNode = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  indicatedByUser?: UserNode | null;
};

type HierarchyRole = Role | 'APOIADOR';

export type HierarchyPathItem = {
  id: string;
  name: string;
  role: HierarchyRole;
};

export const userSummarySelect = {
  id: true,
  email: true,
  name: true,
  role: true
} as const;

export const userHierarchySelect = {
  ...userSummarySelect,
  indicatedByUser: {
    select: {
      ...userSummarySelect,
      indicatedByUser: {
        select: {
          ...userSummarySelect,
          indicatedByUser: {
            select: userSummarySelect
          }
        }
      }
    }
  }
} as const;

export const getUserDisplayName = (user: Pick<UserNode, 'email' | 'name'>) => {
  const normalizedName = user.name?.trim();
  return normalizedName && normalizedName.length > 0 ? normalizedName : user.email;
};

const buildAncestorPath = (user?: UserNode | null): HierarchyPathItem[] => {
  if (!user) {
    return [];
  }

  return [
    ...buildAncestorPath(user.indicatedByUser ?? null),
    {
      id: user.id,
      name: getUserDisplayName(user),
      role: user.role
    }
  ];
};

export const buildUserHierarchyPath = (user: UserNode): HierarchyPathItem[] => {
  return [
    ...buildAncestorPath(user.indicatedByUser ?? null),
    {
      id: user.id,
      name: getUserDisplayName(user),
      role: user.role
    }
  ];
};

export const buildSupporterHierarchyPath = (supporter: {
  id: string;
  name: string;
  indicatedByUser?: UserNode | null;
}): HierarchyPathItem[] => {
  return [
    ...buildAncestorPath(supporter.indicatedByUser ?? null),
    {
      id: supporter.id,
      name: supporter.name,
      role: 'APOIADOR'
    }
  ];
};

export const serializeUserSummary = (user?: UserNode | null) => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: getUserDisplayName(user),
    role: user.role
  };
};

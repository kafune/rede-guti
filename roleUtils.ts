import { RegistrationTarget, SUPPORTER_REGISTRATION_TARGET, UserRole } from './types';

export const getRoleLabel = (role: UserRole) => {
  switch (role) {
    case UserRole.COORDENADOR:
      return 'Coordenador';
    case UserRole.LIDER_REGIONAL:
      return 'Lider Regional';
    case UserRole.LIDER_LOCAL:
      return 'Lider Local';
    default:
      return role;
  }
};

export const getCreatableUserRoles = (role: UserRole) => {
  return getCreatableRegistrationTargets(role).filter(isUserRoleRegistrationTarget);
};

export const getDefaultCreatableUserRole = (role: UserRole) => {
  return getCreatableUserRoles(role)[0] ?? UserRole.LIDER_LOCAL;
};

export const isUserRoleRegistrationTarget = (
  target: RegistrationTarget
): target is UserRole.LIDER_REGIONAL | UserRole.LIDER_LOCAL => {
  return target === UserRole.LIDER_REGIONAL || target === UserRole.LIDER_LOCAL;
};

export const getCreatableRegistrationTargets = (role: UserRole): RegistrationTarget[] => {
  switch (role) {
    case UserRole.COORDENADOR:
      return [UserRole.LIDER_REGIONAL, UserRole.LIDER_LOCAL, SUPPORTER_REGISTRATION_TARGET];
    case UserRole.LIDER_REGIONAL:
      return [UserRole.LIDER_LOCAL, SUPPORTER_REGISTRATION_TARGET];
    case UserRole.LIDER_LOCAL:
      return [SUPPORTER_REGISTRATION_TARGET];
    default:
      return [];
  }
};

export const getDefaultCreatableRegistrationTarget = (role: UserRole): RegistrationTarget => {
  return getCreatableRegistrationTargets(role)[0] ?? SUPPORTER_REGISTRATION_TARGET;
};

export const getRegistrationTargetLabel = (target: RegistrationTarget) => {
  if (target === SUPPORTER_REGISTRATION_TARGET) {
    return 'Apoiador';
  }

  return getRoleLabel(target);
};

export const canAccessManagementPanel = (role: UserRole) =>
  role === UserRole.COORDENADOR || role === UserRole.LIDER_REGIONAL;

export const canManageUsers = (role: UserRole) => role === UserRole.COORDENADOR;

export const canViewAllSupporters = (role: UserRole) =>
  role === UserRole.COORDENADOR || role === UserRole.LIDER_REGIONAL;

export const canDeleteSupporters = (role: UserRole) => role === UserRole.COORDENADOR;

export const normalizeUserRole = (value: string | undefined | null): UserRole | null => {
  switch (value) {
    case UserRole.COORDENADOR:
    case 'ADMIN':
      return UserRole.COORDENADOR;
    case UserRole.LIDER_REGIONAL:
    case 'OPERATOR':
      return UserRole.LIDER_REGIONAL;
    case UserRole.LIDER_LOCAL:
    case 'VIEWER':
      return UserRole.LIDER_LOCAL;
    default:
      return null;
  }
};

export enum UserRole {
  COORDENADOR = 'COORDENADOR',
  LIDER_REGIONAL = 'LIDER_REGIONAL'
}

export type HierarchyRole = UserRole | 'APOIADOR';
export const SUPPORTER_REGISTRATION_TARGET = 'APOIADOR';
export type RegistrationTarget = UserRole.LIDER_REGIONAL | typeof SUPPORTER_REGISTRATION_TARGET;

export interface RegistrationUserPayload {
  target: UserRole.LIDER_REGIONAL;
  name: string;
  email: string;
  password: string;
}

export interface RegistrationSupporterPayload {
  target: typeof SUPPORTER_REGISTRATION_TARGET;
  name: string;
  whatsapp: string;
  churchName: string;
  municipalityName: string;
}

export type RegistrationPayload = RegistrationUserPayload | RegistrationSupporterPayload;

export interface HierarchyPathItem {
  id: string;
  name: string;
  role: HierarchyRole;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export enum SupportStatus {
  ACTIVE = 'Ativo',
  VALIDATING = 'Em validacao',
  INACTIVE = 'Inativo'
}

export type Region =
  | 'Capital'
  | 'RMSP'
  | 'Campinas/RMC'
  | 'Vale do Paraíba'
  | 'Sorocaba'
  | 'Ribeirão Preto'
  | 'São José do Rio Preto'
  | 'Bauru/Marília'
  | 'Presidente Prudente'
  | 'Baixada Santista'
  | 'Litoral Norte'
  | 'Interior (outros)';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  indicatedByUserId?: string | null;
  indicatedByUser?: UserSummary | null;
  hierarchyPath?: HierarchyPathItem[];
  allowedUserRolesToCreate?: UserRole[];
}

export interface AdminUser {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  createdAt: string;
  indicatedByUserId?: string | null;
  indicatedByUser?: UserSummary | null;
  hierarchyPath?: HierarchyPathItem[];
  directIndicatedUsersCount?: number;
  directSupportersCount?: number;
}

export interface AppSettings {
  whatsappGroupLink?: string | null;
  updatedAt?: string | null;
}

export interface Church {
  id: string;
  name: string;
}

export interface Municipality {
  id: string;
  name: string;
  stateCode: string;
}

export interface Supporter {
  id: string;
  name: string;
  identityHidden?: boolean;
  email?: string | null;
  whatsapp: string;
  church: string;
  region: Region;
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  referredBy?: string;
  indicatedBy?: string | null;
  indicatedByUserId?: string | null;
  indicatedByUser?: UserSummary | null;
  hierarchyPath?: HierarchyPathItem[] | null;
  status: SupportStatus;
  notes?: string;
  photo?: string;
  birthDate?: string;
  cpf?: string;
  churchDenomination?: string;
  isMainBranch?: boolean;
  ministryRole?: string;
  churchAddress?: string;
  churchCNPJ?: string;
  churchSocialMedia?: string;
  churchMembersCount?: string;
  hasSocialProjects?: boolean;
  socialProjectsDescription?: string;
}

export interface DashboardStats {
  total: number;
  last7Days: number;
  last30Days: number;
  byRegion: Record<Region, number>;
  monthlyTarget: number;
}

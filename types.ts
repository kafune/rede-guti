export enum UserRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER'
}

export enum SupportStatus {
  ACTIVE = 'Ativo',
  VALIDATING = 'Em validaÃ§Ã£o',
  INACTIVE = 'Inativo'
}

export enum SupporterType {
  SUPPORTER = 'SUPPORTER',
  PASTOR = 'PASTOR'
}

export type Region = 
  | 'Capital'
  | 'RMSP'
  | 'Campinas/RMC'
  | 'Vale do ParaÃ­ba'
  | 'Sorocaba'
  | 'RibeirÃ£o Preto'
  | 'SÃ£o JosÃ© do Rio Preto'
  | 'Bauru/MarÃ­lia'
  | 'Presidente Prudente'
  | 'Baixada Santista'
  | 'Litoral Norte'
  | 'Interior (outros)';

export interface User {
  id: string;
  email: string;
  name: string;
  devzappLink?: string | null;
  role: UserRole;
}

export interface AdminUser {
  id: string;
  email: string;
  name?: string | null;
  devzappLink?: string | null;
  role: UserRole;
  createdAt: string;
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
  whatsapp: string;
  church: string;
  region: Region;
  createdAt: string;
  createdBy: string;
  referredBy?: string; 
  indicatedBy?: string;
  status: SupportStatus;
  notes?: string;
  photo?: string; // Campo para a foto em Base64
  type?: SupporterType;
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

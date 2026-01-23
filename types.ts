
export enum UserRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER'
}

export enum SupportStatus {
  ACTIVE = 'Ativo',
  VALIDATING = 'Em validação',
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
}

export interface DashboardStats {
  total: number;
  last7Days: number;
  last30Days: number;
  byRegion: Record<Region, number>;
  monthlyTarget: number;
}

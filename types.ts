export enum UserRole {
  COORDENADOR = 'COORDENADOR',
  LIDER_REGIONAL = 'LIDER_REGIONAL',
  VERIFICADORA = 'VERIFICADORA'
}

export type HierarchyRole = UserRole | 'APOIADOR';
export const SUPPORTER_REGISTRATION_TARGET = 'APOIADOR';
export type RegistrationTarget =
  | UserRole.LIDER_REGIONAL
  | UserRole.VERIFICADORA
  | typeof SUPPORTER_REGISTRATION_TARGET;

export interface RegistrationUserPayload {
  target: UserRole.LIDER_REGIONAL | UserRole.VERIFICADORA;
  name: string;
  email: string;
  password: string;
  whatsapp?: string;
}

export interface RegistrationSupporterPayload {
  target: typeof SUPPORTER_REGISTRATION_TARGET;
  name: string;
  whatsapp: string;
  // Ausente quando a instância não coleta igreja (VITE_CHURCH_FIELD_ENABLED=false).
  churchName?: string;
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
  active: boolean;
  whatsapp?: string | null;
  createdAt: string;
  indicatedByUserId?: string | null;
  indicatedByUser?: UserSummary | null;
  hierarchyPath?: HierarchyPathItem[];
  directIndicatedUsersCount?: number;
  directSupportersCount?: number;
}

export interface AppSettings {
  whatsappGroupLink?: string | null;
  announcement?: string | null;
  liderAccessBlocked?: boolean;
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

export type EventoIndicadoStatus = 'INDICADO' | 'APROVADO' | 'RECUSADO' | 'CONFIRMADO' | 'PRESENTE';

export interface Atividade {
  id: string;
  liderId: string;
  liderNome: string;
  titulo: string;
  descricao?: string | null;
  dataHora: string;
  local?: string | null;
  qtdEnvolvidos: number;
  createdAt: string;
}

export interface AtividadePublicLider {
  id: string;
  nome: string;
}

export interface Evento {
  id: string;
  nome: string;
  data: string;
  hora: string;
  local: string;
  limitePorLider: number;
  observacao?: string | null;
  encerrado: boolean;
  createdAt: string;
  totalIndicados: number;
  totalAprovados: number;
  totalConfirmados: number;
  totalPresentes: number;
}

export interface EventoIndicado {
  id: string;
  eventoId: string;
  nome: string;
  telefone: string;
  liderId: string;
  liderNome: string;
  status: EventoIndicadoStatus;
  createdAt: string;
}

export interface EventoPublicInfo {
  id: string;
  nome: string;
  data: string;
  hora: string;
  local: string;
  encerrado: boolean;
  lider?: { id: string; nome: string } | null;
  limiteAtingido: boolean;
}

export interface MetaCidade {
  id: string;
  municipalityId: string;
  cidade: string;
  regiao?: string | null;
  eleitores: number;
  votosValidos: number;
  meta: number;
  observacao?: string | null;
  apoiadoresCadastrados: number;
  createdAt: string;
  updatedAt: string;
}

export type EquipeStatus = 'ATIVA' | 'INATIVA';
export type EquipeOrigem = 'MANUAL' | 'AUTOCADASTRO';

export interface EquipeMembro {
  id?: string; // ausente ao criar
  nome: string;
  telefone: string;
  tituloEleitor?: string | null;
  secao?: string | null;
  ordem?: number;
  // Resumo do autocadastro individual do apoiador (preenchido pela pessoa via
  // link público). Ausente ao criar; nulo enquanto a pessoa não se cadastrou.
  cadastro?: MembroCadastroResumo | null;
}

// Equipe de campanha (porta de igreja): motorista com carro próprio + até 4
// apoiadores. valor/valorObservacoes só vêm do backend para o COORDENADOR.
export interface Equipe {
  id: string;
  liderId: string;
  liderNome: string;
  nome: string;
  motoristaNome: string;
  motoristaCnh: string;
  motoristaTelefone: string;
  motoristaTituloEleitor?: string | null;
  motoristaSecao?: string | null;
  // Resumo do autocadastro individual do motorista (via link público).
  motoristaCadastro?: MembroCadastroResumo | null;
  carroPlaca: string;
  carroModelo: string;
  carroCor: string;
  status: EquipeStatus;
  origem: EquipeOrigem;
  membros: EquipeMembro[];
  visitasCount: number;
  ultimaVisitaEm?: string | null;
  createdAt: string;
  updatedAt: string;
  valor?: string | null;
  valorObservacoes?: string | null;
}

export interface EquipeMembroPayload {
  nome: string;
  telefone: string;
  tituloEleitor: string;
  secao: string;
}

export interface EquipePayload {
  nome: string;
  motoristaNome: string;
  motoristaCnh: string;
  motoristaTelefone: string;
  motoristaTituloEleitor: string;
  motoristaSecao: string;
  carroPlaca: string;
  carroModelo: string;
  carroCor: string;
  status?: EquipeStatus;
  membros: EquipeMembroPayload[];
  liderId?: string; // só usado pelo coordenador ao cadastrar por uma liderança
}

// ── Autocadastro individual das pessoas da equipe (motorista/apoiador) ────────

export type PessoaTipo = 'MOTORISTA' | 'APOIADOR';

// Resumo do autocadastro anexado a cada pessoa (sem os dados sensíveis nem as
// imagens dos documentos — só o suficiente para o status no card).
export interface MembroCadastroResumo {
  id: string;
  preenchido: boolean;
  nomeCompleto: string;
  consentimento: boolean;
  documentosCount: number;
  atualizadoEm: string;
}

export interface MembroCadastroDocumento {
  id: string;
  tipo: string;
  imagemUrl: string;
  createdAt: string;
}

// Autocadastro completo — visão da coordenação, com as imagens dos documentos.
export interface MembroCadastro {
  id: string;
  pessoaTipo: PessoaTipo;
  slot: number | null;
  nomeCompleto: string;
  cpf?: string | null;
  rg?: string | null;
  dataNascimento?: string | null;
  telefone?: string | null;
  email?: string | null;
  cep?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  observacoes?: string | null;
  consentimento: boolean;
  consentimentoEm?: string | null;
  atualizadoEm: string;
  documentos: MembroCadastroDocumento[];
}

// Payload enviado pela própria pessoa no link público (sem login).
export interface MembroCadastroPayload {
  nomeCompleto: string;
  cpf?: string;
  rg?: string;
  dataNascimento?: string;
  telefone?: string;
  email?: string;
  cep?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  observacoes?: string;
  consentimento: boolean;
  documentos: { tipo: string; imagemUrl: string }[];
}

// Estado do autocadastro devolvido pelo link público (prefill; sem as imagens).
export interface PessoaCadastroPublic {
  nomeCompleto: string;
  cpf?: string | null;
  rg?: string | null;
  dataNascimento?: string | null;
  telefone?: string | null;
  email?: string | null;
  cep?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  observacoes?: string | null;
  consentimento: boolean;
  consentimentoEm?: string | null;
  atualizadoEm: string;
  documentosCount: number;
  documentos: { id: string; tipo: string; createdAt: string }[];
}

// Info pública da pessoa indicada (motorista/apoiador), carregada pelo link.
export interface PessoaPublica {
  equipeId: string;
  equipeNome: string;
  liderNome: string;
  tipo: PessoaTipo;
  slot: number | null;
  nomeIndicado: string;
  telefone: string;
  cadastro: PessoaCadastroPublic | null;
}

// ── Prestação de contas: visitas das equipes ──────────────────────────────────

export interface EquipeVisita {
  id: string;
  equipeId: string;
  local: string;
  dataHora: string;
  observacoes?: string | null;
  fotoUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  registradoPor?: string | null;
  createdAt: string;
}

export interface EquipeVisitaPayload {
  local: string;
  dataHora?: string;
  observacoes?: string | null;
  registradoPor?: string | null;
  fotoUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

// Resumo público de uma equipe (link de prestação de contas).
export interface EquipePublicInfo {
  id: string;
  nome: string;
  status: EquipeStatus;
  liderNome: string;
  motoristaNome: string;
  totalApoiadores: number;
  visitasCount: number;
}

// Visita no formato reduzido do link público (sem foto).
export interface EquipeVisitaPublic {
  id: string;
  local: string;
  dataHora: string;
  registradoPor?: string | null;
  temLocalizacao: boolean;
}

// Resumo público de uma equipe na página de autocadastro da liderança.
export interface EquipePublicResumo {
  id: string;
  nome: string;
  status: EquipeStatus;
  totalApoiadores: number;
  visitasCount: number;
  createdAt: string;
}

// ── Módulo de cadastro de igrejas ─────────────────────────────────────────────

export type IgrejaOrigem = 'admin' | 'public' | 'import';

export interface IgrejaEquipeVinculo {
  assignmentId: string;
  equipeId: string;
  equipeNome: string;
  dataAgendada?: string | null;
}

export interface Igreja {
  id: string;
  nome: string;
  denominacao: string;
  pastor: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  telefone: string;
  email: string;
  latitude: number | null;
  longitude: number | null;
  observacoes: string;
  membrosEstimados: number | null;
  zonaEleitoral: number | null;
  origem: IgrejaOrigem;
  liderancaLabel?: string | null;
  createdById?: string | null;
  createdByNome?: string | null;
  equipes: IgrejaEquipeVinculo[];
  createdAt: string;
}

// Dados do formulário (sem campos gerados pelo servidor).
export interface IgrejaFormData {
  nome: string;
  denominacao: string;
  pastor: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  telefone: string;
  email: string;
  latitude: number | null;
  longitude: number | null;
  observacoes: string;
  membrosEstimados: number | null;
  zonaEleitoral: number | null;
}

// Payload de criação: aceita vínculo opcional (admin) / obrigatório (público) com equipe.
export type IgrejaPayload = IgrejaFormData & { equipeId?: string };

export interface DashboardStats {
  total: number;
  last7Days: number;
  last30Days: number;
  byRegion: Record<Region, number>;
  monthlyTarget: number;
}

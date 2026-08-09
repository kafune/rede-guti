// Tipos do módulo territorial (frontend). Espelham os serializers do backend.

export interface ElectoralZone {
  id: string;
  number: string;
  name?: string | null;
  color?: string | null;
  eleitores?: number | null;
}

export interface TerritoryChurch {
  id: string;
  name: string;
  denomination: string | null;
  pastorName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodingProvider: string | null;
  geocodingConfidence: string | null;
  electoralZoneId: string | null;
  zoneNumber: string | null;
  zoneColor: string | null;
  zoneClassificationMethod: string | null;
  zoneConfidenceScore: number | null;
  zoneSource: string | null;
  zoneRequiresReview: boolean;
  zoneValidatedAt: string | null;
  currentTeamId: string | null;
  currentTeamName: string | null;
  status: string;
  priority: string | null;
  verificationStatus: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Visit {
  id: string;
  churchId: string;
  churchName?: string;
  teamId: string | null;
  teamName: string | null;
  driverUserId: string | null;
  visitNumber: number;
  scheduledDate: string | null;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  status: string;
  publicToken: string;
  tokenRevoked: boolean;
  checkinAt: string | null;
  checkinLatitude: number | null;
  checkinLongitude: number | null;
  checkinAccuracy: number | null;
  distanceFromChurch: number | null;
  geofenceStatus: string | null;
  justification: string | null;
  checkoutAt: string | null;
  outcome: string | null;
  outcomeHappened: string | null;
  responsibleContacted: string | null;
  nextAction: string | null;
  followUpDate: string | null;
  notes: string | null;
  hasPhoto: boolean;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberRef {
  userId: string;
  name: string;
  role: string | null;
}

export interface Team {
  id: string;
  name: string;
  electoralZoneId: string | null;
  zoneNumber: string | null;
  zoneColor: string | null;
  leaderUserId: string | null;
  leaderName: string | null;
  driverUserId: string | null;
  driverName: string | null;
  vehicle: string | null;
  status: string;
  notes: string | null;
  churchCount: number;
  members: TeamMemberRef[];
  createdAt: string;
}

export interface TerritorySettings {
  id: string;
  checkinRadiusMeters: number;
  checkinWarnMeters: number;
  requirePhoto: boolean;
  visitsPerChurch: number;
}

export interface ZoneDashboardRow {
  zoneId: string;
  number: string;
  color: string | null;
  eleitores: number | null;
  churches: number;
  assigned: number;
  unassigned: number;
  v1Done: number;
  v1Scheduled: number;
  v2Done: number;
  v2Scheduled: number;
  late: number;
}

export interface TeamDashboardRow {
  teamId: string;
  name: string;
  zoneNumber: string | null;
  churches: number;
  v1Done: number;
  v2Done: number;
  late: number;
  pct: number;
}

export interface TerritoryDashboard {
  cards: {
    churchesTotal: number;
    churchesWithZone: number;
    pendingClassification: number;
    assigned: number;
    visitsScheduled: number;
    visitsDone: number;
    visitsLate: number;
    cycleComplete: number;
  };
  funnel: {
    cadastradas: number;
    classificadas: number;
    atribuidas: number;
    v1Agendada: number;
    v1Concluida: number;
    v2Agendada: number;
    cicloCompleto: number;
  };
  byZone: ZoneDashboardRow[];
  byTeam: TeamDashboardRow[];
}

// Payload público (motorista)
export interface PublicVisit {
  visitNumber: number;
  status: string;
  scheduledDate: string | null;
  scheduledStartTime: string | null;
  tokenRevoked: boolean;
  hasPhoto: boolean;
  checkinAt: string | null;
  church: {
    name: string;
    denomination: string | null;
    pastorName: string | null;
    formattedAddress: string | null;
    street: string | null;
    number: string | null;
    district: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    zoneNumber: string | null;
  };
  team: { name: string } | null;
  settings: {
    requirePhoto: boolean;
    checkinRadiusMeters: number;
    checkinWarnMeters: number;
  };
}

export const VISIT_STATUS_LABEL: Record<string, string> = {
  aguardando_agendamento: 'Aguardando agendamento',
  agendada: 'Agendada',
  em_rota: 'Em rota',
  checkin_realizado: 'Check-in realizado',
  visita_realizada: 'Visita realizada',
  nao_realizada: 'Não realizada',
  ausente: 'Ausente',
  reagendada: 'Reagendada',
  cancelada: 'Cancelada',
  pendente_validacao: 'Pendente de validação',
};

import { apiRequest } from './api';
import {
  ElectoralZone,
  PublicVisit,
  Team,
  TerritoryChurch,
  TerritoryDashboard,
  TerritorySettings,
  Visit,
} from './territoryTypes';

// ── Zonas ─────────────────────────────────────────────────────────────────────
export const fetchZones = async () =>
  (await apiRequest<{ zones: ElectoralZone[] }>('/territory/zones')).zones;

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const fetchTerritoryDashboard = async () =>
  await apiRequest<TerritoryDashboard>('/territory/dashboard');

// ── Settings ──────────────────────────────────────────────────────────────────
export const fetchTerritorySettings = async () =>
  (await apiRequest<{ settings: TerritorySettings }>('/territory/settings')).settings;

export const updateTerritorySettings = async (payload: Partial<TerritorySettings>) =>
  (await apiRequest<{ settings: TerritorySettings }>('/territory/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })).settings;

// ── Igrejas ───────────────────────────────────────────────────────────────────
export interface ChurchFilters {
  q?: string;
  zone?: string;
  teamId?: string;
  assigned?: 'true' | 'false';
  needsReview?: 'true' | 'false';
  hasCoords?: 'true' | 'false';
  denomination?: string;
}

export const fetchTerritoryChurches = async (filters: ChurchFilters = {}) => {
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) qs.set(k, v);
  });
  const query = qs.toString();
  return (await apiRequest<{ churches: TerritoryChurch[] }>(
    `/territory/churches${query ? `?${query}` : ''}`
  )).churches;
};

export const fetchChurchDetail = async (id: string) =>
  await apiRequest<{ church: TerritoryChurch; visits: Visit[] }>(`/territory/churches/${id}`);

export type ChurchInput = Partial<Omit<TerritoryChurch, 'id' | 'createdAt' | 'updatedAt'>> & {
  name: string;
};

export const createTerritoryChurch = async (payload: ChurchInput) =>
  await apiRequest<{ church: TerritoryChurch; zoneResolution: any }>('/territory/churches', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateTerritoryChurch = async (id: string, payload: Partial<ChurchInput>) =>
  (await apiRequest<{ church: TerritoryChurch }>(`/territory/churches/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })).church;

export const setChurchZone = async (id: string, zoneNumber: string) =>
  (await apiRequest<{ church: TerritoryChurch }>(`/territory/churches/${id}/zone`, {
    method: 'POST',
    body: JSON.stringify({ zoneNumber }),
  })).church;

export const reclassifyChurch = async (id: string) =>
  await apiRequest<{ church: TerritoryChurch; zoneResolution: any }>(
    `/territory/churches/${id}/reclassify`,
    { method: 'POST' }
  );

export const importChurches = async (churches: ChurchInput[]) =>
  await apiRequest<{ created: number; skipped: number; errors: string[] }>(
    '/territory/churches/import',
    { method: 'POST', body: JSON.stringify({ churches }) }
  );

export const generateVisits = async (churchId: string) =>
  await apiRequest<{ visits: Visit[]; createdCount: number }>(
    `/territory/churches/${churchId}/visits/generate`,
    { method: 'POST' }
  );

// ── Equipes ───────────────────────────────────────────────────────────────────
export const fetchTeams = async () =>
  (await apiRequest<{ teams: Team[] }>('/territory/teams')).teams;

export const createTeam = async (payload: {
  name: string;
  electoralZoneId?: string | null;
  leaderUserId?: string | null;
  driverUserId?: string | null;
  vehicle?: string | null;
  notes?: string | null;
}) => (await apiRequest<{ team: any }>('/territory/teams', {
  method: 'POST',
  body: JSON.stringify(payload),
})).team;

export const updateTeam = async (id: string, payload: any) =>
  (await apiRequest<{ team: any }>(`/territory/teams/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })).team;

export const deleteTeam = async (id: string) =>
  await apiRequest<void>(`/territory/teams/${id}`, { method: 'DELETE' });

export const addTeamMember = async (teamId: string, userId: string, role?: string) =>
  await apiRequest<{ ok: boolean }>(`/territory/teams/${teamId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId, role }),
  });

export const removeTeamMember = async (teamId: string, userId: string) =>
  await apiRequest<void>(`/territory/teams/${teamId}/members/${userId}`, { method: 'DELETE' });

// ── Atribuição ────────────────────────────────────────────────────────────────
export const assignChurches = async (churchIds: string[], teamId: string | null) =>
  await apiRequest<{ updated: number }>('/territory/assign', {
    method: 'POST',
    body: JSON.stringify({ churchIds, teamId }),
  });

// ── Visitas (coordenação) ───────────────────────────────────────────────────────
export interface VisitFilters {
  zone?: string;
  teamId?: string;
  status?: string;
  visitNumber?: string;
  late?: 'true';
  from?: string;
  to?: string;
}

export const fetchVisits = async (filters: VisitFilters = {}) => {
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) qs.set(k, v);
  });
  const query = qs.toString();
  return (await apiRequest<{ visits: Visit[] }>(`/territory/visits${query ? `?${query}` : ''}`)).visits;
};

export const updateVisit = async (
  id: string,
  payload: {
    scheduledDate?: string | null;
    scheduledStartTime?: string | null;
    scheduledEndTime?: string | null;
    teamId?: string | null;
    driverUserId?: string | null;
    status?: string;
    notes?: string;
  }
) => (await apiRequest<{ visit: Visit }>(`/territory/visits/${id}`, {
  method: 'PATCH',
  body: JSON.stringify(payload),
})).visit;

export const revokeVisitToken = async (id: string) =>
  (await apiRequest<{ visit: Visit }>(`/territory/visits/${id}/revoke-token`, { method: 'POST' })).visit;

export const fetchReviewQueue = async () =>
  (await apiRequest<{ visits: Visit[] }>('/territory/review')).visits;

export const reviewVisit = async (id: string, decision: 'aprovar' | 'rejeitar' | 'corrigir', notes?: string) =>
  (await apiRequest<{ visit: Visit }>(`/territory/visits/${id}/review`, {
    method: 'POST',
    body: JSON.stringify({ decision, notes }),
  })).visit;

// ── Público (motorista, sem login) ───────────────────────────────────────────────
export const fetchPublicVisit = async (token: string) =>
  (await apiRequest<{ visit: PublicVisit }>(`/public/visits/${token}`)).visit;

export const publicCheckin = async (
  token: string,
  payload: { latitude: number; longitude: number; accuracy?: number | null; deviceTimestamp?: string | null; justification?: string | null }
) => await apiRequest<{
  ok: boolean;
  needsJustification: boolean;
  geofenceStatus: string;
  distanceFromChurch: number | null;
  radiusMeters: number;
}>(`/public/visits/${token}/checkin`, { method: 'POST', body: JSON.stringify(payload) });

export const publicUploadPhoto = async (token: string, photo: string) =>
  await apiRequest<{ ok: boolean; photoHash: string }>(`/public/visits/${token}/photo`, {
    method: 'POST',
    body: JSON.stringify({ photo }),
  });

export const publicSubmitOutcome = async (
  token: string,
  payload: {
    happened: 'sim' | 'nao' | 'parcialmente';
    outcome?: string;
    responsibleContacted?: string;
    notes?: string;
    nextAction?: string;
    followUpDate?: string | null;
  }
) => await apiRequest<{ ok: boolean; visit: PublicVisit }>(`/public/visits/${token}/outcome`, {
  method: 'POST',
  body: JSON.stringify(payload),
});

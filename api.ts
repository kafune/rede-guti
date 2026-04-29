import {
  AdminUser,
  AppSettings,
  Church,
  Evento,
  EventoIndicado,
  EventoIndicadoStatus,
  EventoPublicInfo,
  HierarchyPathItem,
  Municipality,
  SupportStatus,
  UserRole,
  UserSummary
} from './types';

const getApiBase = () => {
  const envValue = String((import.meta as any).env?.VITE_API_URL ?? '').trim();
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const sameHost = `http://${hostname || 'localhost'}:4000`;

  if (!envValue || envValue.toLowerCase() === 'auto') {
    return sameHost;
  }

  if (
    (envValue.includes('localhost') || envValue.includes('127.0.0.1')) &&
    hostname &&
    !['localhost', '127.0.0.1'].includes(hostname)
  ) {
    return sameHost;
  }

  return envValue;
};

const API_URL = getApiBase();
const REQUEST_TIMEOUT_MS = 12000;

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('guti_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const request = async <T>(path: string, options: RequestInit = {}) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;

  const hasBody = options.body !== undefined;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...getAuthHeaders(),
        ...(options.headers ?? {})
      }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('Tempo limite ao conectar com o servidor.', 408);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let message = 'Erro ao conectar com o servidor.';
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
      if ((!payload?.error || payload?.error === 'Bad Request') && payload?.message) {
        message = payload.message;
      }
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export type ApiIndication = {
  id: string;
  name: string;
  identityHidden?: boolean;
  phone?: string | null;
  email?: string | null;
  status: 'ATIVO' | 'INATIVO';
  indicatedBy?: string | null;
  indicatedByUserId?: string | null;
  indicatedByUser?: UserSummary | null;
  hierarchyPath?: HierarchyPathItem[] | null;
  createdAt: string;
  createdById?: string;
  createdBy?: UserSummary | null;
  church: Church;
  municipality: Municipality;
};

export const fetchIndications = async () => {
  const data = await request<{ indications: ApiIndication[] }>('/indications');
  return data.indications;
};

export const createIndication = async (payload: {
  name: string;
  phone?: string;
  email?: string;
  churchId: string;
  municipalityId: string;
}) => {
  const data = await request<{ indication: ApiIndication }>('/indications', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return data.indication;
};

const toApiIndicationStatus = (status: SupportStatus.ACTIVE | SupportStatus.INACTIVE) => {
  return status === SupportStatus.INACTIVE ? 'INATIVO' : 'ATIVO';
};

export const updateIndicationStatus = async (
  id: string,
  status: SupportStatus.ACTIVE | SupportStatus.INACTIVE
) => {
  const data = await request<{ indication: ApiIndication }>(`/indications/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: toApiIndicationStatus(status) })
  });
  return data.indication;
};

export const deleteIndication = async (id: string) => {
  await request<void>(`/indications/${id}`, { method: 'DELETE' });
};

export const fetchChurches = async () => {
  const data = await request<{ churches: Church[] }>('/churches');
  return data.churches;
};

export const createChurch = async (name: string) => {
  const data = await request<{ church: Church }>('/churches', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  return data.church;
};

export const fetchMunicipalities = async () => {
  const data = await request<{ municipalities: Municipality[] }>('/municipalities');
  return data.municipalities;
};

export const createMunicipality = async (name: string, stateCode = 'SP') => {
  const data = await request<{ municipality: Municipality }>('/municipalities', {
    method: 'POST',
    body: JSON.stringify({ name, stateCode })
  });
  return data.municipality;
};

export const fetchPublicOptions = async () => {
  const data = await request<{
    churches: string[];
    municipalities: string[];
    whatsappGroupLink?: string | null;
  }>('/public/options');
  return data;
};

export const createPublicIndication = async (payload: {
  name: string;
  phone: string;
  email: string;
  churchName: string;
  municipalityName: string;
  indicatedBy?: string;
  indicatedByUserId?: string;
}) => {
  const data = await request<{ indication: ApiIndication }>('/public/indications', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return data.indication;
};

export const fetchUsers = async () => {
  const data = await request<{ users: AdminUser[] }>('/users');
  return data.users;
};

export const createUser = async (payload: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}) => {
  const data = await request<{ user: AdminUser }>('/users', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return data.user;
};

export const updateUser = async (
  id: string,
  payload: { email?: string; name?: string; password?: string; role?: UserRole }
) => {
  const data = await request<{ user: AdminUser }>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return data.user;
};

export const deleteUser = async (id: string) => {
  await request<void>(`/users/${id}`, { method: 'DELETE' });
};

export const fetchSettings = async () => {
  const data = await request<{ settings: AppSettings }>('/settings');
  return data.settings;
};

export const updateSettings = async (payload: { whatsappGroupLink: string | null }) => {
  const data = await request<{ settings: AppSettings }>('/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return data.settings;
};

export const isUnauthorized = (error: unknown) => {
  return error instanceof ApiError && error.status === 401;
};

export const getApiErrorMessage = (error: unknown, fallback = 'Falha ao carregar dados.') => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
};

// ── EVENTOS ──────────────────────────────────────────────────────────────────

export const fetchEventos = async () => {
  const data = await request<{ eventos: Evento[] }>('/eventos');
  return data.eventos;
};

export const createEvento = async (payload: {
  nome: string;
  data: string;
  hora: string;
  local: string;
  limitePorLider: number;
  observacao?: string;
}) => {
  const data = await request<{ evento: Evento }>('/eventos', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return data.evento;
};

export const updateEvento = async (
  id: string,
  payload: { nome?: string; data?: string; hora?: string; local?: string; limitePorLider?: number; observacao?: string }
) => {
  const data = await request<{ evento: Evento }>(`/eventos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return data.evento;
};

export const deleteEvento = async (id: string) => {
  await request<void>(`/eventos/${id}`, { method: 'DELETE' });
};

export const encerrarEvento = async (id: string) => {
  const data = await request<{ evento: Evento }>(`/eventos/${id}/encerrar`, { method: 'PATCH' });
  return data.evento;
};

export const fetchEvento = async (id: string) => {
  const data = await request<{ evento: Evento }>(`/eventos/${id}`);
  return data.evento;
};

export const fetchEventoIndicados = async (
  eventoId: string,
  params?: { status?: EventoIndicadoStatus; liderId?: string; q?: string }
) => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.liderId) qs.set('liderId', params.liderId);
  if (params?.q) qs.set('q', params.q);
  const query = qs.toString();
  const data = await request<{ indicados: EventoIndicado[] }>(
    `/eventos/${eventoId}/indicados${query ? `?${query}` : ''}`
  );
  return data.indicados;
};

export const updateEventoIndicadoStatus = async (
  eventoId: string,
  indicadoId: string,
  status: EventoIndicadoStatus
) => {
  const data = await request<{ indicado: EventoIndicado }>(
    `/eventos/${eventoId}/indicados/${indicadoId}/status`,
    { method: 'PATCH', body: JSON.stringify({ status }) }
  );
  return data.indicado;
};

export const checkinEventoIndicado = async (
  eventoId: string,
  payload: { telefone?: string; nome?: string; indicadoId?: string }
) => {
  const data = await request<{ indicado: EventoIndicado }>(`/eventos/${eventoId}/checkin`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return data.indicado;
};

export const fetchPublicEvento = async (eventoId: string, liderId?: string) => {
  const qs = liderId ? `?lider=${encodeURIComponent(liderId)}` : '';
  const data = await request<{ evento: EventoPublicInfo }>(`/public/eventos/${eventoId}${qs}`);
  return data.evento;
};

export const submitPublicEventoIndicacao = async (
  eventoId: string,
  payload: { nome: string; telefone: string; liderId: string }
) => {
  const data = await request<{ indicado: EventoIndicado }>(`/public/eventos/${eventoId}/indicacao`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return data.indicado;
};

export const fetchPublicEventoIndicado = async (eventoId: string, indicadoId: string) => {
  const data = await request<{
    indicado: { id: string; nome: string; status: EventoIndicadoStatus };
    evento: { id: string; nome: string; data: string; hora: string; local: string; encerrado: boolean };
  }>(`/public/eventos/${eventoId}/indicados/${indicadoId}`);
  return data;
};

export const confirmarPublicEventoIndicado = async (eventoId: string, indicadoId: string) => {
  const data = await request<{ indicado: EventoIndicado }>(
    `/public/eventos/${eventoId}/indicados/${indicadoId}/confirmar`,
    { method: 'POST' }
  );
  return data.indicado;
};

export { getApiBase };

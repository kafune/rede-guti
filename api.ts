import { AdminUser, Church, Municipality, UserRole } from './types';

const getApiBase = () => {
  const envValue = String((import.meta as any).env?.VITE_API_URL ?? '').trim();
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const sameHost = `http://${hostname || 'localhost'}:4000`;

  if (!envValue || envValue.toLowerCase() === 'auto') {
    return sameHost;
  }

  if ((envValue.includes('localhost') || envValue.includes('127.0.0.1')) && hostname && !['localhost', '127.0.0.1'].includes(hostname)) {
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
    } catch (err) {
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
  phone?: string | null;
  email?: string | null;
  indicatedBy: string;
  createdAt: string;
  createdById?: string;
  church: Church;
  municipality: Municipality;
  createdBy?: { id: string; email: string; role: string };
};

export const fetchIndications = async () => {
  const data = await request<{ indications: ApiIndication[] }>('/indications');
  return data.indications;
};

export const createIndication = async (payload: {
  name: string;
  phone?: string;
  email?: string;
  indicatedBy: string;
  churchId: string;
  municipalityId: string;
}) => {
  const data = await request<{ indication: ApiIndication }>('/indications', {
    method: 'POST',
    body: JSON.stringify(payload)
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
  const data = await request<{ churches: string[]; municipalities: string[] }>('/public/options');
  return data;
};

export const createPublicIndication = async (payload: {
  name: string;
  phone: string;
  email?: string;
  churchName: string;
  municipalityName: string;
  indicatedBy?: string;
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
  devzappLink?: string;
}) => {
  const data = await request<{ user: AdminUser }>('/users', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return data.user;
};

export const updateUser = async (
  id: string,
  payload: { email?: string; name?: string; password?: string; role?: UserRole; devzappLink?: string | null }
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

export const isUnauthorized = (error: unknown) => {
  return error instanceof ApiError && error.status === 401;
};

export const getApiErrorMessage = (error: unknown, fallback = 'Falha ao carregar dados.') => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
};

export { getApiBase };

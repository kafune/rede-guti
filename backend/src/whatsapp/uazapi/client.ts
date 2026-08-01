import { sanitizeCredentials } from '../domain/crypto.js';
import type { UazapiAdvancedMessage } from '../types.js';

type Fetch = typeof globalThis.fetch;

interface BaseClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetch?: Fetch;
}

interface AdminClientOptions extends BaseClientOptions {
  adminToken: string;
}

interface InstanceClientOptions extends BaseClientOptions {
  token: string;
}

export interface UazapiCreateInstanceInput {
  name: string;
  adminField01?: string;
  adminField02?: string;
}

export interface UazapiCreateInstanceResponse {
  instance?: { id?: string; name?: string; status?: string; [key: string]: unknown };
  connected?: boolean;
  loggedIn?: boolean;
  name?: string;
  token?: string;
  [key: string]: unknown;
}

export interface UazapiWebhookInput {
  id?: string;
  enabled?: boolean;
  url: string;
  events?: string[];
  excludeMessages?: string[];
  addUrlEvents?: boolean;
  addUrlTypesMessages?: boolean;
  action?: 'add' | 'update' | 'delete';
}

export interface UazapiAdvancedInput {
  delayMin?: number;
  delayMax?: number;
  info?: string;
  scheduled_for?: number;
  messages: UazapiAdvancedMessage[];
}

export interface UazapiListMessagesInput {
  folder_id: string;
  messageStatus?: 'Scheduled' | 'Sent' | 'Failed';
  limit?: number;
  offset?: number;
}

export interface UazapiEditFolderInput {
  folder_id: string;
  action: 'stop' | 'continue' | 'delete';
}

type Credential =
  | { header: 'admintoken'; value: string }
  | { header: 'token'; value: string };

export class UazapiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'UazapiError';
  }

  toJSON() {
    return { code: this.code, status: this.status, message: this.message };
  }
}

const safeHttpError = (status: number) => {
  if (status === 401 || status === 403) {
    return new UazapiError('UAZAPI_UNAUTHORIZED', status, 'Uazapi authentication failed.');
  }
  if (status === 429) {
    return new UazapiError('UAZAPI_RATE_LIMITED', status, 'Uazapi rate limit exceeded.');
  }
  if (status >= 500) {
    return new UazapiError('UAZAPI_UPSTREAM_ERROR', status, 'Uazapi service unavailable.');
  }
  return new UazapiError('UAZAPI_REQUEST_FAILED', status, 'Uazapi request failed.');
};

function sanitizeCreateResponse(value: unknown): unknown {
  const rootToken = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>).token
    : undefined;
  const sanitized = sanitizeCredentials(value);
  if (
    typeof rootToken === 'string'
    && sanitized !== null
    && typeof sanitized === 'object'
    && !Array.isArray(sanitized)
  ) {
    return { ...(sanitized as Record<string, unknown>), token: rootToken };
  }
  return sanitized;
}

export class UazapiClient {
  private readonly baseUrl: string;
  private readonly credential: Credential;
  private readonly timeoutMs: number;
  private readonly fetch: Fetch;

  private constructor(options: BaseClientOptions, credential: Credential) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.credential = credential;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  static forAdmin(options: AdminClientOptions) {
    return new UazapiClient(options, { header: 'admintoken', value: options.adminToken });
  }

  static forInstance(options: InstanceClientOptions) {
    return new UazapiClient(options, { header: 'token', value: options.token });
  }

  private async request<T>(
    path: string,
    init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; preserveRootToken?: boolean } = {},
  ): Promise<T> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          [this.credential.header]: this.credential.value,
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal,
      });

      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw safeHttpError(response.status);
      }

      const text = await response.text();
      let parsed: unknown;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new UazapiError(
            'UAZAPI_INVALID_RESPONSE',
            502,
            'Uazapi returned an invalid response.',
          );
        }
      }

      return (init.preserveRootToken
        ? sanitizeCreateResponse(parsed)
        : sanitizeCredentials(parsed)) as T;
    } catch (error) {
      if (error instanceof UazapiError) throw error;
      if (signal.aborted || (error instanceof Error && error.name === 'TimeoutError')) {
        throw new UazapiError('UAZAPI_TIMEOUT', 504, 'Uazapi request timed out.');
      }
      throw new UazapiError('UAZAPI_UNAVAILABLE', 502, 'Uazapi service unavailable.');
    }
  }

  createInstance(input: UazapiCreateInstanceInput) {
    return this.request<UazapiCreateInstanceResponse>('/instance/create', {
      method: 'POST',
      body: input,
      // This is the sole operation whose documented success payload carries
      // the newly issued token; callers must encrypt it before persistence.
      preserveRootToken: true,
    });
  }

  getInstanceStatus() {
    return this.request<Record<string, unknown>>('/instance/status');
  }

  connectInstance(input: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>('/instance/connect', { method: 'POST', body: input });
  }

  disconnectInstance() {
    return this.request<Record<string, unknown>>('/instance/disconnect', { method: 'POST' });
  }

  deleteInstance() {
    return this.request<void>('/instance', { method: 'DELETE' });
  }

  getWebhook() {
    return this.request<unknown[]>('/webhook');
  }

  setWebhook(input: UazapiWebhookInput) {
    return this.request<Record<string, unknown>>('/webhook', { method: 'POST', body: input });
  }

  sendAdvanced(input: UazapiAdvancedInput) {
    return this.request<Record<string, unknown>>('/sender/advanced', { method: 'POST', body: input });
  }

  listFolders(status?: 'scheduled' | 'sending' | 'paused' | 'done' | 'deleting') {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<unknown[]>(`/sender/listfolders${query}`);
  }

  listMessages(input: UazapiListMessagesInput) {
    return this.request<Record<string, unknown>>('/sender/listmessages', { method: 'POST', body: input });
  }

  editFolder(input: UazapiEditFolderInput) {
    return this.request<Record<string, unknown>>('/sender/edit', { method: 'POST', body: input });
  }
}

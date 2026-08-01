import { beforeEach, describe, expect, it, vi } from 'vitest';
import { whatsappApi } from './api';

describe('whatsappApi', () => {
  beforeEach(() => vi.stubGlobal('localStorage', {
    getItem: (key: string) => key === 'guti_token' ? 'token-1' : null,
  }));

  it('uses FormData without overriding its multipart Content-Type boundary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ media: { id: 'media-1' } }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['bytes'], 'foto.png', { type: 'image/png' });
    await whatsappApi.uploadMedia(file);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get('file')).toBe(file);
    expect(options.headers).toMatchObject({ Authorization: 'Bearer token-1' });
    expect(Object.keys(options.headers as object).map((key) => key.toLowerCase())).not.toContain('content-type');
  });

  it('sends the command UUID as Idempotency-Key for create and retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ campaign: { id: 'campaign-1' } }), {
        status: 201, headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ campaign: { id: 'retry-1' } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await whatsappApi.createCampaign({} as any, 'create-command-uuid');
    await whatsappApi.retryFailedRecipients('campaign-1', 'retry-command-uuid');

    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': 'create-command-uuid',
    });
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': 'retry-command-uuid',
    });
  });
});

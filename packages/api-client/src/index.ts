import { signInternalRequest } from '@sufbot/auth';
import { createOpaqueToken } from '@sufbot/shared';

export class SufBotInternalApiClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  public async post<TResponse>(path: string, payload: unknown): Promise<TResponse> {
    if (!path.startsWith('/v1/')) throw new TypeError('Internal API path must be versioned.');
    const body = JSON.stringify(payload);
    const timestamp = new Date().toISOString();
    const nonce = createOpaqueToken(18);
    const signature = signInternalRequest(
      this.secret,
      'POST',
      path,
      body,
      timestamp,
      nonce,
    );
    const response = await fetch(new URL(path, this.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sufbot-timestamp': timestamp,
        'x-sufbot-nonce': nonce,
        'x-sufbot-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Internal API request failed with ${response.status}.`);
    return (await response.json()) as TResponse;
  }
}


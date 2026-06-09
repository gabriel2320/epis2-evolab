import type {
  Epis2ApiTargetAdapter,
  TargetApiResponse,
  TargetHealthResult,
  TargetSession,
} from './types.js';

export class Epis2ApiTargetAdapterImpl implements Epis2ApiTargetAdapter {
  constructor(private readonly apiBaseUrl: string) {}

  async health(): Promise<TargetHealthResult> {
    const started = Date.now();
    try {
      const res = await fetch(`${this.apiBaseUrl}/health`, {
        signal: AbortSignal.timeout(10_000),
      });
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      return {
        ok: res.ok,
        status: res.status,
        latencyMs: Date.now() - started,
        body,
      };
    } catch {
      return { ok: false, status: 0, latencyMs: Date.now() - started };
    }
  }

  async login(username: string, demoAuthKey: string): Promise<TargetSession> {
    const res = await fetch(`${this.apiBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, demoAuthKey }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`Login demo falló (HTTP ${res.status})`);
    }
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) {
      throw new Error('Login demo sin cookie de sesión');
    }
    const cookie = setCookie.split(';')[0] ?? setCookie;
    const body = (await res.json()) as { user?: { role?: string } };
    return {
      cookies: cookie,
      username,
      role: body.user?.role ?? 'unknown',
    };
  }

  async apiRequest(
    session: TargetSession,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<TargetApiResponse> {
    const started = Date.now();
    const init: RequestInit = {
      method,
      headers: {
        Cookie: session.cookies,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    };
    if (body !== undefined) {
      init.headers = { ...init.headers, 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${this.apiBaseUrl}${path}`, init);
    let parsed: unknown = null;
    const text = await res.text();
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      if (!key.toLowerCase().includes('set-cookie')) {
        headers[key] = value;
      }
    });
    return {
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - started,
      body: parsed,
      headers,
    };
  }
}

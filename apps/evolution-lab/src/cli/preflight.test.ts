import { afterEach, describe, expect, it, vi } from 'vitest';
import { preflightTarget } from './commands.js';

const BASE = {
  apiBaseUrl: 'http://127.0.0.1:3001',
  webBaseUrl: 'http://127.0.0.1:5173',
  browserEnabled: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('preflightTarget', () => {
  it('pasa cuando /health y /ready responden OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200 })),
    );
    const result = await preflightTarget(BASE);
    expect(result.ok).toBe(true);
    expect(result.messages.some((m) => m.includes('API health: ✓'))).toBe(true);
    expect(result.messages.some((m) => m.includes('API ready: ✓'))).toBe(true);
  });

  it('falla con mensaje accionable cuando la API no responde', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const result = await preflightTarget(BASE);
    expect(result.ok).toBe(false);
    expect(result.messages.some((m) => m.includes('reiniciar sandbox EPIS2'))).toBe(true);
  });

  it('detecta timeout como posible proceso zombie', async () => {
    const timeoutError = new Error('timeout');
    timeoutError.name = 'TimeoutError';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw timeoutError;
      }),
    );
    const result = await preflightTarget(BASE);
    expect(result.ok).toBe(false);
    expect(result.messages.some((m) => m.includes('zombie'))).toBe(true);
  });

  it('advierte (sin fallar) cuando /ready está degradado', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/ready')) return { ok: false, status: 503 };
      return { ok: true, status: 200 };
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await preflightTarget(BASE);
    expect(result.ok).toBe(true);
    expect(result.messages.some((m) => m.includes('degradada'))).toBe(true);
  });

  it('exige web arriba solo con browser habilitado', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).startsWith(BASE.webBaseUrl)) return { ok: false, status: 500 };
      return { ok: true, status: 200 };
    });
    vi.stubGlobal('fetch', fetchMock);

    const apiOnly = await preflightTarget(BASE);
    expect(apiOnly.ok).toBe(true);

    const withBrowser = await preflightTarget({ ...BASE, browserEnabled: true });
    expect(withBrowser.ok).toBe(false);
    expect(withBrowser.messages.some((m) => m.includes('BROWSER=true'))).toBe(true);
  });
});

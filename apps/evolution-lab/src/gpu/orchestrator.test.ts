import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  listLoadedOllamaModels,
  prepareExclusiveModel,
  resetGpuOrchestratorState,
  unloadOllamaModel,
} from './orchestrator.js';
import { applyRunProfile, resolveRunProfile } from './run-profile.js';

describe('run-profile', () => {
  beforeEach(() => {
    delete process.env.EPIS2_EVOLAB_RUN_PROFILE;
    delete process.env.EPIS2_EVOLAB_BROWSER;
  });

  it('default api-only desactiva browser', () => {
    process.env.EPIS2_EVOLAB_BROWSER = '1';
    applyRunProfile();
    expect(resolveRunProfile()).toBe('api-only');
    expect(process.env.EPIS2_EVOLAB_BROWSER).toBe('0');
  });

  it('visual-smoke activa browser', () => {
    applyRunProfile('visual-smoke');
    expect(process.env.EPIS2_EVOLAB_BROWSER).toBe('1');
  });
});

describe('gpu orchestrator', () => {
  const baseUrl = 'http://127.0.0.1:11434';

  beforeEach(() => {
    resetGpuOrchestratorState();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prepareExclusiveModel descarga modelos distintos al target', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/ps')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'bge-m3:latest', size_vram: 600_000_000 }],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/api/generate')) {
        const body = JSON.parse(String(init?.body)) as { model: string; keep_alive: number };
        expect(body.keep_alive).toBe(0);
        expect(body.model).toBe('bge-m3:latest');
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await prepareExclusiveModel(baseUrl, 'qwen2.5-coder:7b');

    expect(fetchMock).toHaveBeenCalled();
    const generateCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/generate'));
    expect(generateCalls.length).toBe(1);
  });

  it('listLoadedOllamaModels tolera fallo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(listLoadedOllamaModels(baseUrl)).resolves.toEqual([]);
  });

  it('unloadOllamaModel devuelve false si fetch falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network');
    }));
    await expect(unloadOllamaModel(baseUrl, 'x')).resolves.toBe(false);
  });
});

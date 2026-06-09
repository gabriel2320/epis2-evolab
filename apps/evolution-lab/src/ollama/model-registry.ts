export type OllamaModelInfo = {
  name: string;
  size: number;
  family: string;
  capabilities: string[];
};

export type ModelInventory = {
  baseUrl: string;
  up: boolean;
  models: OllamaModelInfo[];
  selectedModel: string;
  preferredAvailable: boolean;
};

export class OllamaModelRegistry {
  constructor(
    private readonly baseUrl: string,
    private readonly preferredModel: string,
  ) {}

  async discover(): Promise<ModelInventory> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return this.empty(false);
      }
      const body = (await res.json()) as {
        models?: Array<{
          name: string;
          size?: number;
          details?: { family?: string };
          capabilities?: string[];
        }>;
      };
      const models: OllamaModelInfo[] = (body.models ?? []).map((m) => ({
        name: m.name,
        size: m.size ?? 0,
        family: m.details?.family ?? 'unknown',
        capabilities: m.capabilities ?? [],
      }));
      const preferredAvailable = models.some((m) => m.name === this.preferredModel);
      const selectedModel = preferredAvailable
        ? this.preferredModel
        : (models.find((m) => m.capabilities.includes('completion'))?.name ?? '');
      return {
        baseUrl: this.baseUrl,
        up: true,
        models,
        selectedModel,
        preferredAvailable,
      };
    } catch {
      return this.empty(false);
    }
  }

  private empty(up: boolean): ModelInventory {
    return {
      baseUrl: this.baseUrl,
      up,
      models: [],
      selectedModel: '',
      preferredAvailable: false,
    };
  }
}

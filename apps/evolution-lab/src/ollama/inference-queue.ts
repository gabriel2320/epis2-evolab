type QueueItem<T> = {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
};

export type QueueMetrics = {
  enqueued: number;
  completed: number;
  failed: number;
  totalLatencyMs: number;
  consecutiveErrors: number;
  circuitOpen: boolean;
};

export class OllamaInferenceQueue {
  private readonly queue: QueueItem<unknown>[] = [];
  private active = 0;
  private consecutiveErrors = 0;
  private circuitOpenUntil = 0;
  private metrics: QueueMetrics = {
    enqueued: 0,
    completed: 0,
    failed: 0,
    totalLatencyMs: 0,
    consecutiveErrors: 0,
    circuitOpen: false,
  };

  constructor(
    private readonly concurrency: number,
    private readonly maxConsecutiveErrors: number,
    private readonly circuitCooldownMs: number,
    private readonly defaultTimeoutMs: number,
  ) {}

  getMetrics(): QueueMetrics {
    return {
      ...this.metrics,
      consecutiveErrors: this.consecutiveErrors,
      circuitOpen: Date.now() < this.circuitOpenUntil,
    };
  }

  enqueue<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (Date.now() < this.circuitOpenUntil) {
      return Promise.reject(new Error('Circuit breaker abierto — Ollama temporalmente unavailable'));
    }
    this.metrics.enqueued += 1;
    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<unknown> = {
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      };
      if (signal) item.signal = signal;
      this.queue.push(item);
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;
      if (item.signal?.aborted) {
        item.reject(new Error('Abortado'));
        continue;
      }
      this.active += 1;
      const started = Date.now();
      try {
        const timeoutSignal = AbortSignal.timeout(this.defaultTimeoutMs);
        const result = await Promise.race([
          item.fn(),
          new Promise<never>((_, rej) => {
            timeoutSignal.addEventListener('abort', () => {
              rej(new Error(`Timeout inferencia (${this.defaultTimeoutMs}ms)`));
            });
          }),
        ]);
        this.consecutiveErrors = 0;
        this.metrics.completed += 1;
        this.metrics.totalLatencyMs += Date.now() - started;
        item.resolve(result);
      } catch (err) {
        this.consecutiveErrors += 1;
        this.metrics.failed += 1;
        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          this.circuitOpenUntil = Date.now() + this.circuitCooldownMs;
        }
        item.reject(err);
      } finally {
        this.active -= 1;
      }
    }
  }
}

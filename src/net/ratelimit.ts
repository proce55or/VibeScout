/**
 * Wspólny rate limiter dla kontrolera i konektorów.
 * - globalny limit równoległości (domyślnie 2 dla kontrolowanych aplikacji),
 * - minimalny odstęp między startami żądań do tego samego hosta (domyślnie 5 s).
 *
 * `now` i `sleep` są wstrzykiwalne, co umożliwia deterministyczne testy.
 */
export interface RateLimiterOptions {
  maxConcurrent: number;
  minHostIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RateLimiter {
  private readonly maxConcurrent: number;
  private readonly minHostIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  private active = 0;
  private readonly waiters: Array<() => void> = [];
  /** Najwcześniejszy czas, w którym wolno wystartować kolejne żądanie do hosta. */
  private readonly hostNextFree = new Map<string, number>();

  constructor(opts: RateLimiterOptions) {
    this.maxConcurrent = Math.max(1, opts.maxConcurrent);
    this.minHostIntervalMs = Math.max(0, opts.minHostIntervalMs);
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? realSleep;
  }

  private acquireGlobal(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private releaseGlobal(): void {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }

  /** Rezerwuje slot startowy dla hosta (atomowo, bez await) i zwraca czas oczekiwania. */
  private reserveHost(host: string): number {
    const now = this.now();
    const earliest = this.hostNextFree.get(host) ?? 0;
    const start = Math.max(now, earliest);
    this.hostNextFree.set(host, start + this.minHostIntervalMs);
    return start - now;
  }

  /** Uruchamia `fn` z zachowaniem limitów. Host identyfikuje kolejkę odstępów. */
  async run<T>(host: string, fn: () => Promise<T>): Promise<T> {
    await this.acquireGlobal();
    try {
      const wait = this.reserveHost(host);
      if (wait > 0) await this.sleep(wait);
      return await fn();
    } finally {
      this.releaseGlobal();
    }
  }
}

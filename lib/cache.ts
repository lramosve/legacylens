/**
 * Simple in-memory TTL cache for API responses.
 * Entries expire after `ttlMs` and the cache is bounded by `maxSize`.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private ttlMs: number;
  private maxSize: number;

  constructor(ttlMs = 5 * 60 * 1000, maxSize = 200) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  set(key: string, value: T): void {
    // Evict oldest entries if at capacity
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value!;
      this.store.delete(firstKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

// Search results cache: keyed by normalized query string
export const searchCache = new TTLCache<{
  results: Array<Record<string, unknown>>;
  query_normalized?: string;
  latency: { embedding_ms: number; search_ms: number };
}>(5 * 60 * 1000, 200);

// Ask/LLM response cache: keyed by query + mode + speed
export const askCache = new TTLCache<{
  answer: string;
  tokens: { input: number; output: number } | null;
}>(5 * 60 * 1000, 100);

export function searchCacheKey(query: string): string {
  return query.trim().toLowerCase();
}

export function askCacheKey(query: string, mode: string, speed: string): string {
  return `${query.trim().toLowerCase()}::${mode}::${speed}`;
}

// Related questions cache: keyed by query string
export const relatedCache = new TTLCache<string[]>(10 * 60 * 1000, 200);

export function relatedCacheKey(query: string): string {
  return query.trim().toLowerCase();
}

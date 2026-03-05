/**
 * In-memory sliding-window rate limiter.
 * Each key (IP or fallback) tracks timestamps of recent requests.
 * Old entries are pruned on every check to bound memory.
 */

interface WindowEntry {
  timestamps: number[];
}

export class RateLimiter {
  private windows = new Map<string, WindowEntry>();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Returns { allowed, remaining, retryAfterMs }.
   * If not allowed, retryAfterMs indicates when the next request can be made.
   */
  check(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let entry = this.windows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(key, entry);
    }

    // Prune expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= this.maxRequests) {
      const oldest = entry.timestamps[0];
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: oldest + this.windowMs - now,
      };
    }

    entry.timestamps.push(now);
    return {
      allowed: true,
      remaining: this.maxRequests - entry.timestamps.length,
      retryAfterMs: 0,
    };
  }

  /** Periodic cleanup of stale keys (call sparingly, e.g. every 60s) */
  prune(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    for (const [key, entry] of this.windows) {
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) {
        this.windows.delete(key);
      }
    }
  }
}

// LLM-heavy routes: 10 requests per minute
export const askLimiter = new RateLimiter(60_000, 10);

// Search: 20 requests per minute
export const searchLimiter = new RateLimiter(60_000, 20);

// Related questions: 15 per minute
export const relatedLimiter = new RateLimiter(60_000, 15);

// Feedback: 20 per minute
export const feedbackLimiter = new RateLimiter(60_000, 20);

// Ingest status: 30 per minute (lightweight)
export const statusLimiter = new RateLimiter(60_000, 30);

// Prune all limiters every 60 seconds
if (typeof globalThis !== "undefined" && !((globalThis as Record<string, unknown>).__rateLimitPruner)) {
  (globalThis as Record<string, unknown>).__rateLimitPruner = setInterval(() => {
    askLimiter.prune();
    searchLimiter.prune();
    relatedLimiter.prune();
    feedbackLimiter.prune();
    statusLimiter.prune();
  }, 60_000);
}

/**
 * Check rate limit for a request. Returns a 429 Response if blocked, or null if allowed.
 */
export function applyRateLimit(
  limiter: RateLimiter,
  req: { headers: { get(name: string): string | null } }
): Response | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous";

  const { allowed, retryAfterMs } = limiter.check(ip);

  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please slow down." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
        },
      }
    );
  }

  return null;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(
  key: string,
  nowMs: number,
  limit = 30,
  windowMs = 60_000,
): { allowed: boolean; remaining: number } {
  const current = buckets.get(key);
  if (!current || current.resetAt <= nowMs) {
    buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  if (current.count >= limit) return { allowed: false, remaining: 0 };
  current.count += 1;
  return { allowed: true, remaining: limit - current.count };
}

export function resetRateLimits(): void {
  buckets.clear();
}

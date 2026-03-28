import type { RequestHandler } from 'express';

interface RateLimitOptions {
  keyPrefix: string;
  maxRequests: number;
  windowMs: number;
  message: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
let requestCounter = 0;

function getClientKey(reqIp: string | undefined, prefix: string): string {
  return `${prefix}:${reqIp ?? 'unknown'}`;
}

function cleanupExpiredEntries(now: number): void {
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function createRateLimit(options: RateLimitOptions): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    requestCounter += 1;
    if (requestCounter % 100 === 0) {
      cleanupExpiredEntries(now);
    }

    const key = getClientKey(req.ip, options.keyPrefix);
    const current = store.get(key);

    if (!current || current.resetAt <= now) {
      store.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      next();
      return;
    }

    if (current.count >= options.maxRequests) {
      const retryAfter = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(retryAfter, 1)));
      res.status(429).send(options.message);
      return;
    }

    current.count += 1;
    store.set(key, current);
    next();
  };
}

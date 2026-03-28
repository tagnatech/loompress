import type pg from 'pg';
import type { SiteRecord } from './types.js';

const cache = new Map<string, { site: SiteRecord; expiry: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, '');
}

export class SiteResolver {
  constructor(private pool: pg.Pool) {}

  async findByHostname(hostname: string): Promise<SiteRecord | null> {
    const normalizedHostname = normalizeHostname(hostname);
    const cached = cache.get(normalizedHostname);
    if (cached && cached.expiry > Date.now()) {
      return cached.site;
    }

    const { rows } = await this.pool.query<SiteRecord>(
      'SELECT * FROM lp_sites WHERE hostname = $1',
      [normalizedHostname],
    );

    const site = rows[0] ?? null;
    if (site) {
      cache.set(normalizedHostname, { site, expiry: Date.now() + CACHE_TTL_MS });
    }
    return site;
  }

  clearCache(hostname?: string): void {
    if (hostname) {
      cache.delete(hostname);
    } else {
      cache.clear();
    }
  }
}


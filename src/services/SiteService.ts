import type pg from 'pg';
import type { SiteRecord } from '../multi-site/types.js';

export interface CreateSiteDto {
  hostname: string;
  name: string;
  slug: string;
  tagline?: string;
  logo_url?: string | null;
  base_url: string;
  timezone?: string;
  permalink_pattern?: string;
  theme?: string;
}

export interface UpdateSiteDto {
  hostname?: string;
  name?: string;
  tagline?: string | null;
  logo_url?: string | null;
  base_url?: string;
  timezone?: string;
  permalink_pattern?: string;
  theme?: string;
  custom_css?: string | null;
}

export class SiteService {
  constructor(private pool: pg.Pool) {}

  async hasAnySites(): Promise<boolean> {
    const { rows } = await this.pool.query(
      'SELECT 1 FROM lp_sites LIMIT 1',
    );
    return rows.length > 0;
  }

  async getAll(): Promise<SiteRecord[]> {
    const { rows } = await this.pool.query<SiteRecord>(
      'SELECT * FROM lp_sites ORDER BY name',
    );
    return rows;
  }

  async getById(id: string): Promise<SiteRecord | null> {
    const { rows } = await this.pool.query<SiteRecord>(
      'SELECT * FROM lp_sites WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async create(data: CreateSiteDto): Promise<SiteRecord> {
    const { rows } = await this.pool.query<SiteRecord>(
      `INSERT INTO lp_sites (hostname, name, slug, tagline, logo_url, base_url, timezone, permalink_pattern, theme)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.hostname,
        data.name,
        data.slug,
        data.tagline ?? null,
        data.logo_url ?? null,
        data.base_url,
        data.timezone ?? 'UTC',
        data.permalink_pattern ?? 'slug',
        data.theme ?? 'default',
      ],
    );
    return rows[0];
  }

  async update(id: string, data: UpdateSiteDto): Promise<SiteRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(value);
        idx++;
      }
    }

    if (fields.length === 0) return this.getById(id);

    values.push(id);
    const { rows } = await this.pool.query<SiteRecord>(
      `UPDATE lp_sites SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'DELETE FROM lp_sites WHERE id = $1',
      [id],
    );
    return (rowCount ?? 0) > 0;
  }
}


import type pg from 'pg';

export interface SettingRecord {
  id: string;
  site_id: string;
  key: string;
  value: string | null;
}

export const DEFAULT_SETTINGS: Record<string, string> = {
  'site.posts_per_page': '20',
  'site.date_format': 'DD MMM YYYY',
  'site.show_author': 'true',
  'comments.enabled': 'true',
  'comments.moderation': 'true',
  'comments.require_email': 'true',
  'comments.allow_nested': 'true',
  'comments.max_depth': '3',
  'seo.meta_title_suffix': '',
  'seo.default_meta_description': '',
  'seo.noindex_archives': 'false',
  'reading.show_full_content': 'false',
  'reading.excerpt_length': '160',
};

export class SettingsService {
  constructor(private pool: pg.Pool) {}

  async getAll(siteId: string): Promise<Record<string, string>> {
    const { rows } = await this.pool.query<SettingRecord>(
      'SELECT * FROM lp_settings WHERE site_id = $1',
      [siteId],
    );

    const settings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      settings[row.key] = row.value ?? '';
    }
    return settings;
  }

  async get(siteId: string, key: string): Promise<string> {
    const { rows } = await this.pool.query<SettingRecord>(
      'SELECT * FROM lp_settings WHERE site_id = $1 AND key = $2',
      [siteId, key],
    );
    return rows[0]?.value ?? DEFAULT_SETTINGS[key] ?? '';
  }

  async set(siteId: string, key: string, value: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO lp_settings (site_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (site_id, key) DO UPDATE SET value = $3`,
      [siteId, key, value],
    );
  }

  async setMany(siteId: string, settings: Record<string, string>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(settings)) {
        await client.query(
          `INSERT INTO lp_settings (site_id, key, value)
           VALUES ($1, $2, $3)
           ON CONFLICT (site_id, key) DO UPDATE SET value = $3`,
          [siteId, key, value],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async delete(siteId: string, key: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM lp_settings WHERE site_id = $1 AND key = $2',
      [siteId, key],
    );
  }
}


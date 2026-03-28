import type pg from 'pg';

export interface TagRecord {
  id: string;
  site_id: string;
  name: string;
  slug: string;
  post_count?: number;
}

export interface CreateTagDto {
  name: string;
  slug: string;
}

export class TagService {
  constructor(private pool: pg.Pool) {}

  async getAll(siteId: string): Promise<TagRecord[]> {
    const { rows } = await this.pool.query<TagRecord>(
      `SELECT t.*,
         (SELECT COUNT(*) FROM lp_post_tags pt
          JOIN lp_posts p ON pt.post_id = p.id
          WHERE pt.tag_id = t.id AND p.site_id = $1)::int AS post_count
       FROM lp_tags t
       WHERE t.site_id = $1
       ORDER BY t.name`,
      [siteId],
    );
    return rows;
  }

  async getById(siteId: string, id: string): Promise<TagRecord | null> {
    const { rows } = await this.pool.query<TagRecord>(
      'SELECT * FROM lp_tags WHERE site_id = $1 AND id = $2',
      [siteId, id],
    );
    return rows[0] ?? null;
  }

  async getBySlug(siteId: string, slug: string): Promise<TagRecord | null> {
    const { rows } = await this.pool.query<TagRecord>(
      'SELECT * FROM lp_tags WHERE site_id = $1 AND slug = $2',
      [siteId, slug],
    );
    return rows[0] ?? null;
  }

  async create(siteId: string, data: CreateTagDto): Promise<TagRecord> {
    const { rows } = await this.pool.query<TagRecord>(
      `INSERT INTO lp_tags (site_id, name, slug)
       VALUES ($1, $2, $3) RETURNING *`,
      [siteId, data.name, data.slug],
    );
    return rows[0];
  }

  async update(siteId: string, id: string, data: Partial<CreateTagDto>): Promise<TagRecord | null> {
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
    if (fields.length === 0) return this.getById(siteId, id);

    values.push(siteId, id);
    const { rows } = await this.pool.query<TagRecord>(
      `UPDATE lp_tags SET ${fields.join(', ')} WHERE site_id = $${idx} AND id = $${idx + 1} RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  }

  async delete(siteId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'DELETE FROM lp_tags WHERE site_id = $1 AND id = $2',
      [siteId, id],
    );
    return (rowCount ?? 0) > 0;
  }

  async findOrCreate(siteId: string, name: string): Promise<TagRecord> {
    const slug = name.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-');
    const existing = await this.getBySlug(siteId, slug);
    if (existing) return existing;
    return this.create(siteId, { name: name.trim(), slug });
  }
}


import type pg from 'pg';

export interface CategoryRecord {
  id: string;
  site_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  post_count?: number;
}

export interface CreateCategoryDto {
  name: string;
  slug: string;
  parent_id?: string | null;
  description?: string | null;
}

export class CategoryService {
  constructor(private pool: pg.Pool) {}

  async getAll(siteId: string): Promise<CategoryRecord[]> {
    const { rows } = await this.pool.query<CategoryRecord>(
      `SELECT c.*,
         (SELECT COUNT(*) FROM lp_post_categories pc
          JOIN lp_posts p ON pc.post_id = p.id
          WHERE pc.category_id = c.id AND p.site_id = $1)::int AS post_count
       FROM lp_categories c
       WHERE c.site_id = $1
       ORDER BY c.name`,
      [siteId],
    );
    return rows;
  }

  async getById(siteId: string, id: string): Promise<CategoryRecord | null> {
    const { rows } = await this.pool.query<CategoryRecord>(
      'SELECT * FROM lp_categories WHERE site_id = $1 AND id = $2',
      [siteId, id],
    );
    return rows[0] ?? null;
  }

  async getBySlug(siteId: string, slug: string): Promise<CategoryRecord | null> {
    const { rows } = await this.pool.query<CategoryRecord>(
      'SELECT * FROM lp_categories WHERE site_id = $1 AND slug = $2',
      [siteId, slug],
    );
    return rows[0] ?? null;
  }

  async create(siteId: string, data: CreateCategoryDto): Promise<CategoryRecord> {
    const { rows } = await this.pool.query<CategoryRecord>(
      `INSERT INTO lp_categories (site_id, name, slug, parent_id, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [siteId, data.name, data.slug, data.parent_id ?? null, data.description ?? null],
    );
    return rows[0];
  }

  async update(siteId: string, id: string, data: Partial<CreateCategoryDto>): Promise<CategoryRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(value ?? null);
        idx++;
      }
    }
    if (fields.length === 0) return this.getById(siteId, id);

    values.push(siteId, id);
    const { rows } = await this.pool.query<CategoryRecord>(
      `UPDATE lp_categories SET ${fields.join(', ')} WHERE site_id = $${idx} AND id = $${idx + 1} RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  }

  async delete(siteId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'DELETE FROM lp_categories WHERE site_id = $1 AND id = $2',
      [siteId, id],
    );
    return (rowCount ?? 0) > 0;
  }
}


import type pg from 'pg';

export interface PostRecord {
  id: string;
  site_id: string;
  author_id: string | null;
  type: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  status: string;
  featured_image_id: string | null;
  meta_title: string | null;
  meta_description: string | null;
  published_at: Date | null;
  scheduled_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // joined fields
  author_name?: string;
  featured_image_url?: string;
}

export interface CreatePostDto {
  type?: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  body: string;
  status?: string;
  featured_image_id?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  published_at?: string | null;
  scheduled_at?: string | null;
  category_ids?: string[];
  tag_ids?: string[];
}

export interface UpdatePostDto extends Partial<CreatePostDto> {}

export class PostService {
  constructor(private pool: pg.Pool) {}

  async getPublishedPosts(siteId: string, page = 1, limit = 20): Promise<{ posts: PostRecord[]; total: number }> {
    const offset = (page - 1) * limit;
    const [{ rows: posts }, { rows: countRows }] = await Promise.all([
      this.pool.query<PostRecord>(
        `SELECT p.*, u.display_name AS author_name, m.public_url AS featured_image_url
         FROM lp_posts p
         LEFT JOIN lp_users u ON p.author_id = u.id
         LEFT JOIN lp_media m ON p.featured_image_id = m.id
         WHERE p.site_id = $1 AND p.status = 'published' AND p.type = 'post'
         ORDER BY p.published_at DESC
         LIMIT $2 OFFSET $3`,
        [siteId, limit, offset],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM lp_posts
         WHERE site_id = $1 AND status = 'published' AND type = 'post'`,
        [siteId],
      ),
    ]);
    return { posts, total: Number(countRows[0].count) };
  }

  async getAllPosts(
    siteId: string,
    page = 1,
    status?: string,
    limit = 20,
    authorId?: string,
  ): Promise<{ posts: PostRecord[]; total: number }> {
    const offset = (page - 1) * limit;
    const conditions = ['p.site_id = $1', "p.type = 'post'"];
    const params: unknown[] = [siteId];
    let idx = 2;

    if (status) {
      conditions.push(`p.status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (authorId) {
      conditions.push(`p.author_id = $${idx}`);
      params.push(authorId);
      idx++;
    }

    params.push(limit, offset);
    const whereClause = conditions.join(' AND ');

    const [{ rows: posts }, { rows: countRows }] = await Promise.all([
      this.pool.query<PostRecord>(
        `SELECT p.*, u.display_name AS author_name, m.public_url AS featured_image_url
         FROM lp_posts p
         LEFT JOIN lp_users u ON p.author_id = u.id
         LEFT JOIN lp_media m ON p.featured_image_id = m.id
         WHERE ${whereClause}
         ORDER BY p.updated_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params,
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM lp_posts p WHERE ${whereClause}`,
        params.slice(0, idx - 1),
      ),
    ]);
    return { posts, total: Number(countRows[0].count) };
  }

  async getById(siteId: string, id: string): Promise<PostRecord | null> {
    const { rows } = await this.pool.query<PostRecord>(
      `SELECT p.*, u.display_name AS author_name, m.public_url AS featured_image_url
       FROM lp_posts p
       LEFT JOIN lp_users u ON p.author_id = u.id
       LEFT JOIN lp_media m ON p.featured_image_id = m.id
       WHERE p.site_id = $1 AND p.id = $2`,
      [siteId, id],
    );
    return rows[0] ?? null;
  }

  async getBySlug(siteId: string, slug: string): Promise<PostRecord | null> {
    const { rows } = await this.pool.query<PostRecord>(
      `SELECT p.*, u.display_name AS author_name, m.public_url AS featured_image_url
       FROM lp_posts p
       LEFT JOIN lp_users u ON p.author_id = u.id
       LEFT JOIN lp_media m ON p.featured_image_id = m.id
       WHERE p.site_id = $1 AND p.slug = $2 AND p.status = 'published'`,
      [siteId, slug],
    );
    return rows[0] ?? null;
  }

  async create(siteId: string, authorId: string, data: CreatePostDto): Promise<PostRecord> {
    const publishedAt = data.status === 'published' ? new Date().toISOString() : data.published_at ?? null;
    const { rows } = await this.pool.query<PostRecord>(
      `INSERT INTO lp_posts (site_id, author_id, type, slug, title, excerpt, body, status, featured_image_id, meta_title, meta_description, published_at, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        siteId, authorId, data.type ?? 'post', data.slug, data.title,
        data.excerpt ?? null, data.body, data.status ?? 'draft',
        data.featured_image_id ?? null, data.meta_title ?? null,
        data.meta_description ?? null, publishedAt, data.scheduled_at ?? null,
      ],
    );
    const post = rows[0];

    // Handle categories
    if (data.category_ids?.length) {
      const values = data.category_ids.map((cid, i) => `($1, $${i + 2})`).join(', ');
      await this.pool.query(
        `INSERT INTO lp_post_categories (post_id, category_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [post.id, ...data.category_ids],
      );
    }

    // Handle tags
    if (data.tag_ids?.length) {
      const values = data.tag_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
      await this.pool.query(
        `INSERT INTO lp_post_tags (post_id, tag_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [post.id, ...data.tag_ids],
      );
    }

    return post;
  }

  async update(siteId: string, id: string, data: UpdatePostDto): Promise<PostRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const simple = ['slug', 'title', 'excerpt', 'body', 'status', 'featured_image_id', 'meta_title', 'meta_description', 'published_at', 'scheduled_at', 'type'] as const;
    for (const key of simple) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(data[key] ?? null);
        idx++;
      }
    }

    // If publishing now, set published_at
    if (data.status === 'published') {
      const existing = await this.getById(siteId, id);
      if (existing && !existing.published_at) {
        fields.push(`published_at = $${idx}`);
        values.push(new Date().toISOString());
        idx++;
      }
    }

    if (fields.length > 0) {
      values.push(siteId, id);
      await this.pool.query(
        `UPDATE lp_posts SET ${fields.join(', ')} WHERE site_id = $${idx} AND id = $${idx + 1}`,
        values,
      );
    }

    // Update categories
    if (data.category_ids !== undefined) {
      await this.pool.query('DELETE FROM lp_post_categories WHERE post_id = $1', [id]);
      if (data.category_ids.length) {
        const vals = data.category_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
        await this.pool.query(
          `INSERT INTO lp_post_categories (post_id, category_id) VALUES ${vals} ON CONFLICT DO NOTHING`,
          [id, ...data.category_ids],
        );
      }
    }

    // Update tags
    if (data.tag_ids !== undefined) {
      await this.pool.query('DELETE FROM lp_post_tags WHERE post_id = $1', [id]);
      if (data.tag_ids.length) {
        const vals = data.tag_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
        await this.pool.query(
          `INSERT INTO lp_post_tags (post_id, tag_id) VALUES ${vals} ON CONFLICT DO NOTHING`,
          [id, ...data.tag_ids],
        );
      }
    }

    return this.getById(siteId, id);
  }

  async delete(siteId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'DELETE FROM lp_posts WHERE site_id = $1 AND id = $2',
      [siteId, id],
    );
    return (rowCount ?? 0) > 0;
  }

  async getPostCategories(postId: string): Promise<Array<{ id: string; name: string; slug: string }>> {
    const { rows } = await this.pool.query(
      `SELECT c.id, c.name, c.slug FROM lp_categories c
       JOIN lp_post_categories pc ON c.id = pc.category_id
       WHERE pc.post_id = $1 ORDER BY c.name`,
      [postId],
    );
    return rows;
  }

  async getPostTags(postId: string): Promise<Array<{ id: string; name: string; slug: string }>> {
    const { rows } = await this.pool.query(
      `SELECT t.id, t.name, t.slug FROM lp_tags t
       JOIN lp_post_tags pt ON t.id = pt.tag_id
       WHERE pt.post_id = $1 ORDER BY t.name`,
      [postId],
    );
    return rows;
  }

  async getAdjacentPosts(siteId: string, publishedAt: Date): Promise<{ prev: PostRecord | null; next: PostRecord | null }> {
    const [{ rows: prevRows }, { rows: nextRows }] = await Promise.all([
      this.pool.query<PostRecord>(
        `SELECT id, slug, title FROM lp_posts
         WHERE site_id = $1 AND status = 'published' AND type = 'post'
         AND published_at < $2 ORDER BY published_at DESC LIMIT 1`,
        [siteId, publishedAt],
      ),
      this.pool.query<PostRecord>(
        `SELECT id, slug, title FROM lp_posts
         WHERE site_id = $1 AND status = 'published' AND type = 'post'
         AND published_at > $2 ORDER BY published_at ASC LIMIT 1`,
        [siteId, publishedAt],
      ),
    ]);
    return { prev: prevRows[0] ?? null, next: nextRows[0] ?? null };
  }

  async getPostsByCategory(siteId: string, categoryId: string, page = 1, limit = 20): Promise<{ posts: PostRecord[]; total: number }> {
    const offset = (page - 1) * limit;
    const [{ rows: posts }, { rows: countRows }] = await Promise.all([
      this.pool.query<PostRecord>(
        `SELECT p.*, u.display_name AS author_name, m.public_url AS featured_image_url
         FROM lp_posts p
         JOIN lp_post_categories pc ON p.id = pc.post_id
         LEFT JOIN lp_users u ON p.author_id = u.id
         LEFT JOIN lp_media m ON p.featured_image_id = m.id
         WHERE p.site_id = $1 AND pc.category_id = $2 AND p.status = 'published' AND p.type = 'post'
         ORDER BY p.published_at DESC LIMIT $3 OFFSET $4`,
        [siteId, categoryId, limit, offset],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM lp_posts p
         JOIN lp_post_categories pc ON p.id = pc.post_id
         WHERE p.site_id = $1 AND pc.category_id = $2 AND p.status = 'published' AND p.type = 'post'`,
        [siteId, categoryId],
      ),
    ]);
    return { posts, total: Number(countRows[0].count) };
  }

  async getPostsByTag(siteId: string, tagId: string, page = 1, limit = 20): Promise<{ posts: PostRecord[]; total: number }> {
    const offset = (page - 1) * limit;
    const [{ rows: posts }, { rows: countRows }] = await Promise.all([
      this.pool.query<PostRecord>(
        `SELECT p.*, u.display_name AS author_name, m.public_url AS featured_image_url
         FROM lp_posts p
         JOIN lp_post_tags pt ON p.id = pt.post_id
         LEFT JOIN lp_users u ON p.author_id = u.id
         LEFT JOIN lp_media m ON p.featured_image_id = m.id
         WHERE p.site_id = $1 AND pt.tag_id = $2 AND p.status = 'published' AND p.type = 'post'
         ORDER BY p.published_at DESC LIMIT $3 OFFSET $4`,
        [siteId, tagId, limit, offset],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM lp_posts p
         JOIN lp_post_tags pt ON p.id = pt.post_id
         WHERE p.site_id = $1 AND pt.tag_id = $2 AND p.status = 'published' AND p.type = 'post'`,
        [siteId, tagId],
      ),
    ]);
    return { posts, total: Number(countRows[0].count) };
  }

  async getAllPages(siteId: string, page = 1, limit = 20, authorId?: string): Promise<{ posts: PostRecord[]; total: number }> {
    const offset = (page - 1) * limit;
    const conditions = ['p.site_id = $1', "p.type = 'page'"];
    const params: unknown[] = [siteId];
    let idx = 2;

    if (authorId) {
      conditions.push(`p.author_id = $${idx}`);
      params.push(authorId);
      idx++;
    }

    params.push(limit, offset);
    const whereClause = conditions.join(' AND ');

    const [{ rows: posts }, { rows: countRows }] = await Promise.all([
      this.pool.query<PostRecord>(
        `SELECT p.*, u.display_name AS author_name
         FROM lp_posts p
         LEFT JOIN lp_users u ON p.author_id = u.id
         WHERE ${whereClause}
         ORDER BY p.updated_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params,
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM lp_posts p WHERE ${whereClause}`,
        params.slice(0, idx - 1),
      ),
    ]);
    return { posts, total: Number(countRows[0].count) };
  }

  async getPageBySlug(siteId: string, slug: string): Promise<PostRecord | null> {
    const { rows } = await this.pool.query<PostRecord>(
      `SELECT p.*, u.display_name AS author_name
       FROM lp_posts p
       LEFT JOIN lp_users u ON p.author_id = u.id
       WHERE p.site_id = $1 AND p.slug = $2 AND p.type = 'page' AND p.status = 'published'`,
      [siteId, slug],
    );
    return rows[0] ?? null;
  }

  async publishScheduled(): Promise<number> {
    const { rowCount } = await this.pool.query(
      `UPDATE lp_posts SET status = 'published', published_at = NOW()
       WHERE status = 'scheduled' AND scheduled_at <= NOW()`,
    );
    return rowCount ?? 0;
  }

  async getDashboardStats(siteId: string): Promise<{ total: number; published: number; drafts: number; scheduled: number }> {
    const { rows } = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE type = 'post') AS total,
         COUNT(*) FILTER (WHERE type = 'post' AND status = 'published') AS published,
         COUNT(*) FILTER (WHERE type = 'post' AND status = 'draft') AS drafts,
         COUNT(*) FILTER (WHERE type = 'post' AND status = 'scheduled') AS scheduled
       FROM lp_posts WHERE site_id = $1`,
      [siteId],
    );
    return {
      total: Number(rows[0].total),
      published: Number(rows[0].published),
      drafts: Number(rows[0].drafts),
      scheduled: Number(rows[0].scheduled),
    };
  }
}


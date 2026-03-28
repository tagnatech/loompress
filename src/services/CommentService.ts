import type pg from 'pg';

export interface CommentRecord {
  id: string;
  site_id: string;
  post_id: string;
  parent_id: string | null;
  author_name: string;
  author_email: string;
  author_url: string | null;
  body: string;
  status: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
  // joined
  post_title?: string;
  reply_count?: number;
}

export interface CreateCommentDto {
  author_name: string;
  author_email: string;
  author_url?: string;
  body: string;
  parent_id?: string;
  ip_address?: string;
  user_agent?: string;
  status?: string;
}

export class CommentService {
  constructor(private pool: pg.Pool) {}

  async getByPost(postId: string, status = 'approved'): Promise<CommentRecord[]> {
    const { rows } = await this.pool.query<CommentRecord>(
      `SELECT * FROM lp_comments
       WHERE post_id = $1 AND status = $2
       ORDER BY created_at ASC`,
      [postId, status],
    );
    return rows;
  }

  async getById(siteId: string, id: string): Promise<CommentRecord | null> {
    const { rows } = await this.pool.query<CommentRecord>(
      'SELECT * FROM lp_comments WHERE site_id = $1 AND id = $2',
      [siteId, id],
    );
    return rows[0] ?? null;
  }

  async getCommentTree(postId: string): Promise<CommentRecord[]> {
    const comments = await this.getByPost(postId, 'approved');
    return comments;
  }

  async getBySite(siteId: string, status?: string, page = 1, limit = 20): Promise<{ comments: CommentRecord[]; total: number }> {
    const offset = (page - 1) * limit;
    const conditions = ['c.site_id = $1'];
    const params: unknown[] = [siteId];
    let idx = 2;

    if (status) {
      conditions.push(`c.status = $${idx}`);
      params.push(status);
      idx++;
    }

    const where = conditions.join(' AND ');
    params.push(limit, offset);

    const [{ rows: comments }, { rows: countRows }] = await Promise.all([
      this.pool.query<CommentRecord>(
        `SELECT c.*, p.title AS post_title
         FROM lp_comments c
         LEFT JOIN lp_posts p ON c.post_id = p.id
         WHERE ${where}
         ORDER BY c.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params,
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM lp_comments c WHERE ${where}`,
        params.slice(0, idx - 1),
      ),
    ]);

    return { comments, total: Number(countRows[0].count) };
  }

  async create(siteId: string, postId: string, data: CreateCommentDto): Promise<CommentRecord> {
    const { rows } = await this.pool.query<CommentRecord>(
      `INSERT INTO lp_comments (site_id, post_id, parent_id, author_name, author_email, author_url, body, status, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        siteId, postId, data.parent_id ?? null,
        data.author_name, data.author_email, data.author_url ?? null,
        data.body, data.status ?? 'pending',
        data.ip_address ?? null, data.user_agent ?? null,
      ],
    );
    return rows[0];
  }

  async approve(siteId: string, id: string): Promise<void> {
    await this.pool.query(
      'UPDATE lp_comments SET status = $1 WHERE site_id = $2 AND id = $3',
      ['approved', siteId, id],
    );
  }

  async reject(siteId: string, id: string): Promise<void> {
    await this.pool.query(
      'UPDATE lp_comments SET status = $1 WHERE site_id = $2 AND id = $3',
      ['rejected', siteId, id],
    );
  }

  async spam(siteId: string, id: string): Promise<void> {
    await this.pool.query(
      'UPDATE lp_comments SET status = $1 WHERE site_id = $2 AND id = $3',
      ['spam', siteId, id],
    );
  }

  async delete(siteId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'DELETE FROM lp_comments WHERE site_id = $1 AND id = $2',
      [siteId, id],
    );
    return (rowCount ?? 0) > 0;
  }

  async getCountBySite(siteId: string): Promise<{ pending: number; approved: number; spam: number; total: number }> {
    const { rows } = await this.pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE status = 'approved') AS approved,
         COUNT(*) FILTER (WHERE status = 'spam') AS spam
       FROM lp_comments WHERE site_id = $1`,
      [siteId],
    );
    return {
      total: Number(rows[0].total),
      pending: Number(rows[0].pending),
      approved: Number(rows[0].approved),
      spam: Number(rows[0].spam),
    };
  }

  async getCountByPost(postId: string): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM lp_comments WHERE post_id = $1 AND status = 'approved'",
      [postId],
    );
    return Number(rows[0].count);
  }
}


import type pg from 'pg';
import type { PostRecord } from './PostService.js';

export interface SearchResult extends PostRecord {
  rank: number;
  headline: string;
}

export class SearchService {
  constructor(private pool: pg.Pool) {}

  async search(siteId: string, query: string, page = 1, limit = 20): Promise<{ results: SearchResult[]; total: number }> {
    const offset = (page - 1) * limit;
    const tsQuery = this.buildTsQuery(query);

    if (!tsQuery) {
      return { results: [], total: 0 };
    }

    const [{ rows: results }, { rows: countRows }] = await Promise.all([
      this.pool.query<SearchResult>(
        `SELECT p.*,
           u.display_name AS author_name,
           m.public_url AS featured_image_url,
           ts_rank(p.search_vector, to_tsquery('english', $2)) AS rank,
           ts_headline('english', COALESCE(p.excerpt, p.body), to_tsquery('english', $2),
             'MaxWords=35, MinWords=15, StartSel=<mark>, StopSel=</mark>'
           ) AS headline
         FROM lp_posts p
         LEFT JOIN lp_users u ON p.author_id = u.id
         LEFT JOIN lp_media m ON p.featured_image_id = m.id
         WHERE p.site_id = $1
           AND p.status = 'published'
           AND p.type = 'post'
           AND p.search_vector @@ to_tsquery('english', $2)
         ORDER BY rank DESC, p.published_at DESC
         LIMIT $3 OFFSET $4`,
        [siteId, tsQuery, limit, offset],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM lp_posts p
         WHERE p.site_id = $1
           AND p.status = 'published'
           AND p.type = 'post'
           AND p.search_vector @@ to_tsquery('english', $2)`,
        [siteId, tsQuery],
      ),
    ]);

    return { results, total: Number(countRows[0].count) };
  }

  private buildTsQuery(input: string): string {
    const words = input
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);

    if (words.length === 0) return '';
    return words.map(w => `${w}:*`).join(' & ');
  }
}


import type { RequestHandler } from 'express';
import type { SearchService } from '../../services/SearchService.js';
import { param } from '@tagna/udiot/server';
import { sanitizeHighlightedHtml } from '../../utils/html.js';

export function searchController(searchService: SearchService) {
  const search: RequestHandler = async (req, res) => {
    const site = req.site!;
    const query = (req.query.q as string) || '';
    const page = Number(param(req, 'n')) || Number(req.query.page) || 1;

    if (!query.trim()) {
      return res.render('search', {
        site,
        query: '',
        results: [],
        total: 0,
        page: 1,
        totalPages: 0,
        title: `Search — ${site.name}`,
      });
    }

    const { results, total } = await searchService.search(site.id, query, page);
    const totalPages = Math.ceil(total / 20);
    const safeResults = results.map(result => ({
      ...result,
      headline: sanitizeHighlightedHtml(result.headline),
    }));

    res.render('search', {
      site,
      query,
      results: safeResults,
      total,
      page,
      totalPages,
      title: `Search: "${query}" — ${site.name}`,
    });
  };

  return { search };
}

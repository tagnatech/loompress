import type { RequestHandler } from 'express';
import type { PostService } from '../../services/PostService.js';
import type { CategoryService } from '../../services/CategoryService.js';

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function sitemapController(postService: PostService, categoryService: CategoryService) {
  const sitemap: RequestHandler = async (req, res) => {
    const site = req.site!;
    const { posts } = await postService.getPublishedPosts(site.id, 1, 1000);
    const categories = await categoryService.getAll(site.id);

    const urls: string[] = [];

    // Homepage
    urls.push(`  <url>
    <loc>${escapeXml(site.base_url)}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`);

    // Posts
    for (const post of posts) {
      urls.push(`  <url>
    <loc>${escapeXml(site.base_url)}/${escapeXml(post.slug)}</loc>
    <lastmod>${formatDate(new Date(post.updated_at))}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`);
    }

    // Categories
    for (const cat of categories) {
      urls.push(`  <url>
    <loc>${escapeXml(site.base_url)}/category/${escapeXml(cat.slug)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  };

  const robots: RequestHandler = (req, res) => {
    const site = req.site;
    const sitemapUrl = site ? `${site.base_url}/sitemap.xml` : '';
    res.type('text/plain').send(`User-agent: *\nAllow: /\n${sitemapUrl ? `Sitemap: ${sitemapUrl}\n` : ''}`);
  };

  return { sitemap, robots };
}

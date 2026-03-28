import type { RequestHandler } from 'express';
import type { PostService } from '../../services/PostService.js';
import { sanitizeRichText } from '../../utils/html.js';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toRfc2822(date: Date): string {
  return date.toUTCString();
}

export function feedController(postService: PostService) {
  const rss: RequestHandler = async (req, res) => {
    const site = req.site!;
    const { posts } = await postService.getPublishedPosts(site.id, 1, 20);

    const items = posts.map(post => {
      const link = `${site.base_url}/${post.slug}`;
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${post.published_at ? toRfc2822(new Date(post.published_at)) : ''}</pubDate>
      <description>${escapeXml(post.excerpt || '')}</description>
      <content:encoded><![CDATA[${sanitizeRichText(post.body)}]]></content:encoded>
    </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.name)}</title>
    <link>${escapeXml(site.base_url)}</link>
    <description>${escapeXml(site.tagline || '')}</description>
    <language>en</language>
    <lastBuildDate>${toRfc2822(new Date())}</lastBuildDate>
    <atom:link href="${escapeXml(site.base_url)}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(xml);
  };

  return { rss };
}

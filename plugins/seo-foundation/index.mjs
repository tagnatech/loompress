const SEO_SETTINGS_TTL_MS = 60_000;
const INDEXABLE_ROBOTS = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
const NOINDEX_ROBOTS = 'noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
const REMOVED_QUERY_PARAMS = new Set(['fbclid', 'gclid', 'ref', 'theme_preview']);
const settingsCache = new Map();

export default {
  name: 'SEO Foundation',
  version: '1.0.0',
  description: 'Canonical URLs, structured data, and sitemap coverage for posts, pages, categories, tags, and archives.',
  setup(ctx) {
    ctx.logger.info('registered bundled SEO extension');
  },
  registerPublicRoutes({ router, services, pool, config }) {
    router.get('/robots.txt', (req, res) => {
      const site = req.site;
      if (!site) {
        return res.type('text/plain').send('User-agent: *\nDisallow: /\n');
      }

      const lines = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin/',
        'Disallow: /search',
        'Disallow: /comment',
        `Sitemap: ${site.base_url}/sitemap.xml`,
      ];

      res.type('text/plain').send(`${lines.join('\n')}\n`);
    });

    router.get('/sitemap.xml', async (req, res, next) => {
      const site = req.site;
      if (!site) {
        return next();
      }

      try {
        const [contentEntries, categoryEntries, tagEntries] = await Promise.all([
          getPublishedContentEntries(pool, site.id),
          getCategorySitemapEntries(pool, site.id),
          getTagSitemapEntries(pool, site.id),
        ]);

        const xml = buildSitemapXml({
          site,
          contentEntries,
          categoryEntries,
          tagEntries,
        });

        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(xml);
      } catch (error) {
        next(error);
      }
    });

    router.use(async (req, res, next) => {
      if (req.method !== 'GET' || !req.site || isNonHtmlPath(req.path)) {
        return next();
      }

      const settings = await getSeoSettings(services.settingsService, req.site.id);
      const originalRender = res.render.bind(res);

      res.render = function render(view, options, callback) {
        let renderOptions = options;
        let renderCallback = callback;

        if (typeof options === 'function') {
          renderCallback = options;
          renderOptions = {};
        }

        const seoContext = buildSeoRenderContext({
          req,
          site: req.site,
          view,
          options: isPlainObject(renderOptions) ? renderOptions : {},
          settings,
          basePath: res.locals.basePath || config.basePath,
        });

        if (seoContext.xRobotsTag) {
          res.setHeader('X-Robots-Tag', seoContext.xRobotsTag);
        }

        return originalRender(
          view,
          {
            ...(isPlainObject(renderOptions) ? renderOptions : {}),
            ...seoContext.context,
          },
          renderCallback,
        );
      };

      next();
    });
  },
};

export async function getSeoSettings(settingsService, siteId) {
  const cached = settingsCache.get(siteId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const raw = await settingsService.getAll(siteId);
  const value = {
    titleSuffix: normalizeText(raw['seo.meta_title_suffix']),
    defaultDescription: normalizeText(raw['seo.default_meta_description']),
    noindexArchives: raw['seo.noindex_archives'] === 'true',
  };

  settingsCache.set(siteId, {
    value,
    expiresAt: Date.now() + SEO_SETTINGS_TTL_MS,
  });

  return value;
}

export function buildSeoRenderContext({ req, site, view, options, settings, basePath = '' }) {
  const canonicalPath = buildCanonicalPath(req);
  const canonicalUrl = toAbsoluteUrl(canonicalPath, site.base_url);
  const page = parsePageNumber(options, req);
  const imageUrl = resolveSeoImage(site, options, basePath);
  const description = resolveDescription({ view, site, options, settings, page });
  const title = appendTitleSuffix(resolveTitle({ view, site, options, page }), settings.titleSuffix);
  const metaRobots = resolveRobots({ view, page, settings });
  const schemaGraph = buildSchemaGraph({
    view,
    site,
    options,
    canonicalUrl,
    title,
    description,
    imageUrl,
    basePath,
  });

  return {
    xRobotsTag: metaRobots,
    context: {
      title,
      description,
      canonicalPath,
      ogImage: imageUrl ?? options.ogImage ?? null,
      twitterCard: imageUrl ? 'summary_large_image' : 'summary',
      seoHeadHtml: buildSeoHeadHtml({
        site,
        title,
        description,
        imageUrl,
        metaRobots,
        schemaGraph,
        articleMeta: buildArticleMeta(options),
      }),
    },
  };
}

export function buildCanonicalPath(req) {
  const requestUrl = new URL(req.originalUrl || req.url || req.path || '/', 'http://loompress.local');

  for (const key of [...requestUrl.searchParams.keys()]) {
    if (key.startsWith('utm_') || REMOVED_QUERY_PARAMS.has(key)) {
      requestUrl.searchParams.delete(key);
    }
  }

  requestUrl.pathname = normalizePageOnePath(requestUrl.pathname);

  const query = requestUrl.searchParams.toString();
  return `${requestUrl.pathname}${query ? `?${query}` : ''}`;
}

export function buildSitemapXml({ site, contentEntries, categoryEntries, tagEntries }) {
  const urls = [
    createSitemapUrl(site.base_url, '/', null, 'daily', '1.0'),
    ...contentEntries.map(entry => createSitemapUrl(
      site.base_url,
      `/${entry.slug}`,
      entry.updated_at,
      entry.type === 'page' ? 'monthly' : 'weekly',
      entry.type === 'page' ? '0.7' : '0.8',
    )),
    ...categoryEntries.map(entry => createSitemapUrl(
      site.base_url,
      `/category/${entry.slug}`,
      entry.updated_at,
      'weekly',
      '0.6',
    )),
    ...tagEntries.map(entry => createSitemapUrl(
      site.base_url,
      `/tag/${entry.slug}`,
      entry.updated_at,
      'weekly',
      '0.5',
    )),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
}

async function getPublishedContentEntries(pool, siteId) {
  const { rows } = await pool.query(
    `SELECT slug, type, updated_at
     FROM lp_posts
     WHERE site_id = $1 AND status = 'published' AND type IN ('post', 'page')
     ORDER BY COALESCE(published_at, updated_at) DESC`,
    [siteId],
  );

  return rows;
}

async function getCategorySitemapEntries(pool, siteId) {
  const { rows } = await pool.query(
    `SELECT c.slug, MAX(p.updated_at) AS updated_at
     FROM lp_categories c
     JOIN lp_post_categories pc ON pc.category_id = c.id
     JOIN lp_posts p ON p.id = pc.post_id
     WHERE c.site_id = $1 AND p.site_id = $1 AND p.status = 'published' AND p.type = 'post'
     GROUP BY c.slug
     ORDER BY c.slug`,
    [siteId],
  );

  return rows;
}

async function getTagSitemapEntries(pool, siteId) {
  const { rows } = await pool.query(
    `SELECT t.slug, MAX(p.updated_at) AS updated_at
     FROM lp_tags t
     JOIN lp_post_tags pt ON pt.tag_id = t.id
     JOIN lp_posts p ON p.id = pt.post_id
     WHERE t.site_id = $1 AND p.site_id = $1 AND p.status = 'published' AND p.type = 'post'
     GROUP BY t.slug
     ORDER BY t.slug`,
    [siteId],
  );

  return rows;
}

function buildSeoHeadHtml({ site, title, description, imageUrl, metaRobots, schemaGraph, articleMeta }) {
  const tags = [
    `<meta name="robots" content="${escapeHtml(metaRobots)}">`,
    `<meta property="og:site_name" content="${escapeHtml(site.name)}">`,
    `<meta name="author" content="${escapeHtml(site.name)}">`,
  ];

  if (imageUrl) {
    tags.push(`<meta property="og:image:alt" content="${escapeHtml(title)}">`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`);
    tags.push(`<meta name="twitter:image:alt" content="${escapeHtml(title)}">`);
  }

  if (articleMeta.publishedTime) {
    tags.push(`<meta property="article:published_time" content="${escapeHtml(articleMeta.publishedTime)}">`);
  }
  if (articleMeta.modifiedTime) {
    tags.push(`<meta property="article:modified_time" content="${escapeHtml(articleMeta.modifiedTime)}">`);
  }
  if (articleMeta.section) {
    tags.push(`<meta property="article:section" content="${escapeHtml(articleMeta.section)}">`);
  }
  for (const tagName of articleMeta.tags) {
    tags.push(`<meta property="article:tag" content="${escapeHtml(tagName)}">`);
  }

  if (schemaGraph.length > 0) {
    tags.push(
      `<script type="application/ld+json">${escapeJsonForHtml(JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': schemaGraph,
      }))}</script>`,
    );
  }

  return tags.join('\n');
}

function buildSchemaGraph({ view, site, options, canonicalUrl, title, description, imageUrl, basePath }) {
  const breadcrumbs = buildBreadcrumbs({ view, site, options, canonicalUrl });
  const publisherLogoUrl = toAbsoluteUrl(site.logo_url, site.base_url, basePath);
  const graph = [];

  if (breadcrumbs.length > 1) {
    graph.push(createBreadcrumbSchema(breadcrumbs));
  }

  if (view === 'post' && options.post) {
    if (options.post.type === 'page') {
      graph.push({
        '@type': 'WebPage',
        name: title,
        url: canonicalUrl,
        description,
        isPartOf: { '@type': 'WebSite', name: site.name, url: site.base_url },
        ...(imageUrl ? { primaryImageOfPage: { '@type': 'ImageObject', url: imageUrl } } : {}),
      });
      return graph;
    }

    graph.push({
      '@type': 'BlogPosting',
      headline: options.post.title,
      url: canonicalUrl,
      description,
      ...(imageUrl ? { image: [imageUrl] } : {}),
      ...(options.post.published_at ? { datePublished: toIsoDate(options.post.published_at) } : {}),
      ...(options.post.updated_at ? { dateModified: toIsoDate(options.post.updated_at) } : {}),
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
      author: {
        '@type': 'Person',
        name: options.post.author_name || site.name,
      },
      publisher: createPublisher(site, publisherLogoUrl),
      ...(options.categories?.[0]?.name ? { articleSection: options.categories[0].name } : {}),
      ...(options.tags?.length ? { keywords: options.tags.map(tag => tag.name).join(', ') } : {}),
    });
    return graph;
  }

  if (view === 'search') {
    graph.push({
      '@type': 'SearchResultsPage',
      name: title,
      url: canonicalUrl,
      description,
      isPartOf: { '@type': 'WebSite', name: site.name, url: site.base_url },
    });
    return graph;
  }

  if (view === 'category' || view === 'tag' || view === 'index') {
    graph.push({
      '@type': view === 'index' ? 'Blog' : 'CollectionPage',
      name: title,
      url: canonicalUrl,
      description,
      ...(imageUrl ? { image: imageUrl } : {}),
      isPartOf: { '@type': 'WebSite', name: site.name, url: site.base_url },
    });

    if (view === 'index') {
      graph.push({
        '@type': 'WebSite',
        '@id': `${site.base_url}/#website`,
        name: site.name,
        url: site.base_url,
        description,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${site.base_url}/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      });
    }
  }

  return graph;
}

function buildBreadcrumbs({ view, site, options, canonicalUrl }) {
  const items = [
    { name: site.name, url: `${site.base_url}/` },
  ];

  if (view === 'post' && options.post) {
    if (options.post.type === 'post' && options.categories?.[0]) {
      items.push({
        name: options.categories[0].name,
        url: `${site.base_url}/category/${options.categories[0].slug}`,
      });
    }
    items.push({ name: options.post.title, url: canonicalUrl });
    return items;
  }

  if (view === 'category' && options.category) {
    items.push({ name: options.category.name, url: canonicalUrl });
    return items;
  }

  if (view === 'tag' && options.tag) {
    items.push({ name: options.tag.name, url: canonicalUrl });
    return items;
  }

  if (view === 'search') {
    items.push({ name: 'Search', url: canonicalUrl });
  }

  return items;
}

function createBreadcrumbSchema(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function createPublisher(site, imageUrl) {
  return {
    '@type': 'Organization',
    name: site.name,
    url: site.base_url,
    ...(imageUrl ? {
      logo: {
        '@type': 'ImageObject',
        url: imageUrl,
      },
    } : {}),
  };
}

function buildArticleMeta(options) {
  const post = options.post;
  if (!post || post.type !== 'post') {
    return {
      publishedTime: null,
      modifiedTime: null,
      section: null,
      tags: [],
    };
  }

  return {
    publishedTime: post.published_at ? toIsoDate(post.published_at) : null,
    modifiedTime: post.updated_at ? toIsoDate(post.updated_at) : null,
    section: options.categories?.[0]?.name ?? null,
    tags: options.tags?.map(tag => tag.name) ?? [],
  };
}

function resolveTitle({ view, site, options, page }) {
  if (normalizeText(options.title)) {
    return normalizeText(options.title);
  }

  if (view === 'post' && options.post?.title) {
    return options.post.title;
  }

  if (view === 'category' && options.category?.name) {
    return `${options.category.name} — ${site.name}`;
  }

  if (view === 'tag' && options.tag?.name) {
    return `#${options.tag.name} — ${site.name}`;
  }

  if (view === 'search') {
    const query = normalizeText(options.query);
    return query ? `Search: "${query}" — ${site.name}` : `Search — ${site.name}`;
  }

  if (view === 'index' && page > 1) {
    return `Page ${page} — ${site.name}`;
  }

  return site.name;
}

function resolveDescription({ view, site, options, settings }) {
  const explicitDescription = normalizeText(options.description);
  if (explicitDescription) {
    return explicitDescription;
  }

  if (view === 'post' && options.post) {
    const postDescription = normalizeText(
      options.post.meta_description
      || options.post.excerpt
      || summarizeText(stripHtml(options.post.body), 160),
    );
    if (postDescription) {
      return postDescription;
    }
  }

  if (view === 'category' && options.category?.name) {
    return normalizeText(options.category.description)
      || `Browse posts filed under ${options.category.name} on ${site.name}.`;
  }

  if (view === 'tag' && options.tag?.name) {
    return `Browse posts tagged ${options.tag.name} on ${site.name}.`;
  }

  if (view === 'search') {
    const query = normalizeText(options.query);
    return query
      ? `Search results for ${query} on ${site.name}.`
      : `Search the ${site.name} archive.`;
  }

  if (view === 'index') {
    return normalizeText(site.tagline)
      || settings.defaultDescription
      || `Latest posts and updates from ${site.name}.`;
  }

  return settings.defaultDescription
    || normalizeText(site.tagline)
    || `${site.name}.`;
}

function resolveRobots({ view, page, settings }) {
  if (view === 'search') {
    return NOINDEX_ROBOTS;
  }

  if (page > 1 && isArchiveView(view)) {
    return NOINDEX_ROBOTS;
  }

  if (settings.noindexArchives && (view === 'category' || view === 'tag')) {
    return NOINDEX_ROBOTS;
  }

  return INDEXABLE_ROBOTS;
}

function resolveSeoImage(site, options, basePath) {
  const candidate = options.ogImage
    || options.post?.featured_image_url
    || site.logo_url;

  return toAbsoluteUrl(candidate, site.base_url, basePath);
}

function appendTitleSuffix(title, suffix) {
  const normalizedTitle = normalizeText(title);
  const normalizedSuffix = normalizeText(suffix);

  if (!normalizedSuffix) {
    return normalizedTitle;
  }
  if (!normalizedTitle) {
    return normalizedSuffix;
  }
  if (normalizedTitle.endsWith(normalizedSuffix)) {
    return normalizedTitle;
  }

  if (/^[|:>\-–—·]/.test(normalizedSuffix)) {
    return `${normalizedTitle} ${normalizedSuffix}`;
  }

  return `${normalizedTitle} | ${normalizedSuffix}`;
}

function normalizeText(value) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || '';
}

function summarizeText(value, limit) {
  const normalized = normalizeText(value);
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).replace(/\s+\S*$/, '').trim()}…`;
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function parsePageNumber(options, req) {
  const candidate = Number(options.page ?? req.params?.n ?? req.query?.page ?? 1);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
}

function normalizePageOnePath(pathname) {
  if (pathname === '/page/1') {
    return '/';
  }

  const categoryMatch = pathname.match(/^\/category\/([^/]+)\/page\/1$/);
  if (categoryMatch) {
    return `/category/${categoryMatch[1]}`;
  }

  const tagMatch = pathname.match(/^\/tag\/([^/]+)\/page\/1$/);
  if (tagMatch) {
    return `/tag/${tagMatch[1]}`;
  }

  return pathname || '/';
}

function toAbsoluteUrl(value, baseUrl, basePath = '') {
  let normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  normalized = prefixBasePath(normalized, basePath);

  try {
    return new URL(normalized, ensureTrailingSlash(baseUrl)).toString();
  } catch {
    return null;
  }
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function collapseRepeatedSlashes(value) {
  let result = '';
  let previousWasSlash = false;

  for (const char of value) {
    if (char === '/') {
      if (!previousWasSlash) {
        result += char;
      }
      previousWasSlash = true;
      continue;
    }

    result += char;
    previousWasSlash = false;
  }

  return result;
}

function trimTrailingSlashes(value) {
  let end = value.length;

  while (end > 1 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

function normalizeBasePath(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === '/') {
    return '';
  }

  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return trimTrailingSlashes(collapseRepeatedSlashes(withLeadingSlash));
}

function prefixBasePath(value, basePath) {
  const normalized = normalizeText(value);
  const resolvedBasePath = normalizeBasePath(basePath);

  if (
    !normalized
    || !resolvedBasePath
    || /^[a-z][a-z\d+\-.]*:/i.test(normalized)
    || normalized.startsWith('//')
    || !normalized.startsWith('/')
    || normalized === resolvedBasePath
    || normalized.startsWith(`${resolvedBasePath}/`)
  ) {
    return normalized;
  }

  return `${resolvedBasePath}${normalized}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeJsonForHtml(value) {
  return value
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isArchiveView(view) {
  return view === 'index' || view === 'category' || view === 'tag';
}

function isNonHtmlPath(pathname) {
  return pathname.endsWith('.xml') || pathname.endsWith('.txt');
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createSitemapUrl(baseUrl, path, updatedAt, changefreq, priority) {
  const lines = [
    '  <url>',
    `    <loc>${escapeXml(toAbsoluteUrl(path, baseUrl) ?? `${baseUrl}${path}`)}</loc>`,
  ];

  const lastmod = toSitemapDate(updatedAt);
  if (lastmod) {
    lines.push(`    <lastmod>${lastmod}</lastmod>`);
  }

  lines.push(`    <changefreq>${changefreq}</changefreq>`);
  lines.push(`    <priority>${priority}</priority>`);
  lines.push('  </url>');

  return lines.join('\n');
}

function toSitemapDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

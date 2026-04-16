import path from 'node:path';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { requestGeneratedImage, requestStructuredJson } from './openrouter.mjs';
import { resolveOpenRouterApiKey } from './settings.mjs';

const RICH_TEXT_TAGS = [
  'p',
  'br',
  'div',
  'span',
  'blockquote',
  'pre',
  'code',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'img',
  'figure',
  'figcaption',
];

const RICH_TEXT_ATTRIBUTES = {
  a: ['href', 'name', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  '*': ['class'],
};

const strategySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    titleAngle: { type: 'string' },
    primaryKeyword: { type: 'string' },
    secondaryKeywords: {
      type: 'array',
      items: { type: 'string' },
    },
    categoryName: { type: 'string' },
    tagNames: {
      type: 'array',
      items: { type: 'string' },
    },
    slugHint: { type: 'string' },
    outline: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          heading: { type: 'string' },
          goal: { type: 'string' },
        },
        required: ['heading', 'goal'],
      },
    },
    imagePrompt: { type: 'string' },
  },
  required: ['titleAngle', 'primaryKeyword', 'secondaryKeywords', 'categoryName', 'tagNames', 'slugHint', 'outline', 'imagePrompt'],
};

const writerSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    slug: { type: 'string' },
    excerpt: { type: 'string' },
    metaTitle: { type: 'string' },
    metaDescription: { type: 'string' },
    bodyHtml: { type: 'string' },
    categoryName: { type: 'string' },
    tagNames: {
      type: 'array',
      items: { type: 'string' },
    },
    imagePrompt: { type: 'string' },
    imageAlt: { type: 'string' },
  },
  required: ['title', 'slug', 'excerpt', 'metaTitle', 'metaDescription', 'bodyHtml', 'categoryName', 'tagNames', 'imagePrompt', 'imageAlt'],
};

export async function generateAutoblogPost({
  site,
  settings,
  services,
  pool,
  config,
  logger,
  authorId,
}) {
  const apiKey = resolveOpenRouterApiKey(settings);
  if (!apiKey) {
    throw new Error('OpenRouter API key is not configured.');
  }
  if (!settings.textModel) {
    throw new Error('Choose an OpenRouter text model that supports structured outputs.');
  }
  if (!settings.contentBrief) {
    throw new Error('Add a content brief before running the autoblog.');
  }
  if (settings.imageEnabled && !settings.imageModel) {
    throw new Error('Choose an OpenRouter image model or disable featured image generation.');
  }

  const [categories, tags, internalLinks] = await Promise.all([
    services.categoryService.getAll(site.id),
    services.tagService.getAll(site.id),
    getInternalLinkCandidates(pool, site),
  ]);

  const sharedContext = {
    site: {
      name: site.name,
      tagline: site.tagline || '',
      baseUrl: site.base_url,
      timezone: site.timezone,
      theme: site.theme,
    },
    strategy: {
      contentBrief: settings.contentBrief,
      audience: settings.audience,
      brandVoice: settings.brandVoice,
      keywordFocus: splitCommaList(settings.keywordFocus),
      defaultCategory: settings.defaultCategory,
      defaultTags: splitCommaList(settings.defaultTags),
    },
    availableCategories: categories.map(category => ({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      postCount: category.post_count || 0,
    })),
    existingTags: tags.slice(0, 25).map(tag => tag.name),
    internalLinks,
    seoRequirements: {
      titleMaxCharacters: 60,
      metaDescriptionMaxCharacters: 160,
      includeInternalLinksWhenRelevant: true,
      includeScannableHeadings: true,
      avoidKeywordStuffing: true,
    },
  };

  const referer = site.base_url;
  const title = `${site.name} AI Autoblog`;
  const strategy = await requestStructuredJson({
    apiKey,
    model: settings.textModel,
    schemaName: 'loompress_autoblog_strategy',
    schema: strategySchema,
    referer,
    title,
    temperature: 0.8,
    maxTokens: 1_500,
    enableWebResearch: settings.researchWithWeb,
    messages: [
      {
        role: 'system',
        content: 'You are the Strategy Agent for a production blog. Plan one original, specific, search-intent-aligned article. Favor clear user value, strong SERP positioning, realistic claims, and practical structure. Return only schema-compliant JSON.',
      },
      {
        role: 'user',
        content: `Use this site context to design the next post:\n${JSON.stringify(sharedContext, null, 2)}`,
      },
    ],
  });

  const draft = await requestStructuredJson({
    apiKey,
    model: settings.textModel,
    schemaName: 'loompress_autoblog_writer',
    schema: writerSchema,
    referer,
    title,
    temperature: 0.75,
    maxTokens: 4_000,
    messages: [
      {
        role: 'system',
        content: 'You are the Writer Agent. Produce polished HTML for LoomPress with semantic headings, concise paragraphs, occasional lists where useful, and natural internal links from the provided candidates. Avoid markdown fences and fabricated statistics. Return only schema-compliant JSON.',
      },
      {
        role: 'user',
        content: `Write the post using this context and strategy:\n${JSON.stringify({ ...sharedContext, strategy }, null, 2)}`,
      },
    ],
  });

  const finalDraft = await requestStructuredJson({
    apiKey,
    model: settings.textModel,
    schemaName: 'loompress_autoblog_editor',
    schema: writerSchema,
    referer,
    title,
    temperature: 0.35,
    maxTokens: 4_000,
    messages: [
      {
        role: 'system',
        content: 'You are the SEO Editor Agent. Tighten the title, excerpt, metadata, and body for clarity, accuracy, and search performance. Keep meta title around 60 characters and meta description around 160 characters when possible. Return only schema-compliant JSON.',
      },
      {
        role: 'user',
        content: `Review and finalize this generated article:\n${JSON.stringify({ ...sharedContext, strategy, draft }, null, 2)}`,
      },
    ],
  });

  const normalized = normalizeGeneratedPost(finalDraft, {
    fallbackTitle: strategy.titleAngle,
    fallbackSlug: strategy.slugHint,
    fallbackCategory: strategy.categoryName || settings.defaultCategory,
    fallbackTags: [...(Array.isArray(strategy.tagNames) ? strategy.tagNames : []), ...splitCommaList(settings.defaultTags)],
    fallbackExcerpt: draft.excerpt,
    fallbackMetaTitle: draft.metaTitle,
    fallbackMetaDescription: draft.metaDescription,
    fallbackImagePrompt: finalDraft.imagePrompt || strategy.imagePrompt,
  });
  const uniqueSlug = await ensureUniqueSlug(pool, site.id, normalized.slug);
  const categoryIds = [];
  const resolvedCategoryName = normalized.categoryName || settings.defaultCategory;

  if (resolvedCategoryName) {
    const category = await findOrCreateCategory(services.categoryService, site.id, resolvedCategoryName);
    categoryIds.push(category.id);
  }

  const mergedTags = dedupeStrings([
    ...normalized.tagNames,
    ...splitCommaList(settings.defaultTags),
  ]).slice(0, 8);
  const tagIds = [];
  for (const tagName of mergedTags) {
    const tag = await services.tagService.findOrCreate(site.id, tagName);
    tagIds.push(tag.id);
  }

  let featuredImageId = null;
  let imageWarning = '';

  if (settings.imageEnabled && settings.imageModel) {
    try {
      const media = await createGeneratedImage({
        apiKey,
        model: settings.imageModel,
        site,
        settings,
        config,
        services,
        authorId,
        prompt: buildFeaturedImagePrompt(site, settings, normalized),
        altText: normalized.imageAlt || normalized.title,
      });
      featuredImageId = media.id;
    } catch (error) {
      imageWarning = error instanceof Error ? error.message : 'Featured image generation failed.';
      logger.warn(`featured image generation failed for site "${site.slug}":`, imageWarning);
    }
  }

  const post = await services.postService.create(site.id, authorId, {
    slug: uniqueSlug,
    title: normalized.title,
    excerpt: normalized.excerpt,
    body: normalized.bodyHtml,
    status: settings.postStatus,
    featured_image_id: featuredImageId,
    meta_title: normalized.metaTitle,
    meta_description: normalized.metaDescription,
    category_ids: categoryIds,
    tag_ids: tagIds,
  });

  return {
    post,
    imageWarning,
    title: normalized.title,
    slug: uniqueSlug,
  };
}

export async function resolveAutoblogAuthorId({ services, siteId, manualAuthorId, preferredAuthorId }) {
  if (manualAuthorId) {
    const manualAuthor = await services.userService.getById(manualAuthorId);
    if (manualAuthor?.role === 'superadmin') {
      return manualAuthorId;
    }

    const siteRole = await services.userService.getSiteRole(manualAuthorId, siteId);
    if (siteRole) {
      return manualAuthorId;
    }
  }

  if (preferredAuthorId) {
    const siteRole = await services.userService.getSiteRole(preferredAuthorId, siteId);
    if (siteRole) {
      return preferredAuthorId;
    }
  }

  const siteUsers = await services.userService.getSiteUsers(siteId);
  const preferredSiteUser = siteUsers.find(user => user.site_role === 'admin') || siteUsers[0];

  if (!preferredSiteUser) {
    throw new Error('No site user is available to own generated posts.');
  }

  return preferredSiteUser.id;
}

export function normalizeGeneratedPost(rawDraft, fallbacks = {}) {
  const title = sanitizeSingleLine(rawDraft?.title || fallbacks.fallbackTitle, 200) || 'AI Generated Post';
  const slug = slugify(rawDraft?.slug || fallbacks.fallbackSlug || title) || `ai-post-${Date.now()}`;
  const excerpt = truncate(stripHtml(rawDraft?.excerpt || fallbacks.fallbackExcerpt || ''), 320) || truncate(stripHtml(title), 160);
  const metaTitle = truncate(sanitizeSingleLine(rawDraft?.metaTitle || fallbacks.fallbackMetaTitle || title, 140), 70) || title;
  const metaDescription = truncate(stripHtml(rawDraft?.metaDescription || fallbacks.fallbackMetaDescription || excerpt), 160) || excerpt;
  const bodyHtml = sanitizeRichText(rawDraft?.bodyHtml);
  const categoryName = sanitizeSingleLine(rawDraft?.categoryName || fallbacks.fallbackCategory, 120);
  const tagNames = dedupeStrings([
    ...(Array.isArray(rawDraft?.tagNames) ? rawDraft.tagNames : []),
    ...(Array.isArray(fallbacks.fallbackTags) ? fallbacks.fallbackTags : []),
  ]).slice(0, 8);
  const imagePrompt = sanitizeSingleLine(rawDraft?.imagePrompt || fallbacks.fallbackImagePrompt, 700);
  const imageAlt = truncate(sanitizeSingleLine(rawDraft?.imageAlt || title, 220), 160);

  if (!bodyHtml) {
    throw new Error('The AI writer returned an empty article body.');
  }

  return {
    title,
    slug,
    excerpt,
    metaTitle,
    metaDescription,
    bodyHtml,
    categoryName,
    tagNames,
    imagePrompt,
    imageAlt,
  };
}

async function getInternalLinkCandidates(pool, site) {
  const { rows } = await pool.query(
    `SELECT slug, title, type
     FROM lp_posts
     WHERE site_id = $1 AND status = 'published' AND type IN ('post', 'page')
     ORDER BY COALESCE(published_at, updated_at) DESC
     LIMIT 8`,
    [site.id],
  );

  return rows.map(row => ({
    title: row.title,
    url: `${site.base_url}/${row.slug}`,
    type: row.type,
  }));
}

async function ensureUniqueSlug(pool, siteId, baseSlug) {
  const root = slugify(baseSlug) || `ai-post-${Date.now()}`;
  let candidate = root;
  let suffix = 2;

  while (await slugExists(pool, siteId, candidate)) {
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function slugExists(pool, siteId, slug) {
  const { rows } = await pool.query(
    'SELECT 1 FROM lp_posts WHERE site_id = $1 AND slug = $2 LIMIT 1',
    [siteId, slug],
  );

  return rows.length > 0;
}

async function findOrCreateCategory(categoryService, siteId, categoryName) {
  const slug = slugify(categoryName);
  const existing = await categoryService.getBySlug(siteId, slug);
  if (existing) {
    return existing;
  }

  return categoryService.create(siteId, {
    name: sanitizeSingleLine(categoryName, 120),
    slug,
  });
}

async function createGeneratedImage({
  apiKey,
  model,
  site,
  settings,
  config,
  services,
  authorId,
  prompt,
  altText,
}) {
  const image = await requestGeneratedImage({
    apiKey,
    model,
    prompt,
    aspectRatio: settings.imageAspectRatio,
    referer: site.base_url,
    title: `${site.name} AI Autoblog`,
  });
  const extension = extensionFromMimeType(image.mimeType);
  const siteSlug = slugify(site.slug || site.name) || 'site';
  const directory = path.join(config.uploadDir, 'autoblog', siteSlug);
  const filename = `${Date.now()}-${randomUUID()}${extension}`;
  const storagePath = path.join(directory, filename);

  await mkdir(directory, { recursive: true });
  await writeFile(storagePath, image.buffer);

  try {
    const media = await services.mediaService.create(site.id, authorId, {
      filename,
      storagePath,
      publicUrl: prefixBasePath(`/uploads/autoblog/${siteSlug}/${filename}`, config.basePath),
      mimeType: image.mimeType,
      fileSize: image.buffer.length,
    });

    if (altText) {
      await services.mediaService.updateAltText(site.id, media.id, altText);
    }

    return media;
  } catch (error) {
    await unlink(storagePath).catch(() => {});
    throw error;
  }
}

function buildFeaturedImagePrompt(site, settings, draft) {
  const fragments = [
    draft.imagePrompt || `Create a polished editorial hero image for "${draft.title}".`,
    `Use a clean, blog-friendly composition for ${site.name}.`,
  ];

  if (settings.imageStyle) {
    fragments.push(settings.imageStyle);
  }

  fragments.push('No text overlays, no watermarks, no UI chrome, no logos.');
  return fragments.join(' ');
}

const ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#039;': "'",
  '&apos;': "'",
};
const ENTITY_RE = /&(?:amp|lt|gt|quot|apos|#0?39);/g;
const WINDOWS_1252_MAP = {
  0x80: '\u20AC',
  0x82: '\u201A',
  0x83: '\u0192',
  0x84: '\u201E',
  0x85: '\u2026',
  0x86: '\u2020',
  0x87: '\u2021',
  0x88: '\u02C6',
  0x89: '\u2030',
  0x8a: '\u0160',
  0x8b: '\u2039',
  0x8c: '\u0152',
  0x8e: '\u017D',
  0x91: '\u2018',
  0x92: '\u2019',
  0x93: '\u201C',
  0x94: '\u201D',
  0x95: '\u2022',
  0x96: '\u2013',
  0x97: '\u2014',
  0x98: '\u02DC',
  0x99: '\u2122',
  0x9a: '\u0161',
  0x9b: '\u203A',
  0x9c: '\u0153',
  0x9e: '\u017E',
  0x9f: '\u0178',
};
const UTF8_DECODER = new TextDecoder('utf-8');

function hexToNibble(code) {
  if (code >= 48 && code <= 57) {
    return code - 48;
  }
  if (code >= 65 && code <= 70) {
    return code - 55;
  }
  if (code >= 97 && code <= 102) {
    return code - 87;
  }

  return -1;
}

function readHexByte(value, index) {
  if (index + 2 >= value.length) {
    return null;
  }

  const high = hexToNibble(value.charCodeAt(index + 1));
  const low = hexToNibble(value.charCodeAt(index + 2));
  if (high === -1 || low === -1) {
    return null;
  }

  return (high << 4) | low;
}

function isContinuationByte(byte) {
  return byte >= 0x80 && byte <= 0xbf;
}

function getUtf8SequenceLength(bytes, index) {
  const first = bytes[index];

  if (first >= 0xc2 && first <= 0xdf && index + 1 < bytes.length && isContinuationByte(bytes[index + 1])) {
    return 2;
  }

  if (
    first === 0xe0
    && index + 2 < bytes.length
    && bytes[index + 1] >= 0xa0
    && bytes[index + 1] <= 0xbf
    && isContinuationByte(bytes[index + 2])
  ) {
    return 3;
  }

  if (
    first >= 0xe1
    && first <= 0xec
    && index + 2 < bytes.length
    && isContinuationByte(bytes[index + 1])
    && isContinuationByte(bytes[index + 2])
  ) {
    return 3;
  }

  if (
    first === 0xed
    && index + 2 < bytes.length
    && bytes[index + 1] >= 0x80
    && bytes[index + 1] <= 0x9f
    && isContinuationByte(bytes[index + 2])
  ) {
    return 3;
  }

  if (
    first >= 0xee
    && first <= 0xef
    && index + 2 < bytes.length
    && isContinuationByte(bytes[index + 1])
    && isContinuationByte(bytes[index + 2])
  ) {
    return 3;
  }

  if (
    first === 0xf0
    && index + 3 < bytes.length
    && bytes[index + 1] >= 0x90
    && bytes[index + 1] <= 0xbf
    && isContinuationByte(bytes[index + 2])
    && isContinuationByte(bytes[index + 3])
  ) {
    return 4;
  }

  if (
    first >= 0xf1
    && first <= 0xf3
    && index + 3 < bytes.length
    && isContinuationByte(bytes[index + 1])
    && isContinuationByte(bytes[index + 2])
    && isContinuationByte(bytes[index + 3])
  ) {
    return 4;
  }

  if (
    first === 0xf4
    && index + 3 < bytes.length
    && bytes[index + 1] >= 0x80
    && bytes[index + 1] <= 0x8f
    && isContinuationByte(bytes[index + 2])
    && isContinuationByte(bytes[index + 3])
  ) {
    return 4;
  }

  return 0;
}

function decodePercentByteSequence(bytes) {
  let result = '';

  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte < 0x80) {
      result += String.fromCharCode(byte);
      continue;
    }

    const utf8Length = getUtf8SequenceLength(bytes, index);
    if (utf8Length > 0) {
      result += UTF8_DECODER.decode(Uint8Array.from(bytes.slice(index, index + utf8Length)));
      index += utf8Length - 1;
      continue;
    }

    result += WINDOWS_1252_MAP[byte] ?? String.fromCharCode(byte);
  }

  return result;
}

function decodePercentEncodedText(value) {
  let result = '';

  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 37) {
      result += value[index];
      continue;
    }

    const bytes = [];
    let cursor = index;

    while (cursor < value.length && value.charCodeAt(cursor) === 37) {
      const byte = readHexByte(value, cursor);
      if (byte === null) {
        break;
      }

      bytes.push(byte);
      cursor += 3;
    }

    if (bytes.length === 0) {
      result += value[index];
      continue;
    }

    result += decodePercentByteSequence(bytes);
    index = cursor - 1;
  }

  return result;
}

function decodeHtmlEntities(value) {
  return value.replace(ENTITY_RE, (match) => ENTITY_MAP[match] ?? match);
}

function decodeEncodedHtmlIfNeeded(value) {
  const hasRealTags = /<[a-z/]/i.test(value);
  if (hasRealTags) {
    return value;
  }

  if (/%3C[a-z/]/i.test(value)) {
    const decoded = decodePercentEncodedText(value);
    if (/<[a-z/]/i.test(decoded)) {
      return decoded;
    }
  }

  if (/&lt;[a-z/]/i.test(value)) {
    return decodeHtmlEntities(value);
  }

  return value;
}

function sanitizeRichText(input) {
  const html = sanitizeMultiline(input, 200_000);
  if (!html) {
    return '';
  }

  return sanitizeHtml(decodeEncodedHtmlIfNeeded(html), {
    allowedTags: RICH_TEXT_TAGS,
    allowedAttributes: RICH_TEXT_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow noopener noreferrer' }, true),
      img: sanitizeHtml.simpleTransform('img', { loading: 'lazy' }, true),
    },
  });
}

function stripHtml(input) {
  const value = sanitizeMultiline(input, 5_000);
  const decoded = /%[0-9a-f]{2}/i.test(value)
    ? decodePercentEncodedText(value)
    : decodeHtmlEntities(value);

  return sanitizeHtml(decoded, {
    allowedTags: [],
    allowedAttributes: {},
  });
}

function splitCommaList(value) {
  return dedupeStrings(String(value ?? '')
    .split(',')
    .map(item => sanitizeSingleLine(item, 64))
    .filter(Boolean));
}

function dedupeStrings(values) {
  const seen = new Set();
  const list = [];

  for (const value of values) {
    const normalized = sanitizeSingleLine(value, 120);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    list.push(normalized);
  }

  return list;
}

function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function sanitizeSingleLine(input, maxLength = 255) {
  return String(input ?? '')
    .replace(/\0/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeMultiline(input, maxLength = 5_000) {
  return String(input ?? '')
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLength);
}

function truncate(value, maxLength) {
  const normalized = sanitizeSingleLine(value, maxLength * 2);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength).replace(/\s+\S*$/, '').trim();
}

function extensionFromMimeType(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('png')) {
    return '.png';
  }
  if (normalized.includes('jpeg') || normalized.includes('jpg')) {
    return '.jpg';
  }
  if (normalized.includes('webp')) {
    return '.webp';
  }
  if (normalized.includes('svg')) {
    return '.svg';
  }

  return '.png';
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
  const normalized = String(value ?? '').trim();
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

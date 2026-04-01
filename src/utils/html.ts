import sanitizeHtml from 'sanitize-html';
import { sanitizeMultilineText } from './validation.js';

const ALLOWED_TAGS = [
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

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'name', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  '*': ['class'],
};

/**
 * If the entire string is HTML-entity-encoded (no real tags, only `&lt;` /
 * `&gt;` sequences that look like tag boundaries), decode one level of
 * entities so that `sanitize-html` can parse the actual markup.
 *
 * This commonly happens when an LLM returns HTML inside a JSON string field
 * with the tags entity-escaped.
 */
const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#039;': "'",
  '&apos;': "'",
};
const ENTITY_RE = /&(?:amp|lt|gt|quot|apos|#0?39);/g;

function decodeHtmlEntitiesIfNeeded(value: string): string {
  if (/<[a-z/]/i.test(value) || !/&lt;[a-z/]/i.test(value)) {
    return value;
  }
  return value.replace(ENTITY_RE, (match) => ENTITY_MAP[match] ?? match);
}

export function sanitizeRichText(input: unknown): string {
  const html = sanitizeMultilineText(input, 200_000);
  if (!html) {
    return '';
  }

  return sanitizeHtml(decodeHtmlEntitiesIfNeeded(html), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
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

export function stripHtml(input: unknown, maxLength = 500): string {
  const value = sanitizeMultilineText(input, maxLength * 4);
  if (!value) {
    return '';
  }

  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
  }).slice(0, maxLength);
}

export function sanitizeHighlightedHtml(input: unknown): string {
  const value = sanitizeMultilineText(input, 10_000);
  if (!value) {
    return '';
  }

  return sanitizeHtml(value, {
    allowedTags: ['mark'],
    allowedAttributes: {},
  });
}

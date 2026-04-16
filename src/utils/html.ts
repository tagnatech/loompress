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
 * If the string contains no real HTML tags but appears to be encoded HTML,
 * decode it so `sanitize-html` can parse the actual markup.
 *
 * Handles two common LLM output patterns:
 *   1. HTML-entity-encoded: `&lt;p&gt;` instead of `<p>`
 *   2. URL/percent-encoded: `%3Cp%3E` instead of `<p>`
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
const WINDOWS_1252_MAP: Record<number, string> = {
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

function hexToNibble(code: number): number {
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

function readHexByte(value: string, index: number): number | null {
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

function isContinuationByte(byte: number): boolean {
  return byte >= 0x80 && byte <= 0xbf;
}

function getUtf8SequenceLength(bytes: number[], index: number): number {
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

function decodePercentByteSequence(bytes: number[]): string {
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

function decodePercentEncodedText(value: string): string {
  let result = '';

  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 37) {
      result += value[index];
      continue;
    }

    const bytes: number[] = [];
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

function decodeHtmlEntities(value: string): string {
  return value.replace(ENTITY_RE, (match) => ENTITY_MAP[match] ?? match);
}

function decodeEncodedHtmlIfNeeded(value: string): string {
  const hasRealTags = /<[a-z/]/i.test(value);
  if (hasRealTags) {
    return value;
  }

  // URL/percent-encoded HTML: %3Cp%3E → <p>
  if (/%3C[a-z/]/i.test(value)) {
    const decoded = decodePercentEncodedText(value);
    if (/<[a-z/]/i.test(decoded)) {
      return decoded;
    }
  }

  // HTML-entity-encoded: &lt;p&gt; → <p>
  if (/&lt;[a-z/]/i.test(value)) {
    return decodeHtmlEntities(value);
  }

  return value;
}

export function sanitizeRichText(input: unknown): string {
  const html = sanitizeMultilineText(input, 200_000);
  if (!html) {
    return '';
  }

  return sanitizeHtml(decodeEncodedHtmlIfNeeded(html), {
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

  const decoded = /%[0-9a-f]{2}/i.test(value)
    ? decodePercentEncodedText(value)
    : decodeHtmlEntities(value);

  return sanitizeHtml(decoded, {
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

import { describe, expect, it } from 'vitest';
import { sanitizeHighlightedHtml, sanitizeRichText, stripHtml } from './html.js';

describe('html utilities', () => {
  it('removes unsafe scripts from rich text', () => {
    const sanitized = sanitizeRichText('<p>Hello</p><script>alert(1)</script>');
    expect(sanitized).toContain('<p>Hello</p>');
    expect(sanitized).not.toContain('<script>');
  });

  it('keeps only highlight markup for search excerpts', () => {
    const sanitized = sanitizeHighlightedHtml('<mark>hit</mark><script>alert(1)</script>');
    expect(sanitized).toBe('<mark>hit</mark>');
  });

  it('strips all html when plain text is required', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });
});

import { describe, expect, it } from 'vitest';
import { sanitizeHighlightedHtml, sanitizeRichText, stripHtml } from './html.js';

describe('html utilities', () => {
  it('removes unsafe scripts from rich text', () => {
    const sanitized = sanitizeRichText('<p>Hello</p><script>alert(1)</script>');
    expect(sanitized).toContain('<p>Hello</p>');
    expect(sanitized).not.toContain('<script>');
  });

  it('decodes percent-encoded html with legacy punctuation bytes', () => {
    const encoded = '%3Cp%3EHybrid%20support%20wins%20%97%20faster%20and%20smarter.%3C%2Fp%3E';
    expect(sanitizeRichText(encoded)).toBe('<p>Hybrid support wins — faster and smarter.</p>');
  });

  it('decodes mixed percent and entity encoded html', () => {
    const encoded = '%26lt%3Bp%26gt%3BHello%26lt%3B%2Fp%26gt%3B';
    expect(sanitizeRichText(encoded)).toBe('<p>Hello</p>');
  });

  it('keeps only highlight markup for search excerpts', () => {
    const sanitized = sanitizeHighlightedHtml('<mark>hit</mark><script>alert(1)</script>');
    expect(sanitized).toBe('<mark>hit</mark>');
  });

  it('strips all html when plain text is required', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('strips percent-encoded html into readable text', () => {
    const encoded = '%3Cp%3EAI%20handles%2080%25%20of%20tickets%20%97%20humans%20handle%20the%20rest.%3C%2Fp%3E';
    expect(stripHtml(encoded)).toBe('AI handles 80% of tickets — humans handle the rest.');
  });

  it('strips mixed percent and entity encoded html into readable text', () => {
    const encoded = '%26lt%3Bp%26gt%3BEncoded%20excerpt%26lt%3B%2Fp%26gt%3B';
    expect(stripHtml(encoded)).toBe('Encoded excerpt');
  });

  it('does not decode plain percent-escaped text as html', () => {
    expect(stripHtml('Use SAVE%2BNOW at https://example.com/a%2Fb')).toBe(
      'Use SAVE%2BNOW at https://example.com/a%2Fb',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { computeNextRunAt } from './lib/time.mjs';
import { normalizeGeneratedPost } from './lib/generator.mjs';
import { parseDataUrl } from './lib/openrouter.mjs';

describe('ai autoblog helpers', () => {
  it('computes the next daily run in the configured timezone', () => {
    const nextRunAt = computeNextRunAt({
      now: new Date('2026-03-28T10:30:00.000Z'),
      timeZone: 'UTC',
      scheduleMode: 'daily',
      scheduleTime: '09:00',
    });

    expect(nextRunAt).toBe('2026-03-29T09:00:00.000Z');
  });

  it('normalizes generated content into valid post fields', () => {
    const result = normalizeGeneratedPost({
      title: '  Practical API Security Checklist for Teams  ',
      slug: 'Practical API Security Checklist for Teams',
      excerpt: '<p>Five concrete steps to tighten API security without slowing delivery.</p>',
      metaTitle: 'Practical API Security Checklist for Teams and Platforms',
      metaDescription: '<p>Use this checklist to improve API authentication, validation, monitoring, and incident response.</p>',
      bodyHtml: '<h2>Start with your authentication model</h2><p>Review token scope and rotation.</p>',
      categoryName: 'Engineering',
      tagNames: ['Security', 'APIs', 'APIs'],
      imagePrompt: 'Editorial illustration of secure APIs and observability dashboards',
      imageAlt: 'Secure API dashboard illustration',
    });

    expect(result.slug).toBe('practical-api-security-checklist-for-teams');
    expect(result.tagNames).toEqual(['Security', 'APIs']);
    expect(result.metaDescription.length).toBeLessThanOrEqual(160);
    expect(result.bodyHtml).toContain('<h2>');
  });

  it('parses image data urls from OpenRouter responses', () => {
    const payload = parseDataUrl('data:image/png;base64,aGVsbG8=');

    expect(payload.mimeType).toBe('image/png');
    expect(payload.buffer.toString('utf8')).toBe('hello');
  });
});

import { describe, expect, it } from 'vitest';
import { getTimeZoneOptions, normalizeTimeZone } from './timezone.js';

describe('timezone utilities', () => {
  it('includes UTC first in the options list', () => {
    const options = getTimeZoneOptions();

    expect(options[0].value).toBe('UTC');
    expect(options[0].label.startsWith('UTC+00:00')).toBe(true);
  });

  it('validates timezone values and falls back to UTC when empty', () => {
    expect(normalizeTimeZone('UTC')).toBe('UTC');
    expect(normalizeTimeZone('')).toBe('UTC');
    expect(() => normalizeTimeZone('Mars/Olympus')).toThrow(/valid timezone/i);
  });
});

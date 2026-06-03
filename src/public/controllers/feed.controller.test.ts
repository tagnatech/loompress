import { describe, expect, it } from 'vitest';
import { escapeCdata } from './feed.controller.js';

describe('feed controller helpers', () => {
  it('splits CDATA terminators before embedding rich content', () => {
    expect(escapeCdata('<p>safe ]]> content</p>')).toBe('<p>safe ]]]]><![CDATA[> content</p>');
  });
});

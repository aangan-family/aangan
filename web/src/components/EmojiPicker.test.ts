import { describe, expect, it } from 'vitest';
import { EMOJI_GROUPS, onlyEmoji } from './EmojiPicker';

describe('chat emoji', () => {
  it('spots emoji-only messages', () => {
    expect(onlyEmoji('🙏')).toBe(true);
    expect(onlyEmoji('🎉 🎂')).toBe(true);
    expect(onlyEmoji('👍🏽')).toBe(true);
    expect(onlyEmoji('❤️')).toBe(true);
    expect(onlyEmoji('ok 👍')).toBe(false);
    expect(onlyEmoji('123')).toBe(false);
  });
  it('has no repeats within a category', () => {
    for (const g of EMOJI_GROUPS) expect(new Set(g.list).size).toBe(g.list.length);
  });
});

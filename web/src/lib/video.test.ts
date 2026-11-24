import { describe, expect, it } from 'vitest';
import { videosIn, youtubeRef } from './video';

describe('YouTube links', () => {
  it('reads every common link shape', () => {
    for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://youtube.com/live/dQw4w9WgXcQ?si=abc'])
      expect(youtubeRef(u)?.id).toBe('dQw4w9WgXcQ');
  });
  it('keeps the start time', () => {
    expect(youtubeRef('https://youtu.be/dQw4w9WgXcQ?t=90')).toEqual({ id: 'dQw4w9WgXcQ', start: 90 });
    expect(youtubeRef('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')?.start).toBe(90);
  });
  it('ignores other sites and bad ids', () => {
    expect(youtubeRef('https://vimeo.com/123')).toBeNull();
    expect(youtubeRef('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeRef('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeRef('https://www.youtube.com/watch?v=<script>')).toBeNull();
    expect(youtubeRef('javascript:alert(1)')).toBeNull();
  });
  it('finds videos in a post, bare or as a link, without repeats', () => {
    const t = 'Sambar recipe: https://youtu.be/dQw4w9WgXcQ and [the same](https://www.youtube.com/watch?v=dQw4w9WgXcQ), plus https://youtu.be/9bZkp7q19f0.';
    expect(videosIn(t).map((v) => v.id)).toEqual(['dQw4w9WgXcQ', '9bZkp7q19f0']);
  });
});

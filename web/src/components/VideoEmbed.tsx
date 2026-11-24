import { useState } from 'react';
import type { VideoRef } from '../lib/video';

/**
 * A YouTube video that plays on the page. Until someone taps play it is just a picture, so
 * opening a conversation doesn't load YouTube; then it plays from youtube-nocookie.com
 * (YouTube's privacy-enhanced mode).
 */
export function VideoEmbed({ v }: { v: VideoRef }) {
  const [play, setPlay] = useState(false);
  const [noPic, setNoPic] = useState(false);
  const src = `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&playsinline=1${v.start ? `&start=${v.start}` : ''}`;
  return (
    <div className="video">
      {play ? (
        <iframe src={src} title="YouTube video" loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      ) : (
        <button type="button" className="video-cover" onClick={() => setPlay(true)} aria-label="Play the YouTube video here">
          {noPic ? <span className="video-nopic">YouTube video</span>
            : <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" onError={() => setNoPic(true)} />}
          <span className="video-play" aria-hidden="true"><svg width="68" height="48" viewBox="0 0 68 48"><path d="M66.5 7.7a8.5 8.5 0 0 0-6-6C55.2.3 34 .3 34 .3s-21.2 0-26.5 1.4a8.5 8.5 0 0 0-6 6C.1 13 .1 24 .1 24s0 11 1.4 16.3a8.5 8.5 0 0 0 6 6C12.8 47.7 34 47.7 34 47.7s21.2 0 26.5-1.4a8.5 8.5 0 0 0 6-6C67.9 35 67.9 24 67.9 24s0-11-1.4-16.3z" fill="#f00" /><path d="M45 24 27 14v20" fill="#fff" /></svg></span>
        </button>
      )}
    </div>
  );
}

export function Videos({ videos }: { videos: VideoRef[] }) {
  if (!videos.length) return null;
  return <div className="videos">{videos.map((v) => <VideoEmbed key={v.id} v={v} />)}</div>;
}

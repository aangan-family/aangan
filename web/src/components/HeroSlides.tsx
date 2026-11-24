import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import type { HeroPhoto } from '../lib/types';

const SLIDE_MS = 9000;
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The family's old photos, crossfading with a slow pan across each picture so everyone comes into view. */
export function heroSlides(info?: { hero_photos?: HeroPhoto[]; banner_path?: string | null } | null): HeroPhoto[] {
  if (info?.hero_photos?.length) return info.hero_photos;
  return info?.banner_path ? [{ path: info.banner_path }] : [];
}

export function HeroSlides({ slides }: { slides: HeroPhoto[] }) {
  const { fileUrl } = useStore();
  const [at, setAt] = useState(0);
  const [round, setRound] = useState<number[]>(() => slides.map(() => 0));
  const [paused, setPaused] = useState(false);
  const still = useRef(reduced());
  const n = slides.length;
  const urls = slides.map((s) => fileUrl(s.path));

  useEffect(() => { setAt(0); setRound(slides.map(() => 0)); }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (n < 2 || paused || still.current) return;
    const t = window.setTimeout(() => show((at + 1) % n), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [at, n, paused]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const vis = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);

  function show(i: number) {
    setRound((r) => r.map((x, j) => (j === i ? x + 1 : x)));
    setAt(i);
  }
  if (!n) return null;
  const cap = slides[at]?.caption;
  return (
    <>
      <div className="hs" aria-hidden="true">
        {slides.map((s, i) => urls[i] && (
          <img key={`${s.path}-${round[i] || 0}`} src={urls[i]} alt="" draggable={false}
            className={`hs-img${i === at ? ' on' : ''}${i % 2 ? ' rev' : ''}`} />
        ))}
      </div>
      {(n > 1 || cap) && (
        <div className="hs-ui">
          {cap && <span className="hs-cap" key={at}>{cap}</span>}
          {n > 1 && (
            <div className="hs-dots" role="tablist" aria-label="Family photos">
              {slides.map((s, i) => (
                <button key={s.path} role="tab" aria-selected={i === at} aria-label={s.caption || `Photo ${i + 1}`}
                  className={i === at ? 'on' : ''} onClick={() => show(i)}>
                  {i === at && !still.current && !paused && <i style={{ animationDuration: `${SLIDE_MS}ms` }} key={round[i]} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

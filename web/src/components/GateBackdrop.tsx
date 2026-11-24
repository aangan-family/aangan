import { useEffect, useState } from 'react';

/**
 * Behind the sign-in box: two soft abstract pictures (web/public/login/a.jpg, b.jpg), moving slowly and crossfading.
 * A family may swap in its own group photos, but only pre-blurred (docs/SETUP.md, "Make it yours").
 * These files are public, so the blur is baked into them (made from ~120 px wide copies):
 * the people read as a family group, but no face can be recognised or recovered.
 */
const SLIDES = ['login/a.jpg', 'login/b.jpg'];
const SLIDE_MS = 11000;

export function GateBackdrop() {
  const [at, setAt] = useState(0);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => { setAt((a) => (a + 1) % SLIDES.length); setRound((r) => r + 1); }, SLIDE_MS);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="gate-bg" aria-hidden="true">
      {SLIDES.map((s, i) => (
        <img key={i === at ? `${s}-${round}` : s} src={`${import.meta.env.BASE_URL}${s}`} alt="" draggable={false}
          className={`gate-bg-img${i === at ? ' on' : ''}${i % 2 ? ' rev' : ''}`} />
      ))}
      <div className="gate-bg-veil" />
    </div>
  );
}

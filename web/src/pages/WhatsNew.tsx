import { useEffect } from 'react';
import { RELEASES, markSeen } from '../lib/whatsnew';
import { inline } from '../lib/richtext';

const day = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

/** #/whats-new — release notes for everyone, in plain words. */
export function WhatsNew() {
  useEffect(() => { markSeen(); dispatchEvent(new Event('fam-whatsnew-seen')); }, []);
  return (
    <div className="wrap">
      <section className="hero-r reveal" style={{ paddingTop: 60 }}>
        <p className="eyebrow">What’s New!</p>
        <h2 className="headline">What’s new on our website.</h2>
        <p className="subhead">Everything we’ve added since the website began, newest first. Tap a link to try it.</p>
      </section>
      <ol className="releases">
        {RELEASES.map((r, i) => (
          <li key={r.date} className="release">
            <div className="rel-when"><time dateTime={r.date}>{day(r.date)}</time>{i === 0 && <span className="rel-new">Latest</span>}</div>
            <h3 className="rel-title">{r.title}</h3>
            <ul className="rel-notes">
              {r.notes.map((n, j) => (
                <li key={j}>
                  <span className="rel-icon" aria-hidden="true">{n.icon}</span>
                  <span>{inline(n.text)}{n.link && <> <a className="rel-try" href={n.link}>Try it ›</a></>}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="emptyhint" style={{ textAlign: 'center', margin: '40px 0' }}>Got an idea for the website? Share it in <a href="#/talk">Talk</a>.</p>
    </div>
  );
}

/**
 * What's New! — release notes for the whole family, newest first.
 * Plain words, one line per change, written for someone who isn't technical.
 * Add a new release at the top when something people can see or use changes.
 * (Behind-the-scenes work goes in the DevCenter handbook, not here.)
 */
export interface Note { icon: string; text: string; link?: string }
export interface Release { date: string; title: string; notes: Note[] }

export const RELEASES: Release[] = [
  {
    date: '2026-11-24',
    title: 'Welcome to your family website.',
    notes: [
      { icon: '🌳', text: 'The family tree: everyone, every generation, including the families we married into.', link: '#/tree' },
      { icon: '🔒', text: 'Your details are yours: choose Family, Close family or Only me for each one, in My privacy.', link: '#/privacy' },
      { icon: '🪔', text: 'Your traditions: pick Hindi, Punjabi, Bengali, Marathi, Gujarati, Urdu, Tamil, Telugu, Kannada or Malayalam in Theme → Traditions. Family words (Chacha, Mausi, Athai, Bava…), menus, the calendar and festivals follow.' },
      { icon: '🔗', text: 'How are we related? Pick any two people and see the connection, in plain words.', link: '#/related' },
      { icon: '📅', text: 'Calendar: birthdays, anniversaries and remembrance days, with Hindu, Sikh, Muslim, Christian, Jain and Buddhist festivals you can switch on.', link: '#/calendar' },
      { icon: '💬', text: 'Talk and Messages: family conversations, photos and private messages.', link: '#/talk' },
      { icon: '📱', text: 'Add it to your home screen and it works like an app, with notifications.' },
    ],
  },
];

export const LATEST = RELEASES[0].date;
const SEEN_KEY = 'fam.whatsnew.seen';
export function hasUnseen(): boolean {
  try { return (localStorage.getItem(SEEN_KEY) || '') < LATEST; } catch { return false; }
}
export function markSeen() {
  try { localStorage.setItem(SEEN_KEY, LATEST); } catch { /* private mode: no dot, no harm */ }
}

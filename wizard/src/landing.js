// The front door: a banner with "Set up your family", what a family gets, every tradition, how it works, privacy.
import { h, logo, people } from './ui.js';
import { signedUp, me } from './api.js';

export const TRADITIONS = [
  ['hindi', 'Hindi', 'हिन्दी'], ['punjabi', 'Punjabi', 'ਪੰਜਾਬੀ'], ['bengali', 'Bengali', 'বাংলা'], ['marathi', 'Marathi', 'मराठी'],
  ['gujarati', 'Gujarati', 'ગુજરાતી'], ['urdu', 'Urdu', 'اردو'], ['tamil', 'Tamil', 'தமிழ்'], ['telugu', 'Telugu', 'తెలుగు'],
  ['kannada', 'Kannada', 'ಕನ್ನಡ'], ['malayalam', 'Malayalam', 'മലയാളം'], ['odia', 'Odia', 'ଓଡ଼ିଆ'], ['assamese', 'Assamese', 'অসমীয়া'],
  ['konkani', 'Konkani', 'कोंकणी'], ['sindhi', 'Sindhi', 'Sindhi'], ['kashmiri', 'Kashmiri', 'Koshur'], ['parsi', 'Parsi', 'પારસી'],
  ['goan_catholic', 'Goan Catholic', 'Konknni'], ['syrian_christian', 'Syrian Christian', 'നസ്രാണി'], ['english', 'English only', ''],
];
const BORDERS = [['phulkari', 'Phulkari'], ['bandhani', 'Bandhani'], ['paithani', 'Paithani'], ['laal-paar', 'Laal paar'], ['saree-red', 'Kanjeevaram'],
  ['sambalpuri', 'Sambalpuri'], ['mekhela', 'Mekhela'], ['kasavu', 'Kasavu'], ['kunbi', 'Kunbi'], ['kani', 'Kani'], ['ajrak', 'Ajrak'], ['gamosa', 'Gamosa']];

const FEATURES = [
  ['🌳', 'saffron', 'Your family tree', 'Every generation, and the families you married into. Relatives find themselves in a tap.'],
  ['🪔', 'marigold', 'Your traditions', 'Family words in your language: Chacha, Athai, Mama, Pishi. Gotra, kuldevi and your own festivals.'],
  ['📅', 'leaf', 'Birthdays and festivals', 'Birthdays, anniversaries and remembrance days, with the festivals your family keeps.'],
  ['💬', 'pink', 'Talk and photos', 'Family conversations, old photographs, private messages. Nobody is tagged without saying yes.'],
  ['🔒', 'maroon', 'Private by design', 'Only invited family can sign in. Each person decides who sees each detail. Children are protected.'],
  ['👵', 'royal', 'Easy for elders', 'Large text, menus in their language, a QR code to join. Sign in with Google or an email link, no passwords.'],
];

export function landingPage(go) {
  const cta = signedUp() ? 'Continue your setup' : 'Set up your family';
  const start = () => go(signedUp() ? 'sheet' : 'signup');
  return h('div', { class: 'landing' },
    h('section', { class: 'hero' },
      h('div', { class: 'hero-in' },
        h('h1', { class: 'sr' }, 'Aangan'), logo(false, 'hero-logo', true),
        h('p', { class: 'tagline' }, 'A courtyard online for your whole family.'),
        h('p', { class: 'sub' }, 'Your family tree, your traditions and your festivals, in your own languages. Private to your family, run by your family, free to use.'),
        h('div', { class: 'row center' },
          h('button', { class: 'btn big', onclick: start }, cta),
          h('a', { class: 'btn ghost big', href: '#how' , onclick: (e) => { e.preventDefault(); document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }); } }, 'How it works')),
        signedUp() ? h('p', { class: 'muted center' }, `Welcome back${me()?.name ? ', ' + me().name.split(' ')[0] : ''}.`) : null),
      people('people hero-people')),

    h('section', { class: 'band' },
      h('h2', {}, 'Everything a family needs, in one place.'),
      h('div', { class: 'features' }, FEATURES.map(([icon, tint, title, text]) =>
        h('div', { class: `feature t-${tint}` }, h('span', { class: 'ficon', 'aria-hidden': 'true' }, icon), h('h3', {}, title), h('p', {}, text))))),

    h('section', { class: 'band warm' },
      h('h2', {}, 'For every Indian family.'),
      h('p', { class: 'lead center' }, 'Nineteen traditions to choose from, and every relative can pick their own. Each comes with its family words, festivals and a woven border from its own dress.'),
      h('div', { class: 'chips' }, TRADITIONS.map(([id, name, native]) => h('span', { class: 'chip' }, name, native ? h('span', { class: 'native', lang: '' }, ' ' + native) : null))),
      h('div', { class: 'borders' }, BORDERS.map(([id, name]) => h('figure', {}, h('img', { src: `files/borders/${id}.png`, alt: '', loading: 'lazy', width: 580, height: 46 }), h('figcaption', {}, name))))),

    h('section', { class: 'band', id: 'how' },
      h('h2', {}, 'How it works.'),
      h('ol', { class: 'how' },
        h('li', { class: 't-saffron' }, h('b', {}, 'Sign up'), h('span', {}, 'Tell us a little about your family. Two minutes.')),
        h('li', { class: 't-leaf' }, h('b', {}, 'Check your family sheet'), h('span', {}, 'Fill in our Excel template, then check it here. It never leaves your computer.')),
        h('li', { class: 't-royal' }, h('b', {}, 'Put it online'), h('span', {}, 'One click builds your family’s own private website, on your own free accounts.')),
        h('li', { class: 't-pink' }, h('b', {}, 'Invite the family'), h('span', {}, 'Share the link in your WhatsApp groups. Elders get a QR code.'))),
      h('div', { class: 'row center' }, h('button', { class: 'btn big', onclick: start }, cta))),

    h('section', { class: 'promise' },
      logo(true, 'promise-logo'),
      h('h2', {}, 'Your family’s data is never ours.'),
      h('p', {}, 'Each family runs its own copy, on its own accounts. Aangan never sees your tree, your photos or your messages. Even the family sheet you check here stays on your computer.'),
      h('a', { class: 'link light', href: '#privacy' }, 'What we keep when you sign up')),
  );
}

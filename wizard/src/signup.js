// Sign-up before setup, and the privacy note for it.
import { h, people } from './ui.js';
import { signup, me, forget } from './api.js';
import { TRADITIONS } from './landing.js';

const SIZES = [['under-50', 'Under 50 people'], ['50-200', '50 to 200'], ['200-plus', 'More than 200']];
export const CONSENT = 'I agree that Aangan keeps these sign-up details to count who is setting up a family website and to contact me about it. I can delete them any time.';

export function signupPage(go, onSigned) {
  const f = { country: 'India', family_size: '' };
  const err = h('p', { class: 'bad', role: 'alert' });
  const field = (key, label, attrs = {}, hint) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label),
    h('input', { name: key, value: f[key] || '', oninput: (e) => { f[key] = e.target.value; }, ...attrs }), hint ? h('span', { class: 'hint' }, hint) : null);
  const sizes = h('div', { class: 'seg three', role: 'radiogroup', 'aria-label': 'Rough family size' },
    SIZES.map(([v, t]) => h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', onclick: (e) => {
      f.family_size = v; sizes.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-checked', String(b === e.currentTarget)); });
    } }, t)));
  const btn = h('button', { class: 'btn big', type: 'submit' }, 'Sign up and start');
  const form = h('form', { class: 'card signup', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    if (!f.name?.trim()) { err.textContent = 'Please write your name.'; return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((f.email || '').trim())) { err.textContent = 'Please check your email address.'; return; }
    if (!form.querySelector('[name=consent]').checked) { err.textContent = 'Please tick the box to agree, so we can keep your sign-up.'; return; }
    btn.disabled = true; btn.textContent = 'Signing you up…';
    const r = await signup({ ...f, name: f.name.trim(), email: f.email.trim(), consent: true, website: form.querySelector('[name=website]').value });
    btn.disabled = false; btn.textContent = 'Sign up and start';
    if (!r.ok) { err.textContent = r.error; return; }
    onSigned(f.community);
    go('sheet', r.welcomeBack ? 'Welcome back. Let’s carry on.' : r.pending ? 'Thank you. We’ll save your sign-up when your connection allows.' : 'Thank you for signing up. Let’s build your family’s website.');
  } },
    h('div', { class: 'grid2' },
      field('name', 'Your name', { autocomplete: 'name', required: true }),
      field('email', 'Your email', { type: 'email', autocomplete: 'email', required: true }, 'Only to reach you about your setup. Never shared.'),
      field('family_name', 'Your family’s name', { placeholder: 'e.g. Sharma Parivar' }),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Your traditions'),
        h('select', { name: 'community', onchange: (e) => { f.community = e.target.value; } },
          h('option', { value: '' }, 'Choose'), TRADITIONS.map(([id, name]) => h('option', { value: id }, name)))),
      field('city', 'City', { autocomplete: 'address-level2' }),
      field('country', 'Country', { autocomplete: 'country-name', value: 'India' }),
    ),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Roughly how big is your family tree?'), sizes),
    // people never see or fill this; bots do
    h('label', { class: 'hp', 'aria-hidden': 'true' }, 'Website', h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' })),
    h('label', { class: 'tick consent' }, h('input', { type: 'checkbox', name: 'consent' }), h('span', {}, CONSENT, ' ', h('a', { href: '#privacy' }, 'What we keep.'))),
    err,
    h('div', { class: 'row' }, btn),
  );
  return h('section', { class: 'signup-page' },
    h('div', { class: 'split' },
      h('div', {},
        h('h2', {}, 'Let’s set up your family.'),
        h('p', { class: 'lead' }, 'Tell us a little about yourself first. It helps us see who Aangan is reaching, and lets us help if you get stuck. Your family sheet is never sent anywhere.'),
        form),
      h('aside', { class: 'aside' },
        h('div', { class: 'card t-marigold' }, h('h3', {}, 'What happens next.'),
          h('ol', {}, h('li', {}, 'Check your family sheet: it stays on your computer.'), h('li', {}, 'Fill in your settings.'), h('li', {}, 'Press one button to put your site online, or follow the steps by hand.'))),
        h('div', { class: 'card' }, h('h3', {}, 'Already signed up?'), h('p', {}, 'Just fill in the form again with the same email. Nothing is changed.')),
      )),
  );
}

export function privacyPage(go) {
  const s = me();
  const msg = h('p', { class: 'good', role: 'status' });
  return h('section', {},
    h('h2', {}, 'What we keep when you sign up.'),
    h('div', { class: 'card' },
      h('h3', {}, 'Your family’s data: nothing.'),
      h('p', {}, 'Each family’s website runs on that family’s own accounts. We never see its tree, photos, messages or anyone’s details. The family sheet you check on this site is read inside your browser and never sent anywhere.')),
    h('div', { class: 'card' },
      h('h3', {}, 'Your sign-up: only what you type.'),
      h('ul', {},
        h('li', {}, 'Your name and email; your family’s name, traditions, city, country, and rough family size, if you give them; and the words you agreed to.'),
        h('li', {}, 'Which setup steps you reached (for example “checked the family sheet”), so we can see where people get stuck. Never what was in them.'),
        h('li', {}, 'How many people opened each page each day: a count only, with no cookies and nothing about who you are.')),
      h('p', {}, 'Why: to know who Aangan is reaching and to help people who get stuck. We don’t sell it, share it or use it for advertising. It’s stored in a database in Mumbai.')),
    h('div', { class: 'card' },
      h('h3', {}, 'Delete your sign-up.'),
      s ? h('p', {}, `This browser signed up as ${s.name || 'you'}.`) : h('p', {}, 'This browser hasn’t signed up.'),
      s ? h('button', { class: 'btn ghost', onclick: async (e) => {
        if (!confirm('Delete your sign-up? You can sign up again any time.')) return;
        e.target.disabled = true;
        try { await forget(); msg.textContent = 'Deleted. Thank you for trying Aangan.'; e.target.remove(); }
        catch (x) { msg.textContent = x.message; e.target.disabled = false; }
      } }, 'Delete my sign-up') : null,
      msg,
      h('p', { class: 'muted' }, 'Signed up on another browser? Ask in the project’s GitHub Discussions and we’ll delete it.')),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => go('') }, 'Back to the start')),
  );
}

export const peopleBand = () => people('people foot-people');

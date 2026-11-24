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
    title: 'This week in the family.',
    notes: [
      { icon: '🙏', text: 'Bring in your family: Home now suggests your closest relatives who aren’t on the website yet, with a ready-made WhatsApp message to send them.', link: '#/' },
      { icon: '🌳', text: 'Who’s here, by branch: see how many of each branch of the family have joined, and who isn’t on yet.', link: '#/' },
      { icon: '👵', text: 'Set this up for an elder: on the profile of a relative aged 60 or over, a step-by-step guide to get them on from their own phone, with big letters and a QR code to scan.' },
      { icon: 'அ', text: 'Menus in Tamil: Theme → Menus in → தமிழ்.' },
      { icon: '🌿', text: 'Every email from the website now has your veshti or saree border and the mango-leaf thoranam at the top.' },
      { icon: '💌', text: 'Every Sunday morning you’ll get a short email: birthdays and festivals coming up, who joined, and what’s new in Talk and Photos. Turn it off any time in My privacy.', link: '#/privacy' },
      { icon: '📣', text: 'When there’s something important, the admins can now also send it to you by email. You can turn that off in My privacy too.' },
    ],
  },
  {
    date: '2026-11-21',
    title: 'Relationship status.',
    notes: [
      { icon: '💐', text: 'Your profile can show a relationship status: single, engaged, married or widowed. It’s optional, and like every detail you choose who sees it (Edit profile → Relationship status).' },
      { icon: '💍', text: 'Couples can now be shown as engaged, not just married. The tree says “· engaged”, and the Engagement milestone has the date. When they marry, tap Edit on it and switch to Married.' },
      { icon: '💍', text: 'Engaged to someone who isn’t in the tree yet? Add the engagement date and their name. Open your profile, tap Edit profile, and look under Milestones.' },
    ],
  },
  {
    date: '2026-11-17',
    title: 'Fix your own family’s tree details.',
    notes: [
      { icon: '🟢', text: 'The Family tree now shows a small dot beside everyone living: green if they’re on the website, red if they haven’t signed in yet.', link: '#/tree' },
      { icon: '✏️', text: 'You can now correct the name, birth year or passing for yourself and your close family (husband or wife, parents, children, brothers and sisters): open their profile and tap Edit tree details. Every change is shown in Show logs.' },
    ],
  },
  {
    date: '2026-11-16',
    title: 'Children can join, with a parent checking first',
    notes: [
      { icon: '🧒', text: 'Family members under 18 can now have their own login. They can look around everything; what they add waits for a parent’s OK before the family sees it.' },
      { icon: '✅', text: 'Parents: give consent on your child’s page, then approve what they add from the bell or the menu → Waiting for your OK.' },
    ],
  },
  {
    date: '2026-11-16',
    title: 'Get the family app',
    notes: [
      { icon: '📱', text: 'Put the family website on your home screen and it opens like an app, with its own gopuram icon. On your phone you’ll see simple steps (Android has a one-tap Install button).' },
      { icon: '🔔', text: 'The first time you open it from your home screen, you can turn on notifications in one tap.' },
    ],
  },
  {
    date: '2026-11-16',
    title: 'Share a conversation',
    notes: [
      { icon: '🔗', text: 'Tap Share on any conversation in Talk to copy its link or send it on WhatsApp. Only family who have joined can open it, and it opens straight after they sign in.', link: '#/talk' },
    ],
  },
  {
    date: '2026-11-16',
    title: 'More phone notifications',
    notes: [
      { icon: '🔔', text: 'Choose to hear about new conversations and replies in Talk, new family photos, being tagged in a photo, and new details on your close family’s profiles. Each notification says who, never what.', link: '#/privacy' },
      { icon: '⚙️', text: 'Switch each kind on or off in My privacy → Phone notifications.' },
    ],
  },
  {
    date: '2026-11-16',
    title: 'Family news in your bell',
    notes: [
      { icon: '📣', text: 'Notices from the family admins (like a new conversation to join) now show at the top of your bell, and as a phone notification if you’ve turned those on. You can switch “Family news” off in My privacy → Phone notifications.', link: '#/privacy' },
    ],
  },
  {
    date: '2026-11-16',
    title: 'Photos in conversations',
    notes: [
      { icon: '📷', text: 'Add photos to a Talk post or reply with the 📷 button: pick one from Photos or upload a new one.', link: '#/talk' },
      { icon: '🏷️', text: 'Tap a photo in a conversation to see it large, and tag yourself if you’re in it.' },
    ],
  },
  {
    date: '2026-11-16',
    title: 'Notifications on your phone, and a new app icon',
    notes: [
      { icon: '🔔', text: 'Your phone can now tell you when someone writes to you, mentions you in Talk, or it’s a family birthday. Turn it on in **My privacy**. It says who, never what.', link: '#/privacy' },
      { icon: '📱', text: 'On iPhone: add the site to your Home Screen first (Safari → Share → Add to Home Screen), then turn notifications on.' },
      { icon: '🛕', text: 'A new app icon: our gopuram on a kolam. Add the site to your Home Screen to see it.' },
    ],
  },
  {
    date: '2026-11-16',
    title: 'Easier to read and tap, on every phone',
    notes: [
      { icon: '🔠', text: 'Bigger words if you want them: Theme → **Text size** → Large or Larger.' },
      { icon: '📷', text: 'Sharing a photo is clearer, and the sign-in page fits small phones.' },
      { icon: '👪', text: 'Home is much shorter: swipe through the generations and tap one, or search, to see just those people.' },
      { icon: '👓', text: 'Clearer text in every colour and style, light or dark: grey words are darker, and white words on the front page always stand out.' },
      { icon: '👆', text: 'Buttons and links are bigger to tap on phones, and typing in search no longer zooms the page on iPhones.' },
      { icon: '📱', text: 'The front page fits iPads properly, and the installed app turns sideways with your phone.' },
      { icon: '♿', text: 'Works better with screen readers and keyboards.' },
    ],
  },
  {
    date: '2026-11-15',
    title: 'Our traditions, on every page',
    notes: [
      { icon: '🏛️', text: 'Our family as a **gopuram**: seven tiers for seven generations, the founders at the top. Tap a tier to see who’s in it.', link: '#/tree' },
      { icon: '🧵', text: 'A woven border on the front page and under every page title: a mayil kann veshti border for men, a Kanjeevaram saree border with peacocks for women.' },
      { icon: '🌿', text: 'A thoranam of mango leaves and marigolds, faint kolams in the background, and a lamp beside remembrance days.' },
      { icon: '🚪', text: 'The doors open when you arrive.' },
      { icon: '🔤', text: 'Page names in Malayalam and Tamil beside English. Choose under You → Theme → **Names in**.' },
    ],
  },
  {
    date: '2026-11-15',
    title: 'Safer, and a new place to see what’s new',
    notes: [
      { icon: '🎨', text: 'New **Themes**: Light, Dark or Automatic, plus six styles to choose from — Clean, Spotlight, Playful, Instagram, Glass and Aurora. Find them in the menu under You → Theme.' },
      { icon: '📂', text: 'A tidier menu, grouped into Family, Conversations, You and Help, with **My profile** one tap away.' },
      { icon: '🧭', text: 'A **Back** button and a “you are here” trail (like Home › Family tree › your name) at the top of every page, so you always know where you are.' },
      { icon: '✨', text: '**What’s New!** — this page. Every change to the website, in plain words.' },
            { icon: '🛡️', text: 'Invitations from members are now checked by a steward or admin before they work, so nobody can sign in as someone else.', link: '#/help/invite' },
      { icon: '🚪', text: '**Sign out everywhere** in My privacy — handy if you lose a phone or used a shared computer.', link: '#/privacy' },
      { icon: '🖼️', text: 'Photo links now expire after 10 minutes, so a copied link can’t be passed around.' },
      { icon: '✅', text: 'Before approving a request to join, stewards tick “I’ve checked” to confirm they know the person.' },
      { icon: '🔒', text: 'A **Privacy Policy** link is now at the bottom of every page.' },
      { icon: '💾', text: 'The family’s information is backed up every night, and the backup is test-restored every month.' },
    ],
  },
  {
    date: '2026-11-14',
    title: 'Chat, mentions and writing help',
    notes: [
      { icon: '💬', text: '**Messages**: private one-to-one chats with anyone in the family who has joined. Only the two of you can read them.', link: '#/chat' },
      { icon: '🟢', text: 'See **who’s online** right now. You can hide yourself in My privacy.' },
      { icon: '@', text: 'Type **@** in Talk to mention someone. They see it in their bell and get an email (they can turn emails off).' },
      { icon: '✍️', text: '**Help me write** fixes grammar, or makes your message clearer, shorter or warmer. You choose whether to use it.' },
      { icon: '🎤', text: '**Speak**: press the microphone and talk in any language — it’s typed out in English for you. Nothing you say is kept.' },
      { icon: '😊', text: 'An emoji picker in Talk and Messages, and big emoji when a message is only emoji.' },
      { icon: '🎂', text: '**Coming up** now says who each person is to you (with the Tamil word) and has a **Send a wish** button.' },
      { icon: '🏠', text: 'The front page is now called **Home**, with a slideshow of family photos.' },
      { icon: '📜', text: '**Show logs** at the bottom of a profile: see what changed and who changed it.' },
      { icon: '👋', text: 'New members get a welcome message from the family.' },
      { icon: '📱', text: 'On phones, **Messages** is in the bottom bar with a count of unread messages.' },
    ],
  },
  {
    date: '2026-11-13',
    title: 'Talk, the calendar and much more',
    notes: [
      { icon: '🗣️', text: '**Talk**: start a conversation with the whole family, reply, quote and react. YouTube links play right there.', link: '#/talk' },
      { icon: '📅', text: '**Calendar**: Tamil dates, nakshatram and tithi, festivals, birthdays, remembrance days and wedding anniversaries.', link: '#/calendar' },
      { icon: '📸', text: '**Photos**: share family photos and tag people. A tag only shows once that person says yes.', link: '#/photos' },
      { icon: '🔔', text: 'The **bell** shows what’s new for you: replies, mentions, new members and more.' },
      { icon: '🌳', text: 'A full-screen family tree on phones, and a bottom bar to get around quickly.', link: '#/tree' },
      { icon: '👪', text: 'Families who married in now appear in the tree too, through the spouse.' },
      { icon: '🙏', text: 'Gothram, sutram, vedam and kuladeivam are worked out through the family, and Tamil kinship words (Athimber, Chithi…) are shown.' },
      { icon: '💌', text: 'Anyone in the family can **invite** a relative, with a personal link to share on WhatsApp.', link: '#/help/invite' },
      { icon: '🙋', text: 'Not invited yet? You can **ask to join**, and a steward will check and let you in.' },
      { icon: '🔑', text: 'Sign in with **Google**, **Microsoft** (Outlook, Hotmail) or **Yahoo**, or with a link sent to your email.' },
      { icon: '🇮🇳', text: 'Signing in now works on Indian networks that were blocking it.' },
      { icon: '📖', text: 'A **Family** page with the family story, our roots and traditions.' },
      { icon: '🎨', text: 'Pick a **colour** for the website: blue, kumkum, turmeric, peacock, tulsi or lotus.' },
      { icon: '❓', text: '**Help & FAQ**, and a “?” next to each page title for help right where you are.', link: '#/help' },
      { icon: '📲', text: '**Install** the website on your phone’s home screen like an app.' },
      { icon: '📧', text: 'Friendly welcome emails, and birthday and remembrance reminders for the admins.' },
    ],
  },
  {
    date: '2026-11-12',
    title: 'The family website is born',
    notes: [
      { icon: '🌱', text: 'Our private family website: **141 people across 7 generations**, brought over from the Family Echo tree.' },
      { icon: '👤', text: 'Find yourself, **claim your profile** and fill in your details.' },
      { icon: '🔐', text: 'You decide who sees each detail: the whole family, close family, or only you. Nothing is shown until you agree.', link: '#/privacy' },
      { icon: '🧭', text: '**How are we related?** — pick any two people and see how they’re connected.', link: '#/related' },
      { icon: '🧒', text: 'Children’s contact details are never shown, and a parent decides for them.' },
    ],
  },
];

/** The newest release date; used for the "new" dot until someone opens What's New!. */
export const LATEST = RELEASES[0].date;
const SEEN_KEY = 'fam.whatsnew.seen';
export function hasUnseen(): boolean {
  try { return (localStorage.getItem(SEEN_KEY) || '') < LATEST; } catch { return false; }
}
export function markSeen() {
  try { localStorage.setItem(SEEN_KEY, LATEST); } catch { /* private mode: no dot, no harm */ }
}

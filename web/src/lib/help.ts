/**
 * Help and FAQ: short answers to "how do I…?", grouped by the part of the site they belong to.
 * Shown in the "?" tips next to each page's title (HelpTip) and on the Help page (#/help).
 * Answers use the family-story formatting (**bold**). Keep them true to what the site does.
 */
import type { Role } from './types';
import { ADMIN as SITE_ADMIN, APP_NAME, DOMAIN, EMAIL_FROM, FAMILY } from './site';

export type HelpSection =
  | 'start' | 'family' | 'profile' | 'corrections' | 'privacy' | 'tree' | 'related' | 'calendar'
  | 'talk' | 'chat' | 'photos' | 'invite' | 'signin' | 'phone' | 'stewards' | 'admin';

export const SECTION_LABEL: Record<HelpSection, string> = {
  start: 'Getting started', family: 'The Home page', profile: 'Your profile', corrections: 'Corrections',
  privacy: 'Privacy', tree: 'Family tree', related: 'How are we related?', calendar: 'Calendar', talk: 'Talk', chat: 'Messages and who’s online',
  photos: 'Photos', invite: 'Inviting relatives', signin: 'Signing in', phone: 'On your phone',
  stewards: 'For stewards', admin: 'For admins',
};

export interface HelpItem { id: string; section: HelpSection; q: string; a: string; roles?: Role[] }

const STEWARD: Role[] = ['steward', 'admin'];
const ADMIN: Role[] = ['admin'];

export const HELP: HelpItem[] = [
  { id: 'chat-online', section: 'chat', q: 'How do I see who’s online?', a: 'Tap the green dot next to the bell at the top. It lists who has the site open right now, who was here earlier this week, and everyone else who has joined. A green dot means online now.' },
  { id: 'chat-start', section: 'chat', q: 'How do I send someone a private message?', a: 'Tap **Message** next to their name in the online list or on their profile, or open Messages (the speech bubble at the top, or **Messages** at the bottom on a phone) and tap **New message**. Only relatives who have joined can get messages.' },
  { id: 'chat-admin', section: 'chat', q: 'Who is “Family Admin” in my messages?', a: 'That’s the family site’s own admin account, used for notices and help about the site. It isn’t a person in the tree. You can reply to it like any other message, and the admins will see your reply.' },
  { id: 'chat-private', section: 'chat', q: 'Who can read my messages?', a: 'Only you and the person you’re talking to. Admins can’t read them on the site. You can delete a message you sent: tap it and choose **Delete for both**.' },
  { id: 'chat-hide', section: 'chat', q: 'Can I hide when I’m online?', a: 'Yes. In My privacy, untick **Show when I’m online**. Then nobody sees you as online or when you were last here, and you won’t see that for others either.' },
  // getting started
  { id: 'what', section: 'start', q: 'What is this website?', a: `A private home online for the ${FAMILY} family: the family tree, a calendar with family days and the festivals you keep, photos and conversations. Only invited family can sign in, and nothing on it is public.` },
  { id: 'first', section: 'start', q: 'I’ve just joined. What should I do first?', a: 'Open your profile (tap your initial at the top right, or your card on the Home page) and choose **Set up your profile**. Agree to the short privacy note, then add a photo, your city and anything else you’d like to share. Each detail has its own privacy setting.' },
  { id: 'find', section: 'start', q: 'How do I find someone?', a: 'Use **Find a person** at the top, or the search on the Family tree page. You can search by name or city. Tap a name to open their profile.' },
  { id: 'bell', section: 'start', q: 'What does the bell show?', a: 'What’s new since you last looked: who joined, new details you can see, photos you’re tagged in, new conversations and replies in conversations you’re part of.' },
  { id: 'colour', section: 'start', q: 'Can I change the colours, or use dark mode?', a: 'Yes. In the menu, under You, tap **Theme**. Choose **Light**, **Dark** or **Automatic** (follows your phone), then a colour dot or a style: **Clean**, **Spotlight**, **Playful**, **Instagram**, **Glass** or **Aurora**. It’s remembered on your account.' },
  { id: 'whereami', section: 'start', q: 'How do I know where I am, or go back?', a: 'The bar at the top of every page shows where you are, like Home › Family tree › a name. Tap any part of it to go there, or tap **Back** to return to the page you were on.' },
  { id: 'under-18', section: 'start', q: 'I’m under 18. What can I do on the site?', a: 'You can look around everything the family shares: the tree, Talk, Photos and the calendar. When you add something (a detail on your page, a conversation, a reply or a photo), a parent checks it first, and once they say OK it appears with your name. See what’s waiting in the menu → **Waiting for a parent**. A parent also gives consent for your page, and phone numbers, emails and addresses aren’t kept for anyone under 18.' },
  { id: 'child-approve', section: 'start', q: 'My child is under 18 and has joined. What do I need to do?', a: 'First, open their page and give consent as their parent, so the family can see it. After that, anything they add waits for you: you get a notification, and it shows in the bell and in the menu → **Waiting for your OK**. Tap **Approve** to publish it under their name, or **Decline** to delete it (nobody else ever sees it).' },
  { id: 'get-app', section: 'start', q: 'How do I get the family app on my phone?', a: `There’s nothing to download. Open ${DOMAIN} on your phone. On iPhone or iPad: in Safari, tap Share, then **Add to Home Screen**, then **Add**. On Android: in Chrome, tap ⋮, then **Install app** (or **Add to Home screen**). From then on, open ${APP_NAME} from your home screen: it opens full screen like an app and can send you notifications. If you opened the link inside WhatsApp, first open it in Safari or Chrome. You can also tap **Add to home screen** in the menu for the steps.` },
  { id: 'notifications', section: 'start', q: 'Can my phone tell me when someone writes to me?', a: 'Yes. Open the menu → You → **My privacy** → Phone notifications and tap **Turn on notifications**. On iPhone and iPad, first add the site to your Home Screen (in Safari: Share → Add to Home Screen), then open it from there. You choose what to get: private messages, mentions and photo tags, new details from your close family, new conversations and replies in Talk, new photos, family news from the admins, birthdays and remembrance days, festival days. Quiet hours hold everything except messages from 10 pm to 7 am. A notification says who, never what. Tap **Send me a test** to check it works.' },
  { id: 'text-size', section: 'start', q: 'Can I make the words bigger?', a: 'Yes. Open the menu, then You → **Theme** → **Text size** and choose Large or Larger. Words, buttons and spacing all grow together. It is remembered on each phone or computer separately. In the calendar and the family tree, the arrow keys move between days and people.' },
  { id: 'traditions-look', section: 'start', q: 'What are the borders and the art in the background?', a: 'The site is dressed in your traditions: a woven border from your community’s dress (a phulkari, a Paithani, a Kanjeevaram saree…), and faint floor art behind the pages: kolam for South Indian families, rangoli for North and West Indian ones, alpana for Bengal, Odisha and Assam, a jali lattice for Muslim and Kashmiri families, a vine for Christian ones. The generations are a gopuram for South Indian families and a banyan tree for everyone else. With South Indian traditions, page names also show in Malayalam and Tamil. Change them in the menu under You → **Theme**: **Border**, **Names in** and **Background art**.' },
  { id: 'whatsnew', section: 'start', q: 'How do I find out what’s new on the website?', a: 'Open **What’s New!** in the menu (under **More** on a phone). It lists every change since the website began, newest first, in plain words. A blue dot appears next to it when something new is added.' },
  { id: 'signout', section: 'start', q: 'How do I sign out?', a: 'Tap **Sign out** (in red) at the bottom of the menu, or at the bottom of your own profile. On a phone, the menu is under **More**.' },

  // family page
  { id: 'fam-wish', section: 'family', q: 'How do I wish someone on their birthday or anniversary?', a: 'On the Home page, Coming up shows who each person is to you (with the family word in your traditions, like Didi, Mama or Athai). Tap **Send a wish** next to anyone who has joined: Messages opens with a wish already written to them. Change it if you like, add emoji, and send.' },
  { id: 'fam-tiles', section: 'family', q: 'What are the tiles on the Home page?', a: 'A quick overview: you, what’s coming up, the latest conversations and photos, our story, our roots and the generations. Tap a tile to jump to its full section below.' },
  { id: 'fam-coming', section: 'family', q: 'Where do "Coming up" dates come from?', a: 'From birthdays, remembrance days and wedding anniversaries recorded on profiles, for people who have shared them with the family. Add your own birth date on your profile to appear.' },
  { id: 'fam-story', section: 'family', q: 'Who writes the family story and the family photo?', a: 'The admins. If you have a story, a correction or an old photo to add, share it in **Talk** or send it to an admin.' },

  // profile
  { id: 'edit', section: 'profile', q: 'How do I add or change my details?', a: 'Open your profile and tap **Edit profile** (or **Add photo & details**). Change what you like, choose who can see each item, and tap **Save**.' },
  { id: 'photo', section: 'profile', q: 'How do I add or change my photo?', a: 'On your profile, tap **Edit profile**, then choose a photo at the top and **Save**. Location data is removed from the photo before it’s uploaded. Tap **Remove** to take it down.' },
  { id: 'logs', section: 'profile', q: 'Can I see who changed a profile?', a: 'Yes. At the bottom of every profile, tap **Show logs**. Each change says whether something was added, modified or deleted, what changed, who made it and when. Details you aren’t allowed to see stay hidden in the log too.' },
  { id: 'name', section: 'profile', q: 'How do I change my name or birth year?', a: 'Names, birth years and relationships are part of the family tree, so a **steward** or **admin** changes them. On your profile, tap **Suggest a correction** and tell us what to change.' },
  { id: 'wedding', section: 'profile', q: 'How do we add our wedding date?', a: 'On your profile, under **Milestones**, tap **Add the date** next to Wedding (or **Add wedding date** on the **Calendar** page). Either of you can set it. It appears on the calendar as your anniversary.' },
  { id: 'gothram', section: 'profile', q: 'Why does my profile show a gothram I didn’t enter?', a: 'Gothram, sutram, vedam and kuladeivam follow the family tradition: sons and unmarried daughters carry their father’s, and a married woman takes her husband’s family’s. If yours is different, add it on your profile and your own entry wins.' },
  { id: 'others', section: 'profile', q: 'Can I fill in details for my parents or children?', a: 'Yes, for close family who **haven’t joined** yet, and for relatives who have passed away. Open their profile and tap **Edit profile**. Once someone joins, their profile is theirs to edit. Parents look after children’s profiles until 18.' },
  { id: 'star', section: 'profile', q: 'How do I add my nakshatram or shraddham tithi?', a: 'In **Edit profile**, under traditions, pick the month and the star (or tithi). The calendar then shows your star birthday (with Tamil or Malayalam traditions), or the shraddh, each year.' },

  // corrections
  { id: 'wrong', section: 'corrections', q: 'Something in the tree is wrong. How do I get it fixed?', a: `Open the person’s profile and tap **Suggest a correction**. It opens WhatsApp with a message to the family admin, ready to fill in. For yourself and your close family (husband or wife, parents, children, brothers and sisters) you can fix a name, birth year or passing yourself with **Edit tree details**. Stewards and admins can fix anyone.` },
  { id: 'missing', section: 'corrections', q: 'Someone is missing from the tree. How do I add them?', a: 'Ask a steward or admin: they open a relative’s profile and choose **Add a relative** (parent, child, husband or wife, brother or sister). Or use **Suggest a correction** on the nearest relative’s profile.' },
  { id: 'passed', section: 'corrections', q: 'How do we record that someone has passed away?', a: 'Close family (or a steward or admin) opens their profile, taps **Edit tree details**, and adds the date of passing. If they had joined the site, a steward or admin does this. Their remembrance day then appears on the calendar.' },
  { id: 'fixmine', section: 'corrections', q: 'A detail about me is wrong.', a: 'If it’s a detail on your profile (city, work, phone…), tap **Edit profile** and change it. If it’s your name, birth year or a relationship, tap **Suggest a correction**.' },

  // privacy
  { id: 'levels', section: 'privacy', q: 'Who can see my details?', a: 'You choose for each detail: **Family** (everyone signed in), **Close family** (parents, children, brothers and sisters, husband or wife and their households) or **Only me**. Change it any time in **Edit profile**.' },
  { id: 'real-or-fake', section: 'privacy', q: 'How do I know a message is really from the family website?', a: `Real emails come only from ${EMAIL_FROM}, and every link in them goes to ${DOMAIN} (check the address before you tap). We never ask for a password, a code, bank details or money, and never ask you to install anything, do a “prove you’re human” check or copy and run a command. Nobody can send email pretending to be ${DOMAIN}: other email services reject it. If something looks odd, don’t tap anything: message **Family Admin** in Messages, or WhatsApp ${SITE_ADMIN.short}.` },
  { id: 'signout-all', section: 'privacy', q: 'I lost my phone. How do I sign out of it?', a: 'Open **My privacy** and tap **Sign out everywhere**. It ends your sign-in on every phone and computer, including the one you’re using; then sign straight back in. An admin can also pause your account.' },
  { id: 'hidden', section: 'privacy', q: 'Why are some details hidden until I agree?', a: 'Your details are shown to others only after you agree to the family privacy note. Until then the family sees just your name and relationships.' },
  { id: 'withdraw', section: 'privacy', q: 'How do I hide everything or delete my data?', a: 'Open **My privacy**. **Withdraw consent** hides your details from the family straight away. **Download data** gives you a copy. **Delete** asks the admins to remove your details.' },
  { id: 'children', section: 'privacy', q: 'How are children protected?', a: 'No phone numbers, emails or addresses are kept for anyone under 18, and a parent gives consent for their child’s details and photo.' },
  { id: 'public', section: 'privacy', q: 'Can strangers or Google see this site?', a: 'No. Every page needs a family sign-in, nothing is public or searchable, and the connection is encrypted (HTTPS).' },

  // tree
  { id: 'tree-dots', section: 'tree', q: 'What do the green and red dots in the tree mean?', a: 'A green dot means that person has signed in to the website. A red dot means they haven’t yet. Only living people have a dot. If someone close to you has a red dot, open their page to invite them.' },
  { id: 'tree-me', section: 'tree', q: 'How do I find myself in the tree?', a: 'Tap **Show me**. You (and your line) are highlighted. **Expand all** opens every branch; **Collapse** closes them again.' },
  { id: 'tree-numbers', section: 'tree', q: 'What do the numbers next to names mean?', a: 'How many descendants that person has in the tree. Tap the arrow to open the branch.' },
  { id: 'tree-inlaws', section: 'tree', q: 'Where are the families we married into?', a: 'In-law families are reached through the person who married in: open their profile to see their parents and siblings.' },

  // related
  { id: 'rel-how', section: 'related', q: 'How do I see how two people are related?', a: 'Pick the first person (it starts with you), then the second. You’ll see the relationship in English, the word you’d use in your traditions (Chacha, Mausi, Athai…), and the path through the tree.' },
  { id: 'rel-tamil', section: 'related', q: 'The family word looks wrong.', a: 'Family words depend on whether a relative is on your mother’s or father’s side, older or younger, and on your community. Pick yours in the menu under **Theme** → **Traditions**. If a word still looks wrong, tell us in **Talk** so we can correct it.' },

  // calendar
  { id: 'cal-what', section: 'calendar', q: 'What’s on the calendar?', a: 'The date in your own calendar (Tamil, Malayalam, Bengali, lunar or Hijri), nakshatra and tithi for every day, the festivals you keep, and our family days: birthdays, star birthdays, wedding anniversaries, remembrance days and shraddhs.' },
  { id: 'cal-missing', section: 'calendar', q: 'Why isn’t someone’s birthday showing?', a: 'Either their birth date isn’t recorded, or they’ve kept it to close family or to themselves. Living people’s dates show only after they’ve agreed to share.' },
  { id: 'cal-day', section: 'calendar', q: 'How do I see details for a day?', a: 'Tap the day. You’ll see its date in your calendar, star, tithi, festivals and family occasions. **Today** brings you back to the current month.' },

  // talk
  { id: 'talk-mention', section: 'talk', q: 'How do I mention someone?', a: 'While writing in Talk, type @ and the first letters of their name, then pick them from the list (or tap the @ button). Their name shows as a link to their profile. If they’ve joined, it appears in their bell and they get a short email.' },
  { id: 'talk-writehelp', section: 'talk', q: 'Can the site help me write a message?', a: 'Yes. Write what you want to say, even roughly, then tap the ✨ button (**Help me write**) and choose **Fix grammar**, **Make it clearer**, **Shorter** or **Warmer**. You’ll see the new version first: **Use this** puts it in the box, **Keep mine** leaves your words as they were. It works in Talk, replies and Messages. Nothing is sent until you press send, and nothing is saved.' },
  { id: 'talk-speak', section: 'talk', q: 'Can I speak instead of typing?', a: 'Yes. Press and hold the 🎤 microphone button, speak in any language (Tamil, Malayalam, Hindi, English or a mix), then let go. A moment later the English text appears in the box for you to check and change before you send it. On a computer, click the microphone once to start and **■ Stop** when you’re done. The first time, your browser asks to use the microphone: choose Allow. The recording is only used to write the text and isn’t kept.' },
  { id: 'notify-everyone', section: 'admin', q: 'How do I tell everyone about something new?', a: 'Admin → Messages → Send a notification. Choose **Everyone** or **Choose people**, pick what it opens (a conversation or a page), write a short title and text, and press **Notify everyone** (or Notify … people). It goes to the top of their bell, and anyone with phone notifications on gets it on their phone (in the morning if it’s their quiet hours). Tick **Also email them** to send it by email too (at most two emailed notices a day). You can send up to 10 a day.', roles: ADMIN },
  { id: 'talk-share', section: 'talk', q: 'Can I share a conversation on WhatsApp?', a: 'Yes. Open the conversation and tap **Share** (under the post). **Copy link** copies the address; **Send on WhatsApp** opens WhatsApp with a short message you can change first. Only family members who have joined can open it; anyone else is asked to sign in or ask to join, and after signing in the conversation opens straight away.' },
  { id: 'talk-photos', section: 'talk', q: 'Can I add photos to a conversation?', a: 'Yes. While writing, tap the 📷 button. Choose **From Photos** to pick a picture already shared, or **Upload new**, add a caption and press **Add to post**. A new photo is also saved in Photos. The photo appears where its line is in your text; press **Preview** to see it. Everyone sees it the same way as in Photos: if someone in it chose to hide it, it doesn’t show. Tap a photo to see it large, and tap **Are you in it? Tag yourself** to add your name.' },
  { id: 'talk-mention-email', section: 'talk', q: 'Can I stop the emails when someone mentions me?', a: 'Yes. Open My privacy and untick **Email me when someone mentions me in Talk**. Mentions still show in your bell.' },
  { id: 'bring-family', section: 'family', q: 'How do I bring a relative onto the website?', a: 'On Home, **Bring in your family** suggests your closest relatives who aren’t on yet. **Ask on WhatsApp** sends them the join link: they sign in, fill in a short form, and a steward lets them in. If you know their email, **Invite by email** lets them straight in. **Who’s here, by branch** on Home shows how many of each branch have joined; tap a branch to see who isn’t on yet.' },
  { id: 'elder-setup', section: 'family', q: 'How do I set up the website for an elder?', a: 'Open their profile and tap **Set this up for …** (it shows for relatives aged 60 and over who haven’t joined). Sit with them and use their phone: invite them with their email, then point their phone camera at the QR code (or send the link on WhatsApp). The website opens on their phone with large text, and with the menus in your traditions’ language if you tick that box (for example Menus in Hindi). Sign in together, then add it to their home screen.' },
  { id: 'menus-tamil', section: 'start', q: 'Can I see the menus in my language?', a: 'Yes. Open the menu, tap **Theme**, choose your **Traditions** (Hindi, Punjabi, Bengali, Marathi, Gujarati, Urdu, Tamil, Telugu, Kannada or Malayalam), then under **Menus in** pick your language. The menu, the bottom bar and the “you are here” bar change on this phone or computer. The pages are still in English for now.' },
  { id: 'traditions', section: 'start', q: 'Can I choose my own traditions?', a: 'Yes, and so can everyone, because married-in families bring their own. Open the menu, tap **Theme**, and pick **Traditions**. Family words, menus, the calendar and festivals follow your choice on this phone or computer. Tap **Festivals in the calendar** to add or remove festival groups (for example Sikh, Muslim or Christian days).' },
  { id: 'weekly-email', section: 'privacy', q: 'What is the “This week in the family” email?', a: 'A short email on Sunday mornings with the birthdays, remembrance days and festivals coming up that week, who joined the website, new conversations in Talk and new photos. It only has what every member can already see on the website. Don’t want it? Open My privacy and untick **This week in the family**.' },
  { id: 'news-email', section: 'privacy', q: 'Can I stop the family news emails?', a: 'Yes. Open My privacy and untick **Family news by email**. The news still shows in your bell.' },
  { id: 'talk-start', section: 'talk', q: 'How do I start a conversation?', a: 'Tap **Start a conversation**, pick a topic (traditions, recipes, festivals, news…), write your message and tap **Send**. Need an idea? Pick one from the suggestions.' },
  { id: 'talk-reply', section: 'talk', q: 'How do I reply or react?', a: 'Open a conversation and write at the bottom, then **Reply**. Tap an emoji under any message to react. Use the quote button to reply to a particular message.' },
  { id: 'talk-video', section: 'talk', q: 'Can I share a YouTube video?', a: 'Yes. Paste the YouTube link into your message. It shows as a video that plays right here when tapped, without leaving the site.' },
  { id: 'talk-edit', section: 'talk', q: 'Can I edit or delete what I wrote?', a: 'Yes: **Edit** or **Delete** appear on your own messages.' },
  { id: 'talk-who', section: 'talk', q: 'Who can read conversations?', a: 'Every family member who has joined. Nobody else.' },

  // photos
  { id: 'ph-share', section: 'photos', q: 'How do I share a photo?', a: 'Tap **Share a photo**, choose it, add a caption and tag who’s in it, then **Share**. Location data is removed before it’s uploaded.' },
  { id: 'ph-tag', section: 'photos', q: 'Someone tagged me. What do I do?', a: 'You’ll see it in the bell and on the photo. **Show everyone** approves the tag; **Hide this photo** hides it from everyone except you, the person who shared it and the admins.' },
  { id: 'ph-delete', section: 'photos', q: 'How do I delete a photo I shared?', a: 'Open it and tap **Delete**. Only the person who shared it, or an admin, can delete it.' },

  // invite
  { id: 'inv-how', section: 'invite', q: 'How do I invite a relative?', a: 'Open their profile and tap **Invite**, or use **Bring the family in** on the Home page. Enter their email. A steward or admin checks the email is really theirs first (you’ll see **Waiting for approval**); once it’s approved, choose **Share again** to send their personal link on WhatsApp or email them a sign-in link.' },
  { id: 'inv-why-approve', section: 'invite', q: 'Why does my invitation need approval?', a: 'So nobody can invite an email they control and sign in as someone else. A steward or admin checks the email belongs to that relative, usually within a day. Invitations sent by stewards and admins work straight away.' },
  { id: 'inv-noemail', section: 'invite', q: 'I don’t know their email address.', a: `Send them the family link **${DOMAIN}/#/join**. They sign in with any email they use and ask to join; a steward checks and lets them in.` },
  { id: 'inv-resend', section: 'invite', q: 'They didn’t get the email.', a: 'Ask them to check spam or Promotions. Then use **Resend email** next to the invitation, or **Share again** to send their link on WhatsApp.' },

  // sign-in
  { id: 'si-ways', section: 'signin', q: 'How do I sign in?', a: 'With Google, Microsoft (Outlook, Hotmail, Live), Yahoo, or an email link. There’s no password. Use the email address you were invited with.' },
  { id: 'si-link', section: 'signin', q: 'My email link says it has expired.', a: 'Links work once and only for a short while. Ask for a new one and tap it straight away. Some email apps open links to check them, which can use them up.' },
  { id: 'si-whatsapp', section: 'signin', q: 'Google sign-in doesn’t work from WhatsApp.', a: 'Google blocks sign-in inside WhatsApp’s own browser. Tap ⋮ (or Share) and choose **Open in Chrome** or **Open in Safari**, then sign in.' },
  { id: 'si-noinvite', section: 'signin', q: 'It says I’m not invited.', a: 'You may have signed in with a different email from the one you were invited with. Sign out and try that one, or fill in the short form to ask to join.' },

  // phone
  { id: 'app', section: 'phone', q: 'Can I keep it on my phone like an app?', a: `Yes. Open ${DOMAIN} in Chrome (Android) or Safari (iPhone) and choose **Add to Home screen**. It opens full-screen, like an app.` },
  { id: 'menu', section: 'phone', q: 'Where is the menu on my phone?', a: 'Use the tabs at the bottom: Family, Tree, Talk, Me, and **More** for everything else.' },

  // stewards
  { id: 'st-decided', section: 'stewards', q: 'Who approved or declined a request to join?', a: 'Admin → **Requests to join** → **Decided**. Each request shows who approved or declined it, and when.', roles: STEWARD },
  { id: 'st-what', section: 'stewards', q: 'What can a steward do?', a: 'Approve requests to join, add and correct people and relationships in the tree, and fill in details for anyone who hasn’t joined yet or has passed away. Once someone joins, their profile is theirs.', roles: STEWARD },
  { id: 'st-approve', section: 'stewards', q: 'How do I approve a request to join?', a: 'Open **Requests to join**. Check who they are (call or WhatsApp if unsure), pick them in the tree from the suggestions or the search, tick that you’ve checked it’s really them, and tap **Approve**. They get a welcome email. **Decline** lets you leave a short note.', roles: STEWARD },
  { id: 'st-invites', section: 'stewards', q: 'How do I approve an invitation a member sent?', a: 'You’re emailed when one arrives. Open **Requests to join**: **Invitations to approve** lists each relative, the email and who invited them. If the email is theirs, tap **Approve invitation**; if not, **Decline**.', roles: STEWARD },
  { id: 'st-add', section: 'stewards', q: 'How do I add a relative or fix the tree?', a: 'Open a profile and use **Add a relative** or **Edit tree details**. Only admins can remove people or relationships.', roles: STEWARD },
  { id: 'st-noemail', section: 'stewards', q: 'Who still needs inviting?', a: '**No email yet** lists living adults who haven’t joined or been invited, with relatives who could ask them. **Copy list** or **Send on WhatsApp** shares names only.', roles: STEWARD },

  // admins
  { id: 'ad-devcenter', section: 'admin', q: 'Where is the handbook for running the website?', a: 'Open **DevCenter** in the menu (admins only). It has the operations handbook: the services, schedules, releases, what to do when something breaks, and security. Use **Edit** to change a section or **New section** to add one; every change is logged. Never put passwords or keys in it.', roles: ADMIN },
  { id: 'ad-twostep', section: 'admin', q: 'Why do admins need 2-step sign-in, and how do I turn it on?', a: 'Admins can see and change everyone’s details, so a broken-into email account mustn’t be enough to get in. Install Google Authenticator or Microsoft Authenticator on your phone, tap **Turn on 2-step sign-in** (at the top of the page, or in **My privacy**), scan the picture and type the 6-digit code. After that, when you sign in, type the code and tap **Unlock admin tools**. A new admin has 7 days: Family Admin sends a reminder every day, and if it isn’t on by then, admin access is removed automatically (they stay a member, and an admin can give it back once 2-step is on). Lost your phone? Ask another admin to reset it.', roles: ADMIN },
  { id: 'ad-roles', section: 'admin', q: 'How do I make someone a steward or admin?', a: 'Admin → **Members & roles**: choose Member, Steward or Admin next to their name. There’s always at least one admin.', roles: ADMIN },
  { id: 'ad-invite', section: 'admin', q: 'How do I invite someone with a role?', a: 'Admin → **Invitations**: pick them in the tree, enter their email, choose the role and **Save invitation**. Use **Resend email** or **Share** to remind them.', roles: ADMIN },
  { id: 'ad-delete', section: 'admin', q: 'How do I remove someone from the tree?', a: 'Only admins can. Open their profile and tap **Delete**. You’ll see what goes with them (their links, details and photo) and anyone who would be left unconnected; then confirm. People who have joined the site can’t be removed: **Suspend** their account instead. Every removal is listed in **Recent changes**.', roles: ADMIN },
  { id: 'ad-photos', section: 'admin', q: 'How do I change the photos at the top of the Home page?', a: 'On the Home page, tap **Family photos** in the big photo at the top. Add several photos, give each a caption, put them in order and **Save**. They crossfade and move slowly so everyone in a group photo comes into view.', roles: ADMIN },
  { id: 'ad-broadcast', section: 'admin', q: 'How do I message everyone, or welcome new people?', a: 'Admin → **Messages**. **Message everyone** sends a private message from you to each person who has joined; write {name} for their first name. Under **Welcome message**, tick the box, choose who it comes from and write the text: everyone who joins then gets it once, automatically.', roles: ADMIN },
  { id: 'ad-replace', section: 'admin', q: 'Someone joined with one email and now signs in with another. What do I do?', a: 'Ask them to request to join with the new email. In **Requests to join**, choose them in the tree; you’ll see they already have a login. Tap **Approve and replace old login**: their place in the tree moves to the new email and the old login is deleted. Their details, consent and role stay.', roles: ADMIN },
  { id: 'ad-suspend', section: 'admin', q: 'How do I pause someone’s account?', a: 'Admin → **Members & roles** → **Suspend**. **Restore** turns it back on.', roles: ADMIN },
  { id: 'ad-story', section: 'admin', q: 'How do I edit the family story, photo or roots?', a: 'On the Home page, use the edit buttons on **Our story**, the family photo and **Our roots**.', roles: ADMIN },
];

/** Topics visible to this role (members don't see steward/admin help). */
export function helpFor(role: Role | null | undefined, section?: HelpSection): HelpItem[] {
  const r = role || 'member';
  return HELP.filter((h) => (!h.roles || h.roles.includes(r)) && (!section || h.section === section));
}

/** Simple search across questions and answers. */
export function searchHelp(items: HelpItem[], q: string): HelpItem[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((h) => { const hay = `${h.q} ${h.a} ${SECTION_LABEL[h.section]}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
}

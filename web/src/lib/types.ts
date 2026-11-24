export type Visibility = 'family' | 'close' | 'private';

export const FIELDS = [
  'known_as', 'birth_date', 'birth_place', 'city', 'work', 'organisation',
  'interests', 'about', 'photo', 'phone', 'email', 'address',
  // Iyer traditions
  'gothram', 'sutram', 'vedam', 'native_place', 'kuladeivam',
  'janma_nakshatram', 'horoscope', 'shraddha_tithi',
  'upanayanam', 'sashtiabdapoorthi', 'bhimaratha_shanti', 'sathabhishekam',
  'engagement', 'engaged_to', 'marital_status',
] as const;
export type FieldName = (typeof FIELDS)[number];
export const CONTACT_FIELDS: FieldName[] = ['phone', 'email', 'address'];

export const DEFAULT_VISIBILITY: Record<FieldName, Visibility> = {
  known_as: 'family', birth_date: 'close', birth_place: 'family', city: 'family', work: 'family',
  organisation: 'family', interests: 'family', about: 'family', photo: 'family',
  phone: 'close', email: 'close', address: 'private',
  gothram: 'family', sutram: 'family', vedam: 'family', native_place: 'family', kuladeivam: 'family',
  janma_nakshatram: 'close', horoscope: 'private', shraddha_tithi: 'family',
  upanayanam: 'family', sashtiabdapoorthi: 'family', bhimaratha_shanti: 'family', sathabhishekam: 'family',
  engagement: 'family', engaged_to: 'family', marital_status: 'family',
};

export const FIELD_LABEL: Record<FieldName, string> = {
  known_as: 'Known as', birth_date: 'Date of birth', birth_place: 'Born in', city: 'Lives in', work: 'What they do',
  organisation: 'Organisation', interests: 'Interests', about: 'Story', photo: 'Photo', phone: 'Phone', email: 'Email',
  address: 'Address', gothram: 'Gothram', sutram: 'Sutram', vedam: 'Vedam', native_place: 'Native place',
  kuladeivam: 'Kuladeivam', janma_nakshatram: 'Janma nakshatram', horoscope: 'Horoscope notes',
  shraddha_tithi: 'Shraddham tithi', upanayanam: 'Upanayanam', sashtiabdapoorthi: 'Shashtiabdapoorthi',
  bhimaratha_shanti: 'Bhimaratha Shanti', sathabhishekam: 'Sathabhishekam',
  engagement: 'Engagement', engaged_to: 'Engaged to', marital_status: 'Relationship status',
};

/** relationship status (0042); the stored value is the key */
export const MARITAL_STATUS: Record<string, string> = {
  single: 'Single', engaged: 'Engaged', married: 'Married', widowed: 'Widowed',   // 0043: no separated/divorced/alliance
};

/** Milestone celebrations, the age at which each is usually held, and how to describe it. */
export const MILESTONES: { field: FieldName; age: number; name: string; about: string }[] = [
  { field: 'sashtiabdapoorthi', age: 60, name: 'Shashtiabdapoorthi', about: '60 years' },
  { field: 'bhimaratha_shanti', age: 70, name: 'Bhimaratha Shanti', about: '70 years' },
  { field: 'sathabhishekam', age: 80, name: 'Sathabhishekam', about: '80 years, a thousand full moons' },
];

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  family: 'Family', close: 'Close family', private: 'Only me',
};

export interface Person {
  id: string;
  given_name: string;
  surname: string;
  birth_surname: string;
  gender: string;
  birth_year: number | null;
  is_living: boolean;
  death_date: string | null;
  death_place: string | null;
  sort_key: string | null;
  created_at?: string;
}
export interface ParentLink { child_id: string; parent_id: string; kind: string }
export interface Partnership {
  id?: number; person_a: string; person_b: string; kind: string;
  is_current: boolean; start_date: string | null; place: string | null;
}
/** What an admin may set on a person in the tree (structural, admin-only). */
export interface PersonInput {
  given_name: string; surname: string; birth_surname: string; gender: string;
  birth_year: number | null; is_living: boolean; death_date: string | null; death_place: string | null;
}
export type RelativeKind = 'parent' | 'child' | 'spouse' | 'sibling';
export interface ProfileField {
  person_id: string; field: FieldName; value: string; visibility: Visibility;
  updated_by?: string | null; updated_at?: string;
}
export type Role = 'admin' | 'steward' | 'member';
export const ROLE_LABEL: Record<Role, string> = { member: 'Member', steward: 'Steward', admin: 'Admin' };
export const ROLES: Role[] = ['member', 'steward', 'admin'];
export const ROLE_HELP: Record<Role, string> = {
  member: 'edits their own profile and close family who haven’t joined; invites relatives',
  steward: 'also edits anyone who hasn’t joined, adds and corrects people in the tree, approves requests to join',
  admin: 'everything, plus roles, settings and removing people',
};
export interface Member { user_id: string; person_id: string | null; role: Role; status: string; created_at?: string;
  /** 0029, admins only: last sign-in and when the welcome email went out (dates only) */
  last_sign_in_at?: string | null; welcome_sent_at?: string | null; app_at?: string | null;
  /** 0046: when they became admin (the 7 days for 2-step count from here) and, for admins viewing Members & roles, whether 2-step is on */
  admin_since?: string | null; two_step?: boolean }
export interface Consent {
  id: string; person_id: string; given_by: string; relation: 'self' | 'guardian' | 'steward';
  policy_version: number; show_photo: boolean; allow_tags: boolean; include_in_exports: boolean;
  granted_at: string; withdrawn_at: string | null;
}
export interface Policy { version: number; body: string; effective_from: string }
export interface Invitation { id: string; email: string; person_id: string | null; role: Role; created_at: string; accepted_at: string | null; invited_by?: string | null;
  /** 0024: null while a member's invitation waits for a steward or admin */
  approved_at?: string | null; code?: string | null }
/** 0024: a member's invitation waiting for a steward or admin to check the email */
export interface InviteToApprove { id: string; person_id: string | null; email: string; invited_by_person: string | null; created_at: string }
export interface DeletionRequest { id: string; person_id: string; reason: string | null; status: string; created_at: string; resolved_at: string | null }
export interface AuditEntry { id: number; actor: string | null; action: string; table_name: string; record_key: string | null; at: string }

/** The family page: story, banner and where the traditions come from. Edited by admins. */
export interface HeroPhoto { path: string; caption?: string | null }
export interface FamilyInfo {
  about: string | null; banner_path: string | null; roots_person_id: string | null;
  /** the Family page slideshow (0016); files in photos/family/ */
  hero_photos?: HeroPhoto[];
  /** 0019: welcome message sent from an admin's account to everyone who joins; {name} = their first name */
  welcome_dm_on?: boolean; welcome_dm?: string | null; welcome_dm_from?: string | null;
  gothram: string | null; sutram: string | null; vedam: string | null; kuladeivam: string | null;
  updated_at?: string;
}
export interface Photo { id: string; path: string; caption: string | null; taken_year: number | null; uploaded_by: string; created_at: string }
export interface PhotoTag { photo_id: string; person_id: string; status: 'pending' | 'approved' | 'declined'; tagged_by: string; created_at: string; decided_at: string | null }
/** Colours change only the accent; styles also change the background and surfaces (0026). */
export const COLOURS = ['blue', 'kumkum', 'turmeric', 'peacock', 'tulsi', 'lotus'] as const;
export const STYLES = ['clean', 'spotlight', 'playful', 'instagram', 'glass', 'aurora'] as const;
export const THEMES = [...COLOURS, ...STYLES] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABEL: Record<Theme, string> = {
  blue: 'Blue', kumkum: 'Kumkum', turmeric: 'Turmeric', peacock: 'Peacock', tulsi: 'Tulsi', lotus: 'Lotus',
  instagram: 'Instagram', glass: 'Glass', aurora: 'Aurora', clean: 'Clean', spotlight: 'Spotlight', playful: 'Playful',
};
export const STYLE_HINT: Record<(typeof STYLES)[number], string> = {
  clean: 'Crisp and neutral, in the style of shadcn/ui', spotlight: 'Glowing edges on a dotted grid, in the style of Magic UI and Aceternity', playful: 'Bold outlines and bouncy cards, in the style of React Bits',
  instagram: 'Sunset gradient, like Instagram', glass: 'Soft frosted glass', aurora: 'Slowly moving northern lights',
};
export const MODES = ['auto', 'light', 'dark'] as const;
export type Mode = (typeof MODES)[number];
export const MODE_LABEL: Record<Mode, string> = { auto: 'Automatic', light: 'Light', dark: 'Dark' };
export interface Prefs { theme: Theme; /** Light / Dark / Automatic (follows the phone), 0026 */ mode?: Mode;
  /** 0028: woven border colour ('' = default for your gender), scripts beside English, kolam background, door welcome */
  border?: string; scripts?: 'both' | 'ml' | 'ta' | 'en'; kolam?: boolean; doors?: boolean; updates_seen_at: string | null; /** others can see when I'm online (0018); default on */ show_online?: boolean; /** email me when someone @-mentions me (0017); default on */ email_mentions?: boolean; /** email me admins' family notices (0048); default on */ email_news?: boolean; /** Sunday email, This week in the family (0049); default on */ email_weekly?: boolean;
  /** 0030 phone notifications, per kind; quiet hours 10 pm–7 am India time (messages still come through) */
  push_messages?: boolean; push_mentions?: boolean; push_occasions?: boolean; push_festivals?: boolean; push_admin?: boolean; push_quiet?: boolean; push_news?: boolean; push_family?: boolean; push_talk?: boolean; push_photos?: boolean; app_at?: string | null }
export interface Join { person_id: string; joined_at: string }

/** Talk: conversation threads */
export const CATEGORIES = ['traditions', 'recipes', 'festivals', 'calendar', 'news', 'general'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  traditions: 'Traditions & rituals', recipes: 'Recipes', festivals: 'Festivals', calendar: 'Tamil calendar', news: 'Family news', general: 'General',
};
export const CATEGORY_ICON: Record<Category, string> = { traditions: '🪔', recipes: '🍛', festivals: '🎉', calendar: '🗓️', news: '📣', general: '💬' };
export interface Thread {
  id: string; title: string; body: string; category: Category; author: string; author_person: string | null;
  pinned: boolean; locked: boolean; reply_count: number; created_at: string; edited_at: string | null; last_activity_at: string;
  mentions?: string[];
}
export interface Post { id: string; thread_id: string; reply_to: string | null; body: string; author: string; author_person: string | null; created_at: string; edited_at: string | null }
export const EMOJIS = ['👍', '❤️', '🙏', '😂', '😮', '👏'] as const;
export type Emoji = (typeof EMOJIS)[number];
export interface Reaction { target_id: string; target_kind: 'thread' | 'post'; thread_id: string; emoji: Emoji; user_id: string; person_id: string | null }
/** light record of recent replies, for the bell */
export interface PostStub { id: string; thread_id: string; author: string; author_person: string | null; created_at: string; reply_to?: string | null; mentions?: string[] }

export interface ConsentChoices { show_photo: boolean; allow_tags: boolean; include_in_exports: boolean }

export interface Snapshot {
  persons: Person[];
  links: ParentLink[];
  partners: Partnership[];
  fields: ProfileField[];
  joined: string[];
  /** people who have actually signed in (0039); joined also counts logins made by a sign-in link that wasn't opened yet */
  signedIn?: string[];
  /** people with an invitation waiting (no emails) */
  invited: string[];
  me: Member | null;
  consents: Consent[]; // consents the viewer may see (their own and people they manage)
  policy: Policy | null;
  info: FamilyInfo | null;
  photos: Photo[];
  tags: PhotoTag[];
  joins: Join[];
  prefs: Prefs;
  threads: Thread[];
  recentPosts: PostStub[];
  /** admins' notices to everyone (Notify everyone), newest first */
  announcements?: Announcement[];
  /** drafts from under-18s waiting for a parent (the child's own, or a parent's children's) */
  childDrafts?: ChildDraft[];
}

export interface ChildDraft { id: string; child_user: string; child_person: string; kind: 'detail' | 'thread' | 'reply' | 'photo'; payload: Record<string, string>; created_at: string }

export interface Announcement { id: string; title: string; body: string; url: string; created_person: string | null; created_at: string; to_persons?: string[] | null }

export interface FieldChange { field: FieldName; value: string; visibility: Visibility }

/** A request to join from someone who signed in without an invitation (0013). */
export interface JoinRequest {
  id: string; user_id: string; email: string; full_name: string; father_name: string; mother_name: string; spouse_name: string;
  city: string; phone: string | null; note: string; status: 'pending' | 'approved' | 'declined'; person_id: string | null;
  decline_note: string | null; created_at: string; decided_at: string | null;
  /** the steward or admin who decided it (0015) */
  decided_by_person?: string | null;
}

/** One change on a person's page, from profile_log() (0015). Values only when the viewer may see them. */
export interface LogEntry {
  at: string; action: 'insert' | 'update' | 'delete';
  kind: 'detail' | 'visibility' | 'hidden' | 'tree' | 'parent' | 'child' | 'spouse' | 'wedding' | 'consent' | 'withdrawn' | 'joined';
  field: string | null; old_value: string | null; new_value: string | null; other: string | null;
  by_person: string | null; by_role: Role | null;
}
export type JoinRequestInput = Pick<JoinRequest, 'full_name' | 'father_name' | 'mother_name' | 'spouse_name' | 'city' | 'note'> & { phone: string };

/** 0018: who's around. seen = their last heartbeat, or null if they (or you) hide online status. */
export interface Heartbeat { people: { p: string; seen: string | null; h?: boolean }[]; unread: number; now: string }
/** 0018: a private one-to-one conversation, as dm_list() returns it */
export interface DmConversation {
  id: string; other_person: string | null; last_message_at: string | null; last_body: string | null;
  last_from_me: boolean | null; unread: number; other_read_at: string;
}
export interface DmMessage { id: string; conversation_id: string; sender: string; body: string; created_at: string }

/** DevCenter: a section of the operations handbook (admins only, table dev_docs). */
export interface DevDoc { id: string; title: string; body: string; sort: number; updated_at: string }

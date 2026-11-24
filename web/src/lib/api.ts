import type {
  AuditEntry, Consent, ConsentChoices, DeletionRequest, FamilyInfo, FieldChange, Category, Emoji, Post, Reaction, Thread, Invitation, JoinRequest, LogEntry, Heartbeat, DmConversation, DmMessage, JoinRequestInput, Member, PersonInput, Role, Prefs, RelativeKind, Snapshot, InviteToApprove, DevDoc } from './types';

/** Everything the website asks of the backend. Supabase in production; an in-memory demo for previews. */
export type WriteStyle = 'grammar' | 'clearer' | 'shorter' | 'warmer';

/** a couple's status in the tree (0041/0042) */
export type CoupleStatus = 'married' | 'engaged';

export interface Api {
  demo: boolean;
  configured: boolean;
  currentEmail(): Promise<string | null>;
  onAuthChange(cb: (email: string | null) => void): () => void;
  signInWithEmail(email: string): Promise<void>;
  /** google, azure (Microsoft: Outlook, Hotmail, Live), apple, or custom:yahoo */
  signInWith(provider: SignInProvider): Promise<void>;
  /** Google Identity Services: exchange Google's ID token for a session */
  signInWithGoogleToken(token: string, nonce: string): Promise<void>;
  signOut(): Promise<void>;
  /** signs this account out on every phone and computer */
  signOutEverywhere(): Promise<void>;
  /** 0046, admins: is an authenticator app set up, and did this session pass its code? */
  twoStep(): Promise<{ enrolled: boolean; aal: 'aal1' | 'aal2' | null; factorId: string | null }>;
  /** start setting up an authenticator app: a QR picture (data: URL) and the key to type by hand */
  twoStepEnroll(): Promise<{ factorId: string; qr: string; secret: string }>;
  /** check a 6-digit code (finishes set-up, or unlocks admin tools in this session) */
  twoStepVerify(factorId: string, code: string): Promise<void>;

  load(): Promise<Snapshot>;
  saveFields(personId: string, changes: FieldChange[]): Promise<void>;
  uploadPhoto(personId: string, file: Blob): Promise<string>;
  photoUrls(paths: string[]): Promise<Record<string, string>>;
  giveConsent(personId: string, relation: Consent['relation'], policyVersion: number, choices: ConsentChoices): Promise<void>;
  withdrawConsent(consentId: string): Promise<void>;
  requestDeletion(personId: string, reason: string): Promise<void>;
  exportMyData(personId: string): Promise<unknown>;
  savePrefs(patch: Partial<Prefs>): Promise<void>;
  /** 0030 phone notifications: this device on/off, my devices (no keys), a test notification */
  pushSubscribe(endpoint: string, p256dh: string, auth: string, device: string): Promise<void>;
  pushUnsubscribe(endpoint?: string): Promise<void>;
  pushDevices(): Promise<{ id: string; device: string; created_at: string; last_ok_at: string | null }[]>;
  pushTest(): Promise<void>;

  // shared photos
  /** Returns the new photo's id. */
  sharePhoto(file: Blob, caption: string, takenYear: number | null, tagIds: string[]): Promise<string>;
  updatePhoto(id: string, patch: { caption: string | null; taken_year: number | null }): Promise<void>;
  deletePhoto(id: string, path: string): Promise<void>;
  addTag(photoId: string, personId: string): Promise<void>;
  decideTag(photoId: string, personId: string, status: 'approved' | 'declined' | 'pending'): Promise<void>;
  removeTag(photoId: string, personId: string): Promise<void>;

  // admins only
  saveFamilyInfo(patch: Partial<FamilyInfo>): Promise<void>;
  uploadBanner(file: Blob): Promise<string>;
  /** Removes a file from the private photos bucket. */
  removeFile(path: string): Promise<void>;
  /** Adds a parent, child, spouse or sibling to `anchor`; returns the new person's id. */
  addRelative(anchor: string, kind: RelativeKind, person: PersonInput, otherParent?: string | null): Promise<string>;
  updatePerson(id: string, patch: Partial<PersonInput>): Promise<void>;
  /** admins only: removes the person, their links and details; refused for anyone who has joined */
  deletePerson(id: string): Promise<void>;
  /** either partner (or their manager) records when and where they married */
  setWedding(a: string, b: string, date: string | null, place: string | null): Promise<void>;
  /** married or engaged, with the wedding or engagement date (0041) */
  setCouple(a: string, b: string, status: CoupleStatus, date: string | null, place: string | null): Promise<void>;

  /** admins only: DevCenter handbook sections, in order */
  listDevDocs(): Promise<DevDoc[]>;
  /** admins only: creates or updates one handbook section */
  saveDevDoc(doc: { id: string; title: string; body: string; sort: number }): Promise<void>;

  // Talk
  getThread(id: string): Promise<{ thread: Thread | null; posts: Post[]; reactions: Reaction[] }>;
  createThread(t: { title: string; body: string; category: Category }): Promise<string>;
  updateThread(id: string, patch: Partial<Pick<Thread, 'title' | 'body' | 'category' | 'pinned' | 'locked'>>): Promise<void>;
  deleteThread(id: string): Promise<void>;
  addPost(threadId: string, body: string, replyTo: string | null): Promise<void>;
  updatePost(id: string, body: string): Promise<void>;
  deletePost(id: string): Promise<void>;
  react(targetId: string, kind: 'thread' | 'post', emoji: Emoji, on: boolean): Promise<void>;

  // invitations: admins see and manage all; members invite relatives (as members) and see only their own
  listInvitations(): Promise<Invitation[]>;
  /** returns the saved invitation (approved at once when a steward or admin sends it) */
  invite(email: string, personId: string | null, role: Role): Promise<Invitation>;
  /** 0024: stewards/admins: members' invitations waiting for a check */
  invitationsToApprove(): Promise<InviteToApprove[]>;
  approveInvitation(id: string): Promise<void>;
  declineInvitation(id: string): Promise<void>;
  /** 0024: signed out: the masked email an invitation link is for ("ra•••@gmail.com"), or null */
  inviteHint(code: string): Promise<string | null>;
  cancelInvitation(id: string): Promise<void>;

  listMembers(): Promise<Member[]>;
  /** requests to join: your own (if you're not a member yet), or all of them for stewards and admins */
  myJoinRequests(): Promise<JoinRequest[]>;
  requestToJoin(r: JoinRequestInput): Promise<void>;
  listJoinRequests(): Promise<JoinRequest[]>;
  approveJoin(id: string, personId: string): Promise<void>;
  /** admins: approve, moving a person who already has a login to this request's login (the old login is deleted) */
  approveJoinReplacing(id: string, personId: string): Promise<void>;
  declineJoin(id: string, note: string): Promise<void>;
  updateMember(userId: string, patch: Partial<Pick<Member, 'role' | 'status' | 'person_id'>>): Promise<void>;
  listDeletionRequests(): Promise<DeletionRequest[]>;
  resolveDeletion(id: string, status: 'done' | 'declined'): Promise<void>;
  listAudit(limit: number): Promise<AuditEntry[]>;
  /** 0018: say I'm here (when here) and get who's around plus my unread message count */
  heartbeat(here: boolean): Promise<Heartbeat>;
  /** open (or start) the private conversation with someone who has joined */
  dmOpen(personId: string): Promise<string>;
  dmList(): Promise<DmConversation[]>;
  /** messages in a conversation, oldest first (only newer than `after` when given) */
  dmMessages(conversationId: string, after?: string): Promise<DmMessage[]>;
  dmSend(conversationId: string, body: string): Promise<void>;
  dmDelete(messageId: string): Promise<void>;
  dmMarkRead(conversationId: string): Promise<void>;
  /** admins: a private message to every active member who has joined ({name} = their first name); returns how many */
  dmBroadcast(body: string): Promise<number>;
  /** Notify everyone (admins): bell + phone notification. */
  /** toPersons: only these people (who have joined); empty = everyone */
  announce(title: string, body: string, url: string, toPersons?: string[], email?: boolean): Promise<{ members: number; phones: number; emails?: number }>;
  announceReach(toPersons?: string[]): Promise<{ members: number; phones: number }>;
  deleteAnnouncement(id: string): Promise<void>;
  /** Under-18s: send something for a parent to check (0034). */
  childSubmit(kind: 'detail' | 'thread' | 'reply' | 'photo', payload: Record<string, string | boolean | number | null>): Promise<string>;
  childDecide(id: string, approve: boolean): Promise<void>;
  childWithdraw(id: string): Promise<void>;
  /** Upload a photo file into the album without sharing it yet (a child's photo waits for a parent). */
  uploadAlbumFile(file: Blob): Promise<string>;
  /** 0021 writing help: the text rewritten in a style (nothing is saved) */
  writeHelp(text: string, style: WriteStyle): Promise<string>;
  /** 0021 speak to write: a short WAV recording → English text, and the language that was spoken */
  speakToText(wav: Blob): Promise<{ text: string; language: string }>;
  /** any member: the history of one person's page, newest first */
  profileLog(personId: string): Promise<LogEntry[]>;
}

export type SignInProvider = 'google' | 'azure' | 'apple' | 'custom:yahoo';
export const PROVIDER_LABEL: Record<SignInProvider, string> = {
  google: 'Google', azure: 'Microsoft (Outlook, Hotmail)', apple: 'Apple', 'custom:yahoo': 'Yahoo',
};
/** Which sign-in buttons to show. Each needs setting up in Supabase first (see README). */
export const SIGNIN_PROVIDERS = ((import.meta.env.VITE_SIGNIN_PROVIDERS as string | undefined) || 'google') // Microsoft and Yahoo need their own app setup: VITE_SIGNIN_PROVIDERS=google,azure,custom:yahoo
  .split(',').map((x) => x.trim()).filter((x): x is SignInProvider => x in PROVIDER_LABEL);

export class ApiError extends Error {
  constructor(message: string, public kind: 'permission' | 'network' | 'other' = 'other') { super(message); }
}

/** Turn backend errors into sentences a relative can act on. */
export function friendly(e: unknown): string {
  const msg = (e as { message?: string })?.message || String(e);
  if (/row-level security|permission denied|not allowed/i.test(msg)) return 'You don’t have permission to change this. Ask a family admin if you think you should.';
  if (/consent can only be withdrawn/i.test(msg)) return msg;
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Couldn’t reach the server. Check your connection and try again.';
  if (/duplicate key|already exists/i.test(msg)) return 'That already exists.';
  if (/Only a family admin|Only a family steward|already been handled|already joined as this person|Choose a living relative|several requests|already a member|Both parents are already|Add their parents first|needs at least one admin|Only the tag|invite|Invite|already joined|Children under 18|living relatives|Choose who you are|25 invitations|approve invitations|decline invitations|Many people have asked|closed for replies|no longer exists|wedding date|recorded as married/i.test(msg)) return msg;
  if (/persons_sort_key_no_date|check constraint/i.test(msg)) return 'That value isn’t in the expected format. Please check it and try again.';
  if (/only request this after|security purposes/i.test(msg)) return 'An email was just sent to this address. Please wait a minute before sending another.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  return msg.length < 160 ? msg : 'Something went wrong. Please try again.';
}

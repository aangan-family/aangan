import { API_URL, FAMILY, PUBLISHABLE_KEY } from './site';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Api } from './api';
import type { Announcement, ChildDraft, Consent, FamilyInfo, Join, LogEntry, Heartbeat, DmConversation, DmMessage, Member, Photo, PhotoTag, Post, PostStub, Prefs, Reaction, Theme, Snapshot, Thread, Invitation, InviteToApprove } from './types';

/**
 * Indian internet providers block *.supabase.co, so the live site talks only to our API address (site.config.json → apiUrl), a plain
 * pass-through to the database (reminders/src/proxy.ts). The production build holds neither the database's
 * own address nor a key that names it: only our API address and the publishable key (public by design;
 * the database's row-level security decides what anyone may see). Local development may point straight
 * at a database with VITE_SUPABASE_URL; that branch is removed from production builds.
 */
export const API_PROXY = (import.meta.env.VITE_SUPABASE_API_URL as string | undefined) || API_URL;
const url = import.meta.env.DEV ? ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || API_PROXY) : API_PROXY;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
  || (import.meta.env.DEV ? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) : undefined) || PUBLISHABLE_KEY;
/** where this device keeps the sign-in (no project name in it) */
const storageKey = 'fam-auth';

/** Keep everyone signed in: move a session saved under the old name (sb-<project>-auth-token) to the new one. */
export function moveOldSession(store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>, to = storageKey) {
  try {
    const old: string[] = [];
    for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && /^sb-[a-z0-9]+-auth-token/.test(k)) old.push(k); }
    for (const k of old) {
      // the session itself moves; leftover sign-in flow notes (…-code-verifier) are simply removed
      const v = /^sb-[a-z0-9]+-auth-token$/.test(k) ? store.getItem(k) : null;
      if (v && !store.getItem(to)) store.setItem(to, v);
      store.removeItem(k);
    }
  } catch { /* storage blocked: nothing to move */ }
}

/** "#/auth?token_hash=…&type=email" from the sign-in emails (links come to our site, not supabase.co). */
export function emailLinkToken(hash: string): { token_hash: string; type: string } | null {
  const m = hash.match(/^#\/auth\?(.*)$/);
  if (!m) return null;
  const p = new URLSearchParams(m[1]);
  const t = p.get('token_hash');
  return t ? { token_hash: t, type: p.get('type') || 'email' } : null;
}

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

/** Supabase returns at most 1000 rows per request; families grow, so page through. */
async function all<T>(sb: SupabaseClient, table: string, columns = '*'): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await sb.from(table).select(columns).range(from, from + 999)) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export function supabaseApi(): Api {
  if (typeof localStorage !== 'undefined') moveOldSession(localStorage);
  const configured = !!(url && key);
  const sb = createClient(url || 'https://not-configured.invalid', key || 'missing', {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey },
  });
  // a sign-in email link: verify its token here, then tidy the address bar
  const link = typeof location !== 'undefined' ? emailLinkToken(location.hash) : null;
  const pending = link
    ? sb.auth.verifyOtp({ token_hash: link.token_hash, type: link.type as 'email' })
      .then(({ error }) => history.replaceState(null, '', location.pathname + (error ? '?error=access_denied&error_code=otp_expired' : '')))
      .catch(() => history.replaceState(null, '', location.pathname + '?error=access_denied&error_code=otp_expired'))
    : Promise.resolve();

  /** writing help runs on our Worker (reminders/src/ai.ts), always via our API address */
  async function aiCall(path: string, body: BodyInit, type: string): Promise<unknown> {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Please sign in again.');
    let r: Response;
    try {
      r = await fetch(API_PROXY + path, { method: 'POST', body, headers: { Authorization: `Bearer ${token}`, apikey: key || '', 'Content-Type': type } });
    } catch { throw new Error('Couldn’t reach writing help. Check your internet and try again.'); }
    const j = await r.json().catch(() => ({})) as { error?: string };
    if (!r.ok) throw new Error(j.error || 'Writing help isn’t available right now.');
    return j;
  }

  return {
    demo: false,
    configured,
    async currentEmail() {
      await pending;
      const { data } = await sb.auth.getSession();
      return data.session?.user.email ?? null;
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session?.user.email ?? null));
      return () => data.subscription.unsubscribe();
    },
    async signInWithEmail(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
    },
    async signInWithGoogleToken(token, nonce) {
      const { error } = await sb.auth.signInWithIdToken({ provider: 'google', token, nonce });
      if (error) throw error;
    },
    async signInWith(provider) {
      // Microsoft, Yahoo and Google's full-page sign-in all finish on our API address (reminders/src/oauth.ts),
      // never on supabase.co (blocked in India, and it would show the database's own address)
      if (url === API_PROXY) {
        const p = provider === 'azure' ? 'azure' : provider === 'custom:yahoo' ? 'yahoo' : 'google';
        location.href = `${API_PROXY}/oauth/${p}/start?return=${encodeURIComponent(location.origin + '/')}`;
        return;
      }
      const { error } = await sb.auth.signInWithOAuth({
        provider: provider as 'google',
        options: { redirectTo: location.origin + location.pathname, ...(provider === 'azure' ? { scopes: 'email' } : {}) },
      });
      if (error) throw error;
    },
    async signOut() { await import('./push').then((p) => p.turnOff({ pushUnsubscribe: async (endpoint?: string) => { await sb.rpc('push_unsubscribe', endpoint ? { endpoint } : {}); } })).catch(() => {}); await sb.auth.signOut(); },
    async twoStep() {
      const [{ data: f }, { data: a }] = await Promise.all([sb.auth.mfa.listFactors(), sb.auth.mfa.getAuthenticatorAssuranceLevel()]);
      const t = (f?.totp || []).find((x) => x.status === 'verified');
      return { enrolled: !!t, aal: (a?.currentLevel as 'aal1' | 'aal2' | null) ?? null, factorId: t?.id ?? null };
    },
    async twoStepEnroll() {
      // clear any half-finished set-up first (a QR that was never confirmed)
      const { data: f } = await sb.auth.mfa.listFactors();
      for (const x of f?.all || []) if (x.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: x.id }).catch(() => {});
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Family website ${new Date().toISOString().slice(0, 10)}`, issuer: FAMILY.slice(0, 40) || 'Family' });
      if (error) throw error;
      return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
    },
    async twoStepVerify(factorId, code) {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\D/g, '') });
      if (error) throw new Error(/invalid|expired/i.test(error.message) ? 'That code didn’t match. Type the 6 digits your app shows now.' : error.message);
    },
    async signOutEverywhere() {
      await sb.rpc('push_unsubscribe', {}).then(() => {}, () => {});
      await import('./push').then((p) => p.turnOff(null)).catch(() => {});
      const { error } = await sb.auth.signOut({ scope: 'global' }); if (error) throw new Error(error.message);
    },
    async load(): Promise<Snapshot> {
      const { data: u } = await sb.auth.getUser();
      const uid = u.user?.id;
      const meRows = uid ? must(await sb.from('members').select('*').eq('user_id', uid)) as Member[] : [];
      const me = meRows[0] || null;
      if (!me || me.status !== 'active') {
        return { persons: [], links: [], partners: [], fields: [], joined: [], invited: [], me, consents: [], policy: null,
          info: null, photos: [], tags: [], joins: [], prefs: { theme: '' as Theme, updates_seen_at: null }, threads: [], recentPosts: [] };
      }
      const since = new Date(Date.now() - 60 * 86400000).toISOString();
      const [persons, links, partners, fields, consents, joined, policies, info, photos, tags, joins, prefs, invited, threads, recentPosts, announcements, childDrafts, signedIn] = await Promise.all([
        all(sb, 'persons'), all(sb, 'parent_links'), all(sb, 'partnerships'), all(sb, 'profile_fields'),
        all<Consent>(sb, 'consents'),
        sb.rpc('joined_people').then((r) => (must(r) as unknown as string[]) || []),
        sb.from('policy_versions').select('*').order('version', { ascending: false }).limit(1).then(must),
        sb.from('family_info').select('*').maybeSingle().then(must),
        all<Photo>(sb, 'photos'), all<PhotoTag>(sb, 'photo_tags'),
        sb.rpc('recent_joins').then((r) => (must(r) as unknown as Join[]) || []),
        sb.from('member_prefs').select('theme,mode,border,scripts,kolam,doors,updates_seen_at,email_mentions,email_news,email_weekly,show_online,push_messages,push_mentions,push_occasions,push_festivals,push_admin,push_quiet,push_news,push_family,push_talk,push_photos,app_at').maybeSingle().then(must),
        sb.rpc('invited_people').then((r) => (must(r) as unknown as string[]) || []),
        sb.from('threads').select('*').order('last_activity_at', { ascending: false }).limit(500).then((r) => (must(r) as Thread[]) || []),
        sb.from('thread_posts').select('id,thread_id,author,author_person,created_at,reply_to,mentions').gt('created_at', since).order('created_at', { ascending: false }).limit(500)
          .then((r) => (must(r) as PostStub[]) || []),
        sb.from('announcements').select('id,title,body,url,created_person,created_at,to_persons').gt('created_at', since).order('created_at', { ascending: false }).limit(20)
          .then((r) => (r.error ? [] : (r.data as Announcement[]) || [])),   // never let the bell's notices stop the site loading
        sb.from('child_drafts').select('id,child_user,child_person,kind,payload,created_at').is('decided_at', null).order('created_at').limit(100)
          .then((r) => (r.error ? [] : (r.data as ChildDraft[]) || [])),
        sb.rpc('signed_in_people').then((r) => (r.error ? undefined : (r.data as unknown as string[]) || [])),   // older database: no dots, nothing breaks
      ]);
      return {
        persons: persons as Snapshot['persons'], links: links as Snapshot['links'], partners: partners as Snapshot['partners'],
        fields: fields as Snapshot['fields'], joined, signedIn, invited, me, consents, policy: (policies as Snapshot['policy'][])[0] || null,
        info: (info as FamilyInfo | null) || null, photos, tags, joins,
        prefs: (prefs as Prefs | null) || { theme: '' as Theme, updates_seen_at: null },
        threads, recentPosts, announcements, childDrafts,
      };
    },

    async saveFields(personId, changes) {
      const removals = changes.filter((c) => !c.value.trim()).map((c) => c.field);
      const upserts = changes.filter((c) => c.value.trim())
        .map((c) => ({ person_id: personId, field: c.field, value: c.value.trim(), visibility: c.visibility }));
      if (upserts.length) must(await sb.from('profile_fields').upsert(upserts, { onConflict: 'person_id,field' }));
      if (removals.length) must(await sb.from('profile_fields').delete().eq('person_id', personId).in('field', removals));
    },

    async uploadPhoto(personId, file) {
      const path = `${personId}/${crypto.randomUUID()}.jpg`;
      must(await sb.storage.from('photos').upload(path, file, { contentType: 'image/jpeg', upsert: false }));
      return path;
    },

    async photoUrls(paths) {
      if (!paths.length) return {};
      const { data, error } = await sb.storage.from('photos').createSignedUrls(paths, 10 * 60)   // 10 minutes (security review M3); the store refreshes them;
      if (error) return {};
      const out: Record<string, string> = {};
      for (const d of data || []) if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
      return out;
    },

    async giveConsent(personId, relation, policyVersion, choices) {
      const { data: u } = await sb.auth.getUser();
      // a new consent replaces the old one: withdraw active ones first
      must(await sb.from('consents').update({ withdrawn_at: new Date().toISOString() }).eq('person_id', personId).is('withdrawn_at', null));
      must(await sb.from('consents').insert({
        person_id: personId, given_by: u.user!.id, relation, policy_version: policyVersion, ...choices,
        user_agent: navigator.userAgent.slice(0, 400),
      }));
    },
    async withdrawConsent(id) {
      must(await sb.from('consents').update({ withdrawn_at: new Date().toISOString() }).eq('id', id));
    },
    async requestDeletion(personId, reason) {
      must(await sb.rpc('request_deletion', { p: personId, why: reason || null }));
    },
    async exportMyData(personId) {
      const [person, fields, consents, links, partners] = await Promise.all([
        sb.from('persons').select('*').eq('id', personId).then(must),
        sb.from('profile_fields').select('*').eq('person_id', personId).then(must),
        sb.from('consents').select('*').eq('person_id', personId).then(must),
        sb.from('parent_links').select('*').or(`child_id.eq.${personId},parent_id.eq.${personId}`).then(must),
        sb.from('partnerships').select('*').or(`person_a.eq.${personId},person_b.eq.${personId}`).then(must),
      ]);
      return { exported_at: new Date().toISOString(), person, details: fields, consents, parent_links: links, partnerships: partners };
    },

    async pushSubscribe(endpoint, p256dh, auth, device) { must(await sb.rpc('push_subscribe', { endpoint, p256dh, auth, device })); },
    async pushUnsubscribe(endpoint) { must(await sb.rpc('push_unsubscribe', endpoint ? { endpoint } : {})); },
    async pushDevices() { return (must(await sb.rpc('push_my_devices')) || []) as { id: string; device: string; created_at: string; last_ok_at: string | null }[]; },
    async pushTest() { must(await sb.rpc('push_test')); },

    async savePrefs(patch) {
      const { data: u } = await sb.auth.getUser();
      must(await sb.from('member_prefs').upsert({ user_id: u.user!.id, ...patch }, { onConflict: 'user_id' }));
    },

    async sharePhoto(file, caption, takenYear, tagIds) {
      const path = `album/${crypto.randomUUID()}.jpg`;
      must(await sb.storage.from('photos').upload(path, file, { contentType: 'image/jpeg', upsert: false }));
      const row = must(await sb.from('photos').insert({ path, caption: caption.trim() || null, taken_year: takenYear }).select('id').single()) as { id: string };
      if (tagIds.length) must(await sb.from('photo_tags').insert(tagIds.map((person_id) => ({ photo_id: row.id, person_id }))));
      return row.id;
    },
    async updatePhoto(id, patch) { must(await sb.from('photos').update(patch).eq('id', id)); },
    async deletePhoto(id, path) {
      await sb.storage.from('photos').remove([path]);
      must(await sb.from('photos').delete().eq('id', id));
    },
    async addTag(photoId, personId) { must(await sb.from('photo_tags').insert({ photo_id: photoId, person_id: personId })); },
    async decideTag(photoId, personId, status) {
      must(await sb.from('photo_tags').update({ status }).eq('photo_id', photoId).eq('person_id', personId));
    },
    async removeTag(photoId, personId) { must(await sb.from('photo_tags').delete().eq('photo_id', photoId).eq('person_id', personId)); },

    async listDevDocs() { return must(await sb.from('dev_docs').select('id,title,body,sort,updated_at').order('sort')) ?? []; },
    async saveDevDoc(doc) { must(await sb.from('dev_docs').upsert(doc)); },
    async saveFamilyInfo(patch) { must(await sb.from('family_info').update(patch).eq('id', true)); },
    async uploadBanner(file) {
      const path = `family/${crypto.randomUUID()}.jpg`;
      must(await sb.storage.from('photos').upload(path, file, { contentType: 'image/jpeg', upsert: false }));
      return path;
    },

    async setWedding(a, b, date, place) { must(await sb.rpc('set_wedding', { a, b, wedding_date: date, wedding_place: place })); },
    async setCouple(a, b, status, date, place) { must(await sb.rpc('set_couple', { a, b, status, on_date: date, at_place: place })); },
    async getThread(id) {
      const [t, posts, reactions] = await Promise.all([
        sb.from('threads').select('*').eq('id', id).maybeSingle().then(must),
        sb.from('thread_posts').select('*').eq('thread_id', id).order('created_at').limit(1000).then(must),
        sb.from('reactions').select('target_id,target_kind,thread_id,emoji,user_id,person_id').eq('thread_id', id).limit(5000).then(must),
      ]);
      return { thread: (t as Thread | null) || null, posts: (posts as Post[]) || [], reactions: (reactions as Reaction[]) || [] };
    },
    async createThread(t) {
      const r = must(await sb.from('threads').insert({ title: t.title.trim(), body: t.body.trim(), category: t.category }).select('id').single()) as { id: string };
      return r.id;
    },
    async updateThread(id, patch) { must(await sb.from('threads').update(patch).eq('id', id)); },
    async deleteThread(id) { must(await sb.from('threads').delete().eq('id', id)); },
    async addPost(thread_id, body, reply_to) { must(await sb.from('thread_posts').insert({ thread_id, body: body.trim(), reply_to })); },
    async updatePost(id, body) { must(await sb.from('thread_posts').update({ body: body.trim() }).eq('id', id)); },
    async deletePost(id) { must(await sb.from('thread_posts').delete().eq('id', id)); },
    async react(target_id, target_kind, emoji, on) {
      if (on) {
        const { error } = await sb.from('reactions').insert({ target_id, target_kind, emoji, thread_id: target_id });
        if (error && error.code !== '23505') throw error; // already reacted: fine
      } else {
        const { data: u } = await sb.auth.getUser();
        must(await sb.from('reactions').delete().eq('target_id', target_id).eq('emoji', emoji).eq('user_id', u.user!.id));
      }
    },
    async removeFile(path) { must(await sb.storage.from('photos').remove([path])); },
    async addRelative(anchor, kind, p, otherParent) {
      return must(await sb.rpc('add_relative', {
        anchor, kind, given_name: p.given_name, surname: p.surname, birth_surname: p.birth_surname, gender: p.gender,
        birth_year: p.birth_year, is_living: p.is_living, death_date: p.death_date, other_parent: otherParent || null,
      })) as unknown as string;
    },
    async updatePerson(id, patch) {
      const clean = { ...patch } as Record<string, unknown>;
      if (patch.is_living) { clean.death_date = null; clean.death_place = null; }
      must(await sb.from('persons').update(clean).eq('id', id));
    },
    async deletePerson(id) {
      const paths = (must(await sb.rpc('delete_person', { person: id })) as unknown as string[]) || [];
      if (paths.length) await sb.storage.from('photos').remove(paths).catch(() => undefined);
    },
    async listInvitations() { return must(await sb.from('invitations').select('*').order('created_at', { ascending: false })); },
    async invitationsToApprove() { return (must(await sb.rpc('invitations_to_approve')) as unknown as InviteToApprove[]) || []; },
    async approveInvitation(id) { must(await sb.rpc('approve_invitation', { inv: id })); },
    async declineInvitation(id) { must(await sb.rpc('decline_invitation', { inv: id })); },
    async inviteHint(code) { const { data } = await sb.rpc('invite_hint', { c: code }); return (data as unknown as string) || null; },
    async invite(email, personId, role) {
      return must(await sb.from('invitations').insert({ email: email.trim().toLowerCase(), person_id: personId, role }).select('*').single()) as unknown as Invitation;
    },
    async cancelInvitation(id) { must(await sb.from('invitations').delete().eq('id', id).is('accepted_at', null)); },
    async listMembers() {
      const [m, a] = await Promise.all([sb.from('members').select('*').order('created_at'), sb.rpc('member_activity')]);
      const act = new Map(((a.data || []) as { user_id: string; last_sign_in_at: string | null; welcome_sent_at: string | null; app_at?: string | null; two_step?: boolean }[]).map((r) => [r.user_id, r]));
      return (must(m) as Member[]).map((x) => ({ ...x, last_sign_in_at: act.get(x.user_id)?.last_sign_in_at ?? null, welcome_sent_at: act.get(x.user_id)?.welcome_sent_at ?? null, app_at: act.get(x.user_id)?.app_at ?? null, two_step: act.get(x.user_id)?.two_step ?? undefined }));
    },
    async myJoinRequests() {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return [];
      return must(await sb.from('join_requests').select('*').eq('user_id', u.user.id).order('created_at', { ascending: false }));
    },
    async requestToJoin(r) { must(await sb.from('join_requests').insert({ ...r, phone: r.phone.trim() || null })); },
    async listJoinRequests() { return must(await sb.from('join_requests').select('*').order('created_at', { ascending: false }).limit(200)); },
    async approveJoin(id, personId) { must(await sb.rpc('approve_join', { req: id, person: personId })); },
    async writeHelp(text, style) {
      return (await aiCall('/ai/rewrite', JSON.stringify({ text, style }), 'application/json') as { text: string }).text;
    },
    async speakToText(wav) {
      return await aiCall('/ai/voice', wav, 'audio/wav') as { text: string; language: string };
    },
    async approveJoinReplacing(id, personId) { must(await sb.rpc('approve_join_replacing', { req: id, person: personId })); },
    async declineJoin(id, note) { must(await sb.rpc('decline_join', { req: id, note: note || null })); },
    async updateMember(userId, patch) { must(await sb.from('members').update(patch).eq('user_id', userId)); },
    async listDeletionRequests() { return must(await sb.from('deletion_requests').select('*').order('created_at', { ascending: false })); },
    async resolveDeletion(id, status) {
      must(await sb.from('deletion_requests').update({ status, resolved_at: new Date().toISOString() }).eq('id', id));
    },
    async heartbeat(here) { return must(await sb.rpc('heartbeat', { here })) as unknown as Heartbeat; },
    async dmOpen(personId) { return must(await sb.rpc('dm_open', { person: personId })) as unknown as string; },
    async dmList() { return (must(await sb.rpc('dm_list')) as unknown as DmConversation[]) || []; },
    async dmMessages(conversationId, after) {
      let q = sb.from('dm_messages').select('id,conversation_id,sender,body,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(500);
      if (after) q = q.gt('created_at', after);
      return (must(await q) as DmMessage[]) || [];
    },
    async dmSend(conversationId, body) { must(await sb.from('dm_messages').insert({ conversation_id: conversationId, body: body.trim() })); },
    async dmDelete(messageId) { must(await sb.from('dm_messages').delete().eq('id', messageId)); },
    async announce(title, body, url, toPersons, email) { const r = must(await sb.rpc('announce', { title, body, url, to_persons: toPersons?.length ? toPersons : null, email: !!email })) as unknown as { members: number; phones: number; emails: number }[]; return r[0] || { members: 0, phones: 0, emails: 0 }; },
    async announceReach(toPersons) { const r = must(await sb.rpc('announce_reach', { to_persons: toPersons?.length ? toPersons : null })) as unknown as { members: number; phones: number }[]; return r[0] || { members: 0, phones: 0 }; },
    async deleteAnnouncement(id) { must(await sb.from('announcements').delete().eq('id', id)); },
    async childSubmit(kind, payload) { return must(await sb.rpc('child_submit', { kind, payload })) as unknown as string; },
    async childDecide(id, approve) { must(await sb.rpc('child_decide', { draft: id, approve })); },
    async childWithdraw(id) { must(await sb.rpc('child_withdraw', { draft: id })); },
    async uploadAlbumFile(file) {
      const path = `album/${crypto.randomUUID()}.jpg`;
      must(await sb.storage.from('photos').upload(path, file, { contentType: 'image/jpeg', upsert: false }));
      return path;
    },
    async dmBroadcast(body) { return must(await sb.rpc('dm_broadcast', { body })) as unknown as number; },
    async dmMarkRead(conversationId) { must(await sb.rpc('dm_mark_read', { c: conversationId })); },
    async profileLog(personId) { return (must(await sb.rpc('profile_log', { person: personId })) as unknown as LogEntry[]) || []; },
    async listAudit(limit) {
      return must(await sb.from('audit_log').select('id,actor,action,table_name,record_key,at').order('id', { ascending: false }).limit(limit));
    },
  };
}

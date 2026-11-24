import type { Family } from './family';
import { fmtDate, fullName } from './format';
import { starLabel, tithiLabel } from './traditions';
import { FIELD_LABEL, VISIBILITY_LABEL, type FieldName, type LogEntry, type Visibility } from './types';

export type LogVerb = 'Add' | 'Modify' | 'Delete';

const TREE_LABEL: Record<string, string> = {
  given_name: 'First name', surname: 'Surname', birth_surname: 'Surname at birth', gender: 'Gender',
  birth_year: 'Birth year', death_date: 'Date of passing', death_place: 'Place of passing',
};
const DATE_FIELDS = new Set(['birth_date', 'upanayanam', 'sashtiabdapoorthi', 'bhimaratha_shanti', 'sathabhishekam', 'engagement', 'death_date']);

function show(field: string | null, v: string | null): string {
  if (v === null || v === '') return '';
  if (field && DATE_FIELDS.has(field)) return fmtDate(v) || v;
  if (field === 'janma_nakshatram') return starLabel(v);
  if (field === 'shraddha_tithi') return tithiLabel(v);
  if (field === 'gender') return v === 'f' ? 'Female' : v === 'm' ? 'Male' : 'Not set';
  const one = v.replace(/\s+/g, ' ').trim();
  return one.length > 90 ? one.slice(0, 88) + '…' : one;
}

/** Add / Modify / Delete, as the family reads it. */
export function verbOf(e: LogEntry): LogVerb {
  if (e.kind === 'consent' || e.kind === 'joined') return 'Add';
  if (e.kind === 'withdrawn') return 'Modify';
  return e.action === 'insert' ? 'Add' : e.action === 'delete' ? 'Delete' : 'Modify';
}

/** One plain sentence describing the change. */
export function describe(e: LogEntry, f: Family): string {
  const who = e.other ? fullName(f.byId.get(e.other)) || 'someone no longer in the tree' : 'someone';
  const v = verbOf(e);
  switch (e.kind) {
    case 'detail': {
      const label = FIELD_LABEL[e.field as FieldName] || e.field || 'a detail';
      if (e.field === 'photo') return v === 'Add' ? 'Added a photo' : v === 'Delete' ? 'Removed the photo' : 'Changed the photo';
      const o = show(e.field, e.old_value), n = show(e.field, e.new_value);
      if (v === 'Add') return n ? `Added ${label}: ${n}` : `Added ${label}`;
      if (v === 'Delete') return o ? `Removed ${label} (was ${o})` : `Removed ${label}`;
      return o && n ? `Changed ${label} from ${o} to ${n}` : n ? `Changed ${label} to ${n}` : `Changed ${label}`;
    }
    case 'visibility': {
      const label = FIELD_LABEL[e.field as FieldName] || e.field || 'a detail';
      return `Changed who sees ${label}: ${VISIBILITY_LABEL[e.old_value as Visibility] || e.old_value} → ${VISIBILITY_LABEL[e.new_value as Visibility] || e.new_value}`;
    }
    case 'hidden':
      return v === 'Add' ? 'Added a detail you can’t see' : v === 'Delete' ? 'Removed a detail you can’t see' : 'Changed a detail you can’t see';
    case 'tree': {
      if (v === 'Add') return 'Added to the family tree';
      if (e.field === 'is_living') return e.new_value === 'false' ? 'Recorded as passed away' : 'Marked as living';
      const label = TREE_LABEL[e.field || ''] || e.field || 'a tree detail';
      const o = show(e.field, e.old_value), n = show(e.field, e.new_value);
      return o && n ? `Changed ${label} from ${o} to ${n}` : n ? `Set ${label} to ${n}` : `Cleared ${label}${o ? ` (was ${o})` : ''}`;
    }
    case 'parent': return v === 'Delete' ? `Removed the link to parent ${who}` : `Linked to parent ${who}`;
    case 'child': return v === 'Delete' ? `Removed the link to child ${who}` : `Linked to child ${who}`;
    case 'spouse': return v === 'Delete' ? `Removed the marriage to ${who}` : `Added marriage to ${who}`;
    case 'wedding': return `Updated wedding details with ${who}`;
    case 'consent': return 'Agreed to share details with the family';
    case 'withdrawn': return 'Withdrew consent: details hidden from the family';
    case 'joined': return 'Joined the family website';
  }
}

/** Who made the change: their name, or "Family records" for the original import and the server. */
export function byWhom(e: LogEntry, f: Family): string {
  if (!e.by_person) return e.by_role ? `An ${e.by_role === 'admin' ? 'admin' : e.by_role}` : 'Family records';
  return fullName(f.byId.get(e.by_person)) || 'A former member';
}

// Tree records → SQL for the Supabase SQL editor. Pure: shared by the importers and the setup wizard.

export const q = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

export function toSQL(rec, { adminEmail, adminPerson } = {}) {
  const out = ['-- Generated from a Family Echo export. Contains family data: do not commit.', 'begin;'];
  for (const p of rec.persons)
    out.push(`insert into public.persons (id, given_name, surname, birth_surname, gender, birth_year, is_living, death_date, death_place, sort_key) values (${[p.id, p.given_name, p.surname, p.birth_surname, p.gender, p.birth_year, p.is_living, p.death_date, p.death_place, p.sort_key].map(q).join(', ')}) on conflict (id) do update set given_name = excluded.given_name, surname = excluded.surname, birth_surname = excluded.birth_surname, gender = excluded.gender, birth_year = excluded.birth_year, is_living = excluded.is_living, death_date = excluded.death_date, death_place = excluded.death_place, sort_key = excluded.sort_key;`);
  for (const l of rec.links)
    out.push(`insert into public.parent_links (child_id, parent_id, kind) values (${q(l.child_id)}, ${q(l.parent_id)}, ${q(l.kind)}) on conflict do nothing;`);
  for (const p of rec.partners)
    out.push(`insert into public.partnerships (person_a, person_b, kind, is_current, start_date, place) values (${[p.person_a, p.person_b, p.kind, p.is_current, p.start_date, p.place].map(q).join(', ')}) on conflict do nothing;`);
  for (const f of rec.fields)
    out.push(`insert into public.profile_fields (person_id, field, value, visibility) values (${q(f.person_id)}, ${q(f.field)}, ${q(f.value)}, ${q(f.visibility)}) on conflict do nothing;`);
  if (adminEmail) out.push(`insert into public.invitations (email, person_id, role) values (${q(adminEmail.toLowerCase())}, ${q(adminPerson || null)}, 'admin') on conflict do nothing;`);
  out.push('commit;');
  return out.join('\n') + '\n';
}


-- 0023: how long things are kept (design choice). Run nightly by the reminders Worker after the 7 am digest.
--
--   decided join requests ............ 90 days after the decision (with their audit entries, which hold the email)
--   invitations never used ........... 6 months (with their audit entries)
--   sent / expired email queues ...... 30 days
--   writing-help counts .............. 30 days
--   closed health alerts ............. 90 days
--   audit log ........................ 3 years
--   audit entries about someone deleted from the tree: 1 year after the deletion
--
-- Not touched: the tree, profiles, consents, Talk, photos and private messages stay until a member or admin removes them.
-- The clean-up itself writes one summary line to the audit log (counts only), and suppresses the audit copies that
-- deleting would otherwise make (those copies would keep the very data being removed). Re-runnable.

-- audit() skips rows deleted by the retention job (fam.retention is set only inside retention_run(), which is server-only;
-- PostgREST cannot set it).
create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  k text;
begin
  if tg_op = 'DELETE' and current_setting('fam.retention', true) = 'on' then return old; end if;
  r := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  k := case tg_table_name
         when 'profile_fields' then (r->>'person_id') || '/' || (r->>'field')
         when 'persons' then r->>'id'
         when 'parent_links' then (r->>'child_id') || '<' || (r->>'parent_id')
         when 'consents' then r->>'person_id'
         when 'members' then r->>'person_id'
         when 'invitations' then r->>'email'
         when 'deletion_requests' then r->>'person_id'
         else r->>'id' end;
  insert into audit_log(actor, action, table_name, record_key, before, after)
  values (auth.uid(), lower(tg_op), tg_table_name, k,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.retention_run() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  n_join int; n_inv int; n_q int; n_ai int; n_alert int; n_old int; n_gone int := 0; n int;
  ids uuid[]; emails text[]; pid text;
begin
  perform set_config('fam.retention', 'on', true);

  -- decided join requests, and their audit entries
  select coalesce(array_agg(id), '{}') into ids from join_requests
   where status <> 'pending' and coalesce(decided_at, created_at) < now() - interval '90 days';
  delete from audit_log where table_name = 'join_requests' and record_key = any(ids::text[]);
  delete from join_requests where id = any(ids);
  n_join := cardinality(ids);

  -- invitations never used, and their audit entries (keyed by email)
  select coalesce(array_agg(email), '{}') into emails from invitations
   where accepted_at is null and created_at < now() - interval '6 months';
  delete from invitations where accepted_at is null and created_at < now() - interval '6 months';
  delete from audit_log a where a.table_name = 'invitations' and a.record_key = any(emails)
     and not exists (select 1 from invitations i where i.email = a.record_key);
  n_inv := cardinality(emails);

  -- email queues: sent, or too old to send
  delete from welcome_emails where coalesce(sent_at, queued_at) < now() - interval '30 days';
  get diagnostics n_q = row_count;
  delete from mention_emails where coalesce(sent_at, queued_at) < now() - interval '30 days';
  get diagnostics n = row_count; n_q := n_q + n;

  delete from ai_usage where day < (now() at time zone 'Asia/Kolkata')::date - 30;
  get diagnostics n_ai = row_count;
  delete from ops_alerts where closed_at < now() - interval '90 days';
  get diagnostics n_alert = row_count;

  -- people deleted from the tree more than a year ago: everything the audit log holds about them
  for pid in select a.record_key from audit_log a
              where a.table_name = 'persons' and a.action = 'delete' and a.at < now() - interval '1 year'
                and not exists (select 1 from persons p where p.id = a.record_key) loop
    delete from audit_log a
     where a.record_key = pid or a.record_key like pid || '/%' or a.record_key like pid || '<%' or a.record_key like '%<' || pid
        or a.before->>'person_id' = pid or a.after->>'person_id' = pid
        or a.before->>'person_a' = pid or a.after->>'person_a' = pid
        or a.before->>'person_b' = pid or a.after->>'person_b' = pid;
    n_gone := n_gone + 1;
  end loop;

  delete from audit_log where at < now() - interval '3 years';
  get diagnostics n_old = row_count;

  perform set_config('fam.retention', 'off', true);
  if n_join + n_inv + n_q + n_ai + n_alert + n_old + n_gone > 0 then
    insert into audit_log(actor, action, table_name, record_key, before, after)
    values (null, 'delete', 'retention', to_char(now(), 'YYYY-MM-DD'), null,
            jsonb_build_object('join_requests', n_join, 'invitations', n_inv, 'email_queue', n_q, 'ai_counts', n_ai,
                               'alerts', n_alert, 'audit_over_3_years', n_old, 'deleted_people_cleared', n_gone));
  end if;
  return jsonb_build_object('join_requests', n_join, 'invitations', n_inv, 'email_queue', n_q, 'ai_counts', n_ai,
                            'alerts', n_alert, 'audit_over_3_years', n_old, 'deleted_people_cleared', n_gone);
end $$;
revoke all on function public.retention_run() from public, anon, authenticated;
grant execute on function public.retention_run() to service_role;

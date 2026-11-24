-- Privacy-rule tests. Run by tests/run_rls_tests.sh against a throwaway Postgres.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create schema t;
create function t.eq(got bigint, want bigint, what text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL: % (got %, want %)', what, got, want; end if;
  raise notice 'ok  %', what;
end $$;
create function t.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', what; end if;
  raise notice 'ok  %', what;
end $$;
-- Run a statement and expect it to be refused (an error or zero rows changed).
create function t.refused(stmt text, what text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    raise notice 'ok  % (refused: %)', what, sqlerrm; return;
  end;
  if n > 0 then raise exception 'FAIL: % (statement changed % rows)', what, n; end if;
  raise notice 'ok  % (changed nothing)', what;
end $$;
grant usage on schema t to anon, authenticated, service_role;
grant execute on all functions in schema t to anon, authenticated, service_role;

create function t.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
grant execute on function t.as_user(text) to anon, authenticated;

-- ---------------------------------------------------------------- fixture
-- G (late) + GM ; children A, B, X ; A married C, child K (minor) ;
-- X married Y, child D ; E is an adult who joined but hasn't consented ; Z is admin.
insert into persons(id, given_name, birth_year, is_living) values
 ('G','Grandpa',1930,false), ('GM','Grandma',1935,true), ('A','Asha',1980,true), ('B','Bala',1983,true),
 ('X','Xavi',1975,true), ('C','Chitra',1982,true), ('K','Kavi',2015,true), ('Y','Yamuna',1976,true),
 ('D','Dev',2000,true), ('E','Esha',1990,true), ('Zp','Admin',1970,true);
insert into parent_links(child_id,parent_id) values
 ('A','G'),('A','GM'),('B','G'),('B','GM'),('X','G'),('X','GM'),('K','A'),('K','C'),('D','X'),('D','Y'),('E','B');
insert into partnerships(person_a,person_b) values ('G','GM'),('A','C'),('X','Y');

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@x.in'), ('00000000-0000-0000-0000-00000000000b','b@x.in'),
 ('00000000-0000-0000-0000-00000000000c','c@x.in'), ('00000000-0000-0000-0000-00000000000d','d@x.in'),
 ('00000000-0000-0000-0000-00000000000e','e@x.in'), ('00000000-0000-0000-0000-0000000000ff','z@x.in'),
 ('00000000-0000-0000-0000-000000000099','stranger@x.in');
insert into members(user_id,person_id,role) values
 ('00000000-0000-0000-0000-00000000000a','A','member'), ('00000000-0000-0000-0000-00000000000b','B','member'),
 ('00000000-0000-0000-0000-00000000000c','C','member'), ('00000000-0000-0000-0000-00000000000d','D','member'),
 ('00000000-0000-0000-0000-00000000000e','E','member'), ('00000000-0000-0000-0000-0000000000ff','Zp','admin');

insert into consents(person_id,given_by,relation,policy_version) values
 ('A','00000000-0000-0000-0000-00000000000a','self',1), ('B','00000000-0000-0000-0000-00000000000b','self',1),
 ('C','00000000-0000-0000-0000-00000000000c','self',1), ('D','00000000-0000-0000-0000-00000000000d','self',1);
-- K's guardian consents, but keeps the photo hidden
insert into consents(person_id,given_by,relation,policy_version,show_photo) values
 ('K','00000000-0000-0000-0000-00000000000a','guardian',1,false);

insert into profile_fields(person_id,field,value,visibility) values
 ('A','city','Bengaluru','family'), ('A','phone','+91 90000 00001','close'), ('A','address','12 Lake Rd','private'),
 ('C','phone','+91 90000 00003','close'), ('E','city','Chennai','family'), ('K','photo','K/k1.jpg','family'),
 ('K','city','Bengaluru','family'), ('G','about','Loved music','family');
insert into storage.objects(bucket_id,name) values ('photos','K/k1.jpg');

-- ---------------------------------------------------------------- signed-out
set role anon;
select t.refused($$select 1 from persons$$, 'signed-out visitor cannot read the tree');
reset role;

-- ---------------------------------------------------------------- stranger with a login but no invitation
set role authenticated;
select t.as_user('00000000-0000-0000-0000-000000000099');
select t.eq((select count(*) from persons), 0, 'uninvited login sees no people');
select t.eq((select count(*) from profile_fields), 0, 'uninvited login sees no details');

-- ---------------------------------------------------------------- Dev (first cousin of Asha)
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.eq((select count(*) from persons), 11, 'member sees the whole tree');
select t.eq((select count(*) from profile_fields where person_id='A' and field='city'), 1, 'cousin sees family-level detail');
select t.eq((select count(*) from profile_fields where person_id='A' and field='phone'), 0, 'cousin cannot see close-family phone');
select t.eq((select count(*) from profile_fields where person_id='A' and field='address'), 0, 'cousin cannot see private address');
select t.eq((select count(*) from profile_fields where person_id='E'), 0, 'nobody sees details of someone who has not consented');
select t.eq((select count(*) from profile_fields where person_id='K' and field='photo'), 0, 'child photo hidden when guardian said no');
select t.eq((select count(*) from storage.objects where name='K/k1.jpg'), 0, 'child photo file not downloadable either');
select t.eq((select count(*) from profile_fields where person_id='K' and field='city'), 1, 'child city shown at guardian''s chosen level');
select t.eq((select count(*) from profile_fields where person_id='G'), 1, 'late grandparent''s memories visible to family');
select t.refused($$update profile_fields set value='hacked' where person_id='A' and field='city'$$, 'cousin cannot edit another profile');
select t.refused($$insert into profile_fields(person_id,field,value,visibility) values ('A','about','x','family')$$, 'cousin cannot add to another profile');
select t.refused($$insert into persons(id,given_name) values ('NEW','New')$$, 'member cannot add people directly');
select t.refused($$delete from parent_links where child_id='A'$$, 'member cannot break the tree');
select t.eq((select count(*) from members), 1, 'member sees only their own account row');
select t.eq((select count(*) from audit_log), 0, 'member cannot read the audit log');
select t.eq((select count(*) from consents), 1, 'member sees only consents they manage');

-- ---------------------------------------------------------------- Bala (Asha's brother)
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.eq((select count(*) from profile_fields where person_id='A' and field='phone'), 1, 'sibling sees close-family phone');
select t.eq((select count(*) from profile_fields where person_id='C' and field='phone'), 1, 'sibling''s spouse counts as close family');
select t.eq((select count(*) from profile_fields where person_id='A' and field='address'), 0, 'sibling cannot see private address');
select t.eq((select count(*) from profile_fields where person_id='E'), 0, 'even a parent cannot see an adult child''s unconsented details');

-- ---------------------------------------------------------------- Asha (parent of minor Kavi, child of late Grandpa)
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.eq((select count(*) from profile_fields where person_id='A'), 3, 'you see all your own details, including private');
select t.eq((select count(*) from profile_fields where person_id='K' and field='photo'), 1, 'guardian sees their child''s photo');
insert into profile_fields(person_id,field,value,visibility) values ('K','interests','Cricket','family');
select t.ok(true, 'parent can edit their minor child''s profile');
select t.refused($$insert into profile_fields(person_id,field,value,visibility) values ('K','phone','123','close')$$, 'no contact details stored for children');
update profile_fields set value='Loved Carnatic music' where person_id='G' and field='about';
select t.eq((select count(*) from profile_fields where person_id='G' and value='Loved Carnatic music'), 1, 'child of a late relative can steward their profile');
select t.refused($$update consents set show_photo=false where person_id='A'$$, 'a consent cannot be rewritten, only withdrawn');
select t.refused($$delete from consents where person_id='A'$$, 'a consent record cannot be deleted');
update profile_fields set value='Mysuru' where person_id='A' and field='city';
select t.ok((select updated_by = '00000000-0000-0000-0000-00000000000a'::uuid from profile_fields where person_id='A' and field='city'), 'edits are stamped with who made them');

-- withdraw consent → disappears for others at once
update consents set withdrawn_at = now() where person_id='A' and withdrawn_at is null;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.eq((select count(*) from profile_fields where person_id='A'), 0, 'after withdrawing consent, details vanish for others');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.eq((select count(*) from profile_fields where person_id='A'), 3, '...but the person still sees their own');

-- delete my information
select request_deletion('A', 'test');
select t.eq((select count(*) from profile_fields where person_id='A'), 0, 'delete request removes personal details immediately');
select t.eq((select count(*) from deletion_requests where person_id='A'), 1, 'delete request is recorded for an admin');

-- Esha (no consent yet) still sees her own details
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.eq((select count(*) from profile_fields where person_id='E'), 1, 'person without consent still sees own details');

-- ---------------------------------------------------------------- admin
select t.as_user('00000000-0000-0000-0000-0000000000ff');
insert into persons(id,given_name,birth_year) values ('NEWB','Baby',2026);
insert into parent_links(child_id,parent_id) values ('NEWB','D');
select t.ok(true, 'admin can add a new person and link them');
select t.ok((select count(*) from audit_log where record_key='NEWB') >= 1, 'admin change appears in the audit log');
select t.eq((select count(*) from members), 6, 'admin sees all accounts');
insert into invitations(email,person_id) values ('gm@x.in','GM');
reset role;

-- ---------------------------------------------------------------- invitation → account
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000077','GM@x.in');
select t.eq((select count(*) from members where person_id='GM'), 1, 'invited email becomes a member linked to their profile on first sign-in');
select t.ok((select accepted_at is not null from invitations where email='gm@x.in'), 'invitation marked accepted');
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000088','late@x.in');
insert into invitations(email,person_id) values ('late@x.in','Y');
select t.eq((select count(*) from members where person_id='Y'), 1, 'inviting someone who already signed up links them too');

-- ---------------------------------------------------------------- connected families & traditions (0004)
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');   -- Dev, a member
select t.refused($$select add_relative('C', 'parent', 'Someone')$$, 'member cannot add relatives');
select t.as_user('00000000-0000-0000-0000-0000000000ff');   -- admin
select t.refused($$select add_relative('C', 'sibling', 'Sib')$$, 'sibling needs parents recorded first');
select t.ok((select add_relative('C', 'parent', 'Chitra''s father', '', '', 'm', 1950) is not null), 'admin adds a married-in person''s father');
select t.eq((select count(*) from parent_links pl join persons p on p.id = pl.parent_id where pl.child_id = 'C' and p.given_name = 'Chitra''s father'), 1, 'in-law''s father is linked as a parent');
select t.ok((select add_relative('C', 'parent', 'Chitra''s mother', '', '', 'f', 1955) is not null), 'admin adds the mother too');
select t.eq((select count(*) from partnerships pp join persons a on a.id = pp.person_a join persons b on b.id = pp.person_b
  where a.given_name like 'Chitra''s %' and b.given_name like 'Chitra''s %'), 1, 'second parent is partnered with the first automatically');
select t.refused($$select add_relative('C', 'parent', 'Third')$$, 'a third biological parent is refused');
select t.ok((select add_relative('C', 'sibling', 'Chitra''s brother', '', '', 'm', 1985) is not null), 'admin adds the in-law''s brother');
select t.eq((select count(*) from parent_links pl join persons p on p.id = pl.child_id where p.given_name = 'Chitra''s brother'), 2, 'brother shares both parents');
select t.ok((select sort_key = '1985.500' from persons where given_name = 'Chitra''s brother'), 'new person gets a year-only birth order');
select t.ok((select count(*) from audit_log where table_name = 'persons' and action = 'insert') >= 3, 'additions are audited');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.eq((select count(*) from persons where given_name like 'Chitra''s %'), 3, 'members see the connected family in the tree');

-- tradition fields and their defaults
select t.ok(default_visibility('horoscope') = 'private' and default_visibility('janma_nakshatram') = 'close'
  and default_visibility('gothram') = 'family' and default_visibility('shraddha_tithi') = 'family', 'horoscope private, star close, gothram & tithi family by default');
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala edits his own profile
insert into profile_fields(person_id,field,value,visibility) values
 ('B','gothram','Kaundinya','family'), ('B','janma_nakshatram','Avani|Moolam','close'), ('B','horoscope','Dhanus rasi','private'),
 ('B','upanayanam','00000000','family');
select t.refused($$insert into profile_fields(person_id,field,value,visibility) values ('B','sutram','x','family'), ('B','shraddha_tithi','not a tithi!','family')$$, 'star/tithi must be "Month|Value"');
select t.refused($$insert into profile_fields(person_id,field,value,visibility) values ('B','sathabhishekam','next year','family')$$, 'milestone must be a YYYYMMDD date');
select t.as_user('00000000-0000-0000-0000-00000000000d');   -- Dev, cousin
select t.eq((select count(*) from profile_fields where person_id='B' and field='gothram'), 1, 'cousin sees gothram');
select t.eq((select count(*) from profile_fields where person_id='B' and field='janma_nakshatram'), 0, 'cousin cannot see close-family star');
select t.eq((select count(*) from profile_fields where person_id='B' and field='horoscope'), 0, 'cousin cannot see private horoscope');
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha, sister
select t.eq((select count(*) from profile_fields where person_id='B' and field='janma_nakshatram'), 1, 'sister sees close-family star');
select t.eq((select count(*) from profile_fields where person_id='B' and field='horoscope'), 0, 'even a sister cannot see a private horoscope');
reset role;
select t.refused($$update persons set sort_key = '19830727' where id = 'A'$$, 'a full birth date cannot be stored in the tree''s sort key');

-- ---------------------------------------------------------------- reminder feed (0005)
update persons set death_date = '19950304' where id = 'G';
insert into profile_fields(person_id,field,value,visibility) values ('C','birth_date','19820615','close'), ('D','birth_date','20000101','family');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000ff');   -- even an admin
select t.refused($$select * from reminder_feed()$$, 'website users (even admins) cannot call the reminder feed');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.refused($$select * from reminder_feed()$$, 'members cannot call the reminder feed');
reset role;
set role anon;
select t.refused($$select * from reminder_feed()$$, 'signed-out visitors cannot call the reminder feed');
reset role;
set role service_role;
select t.ok((select count(*) from reminder_feed()) >= 3, 'the server key can read the reminder feed');
select t.ok((select birth_shared from reminder_feed() where id = 'D'), 'family-visible birth date with consent is marked shareable');
select t.ok((select not birth_shared from reminder_feed() where id = 'C'), 'close-family birth date is marked not for forwarding');
select t.ok((select death_date = '19950304' and parents is null from reminder_feed() where id = 'G'), 'late relatives appear for remembrance');
select t.ok((select parents = 'Bala' from reminder_feed() where id = 'E') is not false, 'parents are named to tell people apart');
reset role;

-- ---------------------------------------------------------------- at least one admin (0006)
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000ff');   -- the only admin
select t.refused($$update members set role = 'member' where user_id = '00000000-0000-0000-0000-0000000000ff'$$, 'the last admin cannot demote themselves');
reset role;
select t.refused($$delete from members where role = 'admin'$$, 'the last admin cannot be removed');
update members set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000b';   -- Bala becomes a second admin
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000ff');
update members set role = 'member' where user_id = '00000000-0000-0000-0000-0000000000ff';
reset role;
select t.eq((select count(*) from members where role = 'admin' and status = 'active'), 1, 'with a second admin, an admin can step down');
select t.refused($$update members set status = 'suspended' where role = 'admin'$$, 'the remaining admin cannot be suspended');

-- ---------------------------------------------------------------- family page, photos, bell (0007)
-- Bala (b) is the admin now; Zp is a member.
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');   -- Dev, member
select t.eq((select count(*) from family_info), 1, 'members can read the family page');
select t.refused($$update family_info set about = 'x'$$, 'members cannot edit the family story');
select t.refused($$insert into family_info(id) values (true)$$, 'nobody adds a second family page');
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala, admin
update family_info set about = 'Our story', gothram = 'G1';
select t.eq((select count(*) from family_info where about = 'Our story' and updated_by = '00000000-0000-0000-0000-00000000000b'), 1, 'an admin edits the family story');
select t.as_user('00000000-0000-0000-0000-000000000099');
select t.eq((select count(*) from family_info), 0, 'an uninvited login cannot read the family page');
reset role;
select t.eq((select count(*) from audit_log where table_name = 'family_info'), 1, 'family page edits are audited');

-- Dev shares a photo of himself, Chitra, Esha (joined, no consent) and Grandpa (late)
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');
insert into photos(id, path, caption) values ('11111111-1111-1111-1111-111111111111', 'album/p1.jpg', 'Wedding');
insert into storage.objects(bucket_id, name, owner_id) values ('photos', 'album/p1.jpg', '00000000-0000-0000-0000-00000000000d');
insert into photo_tags(photo_id, person_id) values
 ('11111111-1111-1111-1111-111111111111','D'), ('11111111-1111-1111-1111-111111111111','C'),
 ('11111111-1111-1111-1111-111111111111','E'), ('11111111-1111-1111-1111-111111111111','G');
reset role;
select t.eq((select count(*) from photo_tags where status = 'approved' and person_id in ('D','G')), 2, 'self-tags and tags of the late are approved at once');
select t.eq((select count(*) from photo_tags where status = 'pending' and person_id in ('C','E')), 2, 'tags of other living members wait for their say');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000ff');   -- Zp, a member now
select t.eq((select count(*) from photos), 1, 'members see shared photos');
select t.eq((select count(*) from storage.objects where name = 'album/p1.jpg'), 1, 'members can open a shared photo file');
select t.eq((select count(*) from photo_tags), 2, 'others see only approved tags (Dev, Grandpa)');
select t.refused($$update photo_tags set status = 'approved' where person_id = 'C'$$, 'only the person tagged may approve');
select t.refused($$delete from photos$$, 'only the uploader or an admin can delete a photo');
select t.refused($$update photos set caption = 'mine'$$, 'only the uploader or an admin can edit a caption');
select t.as_user('00000000-0000-0000-0000-00000000000c');   -- Chitra approves
select t.eq((select count(*) from photo_tags where person_id = 'C' and status = 'pending'), 1, 'Chitra sees the tag waiting for her');
update photo_tags set status = 'approved' where person_id = 'C';
select t.as_user('00000000-0000-0000-0000-0000000000ff');
select t.eq((select count(*) from photo_tags), 3, 'an approved tag of a consenting person is shown');
select t.as_user('00000000-0000-0000-0000-00000000000e');   -- Esha approves, but has not consented
update photo_tags set status = 'approved' where person_id = 'E';
select t.as_user('00000000-0000-0000-0000-0000000000ff');
select t.eq((select count(*) from photo_tags where person_id = 'E'), 0, 'a tag stays hidden until that person consents');
-- K's consent hides photos: tagging K shows nothing to others
select t.as_user('00000000-0000-0000-0000-00000000000d');
insert into photo_tags(photo_id, person_id) values ('11111111-1111-1111-1111-111111111111','K');
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha, K's mother, approves
update photo_tags set status = 'approved' where person_id = 'K';
select t.as_user('00000000-0000-0000-0000-0000000000ff');
select t.eq((select count(*) from photo_tags where person_id = 'K'), 0, 'a child whose consent hides photos is never shown as tagged');
-- Chitra declines: the photo disappears for the family
select t.as_user('00000000-0000-0000-0000-00000000000c');
update photo_tags set status = 'declined' where person_id = 'C';
select t.eq((select count(*) from photos), 1, 'the person who declined still sees the photo (to change their mind)');
select t.as_user('00000000-0000-0000-0000-0000000000ff');
select t.eq((select count(*) from photos), 0, 'a declined photo is hidden from the family');
select t.eq((select count(*) from storage.objects where name = 'album/p1.jpg'), 0, 'and its file cannot be opened');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.eq((select count(*) from photos), 1, 'the uploader still sees it');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.eq((select count(*) from photos), 1, 'an admin still sees it');
-- tags blocked by consent
reset role;
insert into consents(person_id,given_by,relation,policy_version,allow_tags) values ('GM','00000000-0000-0000-0000-00000000000b','steward',1,false);
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.refused($$insert into photo_tags(photo_id, person_id) values ('11111111-1111-1111-1111-111111111111','GM')$$, 'nobody can tag a person whose consent says no tags');
select t.refused($$update photo_tags set tagged_by = '00000000-0000-0000-0000-00000000000c' where person_id = 'D'$$, 'only a tag''s approval can change');
select t.as_user('00000000-0000-0000-0000-000000000099');
select t.eq((select count(*) from photos), 0, 'an uninvited login sees no photos');
select t.refused($$insert into photos(path) values ('album/x.jpg')$$, 'an uninvited login cannot share photos');
-- uploader deletes
select t.as_user('00000000-0000-0000-0000-00000000000d');
delete from storage.objects where name = 'album/p1.jpg';
delete from photos where id = '11111111-1111-1111-1111-111111111111';
reset role;
select t.eq((select count(*) from photos), 0, 'the uploader can delete their photo');
select t.ok((select count(*) from audit_log where table_name in ('photos','photo_tags')) >= 8, 'photo changes are audited');

-- banner storage
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.refused($$insert into storage.objects(bucket_id, name) values ('photos', 'family/b.jpg')$$, 'members cannot change the banner');
select t.as_user('00000000-0000-0000-0000-00000000000b');
insert into storage.objects(bucket_id, name) values ('photos', 'family/b.jpg');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.eq((select count(*) from storage.objects where name = 'family/b.jpg'), 1, 'members can see the banner');
select t.as_user('00000000-0000-0000-0000-000000000099');
select t.eq((select count(*) from storage.objects where name = 'family/b.jpg'), 0, 'an uninvited login cannot see the banner');

-- bell and settings
reset role;
update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-00000000000a';   -- Asha signs in
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok((select count(*) from recent_joins()) > 0, 'members see who joined recently');
insert into member_prefs(theme, updates_seen_at) values ('peacock', now());
select t.as_user('00000000-0000-0000-0000-0000000000ff');
select t.eq((select count(*) from member_prefs), 0, 'settings are private to each person');
select t.refused($$insert into member_prefs(user_id, theme) values ('00000000-0000-0000-0000-00000000000d', 'lotus')$$, 'nobody writes someone else''s settings');
select t.as_user('00000000-0000-0000-0000-000000000099');
select t.eq((select count(*) from recent_joins()), 0, 'an uninvited login sees no joins');
select t.refused($$insert into member_prefs(theme) values ('blue')$$, 'an uninvited login cannot save settings');
reset role;

-- ---------------------------------------------------------------- members invite (0008)
-- Bala (b) is the admin; Dev (d), Chitra (c) are members. R and S are living adults who haven't joined; K is a minor.
insert into persons(id, given_name, birth_year, is_living) values ('R','Ravi',1985,true), ('S','Sita',1988,true);
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');
insert into invitations(email, person_id) values ('yamuna@x.in', 'R');
reset role;
select t.eq((select count(*) from invitations where email = 'yamuna@x.in' and role = 'member' and invited_by = '00000000-0000-0000-0000-00000000000d'), 1, 'a member can invite a relative');
set role authenticated;
select t.refused($$insert into invitations(email, person_id, role) values ('gm@x.in', 'S', 'admin')$$, 'a member cannot invite an admin');
insert into invitations(email, person_id) values ('k@x.in', 'K');   -- 0034: under-18s can be invited like anyone else
select t.eq((select count(*) from invitations where person_id = 'K' and accepted_at is null), 1, 'a member can invite a child (0034)');
delete from invitations where person_id = 'K' and email = 'k@x.in';
select t.refused($$insert into invitations(email, person_id) values ('g@x.in', 'G')$$, 'a member cannot invite someone who has passed away');
select t.refused($$insert into invitations(email, person_id) values ('a2@x.in', 'A')$$, 'a member cannot invite someone already joined');
select t.refused($$insert into invitations(email, person_id) values ('nobody@x.in', null)$$, 'a member must pick the person from the tree');
insert into invitations(email, person_id, invited_by) values ('gm@x.in', 'S', '00000000-0000-0000-0000-00000000000c');
reset role;
select t.eq((select count(*) from invitations where email = 'gm@x.in' and invited_by = '00000000-0000-0000-0000-00000000000d'), 1, 'nobody can invite in someone else''s name (stamped with the real inviter)');
delete from invitations where email = 'gm@x.in';
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000c');   -- Chitra
select t.refused($$insert into invitations(email, person_id) values ('yamuna2@x.in', 'R')$$, 'nobody invites a person who already has an invitation waiting');
select t.eq((select count(*) from invitations), 0, 'members cannot see invitations others sent (no emails leak)');
select t.ok('R' in (select * from invited_people()), 'members can see who already has an invitation waiting');
select t.refused($$delete from invitations where email = 'yamuna@x.in'$$, 'members cannot cancel others'' invitations');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.eq((select count(*) from invitations where email = 'yamuna@x.in'), 1, 'members see their own invitations');
select t.refused($$update invitations set role = 'admin' where email = 'yamuna@x.in'$$, 'members cannot change an invitation');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from invitations where email = 'yamuna@x.in') = 1, 'admins see every invitation');
select t.as_user('00000000-0000-0000-0000-000000000099');
select t.refused($$insert into invitations(email, person_id) values ('x@x.in', 'S')$$, 'an uninvited login cannot invite');
select t.eq((select count(*) from invited_people()), 0, 'an uninvited login sees no pending invitations');
select t.as_user('00000000-0000-0000-0000-00000000000d');
delete from invitations where email = 'yamuna@x.in';
reset role;
select t.eq((select count(*) from invitations where email = 'yamuna@x.in'), 0, 'members can cancel their own invitation');
-- the invited person signs up and is linked as a member, never an admin
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha, a plain member, sends it
insert into invitations(email, person_id) values ('yamuna@x.in', 'R');
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000a1', 'yamuna@x.in');
select t.eq((select count(*) from members where person_id = 'R'), 0, 'a member''s invitation does nothing until a steward or admin approves it (H2)');
set role authenticated;
select t.refused($$select approve_invitation((select id from invitations where email = 'yamuna@x.in'))$$, 'a plain member cannot approve invitations');
select t.eq((select count(*) from invitations_to_approve()), 0, 'members do not see invitations waiting for approval');
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala, admin
select t.eq((select count(*) from invitations_to_approve() where email = 'yamuna@x.in' and person_id = 'R'), 1, 'admins see invitations waiting, with who sent them');
reset role;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select approve_invitation((select id from invitations where email = 'yamuna@x.in'));
select t.eq((select count(*) from members where person_id = 'R' and role = 'member'), 1, 'once approved, a member''s invitee who already signed in is linked as a member');

-- ---------------------------------------------------------------- Talk: threads, replies, reactions (0009)
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');   -- Dev starts a thread
insert into threads(id, title, body, category, author, pinned, reply_count) values
  ('22222222-2222-2222-2222-222222222222', 'Avani Avittam this year', 'Who is doing it at home?', 'traditions', '00000000-0000-0000-0000-00000000000c', true, 99);
reset role;
select t.eq((select count(*) from threads where author = '00000000-0000-0000-0000-00000000000d' and author_person = 'D' and not pinned and reply_count = 0), 1,
  'a member starts a thread; author, person and counts are stamped by the server (no pinning)');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000c');   -- Chitra replies and reacts
select t.eq((select count(*) from threads), 1, 'members see threads');
insert into thread_posts(id, thread_id, body) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'We are, at Thanjavur.');
insert into reactions(target_id, target_kind, emoji) values ('22222222-2222-2222-2222-222222222222', 'thread', '🙏');
select t.refused($$insert into reactions(target_id, target_kind, emoji) values ('22222222-2222-2222-2222-222222222222', 'thread', '💩')$$, 'only the family emoji set is allowed');
select t.refused($$update threads set title = 'Hijacked' where id = '22222222-2222-2222-2222-222222222222'$$, 'members cannot edit someone else''s thread');
reset role;
select t.ok((select title from threads where id = '22222222-2222-2222-2222-222222222222') = 'Avani Avittam this year', 'the thread is unchanged');
select t.eq((select reply_count from threads where id = '22222222-2222-2222-2222-222222222222'), 1, 'reply count follows replies');
select t.eq((select count(*) from reactions where person_id = 'C' and thread_id = '22222222-2222-2222-2222-222222222222'), 1, 'a reaction is stamped with who reacted');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');
update thread_posts set body = 'changed' where id = '33333333-3333-3333-3333-333333333333';
delete from reactions where person_id = 'C';
update threads set pinned = true, locked = true, body = 'Who is doing it at home this year?' where id = '22222222-2222-2222-2222-222222222222';
reset role;
select t.ok((select body from thread_posts where id = '33333333-3333-3333-3333-333333333333') = 'We are, at Thanjavur.', 'nobody edits someone else''s reply');
select t.eq((select count(*) from reactions where person_id = 'C'), 1, 'nobody removes someone else''s reaction');
select t.eq((select count(*) from threads where not pinned and not locked and edited_at is not null), 1, 'authors edit their thread, but only admins pin or close it');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala, admin, closes it
update threads set locked = true, pinned = true where id = '22222222-2222-2222-2222-222222222222';
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.refused($$insert into thread_posts(thread_id, body) values ('22222222-2222-2222-2222-222222222222', 'late')$$, 'nobody replies to a closed conversation');
select t.as_user('00000000-0000-0000-0000-000000000099');   -- not invited
select t.eq((select count(*) from threads) + (select count(*) from thread_posts) + (select count(*) from reactions), 0, 'an uninvited login sees no conversations');
select t.refused($$insert into threads(title, body) values ('Spam', 'spam')$$, 'an uninvited login cannot start a thread');
set role anon;
select t.refused($$select * from threads$$, 'signed-out visitors cannot read conversations');
reset role;
reset role;
insert into reactions(target_id, target_kind, thread_id, emoji, user_id) values ('33333333-3333-3333-3333-333333333333', 'post', '22222222-2222-2222-2222-222222222222', '👍', '00000000-0000-0000-0000-00000000000d');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000c');
delete from thread_posts where id = '33333333-3333-3333-3333-333333333333';
reset role;
select t.eq((select count(*) from reactions where target_id = '33333333-3333-3333-3333-333333333333'), 0, 'reactions go with a deleted reply');
set role authenticated;
reset role;
select t.eq((select reply_count from threads where id = '22222222-2222-2222-2222-222222222222'), 0, 'authors delete their reply; the count follows');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
delete from threads where id = '22222222-2222-2222-2222-222222222222';
reset role;
select t.eq((select count(*) from reactions where thread_id = '22222222-2222-2222-2222-222222222222'), 0, 'admins can remove a thread, with its reactions');
select t.ok((select count(*) from audit_log where table_name in ('threads', 'thread_posts', 'reactions')) >= 6, 'conversation changes are audited');

-- ---------------------------------------------------------------- wedding dates (0010)
-- Asha (A) and Chitra (C) are married in the fixture; Dev (d) is not part of that couple.
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000c');
select set_wedding('A', 'C', '20090515', 'Cochin');
reset role;
select t.eq((select count(*) from partnerships where least(person_a, person_b) = 'A' and start_date = '20090515' and place = 'Cochin'), 1, 'a partner records their wedding date');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.refused($$select set_wedding('A', 'C', '20000101', null)$$, 'nobody else changes a couple''s wedding date');
select t.refused($$update partnerships set start_date = '20000101'$$, 'the tree itself stays admin-only');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.refused($$select set_wedding('A', 'C', '2009', null)$$, 'a wedding date must be a full date');
select t.refused($$select set_wedding('C', 'D', '20090101', null)$$, 'only a recorded marriage can be dated');
select t.as_user('00000000-0000-0000-0000-000000000099');
select t.refused($$select set_wedding('A', 'C', '20000101', null)$$, 'an uninvited login cannot set wedding dates');
reset role;
select t.ok((select count(*) from audit_log where table_name = 'partnerships' and action = 'update') >= 1, 'wedding date changes are audited');

-- 0011 welcome emails
reset role;
insert into persons(id,given_name,birth_year,is_living) values ('W','Wendy',1991,true);
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000066','w@x.in');
insert into members(user_id,person_id,role,invited_by) values ('00000000-0000-0000-0000-000000000066','W','member','00000000-0000-0000-0000-00000000000a');
select t.eq((select count(*) from welcome_emails where user_id = '00000000-0000-0000-0000-000000000066'), 1, 'a new member is queued for a welcome email');
delete from welcome_emails where user_id = '00000000-0000-0000-0000-00000000000a';
update members set status = 'active' where user_id = '00000000-0000-0000-0000-00000000000a';
select t.eq((select count(*) from welcome_emails where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'other changes to a member do not queue another welcome');
set role service_role;
select t.ok((select email = 'w@x.in' and given_name = 'Wendy' and invited_by_name is not null and admins is not null and people > 0 from welcome_due() where user_id = '00000000-0000-0000-0000-000000000066'), 'the server key sees who is due a welcome');
select welcome_sent('00000000-0000-0000-0000-000000000066');
select t.eq((select count(*) from welcome_due() where user_id = '00000000-0000-0000-0000-000000000066'), 0, 'a sent welcome is not sent again');
reset role;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-000000000066');
select t.refused($$select 1 from welcome_emails$$, 'members cannot read the welcome queue');
select t.refused($$select 1 from welcome_due()$$, 'members cannot list emails due a welcome');
select t.refused($$select welcome_sent('00000000-0000-0000-0000-000000000066')$$, 'members cannot mark welcomes sent');
reset role;
set role anon;
select t.refused($$select 1 from welcome_due()$$, 'signed-out visitors cannot list emails due a welcome');
reset role;
select t.ok((select count(*) from audit_log where table_name = 'welcome_emails') >= 2, 'welcome queue changes are audited');

-- 0012/0013 roles: member, steward, admin
reset role;
update members set role = 'steward' where user_id = '00000000-0000-0000-0000-00000000000d';   -- Dev is a steward
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha, a member
select t.ok(can_manage('X'), 'a member edits a close relative who hasn''t joined (her brother Xavi)');
insert into profile_fields(person_id, field, value, visibility) values ('X', 'work', 'Teacher', 'family');
select t.ok(not can_manage('B'), 'a member cannot edit a close relative who has joined (Bala)');
select t.refused($$insert into profile_fields(person_id, field, value, visibility) values ('B', 'city', 'Pune', 'family')$$, 'no writing to a joined relative''s profile');
select t.ok(not can_manage('W'), 'a member cannot edit someone who isn''t close family');
select t.refused($$insert into consents(person_id, given_by, relation, policy_version) values ('X', '00000000-0000-0000-0000-00000000000a', 'steward', 1)$$, 'editing for a relative does not mean consenting for them');
select t.refused($$insert into persons(id, given_name, birth_year, is_living) values ('M1', 'Mallika', 1990, true)$$, 'members cannot add people to the tree');
reset role;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');   -- Dev, a steward
select t.ok(is_steward(), 'a steward is a steward');
select t.ok(can_manage('S'), 'a steward edits anyone who hasn''t joined');
select t.ok(not can_manage('B'), 'a steward cannot edit someone who has joined');
select t.ok(add_relative('S', 'spouse', 'Suresh', '', '', 'm', 1985) is not null, 'a steward adds relatives to the tree');
update persons set birth_year = 1987 where id = 'S';
select t.ok((select birth_year from persons where id = 'S') = 1987, 'a steward corrects people in the tree');
select t.refused($$delete from persons where id = 'S'$$, 'only admins remove people from the tree');
select t.refused($$delete from partnerships where person_a = 'S' or person_b = 'S'$$, 'only admins remove relationships');
select t.refused($$update members set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000d'$$, 'stewards cannot change roles');
select t.refused($$insert into invitations(email, person_id, role) values ('s2@x.in', 'S', 'steward')$$, 'stewards invite only as members');
reset role;
select t.ok((select count(*) from audit_log where table_name = 'persons' and action = 'insert') >= 1, 'steward changes to the tree are audited');

-- requests to join
insert into persons(id, given_name, birth_year, is_living) values ('J', 'Janaki', 1992, true);
insert into auth.users(id, email) values ('00000000-0000-0000-0000-000000000055', 'Janaki@x.in'), ('00000000-0000-0000-0000-000000000044', 'nobody@x.in');
set role anon;
select t.refused($$insert into join_requests(full_name) values ('Anon')$$, 'signed-out visitors cannot ask to join');
reset role;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-000000000055');
insert into join_requests(full_name, father_name, mother_name, city, phone, note, status, user_id)
  values ('Janaki R', 'Ravi', 'Uma', 'Chennai', '+91 90000 00000', 'Ravi''s daughter', 'approved', '00000000-0000-0000-0000-000000000044');
select t.ok((select status = 'pending' and user_id = '00000000-0000-0000-0000-000000000055' and email = 'janaki@x.in' from join_requests), 'a request is stamped with the requester, their email, and pending');
select t.eq((select count(*) from persons), 0, 'a requester still sees nothing of the family');
select t.refused($$insert into join_requests(full_name) values ('Janaki again')$$, 'one open request at a time');
select t.refused($$update join_requests set status = 'approved'$$, 'a requester cannot approve themselves');
select t.refused($$select approve_join((select id from join_requests limit 1), 'J')$$, 'a requester cannot call approve');
reset role;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-000000000044');
select t.eq((select count(*) from join_requests), 0, 'other people cannot see someone''s request');
reset role;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- a plain member
select t.eq((select count(*) from join_requests), 0, 'members do not see requests');
select t.refused($$select approve_join((select id from join_requests where email = 'janaki@x.in'), 'J')$$, 'members cannot approve');
select t.refused($$insert into join_requests(full_name) values ('Asha')$$, 'members do not need to ask');
reset role;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');   -- the steward
select t.eq((select count(*) from join_requests where status = 'pending'), 1, 'stewards see requests');
select t.refused($$select approve_join((select id from join_requests where email = 'janaki@x.in'), 'B')$$, 'cannot approve as someone who already joined');
select approve_join((select id from join_requests where email = 'janaki@x.in'), 'J');
reset role;
select t.ok((select person_id = 'J' and status = 'active' and role = 'member' from members where user_id = '00000000-0000-0000-0000-000000000055'), 'approving links their account to their place in the tree');
select t.ok((select status = 'approved' and phone is null and decided_by = '00000000-0000-0000-0000-00000000000d' from join_requests where email = 'janaki@x.in'), 'the decision is recorded and the phone number deleted');
select t.eq((select count(*) from welcome_emails where user_id = '00000000-0000-0000-0000-000000000055' and sent_at is null), 1, 'they get a welcome email');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-000000000044');
insert into join_requests(full_name, phone) values ('Nobody', '123');
reset role;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');
select decline_join((select id from join_requests where email = 'nobody@x.in'), 'We could not place you in the tree.');
select t.refused($$select decline_join((select id from join_requests where email = 'nobody@x.in'))$$, 'a request is decided once');
reset role;
select t.ok((select status = 'declined' and phone is null from join_requests where email = 'nobody@x.in'), 'declining deletes the phone number');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-000000000044');
select t.eq((select count(*) from persons), 0, 'a declined requester still sees nothing');
select t.refused($$select 1 from join_requests_due()$$, 'only the server key lists requests for notification');
reset role;
set role service_role;
select t.ok((select count(*) from join_requests_due()) = 0, 'decided requests are not notified');
reset role;
select t.ok((select count(*) from audit_log where table_name = 'join_requests') >= 3, 'requests and decisions are audited');

-- 0014 delete_person: admins only, not someone who has joined, not yourself
insert into persons(id, given_name, birth_year, is_living) values ('DEL','Delia',2001,true);
insert into parent_links(child_id, parent_id) values ('DEL','D');
insert into profile_fields(person_id, field, value, visibility) values ('DEL','photo','DEL/x.jpg','family'), ('DEL','city','Pune','family');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');   -- Dev, a steward
select t.refused($$select delete_person('DEL')$$, 'a steward cannot remove people from the tree');
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha, a member
select t.refused($$select delete_person('DEL')$$, 'a member cannot remove people from the tree');
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala, the admin by now
select t.refused($$select delete_person('A')$$, 'an admin cannot remove someone who has joined');
select t.refused($$select delete_person('B')$$, 'an admin cannot remove their own profile');
select t.ok((select delete_person('DEL')) = array['DEL/x.jpg'], 'removing a person returns their photo files to clean up');
select t.eq((select count(*) from persons where id = 'DEL'), 0, 'the person is gone');
select t.eq((select count(*) from parent_links where child_id = 'DEL'), 0, 'their links go with them');
select t.eq((select count(*) from profile_fields where person_id = 'DEL'), 0, 'their details go with them');
select t.ok((select count(*) from audit_log where table_name = 'persons' and action = 'delete' and record_key = 'DEL') = 1, 'the removal is audited');
reset role;

-- 0015 change logs
select t.ok((select decided_by_person = 'D' from join_requests where email = 'janaki@x.in'), 'a decided join request records which steward decided it');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha edits her own page
insert into consents(person_id, given_by, relation, policy_version) select 'A', '00000000-0000-0000-0000-00000000000a', 'self', max(version) from policy_versions where not exists (select 1 from consents where person_id = 'A' and withdrawn_at is null);
insert into profile_fields(person_id, field, value, visibility) values ('A','city','Bengaluru','family'), ('A','phone','+91 90000 00001','close'), ('A','address','12 Lake Rd','private');
update profile_fields set value = 'Mysuru' where person_id = 'A' and field = 'city';
update profile_fields set value = '+91 90000 00099' where person_id = 'A' and field = 'phone';
update profile_fields set visibility = 'close' where person_id = 'A' and field = 'address';
select t.ok((select count(*) from profile_log('A') where kind = 'detail' and field = 'phone' and new_value = '+91 90000 00099' and by_person = 'A') = 1, 'you see your own private changes in full');
select t.ok((select count(*) from profile_log('A') where kind = 'visibility' and field = 'address' and new_value = 'close') = 1, 'visibility changes are logged');
select t.as_user('00000000-0000-0000-0000-0000000000ff');   -- Zp, a member now, not close to Asha
select t.ok((select count(*) from profile_log('A') where field = 'city' and old_value = 'Bengaluru' and new_value = 'Mysuru' and action = 'update' and by_person = 'A') >= 1, 'members see who changed a family-level detail, from what to what');
select t.eq((select count(*) from profile_log('A') where field in ('phone', 'address') or old_value like '%90000%' or new_value like '%90000%' or new_value like '%Lake%'), 0, 'members never see details hidden from them, not even the field name');
select t.ok((select count(*) from profile_log('A') where kind = 'hidden' and by_person = 'A') >= 2, 'hidden changes still show who made them and when');
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala, admin
update persons set birth_year = 1989 where id = 'S';
select t.ok((select count(*) from profile_log('S') where kind = 'tree' and field = 'birth_year' and old_value = '1987' and new_value = '1989' and by_role = 'admin') = 1, 'tree corrections are logged with who made them');
select t.as_user('00000000-0000-0000-0000-000000000044');   -- a login without membership
select t.refused($$select * from profile_log('A')$$, 'logins without membership cannot read change logs');
reset role;
set role anon;
select t.refused($$select * from profile_log('A')$$, 'signed-out visitors cannot read change logs');
reset role;

-- 0016 hero photos
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala, admin
update family_info set hero_photos = '[{"path":"family/abc-1.jpg","caption":"1975"},{"path":"family/def-2.jpg"}]';
select t.eq((select jsonb_array_length(hero_photos) from family_info), 2, 'an admin sets the family photos');
select t.refused($$update family_info set hero_photos = '[{"path":"album/x.jpg"}]'$$, 'family photos must live in the private family folder');
select t.refused($$update family_info set hero_photos = '[{"path":"family/a.jpg","url":"https://evil"}]'$$, 'no other fields are allowed');
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha, member
update family_info set hero_photos = '[]';
reset role;
select t.eq((select jsonb_array_length(hero_photos) from family_info), 2, 'members cannot change the family photos');

-- 0017 mentions
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha starts a conversation mentioning Bala (admin), Dev (steward), herself and someone who hasn't joined
insert into threads(id, title, body, category) values ('44444444-4444-4444-4444-444444444444', 'Help needed',
  'Hi @[Bala](person:B) and @[Dev](person:D), and me @[Asha](person:A). Also @[Kid](person:K). Fake: @[Bala](person:B)', 'general');
select t.ok((select mentions @> array['B','D','A','K'] and cardinality(mentions) = 4 from threads where id = '44444444-4444-4444-4444-444444444444'), 'mentions are read from the text, once each');
select t.refused($$insert into threads(title, body, category, mentions) values ('x', 'y', 'general', array['B'])$$, 'nobody can claim a mention that is not in the text');
select t.refused($$select * from mention_emails$$, 'members cannot read the mention email queue');
select t.refused($$select * from mentions_due()$$, 'members cannot read pending mention emails');
select t.as_user('00000000-0000-0000-0000-00000000000d');   -- Dev turns mention emails off, then is mentioned in a reply
insert into member_prefs(email_mentions) values (false) on conflict (user_id) do update set email_mentions = false;
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala replies mentioning Dev and Asha
insert into thread_posts(id, thread_id, body) values ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 'Sure @[Asha](person:A), @[Dev](person:D) too');
reset role;
select t.eq((select count(*) from mention_emails where thread_id = '44444444-4444-4444-4444-444444444444' and post_id is null and person_id = 'B'), 1, 'a mentioned member is emailed');
select t.eq((select count(*) from mention_emails where person_id = 'A' and post_id is null), 0, 'mentioning yourself sends no email');
select t.eq((select count(*) from mention_emails where person_id = 'K'), 0, 'someone who has not joined gets no email');
select t.eq((select count(*) from mention_emails where person_id = 'D' and post_id = '55555555-5555-5555-5555-555555555555'), 0, 'members who turned mention emails off get none');
select t.eq((select count(*) from mention_emails where person_id = 'A' and post_id = '55555555-5555-5555-5555-555555555555'), 1, 'replies with mentions are emailed too');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
update thread_posts set body = body || ' (edited)' where id = '55555555-5555-5555-5555-555555555555';
reset role;
select t.eq((select count(*) from mention_emails where post_id = '55555555-5555-5555-5555-555555555555'), 1, 'editing a post does not email the same people again');

-- 0018 presence and chat
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha opens a chat with Bala and writes
select t.ok((select dm_open('B')) is not null, 'a member can start a chat with someone who has joined');
select t.ok((select dm_open('B')) = (select dm_open('B')), 'the same two people always share one conversation');
select t.refused($$select dm_open('A')$$, 'you cannot chat with yourself');
select t.refused($$select dm_open('K')$$, 'you cannot chat with someone who has not joined');
insert into dm_messages(conversation_id, body) values ((select dm_open('B')), 'Hello Bala, private note');
select t.refused($$insert into dm_messages(conversation_id, sender, body) values ((select dm_open('B')), '00000000-0000-0000-0000-00000000000b', 'forged')$$, 'you cannot write as someone else');
select t.ok((select (heartbeat())->'people' is not null), 'members get the list of who is around');
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala sees it, unread
select t.eq((select count(*) from dm_messages where body = 'Hello Bala, private note'), 1, 'the other person reads the message');
select t.eq((select unread from dm_list() where other_person = 'A'), 1, 'it counts as unread until opened');
select dm_mark_read((select id from dm_list() where other_person = 'A'));
select t.eq((select unread from dm_list() where other_person = 'A'), 0, 'opening it marks it read');
select t.ok((select ((heartbeat())->'people') @> '[{"p":"A"}]'), 'Bala can see Asha in the presence list');
select t.as_user('00000000-0000-0000-0000-00000000000d');   -- Dev, a steward, is not in the conversation
select t.eq((select count(*) from dm_messages), 0, 'nobody else can read a private chat');
select t.eq((select count(*) from dm_conversations), 0, 'nobody else can even see that the conversation exists');
select t.refused($$insert into dm_messages(conversation_id, body) select id, 'butting in' from dm_conversations limit 1$$, 'nobody else can write into it');
select t.refused($$select * from member_presence$$, 'raw presence is not readable');
insert into member_prefs(show_online) values (false) on conflict (user_id) do update set show_online = false;
select t.as_user('00000000-0000-0000-0000-00000000000a');
select heartbeat();
select t.ok((select (x->>'seen') is null and (x->>'h')::boolean from jsonb_array_elements((heartbeat())->'people') x where x->>'p' = 'D'), 'someone who hides their status never shows as online');
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- admin
select t.eq((select count(*) from dm_messages where body like '%private note%'), 1, 'sanity: Bala is a participant');
reset role;
select t.ok((select bool_and(after ? 'conversation_id' and not (after ? 'body')) from audit_log where table_name = 'dm_messages'), 'the audit log records messages without their words');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000ff');   -- Zp, an ordinary member now
select t.eq((select count(*) from dm_messages), 0, 'other members cannot read it either');
select t.as_user('00000000-0000-0000-0000-000000000044');   -- a login without membership
select t.refused($$select heartbeat()$$, 'logins without membership get no presence');
reset role;
set role anon;
select t.refused($$select heartbeat()$$, 'signed-out visitors get no presence');
reset role;

-- 0019 message everyone, welcome message
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha, a member
select t.refused($$select dm_broadcast('Hi {name}')$$, 'members cannot message everyone');
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala, admin
select t.ok((select dm_broadcast('Hello {name}, try Messages!')) = (select count(*)::int from members where status = 'active' and person_id is not null and user_id <> '00000000-0000-0000-0000-00000000000b'), 'an admin messages every active member who has joined');
select t.refused($$select dm_broadcast('   ')$$, 'an empty broadcast is refused');
update family_info set welcome_dm_on = true, welcome_dm = 'Welcome {name}! Ask me anything.', welcome_dm_from = 'B';
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.ok((select count(*) from dm_messages where body = 'Hello Asha, try Messages!' and sender = '00000000-0000-0000-0000-00000000000b') = 1, 'each person gets it with their own first name, from the admin');
select t.refused($$update family_info set welcome_dm_on = false$$, 'members cannot change the welcome message') ;
reset role;
insert into persons(id, given_name, birth_year, is_living) values ('NWB19', 'Nila', 1990, true);
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000ab','nila@x.in');
insert into members(user_id, person_id, role) values ('00000000-0000-0000-0000-0000000000ab', 'NWB19', 'member');
select t.eq((select count(*) from dm_messages where body = 'Welcome Nila! Ask me anything.' and sender = '00000000-0000-0000-0000-00000000000b'), 1, 'someone who joins gets the welcome message from the chosen admin');
update members set status = 'suspended' where user_id = '00000000-0000-0000-0000-0000000000ab';
update members set status = 'active' where user_id = '00000000-0000-0000-0000-0000000000ab';
select t.eq((select count(*) from dm_messages where body like 'Welcome Nila%'), 1, 'they get it only once, even if suspended and restored');

-- 0020 approve a request and replace the old login (Seema: invited at Yahoo, now signs in with Gmail)
insert into persons(id, given_name, birth_year, is_living) values ('SEEMA', 'Seema', 1970, true);
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000c1','seema_old@yahoo.com'), ('00000000-0000-0000-0000-0000000000c2','seema.new@gmail.com');
insert into members(user_id, person_id, role) values ('00000000-0000-0000-0000-0000000000c1', 'SEEMA', 'steward');
insert into profile_fields(person_id, field, value, visibility) values ('SEEMA', 'city', 'Hyderabad', 'family');
select t.as_user('00000000-0000-0000-0000-0000000000c2');
insert into join_requests(id, user_id, email, full_name) values ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-0000000000c2', 'seema.new@gmail.com', 'Seema Sriram');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');   -- Dev, a steward
select t.refused($$select approve_join('66666666-6666-6666-6666-666666666666', 'SEEMA')$$, 'a plain approve is refused while someone is linked to the person');
select t.refused($$select approve_join_replacing('66666666-6666-6666-6666-666666666666', 'SEEMA')$$, 'a steward cannot replace a login');
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala, admin
select approve_join_replacing('66666666-6666-6666-6666-666666666666', 'SEEMA');
reset role;
select t.eq((select count(*) from auth.users where id = '00000000-0000-0000-0000-0000000000c1'), 0, 'the old login is deleted');
select t.ok((select person_id = 'SEEMA' and role = 'steward' and status = 'active' from members where user_id = '00000000-0000-0000-0000-0000000000c2'), 'the new login has her place in the tree and keeps her role');
select t.eq((select count(*) from profile_fields where person_id = 'SEEMA'), 1, 'her details stay with her');
select t.ok((select status = 'approved' from join_requests where id = '66666666-6666-6666-6666-666666666666'), 'the request is marked approved');

-- 0021 writing help: only members, a daily allowance, nobody else's counts
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000d1','stranger21@x.in');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.refused($$select ai_allow('rewrite')$$, 'a login without membership cannot use writing help');
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha, a member
select t.eq((select ai_allow('rewrite')), 59, 'a member gets writing help and sees what is left today');
select t.eq((select ai_allow('voice')), 39, 'speaking has its own allowance');
select t.refused($$select ai_allow('anything')$$, 'only the known kinds are allowed');
select t.refused($$insert into ai_usage(user_id, kind, n) values ('00000000-0000-0000-0000-00000000000a', 'rewrite', 0)$$, 'members cannot reset their own count');
select t.refused($$update ai_usage set n = 0$$, 'members cannot change their count');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.eq((select count(*) from ai_usage), 0, 'nobody sees anyone else''s use');
reset role;
update ai_usage set n = 60 where user_id = '00000000-0000-0000-0000-00000000000a' and kind = 'rewrite';
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.refused($$select ai_allow('rewrite')$$, 'over the daily allowance is refused');
reset role;
select t.eq((select n from ai_usage where user_id = '00000000-0000-0000-0000-00000000000a' and kind = 'rewrite'), 60, 'a refused use is not counted');

-- 0022 health checks: server key only, counts only, one alert per problem
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala, admin
select t.refused($$select ops_queues()$$, 'even an admin cannot read health status through the site');
select t.refused($$select ops_record('digest', true)$$, 'members cannot record job runs');
select t.refused($$select * from ops_alerts$$, 'alert state is server-only');
reset role;
set role service_role;
select ops_record('digest', false, 'email: Resend said 401');
select ops_record('digest', true, 'sent 3');
select ops_record('digest', false, 'boom');
reset role;
select t.ok((select ok = false and last_ok_at is not null and detail = 'boom' from ops_runs where job = 'digest'), 'a failed run keeps the time of the last good one');
set role service_role;
select t.ok((select (ops_queues()->'runs'->'digest'->>'ok') = 'false'), 'the Worker sees how each job last went');
select t.ok((select ops_queues() ? 'welcome_stuck' and not (ops_queues()::text ~ '@')), 'queues are counts only, never emails');
select t.eq((select jsonb_array_length(ops_alerts_sync('[{"key":"site","summary":"Website down"}]')->'started')), 1, 'a new problem is emailed');
select t.eq((select jsonb_array_length(ops_alerts_sync('[{"key":"site","summary":"Website down"}]')->'started')), 0, 'the same problem is not emailed again straight away');
reset role;
update ops_alerts set last_sent_at = now() - interval '25 hours' where key = 'site';
set role service_role;
select t.eq((select jsonb_array_length(ops_alerts_sync('[{"key":"site","summary":"Website down"}]')->'still')), 1, 'a reminder after 24 hours while it lasts');
select t.eq((select jsonb_array_length(ops_alerts_sync('[]')->'cleared')), 1, 'an all-clear when it is fixed');
select t.eq((select jsonb_array_length(ops_alerts_sync('[{"key":"site","summary":"Website down"}]')->'started')), 1, 'it comes back as a new problem if it breaks again');
reset role;

-- 0023 retention: server-only, removes old data with its audit copies, keeps the rest
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.refused($$select retention_run()$$, 'even an admin cannot run the clean-up through the site');
reset role;
insert into persons(id, given_name, birth_year, is_living) values ('RET01', 'Gone', 1950, false), ('RET02', 'Stays', 1951, false);
insert into profile_fields(person_id, field, value, visibility) values ('RET01', 'city', 'Madurai', 'family');
delete from persons where id = 'RET01';
update audit_log set at = now() - interval '13 months' where record_key = 'RET01' or record_key like 'RET01/%';
insert into audit_log(actor, action, table_name, record_key, at) values (null, 'update', 'persons', 'RET02', now() - interval '4 years');
insert into invitations(email, person_id) values ('old.invite@x.in', 'RET02');
update invitations set created_at = now() - interval '7 months' where email = 'old.invite@x.in';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000e1','asker@x.in');
select t.as_user('00000000-0000-0000-0000-0000000000e1');
insert into join_requests(id, user_id, email, full_name) values ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-0000000000e1', 'asker@x.in', 'Old Asker');
update join_requests set status = 'declined', decided_at = now() - interval '100 days' where id = '77777777-7777-7777-7777-777777777777';
insert into audit_log(actor, action, table_name, record_key, after) values (null, 'insert', 'join_requests', '77777777-7777-7777-7777-777777777777', '{"email":"asker@x.in"}');
set role service_role;
select t.ok((select (retention_run()->>'deleted_people_cleared')::int >= 1), 'the clean-up runs with the server key');
reset role;
select t.eq((select count(*) from audit_log where record_key = 'RET01' or record_key like 'RET01/%'), 0, 'a year after someone is deleted, the audit log forgets them');
select t.eq((select count(*) from audit_log where record_key = 'RET02' and at < now() - interval '3 years'), 0, 'audit entries over 3 years old are removed');
select t.eq((select count(*) from invitations where email = 'old.invite@x.in'), 0, 'unused invitations go after 6 months');
select t.eq((select count(*) from audit_log where table_name = 'invitations' and record_key = 'old.invite@x.in'), 0, 'and their audit entries with the email');
select t.eq((select count(*) from join_requests where id = '77777777-7777-7777-7777-777777777777'), 0, 'decided join requests go after 90 days');
select t.eq((select count(*) from audit_log where record_key = '77777777-7777-7777-7777-777777777777'), 0, 'with their audit entries');
select t.eq((select count(*) from audit_log where before::text like '%asker@x.in%' or before::text like '%old.invite@x.in%'), 0, 'deleting leaves no audit copy of what was removed');
select t.ok((select count(*) from persons where id = 'RET02') = 1 and (select count(*) from profile_fields where person_id = 'SEEMA') = 1, 'the tree and profiles are untouched');
select t.ok((select count(*) from audit_log where table_name = 'retention') >= 1, 'the clean-up leaves a summary line (counts only)');
select t.ok((select count(*) from audit_log where table_name = 'persons' and record_key = 'RET02' and action = 'insert') = 1, 'normal changes are still audited');

-- 0024 security review fixes
-- M1: helpers answer nobody outside the family
set role anon;
select t.refused($$select is_minor('A')$$, 'signed-out visitors cannot call is_minor');
select t.refused($$select household('A')$$, 'signed-out visitors cannot call household');
select t.refused($$select has_consent('A')$$, 'signed-out visitors cannot call has_consent');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and p.proname <> 'invite_hint' and has_function_privilege('anon', p.oid, 'execute')), 'no other security-definer function is open to signed-out visitors');
reset role;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-000000000099');   -- signed in, never invited
select t.eq((select count(*) from household('A')), 0, 'an uninvited login learns nothing from household()');
select t.ok(not (select has_consent('A')) and not (select is_close('A', 'B')), 'an uninvited login learns nothing from has_consent() or is_close()');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.ok((select count(*) from household('A')) >= 1, 'members still get answers');
reset role;
-- L2: invitation codes, masked hint for signed-out visitors
select t.as_user('00000000-0000-0000-0000-00000000000b');
insert into persons(id, given_name, birth_year, is_living) values ('HINT1', 'Hema', 1980, true);
insert into invitations(email, person_id) values ('hema.k@gmail.com', 'HINT1');
reset role;
select code as hint_code from invitations where email = 'hema.k@gmail.com' \gset
set role anon;
select t.ok((select invite_hint(:'hint_code')) = 'he•••@gmail.com', 'a signed-out visitor with the link sees only a masked email');
select t.ok((select invite_hint('000000000000')) is null, 'a made-up code reveals nothing');
reset role;
select t.ok((select length(code) = 12 from invitations where email = 'hema.k@gmail.com'), 'every invitation gets a random 12-character code');
-- L1: daily cap on requests to join
insert into auth.users(id, email) select ('00000000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, 'spam' || g || '@x.in' from generate_series(1, 21) g;
do $$ declare g int; begin
  for g in 1..20 loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-' || lpad(g::text, 12, '0'), true);
    perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0001-' || lpad(g::text, 12, '0'), 'role', 'authenticated')::text, true);
    begin insert into join_requests(full_name) values ('Spammer ' || g); exception when others then null; end;
  end loop; end $$;
select t.as_user('00000000-0000-0000-0001-000000000021');
select t.refused($$insert into join_requests(full_name) values ('One too many')$$, 'no more than 20 new requests to join a day');
reset role;

-- 0025: DevCenter handbook is for admins only (Bala is the admin by now; Zp is a member)
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- admin
insert into dev_docs(id, title, body, sort) values ('operations', 'Operations', 'Secrets live in Cloudflare.', 1);
select t.eq((select count(*) from dev_docs), 1, 'an admin can add and read DevCenter sections');
update dev_docs set body = 'Edited' where id = 'operations';
select t.ok((select updated_by = '00000000-0000-0000-0000-00000000000b' from dev_docs where id = 'operations'), 'DevCenter edits are stamped with who made them');
select t.as_user('00000000-0000-0000-0000-0000000000ff');   -- a former admin, now a member
select t.eq((select count(*) from dev_docs), 0, 'a member sees no DevCenter sections');
select t.refused($$insert into dev_docs(id, title) values ('x', 'X')$$, 'a member cannot add a DevCenter section');
update dev_docs set body = 'hacked' where id = 'operations';
select t.as_user('00000000-0000-0000-0000-000000000099');   -- signed in, never invited
select t.eq((select count(*) from dev_docs), 0, 'an uninvited login sees no DevCenter sections');
reset role;
select t.ok((select body = 'Edited' from dev_docs where id = 'operations'), 'a member cannot change a DevCenter section');
select t.ok(exists (select 1 from audit_log where table_name = 'dev_docs'), 'DevCenter changes are audited');
set role anon;
select t.refused($$select * from dev_docs$$, 'signed-out visitors cannot read the DevCenter');
reset role;

-- 0026: themes and Light / Dark / Automatic
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');
insert into member_prefs(theme, mode) values ('instagram', 'dark') on conflict (user_id) do update set theme = 'instagram', mode = 'dark';
select t.ok((select theme = 'instagram' and mode = 'dark' from member_prefs), 'a member can pick a style and dark mode');
select t.refused($$update member_prefs set mode = 'neon'$$, 'only automatic, light or dark');
select t.refused($$update member_prefs set theme = 'matrix'$$, 'only themes the site offers');
update member_prefs set theme = 'spotlight';
select t.ok((select theme = 'spotlight' from member_prefs), 'the design styles (0027) can be picked');
reset role;

-- 0028: heritage preferences (own row only, fixed choices)
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');
update member_prefs set border = 'veshti-blue', scripts = 'ml', kolam = false, doors = false;
select t.ok((select border = 'veshti-blue' and scripts = 'ml' and not kolam and not doors from member_prefs), 'a member can choose border, scripts, kolam and doors');
select t.refused($$update member_prefs set border = 'tartan'$$, 'only the offered borders');
select t.refused($$update member_prefs set scripts = 'hindi'$$, 'only both, Malayalam, Tamil or English');
reset role;

-- 0029: member activity (last sign-in, welcome email) is for admins only, and holds no email addresses
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) > 0 from member_activity()), 'an admin sees members'' last sign-in and welcome dates');
select t.as_user('00000000-0000-0000-0000-0000000000ff');
select t.ok((select count(*) = 0 from member_activity()), 'a plain member sees no activity rows');
reset role;
set role anon;
select t.refused($$select * from member_activity()$$, 'signed-out visitors cannot call member_activity');
reset role;

-- 0030: phone notifications
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala turns them on for his phone
select push_subscribe('https://push.example.com/bala-phone', repeat('p', 87), repeat('a', 22), 'iPhone');
select t.eq((select count(*) from push_my_devices()), 1, 'a member turns on notifications for a device');
select t.refused($$select * from push_subscriptions$$, 'members cannot read device keys directly');
select t.refused($$select * from push_queue$$, 'members cannot read the notification queue');
select t.refused($$select * from push_due()$$, 'members cannot pull what to send');
select t.refused($$select push_daily('occasion', 'x', 'y')$$, 'members cannot send notifications to everyone');
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha writes to Bala
insert into dm_messages(conversation_id, body) values ((select dm_open('B')), 'Secret plans for Amma''s birthday');
select t.eq((select count(*) from push_my_devices()), 0, 'Asha sees only her own devices');
reset role;
select t.eq((select count(*) from push_queue where user_id = '00000000-0000-0000-0000-00000000000b' and kind = 'message'), 1, 'a private message queues a notification for the other person');
select t.ok((select bool_and(body not like '%Secret%' and body like '% sent you a message') from push_queue where kind = 'message'), 'the notification says who wrote, never what');
select t.eq((select count(*) from push_queue where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'no notification for someone without a device');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala turns message notifications off
update member_prefs set push_messages = false;
insert into member_prefs(user_id, push_messages) select auth.uid(), false where not exists (select 1 from member_prefs where user_id = auth.uid());
select t.as_user('00000000-0000-0000-0000-00000000000a');
insert into dm_messages(conversation_id, body) values ((select dm_open('B')), 'Another one');
reset role;
select t.eq((select count(*) from push_queue where user_id = '00000000-0000-0000-0000-00000000000b' and kind = 'message'), 1, 'switching messages off stops new message notifications');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
select push_unsubscribe('https://push.example.com/bala-phone');
reset role;
select t.eq((select count(*) from push_subscriptions where user_id = '00000000-0000-0000-0000-00000000000b'), 1, 'nobody can turn off someone else''s device');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select push_unsubscribe();
select t.eq((select count(*) from push_my_devices()), 0, 'Sign out everywhere turns notifications off on every device');
reset role;
select t.ok((select count(*) > 0 from audit_log where table_name = 'push_subscriptions' and after::text not like '%push.example%'), 'turning notifications on and off is audited without the device address');
set role anon;
select t.refused($$select push_subscribe('https://push.example.com/x', repeat('p', 87), repeat('a', 22))$$, 'signed-out visitors cannot turn on notifications');
reset role;

-- 0030: join requests and mentions reach stewards/admins and the person mentioned
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- Bala is the admin by now; his phone
select push_subscribe('https://push.example.com/admin-phone', repeat('p', 87), repeat('a', 22), 'Android');
reset role;
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000a9', 'newcomer@x.in');
update join_requests set created_at = now() - interval '2 days';   -- earlier tests used up today's request limit
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a9');   -- a login without an invitation asks to join
insert into join_requests(full_name) values ('Nalini Newcomer');
reset role;
select t.eq((select count(*) from push_queue where user_id = '00000000-0000-0000-0000-00000000000b' and kind = 'join' and body like 'Nalini Newcomer asked%'), 1, 'a join request notifies the admin');
insert into mention_emails(user_id, person_id, by_person, thread_id) select '00000000-0000-0000-0000-00000000000b', 'B', 'A', id from threads limit 1;
select t.eq((select count(*) from push_queue where user_id = '00000000-0000-0000-0000-00000000000b' and kind = 'mention' and body like '% mentioned you in Talk'), 1, 'an @-mention notifies the person mentioned');
set role service_role;
select t.ok((select count(*) > 0 from push_due()), 'the server can pull what to send');
reset role;

-- 0031: Notify everyone
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- a plain member
select t.refused($$select * from announce('Hello', 'x', '#/talk')$$, 'members cannot notify everyone');
select t.refused($$insert into announcements(title) values ('sneaky')$$, 'members cannot write notices directly');
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- the admin, with a phone
select t.refused($$select * from announce('Bad link', '', 'https://evil.example')$$, 'notices only link inside the site');
select t.eq((select phones from announce('New conversation', 'The Sathabhishekam of Thatha and Paati', '#/talk')), 1, 'the admin can notify everyone; phones with notifications on are counted');
reset role;
select t.eq((select count(*) from push_queue where kind = 'news' and title = 'New conversation' and url = '#/talk'), 1, 'a notice is queued as a phone notification');
select t.ok((select count(*) = 1 from audit_log where table_name = 'announcements' and action = 'insert'), 'notices are audited');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.eq((select count(*) from announcements where title = 'New conversation'), 1, 'members see the notice in their bell');
select t.refused($$update announcements set title = 'changed'$$, 'nobody edits a notice');
delete from announcements;
select t.eq((select count(*) from announcements), 1, 'members cannot delete notices');
select t.eq((select members from announce_reach())::bigint, 0, 'members cannot see how many phones are reachable');
select t.as_user('00000000-0000-0000-0000-00000000000b');
update member_prefs set push_news = false where user_id = auth.uid();
insert into member_prefs(user_id, push_news) select auth.uid(), false where not exists (select 1 from member_prefs where user_id = auth.uid());
select t.eq((select phones from announce('Second', '', '#/')), 0, 'switching Family news off stops notice notifications');
select t.eq((select count(*) from announcements), 2, 'the notice still reaches the bell');
select * from announce('3', '', '#/'); select * from announce('4', '', '#/'); select * from announce('5', '', '#/'); select * from announce('6', '', '#/');
select * from announce('7', '', '#/'); select * from announce('8', '', '#/'); select * from announce('9', '', '#/'); select * from announce('10', '', '#/');
select t.refused($$select * from announce('11', '', '#/')$$, 'at most 10 notices a day');
reset role;
set role anon;
select t.refused($$select * from announcements$$, 'signed-out visitors see no notices');
reset role;

-- 0032: more notifications, and notices to chosen people
reset role;
delete from announcements; delete from push_queue;
update member_prefs set push_news = true;
-- give Asha (A, a member) a phone too
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
select push_subscribe('https://push.example.com/asha-phone', repeat('p', 87), repeat('a', 22), 'iPhone');
reset role;
select t.ok((select is_close('A', 'B')), 'A and B are close family (test setup)');
-- Bala (B) adds a detail the family can see: Asha, close family, is told who, not what
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
insert into profile_fields(person_id, field, value, visibility) values ('B', 'native_place', 'Palakkad', 'family')
  on conflict (person_id, field) do update set value = excluded.value, visibility = excluded.visibility;
reset role;
select t.eq((select count(*) from push_queue where user_id = '00000000-0000-0000-0000-00000000000a' and kind = 'family' and body like 'New details on %'), 1, 'close family are notified of new profile details');
select t.ok((select count(*) = 0 from push_queue where kind = 'family' and body like '%Palakkad%'), 'the notification never says what changed');
select t.eq((select count(*) from push_queue where user_id = '00000000-0000-0000-0000-00000000000b' and kind = 'family'), 0, 'you are not notified of your own change');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
insert into profile_fields(person_id, field, value, visibility) values ('B', 'kuladeivam', 'Guruvayurappan', 'family')
  on conflict (person_id, field) do update set value = excluded.value, visibility = excluded.visibility;
insert into profile_fields(person_id, field, value, visibility) values ('B', 'horoscope', 'secret', 'private')
  on conflict (person_id, field) do update set value = excluded.value, visibility = excluded.visibility;
reset role;
select t.eq((select count(*) from push_queue where user_id = '00000000-0000-0000-0000-00000000000a' and kind = 'family'), 1, 'several changes make one notification (6 hours)');
delete from push_queue;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
insert into profile_fields(person_id, field, value, visibility) values ('B', 'horoscope', 'more secret', 'private')
  on conflict (person_id, field) do update set value = excluded.value, visibility = excluded.visibility;
reset role;
select t.eq((select count(*) from push_queue where kind = 'family'), 0, 'private details never notify anyone');
-- Talk: a new conversation reaches everyone else; a reply reaches the people in it
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
insert into threads(title, body) values ('Notify test conversation', 'Hello all');
reset role;
select t.eq((select count(*) from push_queue where user_id = '00000000-0000-0000-0000-00000000000a' and kind = 'talk' and body like '% started a new conversation'), 1, 'a new conversation notifies the family');
select t.ok((select count(*) = 0 from push_queue where kind = 'talk' and body like '%Hello all%'), 'the notification never carries the text');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
insert into thread_posts(thread_id, body) select id, 'A reply' from threads where title = 'Notify test conversation';
reset role;
select t.eq((select count(*) from push_queue where user_id = '00000000-0000-0000-0000-00000000000b' and kind = 'talk' and body like '% replied in a conversation you’re in'), 1, 'a reply notifies the people in the conversation');
-- switches
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
insert into member_prefs(user_id, push_talk) values (auth.uid(), false) on conflict (user_id) do update set push_talk = false;
select t.as_user('00000000-0000-0000-0000-00000000000b');
insert into threads(title, body) values ('Second notify test', 'Hi again');
reset role;
select t.eq((select count(*) from push_queue where user_id = '00000000-0000-0000-0000-00000000000a' and kind = 'talk' and url like '#/talk/%' and queued_at > now() - interval '1 second' and body like '% started%' and tag like 'talk-%' and tag <> ''), 1, 'switching Talk off stops new conversation notifications (only the earlier one is there)');
-- notices to chosen people
delete from push_queue;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.eq((select members from announce('Just for Asha', 'Hi', '#/', array['A'])), 1, 'a notice can go to chosen people');
select t.refused($$select * from announce('Nobody', '', '#/', array['ZZZ'])$$, 'a notice to people who have not joined is refused');
reset role;
select t.eq((select count(*) from push_queue where kind = 'news'), 1, 'only the chosen people get the phone notification');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.eq((select count(*) from announcements where title = 'Just for Asha'), 1, 'the chosen person sees it in the bell');
reset role;
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000c7', 'other@x.in') on conflict do nothing;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.eq((select count(*) from announcements where title = 'Just for Asha'), 0, 'others do not see a notice that was not for them');
reset role;

-- 0048: a notice can also be emailed
delete from news_emails;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.eq((select emails from announce('No email', 'x', '#/')), 0, 'a notice is not emailed unless asked');
select t.ok((select emails > 0 from announce('Deepam', 'Light a lamp', '#/talk', null, true)), 'the admin can email a notice to everyone');
select t.refused($$select * from news_emails$$, 'members cannot read the email queue');
select t.refused($$select * from news_due()$$, 'members cannot read who gets the emails');
select t.refused($$select news_sent(array[1::bigint])$$, 'members cannot mark emails sent');
reset role;
select t.eq((select count(*) from news_emails where user_id = '00000000-0000-0000-0000-00000000000b'), 0, 'the sender does not email themselves');
select t.eq((select count(*) from news_emails q join members m on m.user_id = q.user_id where m.status <> 'active' or m.person_id is null), 0, 'only active members with a place in the tree are emailed');
select t.ok((select count(*) > 0 from news_due()), 'the server sees the waiting emails');
insert into member_prefs(user_id, email_news) values ('00000000-0000-0000-0000-00000000000a', false) on conflict (user_id) do update set email_news = false;
select t.eq((select count(*) from news_due() d join auth.users u on u.email = d.email where u.id = '00000000-0000-0000-0000-00000000000a'), 0, 'turning notice emails off stops waiting ones too');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select * from announce('Again', 'y', '#/', null, true);
select t.refused($$select * from announce('Third', 'z', '#/', null, true)$$, 'at most two emailed notices a day');
select t.eq((select emails from announce('Third', 'z', '#/')), 0, 'a third notice can still go without email');
reset role;
select t.eq((select count(*) from news_emails q join announcements a on a.id = q.announcement_id where a.title = 'Again' and q.user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'people who turned notice emails off are not queued');
select t.ok((select count(*) > 0 from news_emails q join announcements a on a.id = q.announcement_id where a.title = 'Again'), 'everyone else is queued for the second email');
select news_sent(array(select id from news_emails));
select t.eq((select count(*) from news_emails), 0, 'sent emails leave nothing behind');
update member_prefs set email_news = true where user_id = '00000000-0000-0000-0000-00000000000a';

-- 0032: photos and tags
delete from push_queue;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
insert into photos(path, caption) values ('album/notify-test-1.jpg', 'One'), ('album/notify-test-2.jpg', 'Two');
reset role;
select t.eq((select count(*) from push_queue where user_id = '00000000-0000-0000-0000-00000000000a' and kind = 'photo'), 1, 'new photos notify the family once, not per photo');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
insert into photo_tags(photo_id, person_id) select id, 'A' from photos where path = 'album/notify-test-1.jpg';
reset role;
select t.eq((select count(*) from push_queue where user_id = '00000000-0000-0000-0000-00000000000a' and kind = 'tag' and body like '% tagged you in a photo%'), 1, 'being tagged notifies you to approve or hide it');

-- 0033: who has the app on their home screen
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
insert into member_prefs(user_id, app_at) values (auth.uid(), now()) on conflict (user_id) do update set app_at = now();
select t.eq((select count(*) from member_activity()), 0, 'members cannot see who has the app');
update member_prefs set app_at = null where user_id = '00000000-0000-0000-0000-00000000000b';
select t.eq((select count(*) from member_prefs where user_id = '00000000-0000-0000-0000-00000000000b' and app_at is not null), 0, 'members cannot read or change someone else''s app date');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok((select app_at is not null from member_activity() where user_id = '00000000-0000-0000-0000-00000000000a'), 'admins see who has opened the app from their home screen');
reset role;

-- 0034: children under 18 can join; their contact details stay blocked and their parent keeps managing them
reset role;
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000a7', 'kavi@x.in');
update join_requests set created_at = now() - interval '2 days';
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a7');
insert into join_requests(full_name) values ('Kavi');
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- the admin
select approve_join((select id from join_requests where full_name = 'Kavi' and status = 'pending'), 'K');
reset role;
select t.eq((select count(*) from members where person_id = 'K' and user_id = '00000000-0000-0000-0000-0000000000a7' and status = 'active'), 1, 'an admin can approve a child''s request to join');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a7');
select t.refused($$insert into profile_fields(person_id,field,value,visibility) values ('K','phone','99999','close')$$, 'a child who joined still cannot store contact details');
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha, Kavi's parent
select t.ok((select can_consent('K')), 'a parent still manages their child''s consent after the child joins');
reset role;

-- 0034: under-18s: a parent checks first
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a7');   -- Kavi, 11, has joined
select t.ok((select am_minor()), 'Kavi counts as under 18');
select t.refused($$insert into consents(person_id, relation, policy_version, given_by) values ('K', 'self', 1, auth.uid())$$, 'a child cannot give consent for themselves');
select t.refused($$insert into threads(title, body) values ('Kavi''s post', 'Hi everyone')$$, 'a child cannot post straight to Talk');
select t.refused($$insert into thread_posts(thread_id, body) select id, 'hi' from threads limit 1$$, 'a child cannot reply straight away');
select t.refused($$insert into photos(path, caption) values ('album/kavi-1.jpg', 'Me')$$, 'a child cannot share a photo straight away');
select t.refused($$insert into profile_fields(person_id, field, value, visibility) values ('K', 'interests', 'Chess', 'family')$$, 'a child cannot change their own details directly');
select t.refused($$select child_submit('detail', '{"field":"phone","value":"99999","visibility":"family"}')$$, 'a child cannot even ask to store a phone number');
select t.refused($$select ai_allow('rewrite')$$, 'no writing help (AI) for children');
select child_submit('thread', '{"title":"My school trip","body":"We went to Mysore!","category":"general"}');
select child_submit('detail', '{"field":"interests","value":"Chess","visibility":"family"}');
select t.eq((select count(*) from child_drafts where child_user = auth.uid() and decided_at is null), 2, 'a child sees what is waiting for their parent');
select heartbeat(true);
reset role;
select t.eq((select count(*) from member_presence where user_id = '00000000-0000-0000-0000-0000000000a7'), 0, 'a child''s presence is never recorded');
select t.eq((select count(*) from threads where title = 'My school trip'), 0, 'nothing is published before a parent says OK');
select t.ok((select count(*) > 0 from push_queue where kind = 'child' and user_id = '00000000-0000-0000-0000-00000000000a'), 'the parent is notified that something is waiting');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');   -- a steward who is not Kavi's parent
select t.eq((select count(*) from child_drafts), 0, 'other members cannot see a child''s drafts');
select t.refused($$select child_decide((select id from child_drafts limit 1), true)$$, 'only a parent can approve');
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha, the parent
select t.eq((select count(*) from child_drafts where decided_at is null), 2, 'the parent sees what is waiting');
select child_decide((select id from child_drafts where kind = 'thread' and decided_at is null), true);
select child_decide((select id from child_drafts where kind = 'detail' and decided_at is null), false);
reset role;
select t.ok((select author = '00000000-0000-0000-0000-0000000000a7' and author_person = 'K' from threads where title = 'My school trip'), 'once approved it is published under the child''s name');
select t.eq((select count(*) from profile_fields where person_id = 'K' and field = 'interests' and value = 'Chess'), 0, 'a declined detail is not saved');
select t.ok((select bool_and(payload::text not like '%Mysore%' and payload::text not like '%Chess%') from child_drafts), 'decided drafts keep no copy of what the child wrote');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a7');
select t.ok((select count(*) >= 1 from profile_fields where person_id = 'K'), 'a child sees their own details');
reset role;

-- 0035: no duplicate invitations, admins included
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');   -- the admin
select t.refused($$insert into invitations(email, person_id) values ('twice@x.in', 'K')$$, 'even an admin cannot invite someone who has joined');
reset role;

-- 0036: the site's own admin login (no place in the tree) is the "Family Admin" contact in Messages
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000ad','site-admin@x.in');
insert into members(user_id, person_id, role) values ('00000000-0000-0000-0000-0000000000ad', null, 'admin');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000ad');   -- the Family Admin writes to Asha
select dm_open('A');
insert into dm_messages(conversation_id, body) values ((select dm_open('A')), 'Welcome to the site');
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha sees who it is from and can open it
select t.eq((select count(*) from dm_list() where other_person = 'site'), 1::bigint, 'a message from the admin login shows as the Family Admin');
select t.ok((select dm_open('site')) = (select id from dm_list() where other_person = 'site'), 'opening the Family Admin conversation finds the same one');
insert into dm_messages(conversation_id, body) values ((select dm_open('site')), 'Thank you');
select t.as_user('00000000-0000-0000-0000-0000000000ad');
select t.refused($$select dm_open('site')$$, 'the Family Admin cannot message itself');
reset role;
select t.ok((select push_name('00000000-0000-0000-0000-0000000000ad')) = 'Family Admin', 'phone notifications name the Family Admin');
select t.ok(exists(select 1 from push_queue where url = '#/chat/site') or not exists(select 1 from push_subscriptions), 'notifications open the Family Admin conversation');
set role anon;
select t.refused($$select site_admin_uid()$$, 'signed-out visitors cannot look up the admin login');
reset role;

-- 0037: "joined" means signed in, not just sent a sign-in link
insert into persons(id, given_name, birth_year, is_living) values ('LNK', 'Linky', 1960, true);
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000ae','linked@x.in');
insert into members(user_id, person_id, role) values ('00000000-0000-0000-0000-0000000000ae', 'LNK', 'member');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.eq((select count(*) from recent_joins() where person_id = 'LNK'), 0, 'someone sent a sign-in link has not joined yet');
reset role;
update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000000ae';
set role authenticated;
select t.eq((select count(*) from recent_joins() where person_id = 'LNK'), 1, 'they show as joined once they sign in');
reset role;
update auth.users set last_sign_in_at = now() + interval '1 day' where id = '00000000-0000-0000-0000-0000000000ae';
select t.ok((select first_signin_at < now() + interval '1 hour' from members where user_id = '00000000-0000-0000-0000-0000000000ae'), 'signing in again does not move their joined date');
insert into auth.users(id,email,last_sign_in_at) values ('00000000-0000-0000-0000-0000000000af','asked@x.in', now() - interval '3 days');
insert into persons(id, given_name, birth_year, is_living) values ('ASK', 'Asky', 1965, true);
insert into members(user_id, person_id, role) values ('00000000-0000-0000-0000-0000000000af', 'ASK', 'member');
select t.ok((select first_signin_at is not null from members where user_id = '00000000-0000-0000-0000-0000000000af'), 'someone approved after signing in counts as joined at approval');
-- 0038: members correct tree details for themselves and close family
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha
update persons set surname = 'Iyer' where id = 'B';
update persons set birth_year = 1981 where id = 'A';
update persons set surname = 'Changed' where id = 'D';       -- Dev is her nephew: not close family
reset role;
select t.ok((select surname = 'Iyer' from persons where id = 'B'), 'a member can fix a brother''s tree details');
select t.ok((select birth_year = 1981 from persons where id = 'A'), 'a member can fix their own tree details');
select t.ok((select surname <> 'Changed' from persons where id = 'D'), 'a member cannot edit someone outside close family');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.refused($$update persons set sort_key = '1983.009' where id = 'B'$$, 'a member cannot change the birth order');
select t.refused($$update persons set is_living = false, death_date = '20260101' where id = 'B'$$, 'a member cannot mark someone who has joined as passed away');
select t.as_user('00000000-0000-0000-0000-0000000000a7');   -- Kavi, under 18
update persons set given_name = 'Kavi K' where id = 'K';
reset role;
select t.ok((select given_name = 'Kavi' from persons where id = 'K'), 'a child cannot edit tree details directly');
select t.ok(exists(select 1 from audit_log where table_name = 'persons' and record_key = 'B' and action = 'update'), 'tree edits by members are in the audit log');

-- 0039: who has signed in (person ids only, members only)
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.ok((select count(*) from signed_in_people() s where s = 'LNK') = 1, 'members see who has signed in');
select t.ok((select count(*) from signed_in_people() s where s = 'ASK') = 1 and (select count(*) from signed_in_people() s where s = 'E') = 0, 'only people who have signed in are listed');
reset role;
set role anon;
select t.refused($$select signed_in_people()$$, 'signed-out visitors cannot see who has signed in');
reset role;

-- 0040: engagement milestone and fiance(e)'s name
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha, her own profile
insert into profile_fields(person_id,field,value,visibility) values ('A','engagement','20260214','family'), ('A','engaged_to','Arjun','family')
  on conflict (person_id, field) do update set value = excluded.value;
select t.ok((select count(*) from profile_fields where person_id = 'A' and field in ('engagement','engaged_to')) = 2, 'a member can add their engagement date and who they are engaged to');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.refused($$insert into profile_fields(person_id,field,value,visibility) values ('A','engagement','not a date','family') on conflict (person_id, field) do update set value = excluded.value$$, 'an engagement date must be a date');
select t.as_user('00000000-0000-0000-0000-0000000000a7');   -- Kavi, under 18: still can't write directly
select t.refused($$insert into profile_fields(person_id,field,value,visibility) values ('K','engagement','20260101','family')$$, 'a child cannot add an engagement directly');
reset role;

-- 0041: engaged couples via set_couple()
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000c');   -- Chitra, one of the couple
select set_couple('A', 'C', 'engaged', '20080101', null);
reset role;
select t.ok((select kind = 'engaged' and start_date = '20080101' from partnerships where least(person_a, person_b) = 'A' and greatest(person_a, person_b) = 'C'), 'a partner can mark the couple as engaged, with the engagement date');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000e');   -- a plain member, not part of the couple
select t.refused($$select set_couple('A', 'C', 'married', null, null)$$, 'nobody else changes a couple''s status');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.refused($$select set_couple('A', 'C', 'other', null, null)$$, 'only married or engaged can be chosen');
select t.refused($$select set_couple('A', 'C', 'married', '2009', null)$$, 'the date must be a full date');
select set_couple('A', 'C', 'married', '20090515', 'Cochin');   -- back to the fixture
reset role;
select t.ok((select kind = 'married' and start_date = '20090515' from partnerships where least(person_a, person_b) = 'A' and greatest(person_a, person_b) = 'C'), 'an engaged couple can be marked married with the wedding date');
select t.ok(exists(select 1 from audit_log where table_name = 'partnerships' and action = 'update'), 'status changes are in the audit log');
set role anon;
select t.refused($$select set_couple('A', 'C', 'engaged', null, null)$$, 'signed-out visitors cannot change a couple');
reset role;

-- 0042: relationship status
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha, her own profile
insert into profile_fields(person_id,field,value,visibility) values ('A','marital_status','engaged','close')
  on conflict (person_id, field) do update set value = excluded.value, visibility = excluded.visibility;
select t.ok((select value = 'engaged' from profile_fields where person_id = 'A' and field = 'marital_status'), 'a member can set their own relationship status, with its own visibility');
select t.refused($$update profile_fields set value = 'complicated' where person_id = 'A' and field = 'marital_status'$$, 'only the listed statuses can be chosen');
select t.as_user('00000000-0000-0000-0000-0000000000ff');   -- an admin, for Kavi (under 18)
select t.refused($$insert into profile_fields(person_id,field,value,visibility) values ('K','marital_status','engaged','family')$$, 'nobody can mark an under-18 as engaged');
select t.refused($$insert into profile_fields(person_id,field,value,visibility) values ('K','marital_status','married','family')$$, 'nobody can mark an under-18 as married');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.refused($$update profile_fields set value = 'alliance' where person_id = 'A' and field = 'marital_status'$$, 'looking for an alliance is not offered (0043)');
select t.refused($$update profile_fields set value = 'divorced' where person_id = 'A' and field = 'marital_status'$$, 'divorced is not offered (0043)');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.refused($$select set_couple('A', 'C', 'divorced', null, null)$$, 'a couple cannot be marked divorced (0043)');
reset role;


-- 0044: hardening
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prorettype = 'trigger'::regtype and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))), 'no trigger function can be called through the API');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and p.proconfig is null and p.oid not in (select objid from pg_depend where deptype = 'e')), 'every function in public has a fixed search_path');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
insert into threads(category, title, body) values ('general', 'Still works', 'Triggers keep firing after 0044.');
select t.ok((select author_person = 'A' from threads where title = 'Still works'), 'triggers still stamp the author after EXECUTE was taken away');
reset role;


-- 0045: no passwords, no member email changes
insert into auth.users(id, email, encrypted_password) values ('00000000-0000-0000-0000-0000000000f9', 'pw@x.in', '$2a$10$abcdefghijklmnopqrstuv');
select t.ok((select encrypted_password = '' from auth.users where id = '00000000-0000-0000-0000-0000000000f9'), 'a new sign-in account never keeps a password');
update auth.users set encrypted_password = '$2a$10$zzzz' where id = '00000000-0000-0000-0000-0000000000f9';
select t.ok((select encrypted_password = '' from auth.users where id = '00000000-0000-0000-0000-0000000000f9'), 'a password can''t be set later either');
select t.refused($$update auth.users set email_change = 'thief@x.in' where id = '00000000-0000-0000-0000-0000000000f9'$$, 'a sign-in email change is refused');
update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000000f9';
select t.ok((select last_sign_in_at is not null from auth.users where id = '00000000-0000-0000-0000-0000000000f9'), 'ordinary sign-in updates still work');
delete from auth.users where id = '00000000-0000-0000-0000-0000000000f9';
select t.ok(not has_function_privilege('authenticated', 'public.auth_user_guard()', 'execute'), 'members cannot call the guard');


-- 0046: admins need 2-step sign-in
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000f0', 'site@x.in');
insert into members(user_id, person_id, role) values ('00000000-0000-0000-0000-0000000000f0', null, 'admin');   -- the Family Admin account
select t.ok((select admin_since is not null from members where user_id = '00000000-0000-0000-0000-00000000000b'), 'becoming an admin stamps admin_since');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok(is_admin(), 'a new admin without 2-step has admin powers during the 7 days');
update members set admin_since = now() - interval '30 days', mfa_stage = 6 where user_id = '00000000-0000-0000-0000-00000000000b';
select t.ok((select admin_since > now() - interval '1 day' from members where user_id = '00000000-0000-0000-0000-00000000000b'), 'an admin cannot move their own deadline');
select t.refused($$select has_mfa('00000000-0000-0000-0000-00000000000b')$$, 'members cannot call has_mfa');
select t.refused($$select admin_mfa_run()$$, 'members cannot run the 2-step job');
select t.ok(has_function_privilege('service_role', 'public.admin_mfa_run()', 'execute'), 'the server key can run the 2-step job');
reset role;
select set_config('request.jwt.claim.sub', '', false);
select admin_mfa_run();
select t.ok(exists (select 1 from dm_messages where sender = site_admin_uid() and body like 'Hello %2-step sign-in%'), 'a new admin gets the 2-step message from the Family Admin account');
select t.ok(not exists (select 1 from dm_messages m join dm_conversations c on c.id = m.conversation_id where c.user_a = c.user_b), 'the Family Admin account is not messaged by itself');
select admin_mfa_run();
select t.eq((select count(*) from dm_messages m join dm_conversations c on c.id = m.conversation_id where m.sender = site_admin_uid() and '00000000-0000-0000-0000-00000000000b' in (c.user_a, c.user_b)), 1, 'running again the same day sends nothing more');
update members set admin_since = now() - interval '3 days 1 hour' where user_id = '00000000-0000-0000-0000-00000000000b';
select admin_mfa_run();
select t.ok(exists (select 1 from dm_messages where body like 'Reminder, %4 days left%'), 'a daily reminder counts down the days');
update members set admin_since = now() - interval '6 days 1 hour' where user_id = '00000000-0000-0000-0000-00000000000b';
select admin_mfa_run();
select t.ok(exists (select 1 from dm_messages where body like 'Reminder, %last day%'), 'the last reminder says it is the last day');
update members set admin_since = now() - interval '7 days 1 hour' where user_id = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok(not is_admin(), 'after 7 days without 2-step, admin powers stop');
reset role;
select set_config('request.jwt.claim.sub', '', false);
select admin_mfa_run();
select t.ok((select role = 'member' and admin_since is null from members where user_id = '00000000-0000-0000-0000-00000000000b'), 'after 7 days the admin role is removed');
select t.ok(exists (select 1 from dm_messages where body like 'Hello %, 2-step sign-in wasn''t turned on%'), 'and they are told how to get it back');
select t.ok((select role = 'admin' from members where user_id = '00000000-0000-0000-0000-0000000000f0'), 'the last admin is never removed');
-- set up 2-step and come back
update members set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000b';
insert into auth.mfa_factors(user_id, factor_type, status) values ('00000000-0000-0000-0000-00000000000b', 'totp', 'verified');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select set_config('request.jwt.claim.aal', 'aal1', false);
select t.ok(not is_admin(), 'with 2-step set up, a session without the code has no admin powers');
select set_config('request.jwt.claim.aal', 'aal2', false);
select t.ok(is_admin(), 'with the code, admin powers work');
reset role;
select set_config('request.jwt.claim.sub', '', false);
select admin_mfa_run();
select t.ok((select mfa_stage = 100 from members where user_id = '00000000-0000-0000-0000-00000000000b') and exists (select 1 from dm_messages where body like 'Thank you, %. 2-step%'), 'turning 2-step on gets a thank-you, once');
delete from auth.mfa_factors where user_id = '00000000-0000-0000-0000-00000000000b';
select admin_mfa_run();
select t.ok((select admin_since > now() - interval '1 hour' and mfa_stage = 0 from members where user_id = '00000000-0000-0000-0000-00000000000b'), 'removing 2-step starts the 7 days again');
select set_config('request.jwt.claim.aal', '', false);
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.eq((select count(*) from member_activity() where two_step is not null), (select count(*) from members), 'admins see 2-step status in Members & roles');
reset role;


-- 0047: throwaway emails and the pass-through check
select set_config('request.jwt.claim.sub', '', false);
select t.ok(blocked_email('x@mailinator.com') and blocked_email('a@guerrillamailblock.com') and blocked_email('z@euploading.com') and blocked_email('admin@ourfamily.example') and blocked_email('q@test.com'), 'throwaway, made-up and our own addresses are blocked');
select t.ok(not blocked_email('ragini@gmail.com') and not blocked_email('a@yahoo.co.in') and not blocked_email('x@outlook.com'), 'ordinary addresses are fine');
select t.refused($$insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000e9', 'probe@mailinator.com')$$, 'a throwaway address cannot create a sign-in');
select proxy_token_set(encode(extensions.digest('tok', 'sha256'), 'hex'));
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
select set_config('request.headers', '{"x-fam-proxy":"tok"}', false);
select t.ok((select true from (select private.check_request()) x), 'a request through api.ourfamily.example is let in');
select set_config('request.headers', '{}', false);
select t.refused($$select private.check_request()$$, 'a member calling supabase.co directly is refused');
select set_config('request.headers', '{"x-fam-proxy":"guess"}', false);
select t.refused($$select private.check_request()$$, 'a made-up proof header is refused');
select t.refused($$select proxy_token_set('00')$$, 'members cannot register a token');
reset role;
set role anon;
select set_config('request.headers', '{}', false);
select t.refused($$select private.check_request()$$, 'a signed-out visitor calling supabase.co directly is refused');
reset role;
set role service_role;
select t.ok((select true from (select private.check_request()) x), 'server-key calls are not affected');
select t.ok(has_function_privilege('service_role', 'private.proxy_token_ok(text)', 'execute'), 'the server key can always run the check''s helper');
reset role;
select set_config('request.headers', '', false);

-- 0049: This week in the family
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.refused($$select * from weekly_emails$$, 'members cannot read the weekly email record');
select t.refused($$select weekly_digest(current_date)$$, 'members cannot read the weekly email list (it has email addresses)');
select t.refused($$select weekly_sent(current_date, 1)$$, 'members cannot mark the weekly email sent');
reset role;
set role anon;
select t.refused($$select weekly_digest(current_date)$$, 'signed-out visitors cannot read the weekly email list');
reset role;
select set_config('request.jwt.claim.sub', '', false);
select t.ok(jsonb_array_length(weekly_digest('2030-01-06')->'recipients') > 0, 'the server gets the weekly email list');
select t.eq((select count(*) from jsonb_array_elements(weekly_digest('2030-01-06')->'recipients') r where r ? 'email' and r ? 'given_name' and (select count(*) from jsonb_object_keys(r)) = 2), (jsonb_array_length(weekly_digest('2030-01-06')->'recipients'))::bigint, 'each recipient is only an email and a first name');
insert into member_prefs(user_id, email_weekly) values ('00000000-0000-0000-0000-00000000000a', false) on conflict (user_id) do update set email_weekly = false;
select t.eq((select count(*) from jsonb_array_elements(weekly_digest('2030-01-06')->'recipients') r join auth.users u on u.email = r->>'email' where u.id = '00000000-0000-0000-0000-00000000000a'), 0, 'turning the weekly email off takes you off the list');
update member_prefs set email_weekly = true where user_id = '00000000-0000-0000-0000-00000000000a';
select set_config('fam.as_author', '00000000-0000-0000-0000-00000000000b', false);
insert into photos(id, path, caption) values ('00000000-0000-0000-0000-0000000e0001', 'album/weekly-declined.jpg', 'Hidden');
select set_config('fam.as_author', '', false);
select t.ok((select (weekly_digest('2030-01-06')->>'photos')::int >= 1), 'new photos are counted');
select (weekly_digest('2030-01-06')->>'photos')::int as before_decline \gset
alter table photo_tags disable trigger user;
insert into photo_tags(photo_id, person_id, status, tagged_by) values ('00000000-0000-0000-0000-0000000e0001', 'A', 'declined', '00000000-0000-0000-0000-00000000000b');
alter table photo_tags enable trigger user;
select t.eq((weekly_digest('2030-01-06')->>'photos')::int, :before_decline - 1, 'a photo someone declined is not counted');
select t.ok(weekly_digest('2030-01-06') ? 'threads' and not (weekly_digest('2030-01-06')::text ~* 'body'), 'conversations are titles and counts only');
select weekly_sent('2030-01-06', 3);
select t.ok(weekly_digest('2030-01-06') is null, 'each week goes out only once');
select t.ok(weekly_digest('2030-01-13') is not null, 'the next week still goes out');
alter table photo_tags disable trigger user; alter table photos disable trigger user;
delete from photo_tags where photo_id = '00000000-0000-0000-0000-0000000e0001';
delete from photos where id = '00000000-0000-0000-0000-0000000e0001';
alter table photo_tags enable trigger user; alter table photos enable trigger user;

-- 0050: email borders
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.refused($$select * from email_borders()$$, 'members cannot read the email border list (it has email addresses)');
reset role;
select set_config('request.jwt.claim.sub', '', false);
select t.ok((select count(*) > 0 from email_borders()), 'the server gets each member''s border');
select t.eq((select count(*) from email_borders() e join auth.users u on u.email = e.email join members m on m.user_id = u.id join persons p on p.id = m.person_id
             where e.gender is distinct from coalesce(p.gender, '')), 0::bigint, 'the server gets each member''s gender from the tree, for the border');

-- 0052: borders from every community's dress
select t.ok((select count(*) from information_schema.columns where table_name = 'member_prefs' and column_name = 'border') = 1, 'members keep a border choice');
select t.refused($$update member_prefs set border = 'not-a-border' where user_id = (select user_id from member_prefs limit 1)$$, 'only borders we draw can be saved');
update member_prefs set border = 'phulkari' where user_id = (select mp.user_id from member_prefs mp join members m on m.user_id = mp.user_id and m.status = 'active' join auth.users u on u.id = m.user_id where u.email is not null and m.person_id is not null limit 1);
select t.ok((select count(*) from email_borders() where border = 'phulkari') = 1, 'the server sees the saved choice as it is');
update member_prefs set border = '' where border = 'phulkari';

-- 0053: tradition fields for every family
reset role;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');   -- Asha, her own profile
insert into profile_fields(person_id,field,value,visibility) values ('A','baptism','19840600','family')
  on conflict (person_id, field) do update set value = excluded.value;
select t.ok((select value = '19840600' from profile_fields where person_id = 'A' and field = 'baptism'), 'a member can record a baptism date (any tradition''s milestone)');
select t.refused($$insert into profile_fields(person_id,field,value,visibility) values ('A','amrit_sanchar','last year','family')$$, 'milestones must be dates');
select t.refused($$insert into profile_fields(person_id,field,value,visibility) values ('A','gurdwara',repeat('x',121),'family')$$, 'the gurdwara is a short place name');
select t.refused($$insert into profile_fields(person_id,field,value,visibility) values ('A','caste','x','family')$$, 'only listed details can be stored');
delete from profile_fields where person_id = 'A' and field = 'baptism';
reset role;

-- ---------------------------------------------------------------- 0051 first admin (setup only)
reset role;
select t.as_user('');
select t.refused($$insert into invitations (email, person_id, role) values ('second.admin@gmail.com', null, 'admin')$$, 'once the site has an admin, the setup shortcut is closed');
select t.as_user('00000000-0000-0000-0000-00000000000d');

\echo ALL PRIVACY TESTS PASSED

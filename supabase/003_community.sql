alter table public.rooms
  add column if not exists description text not null default '',
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists created_by_name text not null default '',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists last_message_at timestamptz,
  add column if not exists last_author text,
  add column if not exists last_body text,
  add column if not exists last_user_id uuid;

alter table public.room_members
  add column if not exists last_read_at timestamptz not null default now();

alter table public.messages
  add column if not exists deleted boolean not null default false;

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages drop constraint if exists messages_body_rule;
alter table public.messages add constraint messages_body_rule check (
  (deleted and body = '') or (not deleted and char_length(body) between 1 and 1000)
);

alter table public.messages drop constraint if exists messages_user_id_fkey;
alter table public.messages add constraint messages_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

create index if not exists messages_room_unread on public.messages (room_id, created_at) where not deleted;

alter table public.rooms drop constraint if exists rooms_rules;
alter table public.rooms add constraint rooms_rules check (
  id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  and char_length(id) <= 60
  and char_length(btrim(name)) between 3 and 40
  and char_length(description) <= 160
  and groups <@ array['regions', 'buddies']::text[]
  and char_length(initials) between 1 and 2
) not valid;

create unique index if not exists rooms_name_unique on public.rooms (lower(name));

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.messages (id) on delete cascade,
  reporter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  unique (message_id, reporter)
);

create or replace function public.set_message_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.deleted := false;
  if auth.uid() is null then
    return new;
  end if;
  new.user_id := auth.uid();
  new.created_at := now();
  new.author_name := coalesce((select p.name from public.profiles p where p.id = new.user_id), 'Traveller');
  return new;
end;
$$;

create or replace function public.refresh_room_last(target text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  at_time timestamptz;
  author text;
  text_body text;
  author_id uuid;
begin
  select m.created_at, m.author_name, m.body, m.user_id
    into at_time, author, text_body, author_id
  from public.messages m
  where m.room_id = target and not m.deleted
  order by m.created_at desc, m.id desc
  limit 1;

  update public.rooms
  set last_message_at = at_time, last_author = author, last_body = text_body, last_user_id = author_id
  where id = target;
end;
$$;

revoke execute on function public.refresh_room_last(text) from public, anon, authenticated;

create or replace function public.after_message_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and not new.deleted then
    update public.rooms
    set last_message_at = new.created_at, last_author = new.author_name, last_body = new.body, last_user_id = new.user_id
    where id = new.room_id;
    return new;
  end if;
  perform public.refresh_room_last(coalesce(new.room_id, old.room_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists after_message_change on public.messages;
create trigger after_message_change
  after insert or update or delete on public.messages
  for each row execute function public.after_message_change();

update public.rooms r set description = v.description
from (values
  ('kakum', 'Canopy walks, castles and the Central Region coast.'),
  ('volta', 'Waterfalls, mountains and the lake.'),
  ('accra', 'Beaches, food and weekend plans in the capital.'),
  ('mole', 'Safaris, Larabanga and getting to Mole.'),
  ('solo', 'Find travel buddies and share solo tips.'),
  ('north', 'Tamale, the Savannah and the far north.')
) as v (id, description)
where r.id = v.id and r.description = '';

delete from public.messages where user_id is null;

update public.rooms r
set members = (select count(*) from public.room_members m where m.room_id = r.id);

do $$
declare
  room record;
begin
  for room in select id from public.rooms loop
    perform public.refresh_room_last(room.id);
  end loop;
end;
$$;

create or replace function public.create_room(room_name text, room_description text default '', room_topic text default '')
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean_name text := regexp_replace(btrim(coalesce(room_name, '')), '\s+', ' ', 'g');
  clean_about text := regexp_replace(btrim(coalesce(room_description, '')), '\s+', ' ', 'g');
  topic text := coalesce(room_topic, '');
  base text;
  new_id text;
  counter int := 1;
  words text[];
  letters text;
  result public.rooms;
begin
  if uid is null then
    raise exception 'Sign in to create a room.' using errcode = '42501';
  end if;
  if char_length(clean_name) < 3 or char_length(clean_name) > 40 then
    raise exception 'Room names need 3 to 40 characters.' using errcode = '23514';
  end if;
  if clean_name !~ '[[:alnum:]]' then
    raise exception 'Use letters or numbers in the room name.' using errcode = '23514';
  end if;
  if char_length(clean_about) > 160 then
    raise exception 'Keep the description under 160 characters.' using errcode = '23514';
  end if;
  if topic not in ('', 'regions', 'buddies') then
    raise exception 'Choose a topic from the list.' using errcode = '23514';
  end if;
  if exists (select 1 from public.rooms where lower(name) = lower(clean_name)) then
    raise exception 'There''s already a room called %. Join that one instead.', clean_name using errcode = '23505';
  end if;
  if not public.is_admin() and (
    select count(*) from public.rooms
    where created_by = uid and created_at > now() - interval '1 day'
  ) >= 3 then
    raise exception 'You can create up to 3 rooms a day. Try again tomorrow.' using errcode = '23514';
  end if;

  base := left(btrim(regexp_replace(lower(clean_name), '[^a-z0-9]+', '-', 'g'), '-'), 50);
  base := btrim(base, '-');
  if base = '' then
    base := 'room';
  end if;
  new_id := base;
  while exists (select 1 from public.rooms where id = new_id) loop
    counter := counter + 1;
    new_id := base || '-' || counter;
  end loop;

  words := array_remove(regexp_split_to_array(regexp_replace(clean_name, '[^[:alnum:] ]', '', 'g'), ' '), '');
  letters := upper(left(coalesce(words[1], 'R'), 1) || coalesce(left(words[2], 1), ''));

  insert into public.rooms (id, name, initials, groups, description, created_by, created_by_name, sort, members)
  values (
    new_id,
    clean_name,
    letters,
    case when topic = '' then '{}'::text[] else array[topic] end,
    clean_about,
    uid,
    coalesce((select p.name from public.profiles p where p.id = uid), 'Traveller'),
    coalesce((select max(sort) from public.rooms), 0) + 1,
    0
  );

  insert into public.room_members (room_id, user_id) values (new_id, uid);

  select * into result from public.rooms where id = new_id;
  return result;
end;
$$;

revoke execute on function public.create_room(text, text, text) from public, anon;
grant execute on function public.create_room(text, text, text) to authenticated;

create or replace function public.mark_read(target text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.room_members set last_read_at = now()
  where room_id = target and user_id = auth.uid();
$$;

revoke execute on function public.mark_read(text) from public, anon;
grant execute on function public.mark_read(text) to authenticated;

create or replace function public.my_unread()
returns table (room_id text, unread int)
language sql
stable
security definer
set search_path = ''
as $$
  select m.room_id, count(x.id)::int
  from public.room_members m
  left join public.messages x
    on x.room_id = m.room_id
    and x.created_at > m.last_read_at
    and not x.deleted
    and x.user_id is distinct from m.user_id
  where m.user_id = auth.uid()
  group by m.room_id;
$$;

revoke execute on function public.my_unread() from public, anon;
grant execute on function public.my_unread() to authenticated;

create or replace function public.delete_message(target bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages
  set deleted = true, body = ''
  where id = target and not deleted and (user_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'You can only delete your own messages.' using errcode = '42501';
  end if;
  delete from public.reports where message_id = target;
end;
$$;

revoke execute on function public.delete_message(bigint) from public, anon;
grant execute on function public.delete_message(bigint) to authenticated;

create or replace function public.admin_reports()
returns table (
  message_id bigint,
  room_id text,
  room_name text,
  author_name text,
  body text,
  sent_at timestamptz,
  reports int,
  reasons text[],
  last_reported timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see reports.' using errcode = '42501';
  end if;
  return query
  select m.id, m.room_id, r.name, m.author_name, m.body, m.created_at,
    count(x.id)::int,
    array_remove(array_agg(distinct nullif(x.reason, '')), null),
    max(x.created_at)
  from public.reports x
  join public.messages m on m.id = x.message_id
  join public.rooms r on r.id = m.room_id
  group by m.id, r.name
  order by max(x.created_at) desc;
end;
$$;

revoke execute on function public.admin_reports() from public, anon;
grant execute on function public.admin_reports() to authenticated;

alter table public.reports enable row level security;

drop policy if exists "Report messages" on public.reports;
create policy "Report messages" on public.reports for insert to authenticated with check (
  reporter = auth.uid()
  and exists (
    select 1 from public.messages m
    where m.id = message_id and not m.deleted and m.user_id is distinct from auth.uid()
  )
);

drop policy if exists "Admins read reports" on public.reports;
create policy "Admins read reports" on public.reports for select to authenticated using (public.is_admin());

drop policy if exists "Admins clear reports" on public.reports;
create policy "Admins clear reports" on public.reports for delete to authenticated using (public.is_admin());

drop policy if exists "Admins change rooms" on public.rooms;
create policy "Admins change rooms" on public.rooms for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins delete rooms" on public.rooms;
create policy "Admins delete rooms" on public.rooms for delete to authenticated using (public.is_admin());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end;
$$;

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.admins enable row level security;

drop policy if exists "See own admin row" on public.admins;
create policy "See own admin row" on public.admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

alter table public.places add column if not exists hidden boolean not null default false;
alter table public.places add column if not exists updated_at timestamptz not null default now();
alter table public.hotels add column if not exists hidden boolean not null default false;
alter table public.hotels add column if not exists updated_at timestamptz not null default now();

create or replace function public.ghana_regions()
returns text[]
language sql
immutable
as $$
  select array['Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern', 'Greater Accra', 'North East',
               'Northern', 'Oti', 'Savannah', 'Upper East', 'Upper West', 'Volta', 'Western', 'Western North'];
$$;

alter table public.places drop constraint if exists places_rules;
alter table public.places add constraint places_rules check (
  id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  and char_length(name) between 2 and 80
  and category in ('Nature', 'History', 'Wildlife', 'Beach', 'Culture')
  and region = any (public.ghana_regions())
  and char_length(area) between 2 and 120
  and reviews >= 0
  and char_length(image) > 0
  and map_x between 0 and 100
  and map_y between 0 and 100
  and cardinality(about) between 1 and 6
  and jsonb_typeof(facts) = 'array'
) not valid;

alter table public.hotels drop constraint if exists hotels_rules;
alter table public.hotels add constraint hotels_rules check (
  id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  and char_length(name) between 2 and 80
  and region = any (public.ghana_regions())
  and char_length(area) between 2 and 120
  and price between 1 and 100000
) not valid;

alter table public.profiles drop constraint if exists profiles_region_rule;
alter table public.profiles add constraint profiles_region_rule check (
  region is null or region = any (public.ghana_regions())
) not valid;

alter table public.profiles drop constraint if exists profiles_prefs_rule;
alter table public.profiles add constraint profiles_prefs_rule check (jsonb_typeof(prefs) = 'object') not valid;

create or replace function public.check_place()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  missing text;
begin
  new.related := array(
    select r from unnest(new.related) with ordinality as t (r, n)
    where r <> new.id group by r order by min(n)
  );
  select string_agg(r, ', ') into missing
  from unnest(new.related) as r
  where not exists (select 1 from public.places p where p.id = r);
  if missing is not null then
    raise exception 'Nearby places not found: %', missing using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.facts) as f
    where jsonb_typeof(f) <> 'object'
       or coalesce(trim(f ->> 'label'), '') = ''
       or coalesce(trim(f ->> 'value'), '') = ''
  ) then
    raise exception 'Every fact needs a label and a value.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists before_place_save on public.places;
create trigger before_place_save
  before insert or update on public.places
  for each row execute function public.check_place();

create or replace function public.check_hotel()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  missing text;
begin
  new.amenities := array(
    select a from unnest(new.amenities) with ordinality as t (a, n)
    group by a order by min(n)
  );
  select string_agg(a, ', ') into missing
  from unnest(new.amenities) as a
  where not exists (select 1 from public.amenities m where m.key = a);
  if missing is not null then
    raise exception 'Unknown amenities: %', missing using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists before_hotel_save on public.hotels;
create trigger before_hotel_save
  before insert or update on public.hotels
  for each row execute function public.check_hotel();

create or replace function public.forget_place()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.places set related = array_remove(related, old.id) where old.id = any (related);
  return old;
end;
$$;

drop trigger if exists after_place_delete on public.places;
create trigger after_place_delete
  after delete on public.places
  for each row execute function public.forget_place();

create or replace function public.check_trip()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  missing text;
begin
  if cardinality(new.stops) = 0 or cardinality(new.stops) > 30 then
    raise exception 'A trip needs between 1 and 30 stops.' using errcode = '23514';
  end if;
  select string_agg(s, ', ') into missing
  from unnest(new.stops) as s
  where not exists (select 1 from public.places p where p.id = s);
  if missing is not null then
    raise exception 'These stops are not places on Wandr: %', missing using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists before_trip_save on public.trips;
create trigger before_trip_save
  before insert or update on public.trips
  for each row execute function public.check_trip();

create or replace function public.check_booking()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.check_in < current_date then
    raise exception 'Check-in can''t be in the past.' using errcode = '23514';
  end if;
  if new.check_out - new.check_in > 30 then
    raise exception 'Bookings can be at most 30 nights.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists before_booking_insert on public.bookings;
create trigger before_booking_insert
  before insert on public.bookings
  for each row execute function public.check_booking();

create or replace function public.limit_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and (
    select count(*) from public.messages
    where user_id = new.user_id and created_at > now() - interval '10 seconds'
  ) >= 5 then
    raise exception 'You''re sending messages too quickly. Wait a few seconds.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists before_message_limit on public.messages;
create trigger before_message_limit
  before insert on public.messages
  for each row execute function public.limit_messages();

drop policy if exists "Anyone can read places" on public.places;
create policy "Anyone can read places" on public.places for select to anon, authenticated
  using (not hidden or public.is_admin());
drop policy if exists "Admins add places" on public.places;
create policy "Admins add places" on public.places for insert to authenticated with check (public.is_admin());
drop policy if exists "Admins change places" on public.places;
create policy "Admins change places" on public.places for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins remove places" on public.places;
create policy "Admins remove places" on public.places for delete to authenticated using (public.is_admin());

drop policy if exists "Anyone can read hotels" on public.hotels;
create policy "Anyone can read hotels" on public.hotels for select to anon, authenticated
  using (not hidden or public.is_admin());
drop policy if exists "Admins add hotels" on public.hotels;
create policy "Admins add hotels" on public.hotels for insert to authenticated with check (public.is_admin());
drop policy if exists "Admins change hotels" on public.hotels;
create policy "Admins change hotels" on public.hotels for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins remove hotels" on public.hotels;
create policy "Admins remove hotels" on public.hotels for delete to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins read media" on storage.objects;
create policy "Admins read media" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_admin());
drop policy if exists "Admins upload media" on storage.objects;
create policy "Admins upload media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());
drop policy if exists "Admins replace media" on storage.objects;
create policy "Admins replace media" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_admin());
drop policy if exists "Admins delete media" on storage.objects;
create policy "Admins delete media" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());

create table public.amenities (
  key text primary key,
  label text not null,
  sort int not null default 0
);

create table public.hotels (
  id text primary key,
  name text not null,
  area text not null,
  region text not null,
  price int not null check (price > 0),
  rating numeric(2, 1) not null check (rating between 0 and 5),
  amenities text[] not null default '{}',
  image text,
  sort int not null default 0
);

create table public.places (
  id text primary key,
  name text not null,
  category text not null,
  region text not null,
  area text not null,
  rating numeric(2, 1) not null check (rating between 0 and 5),
  reviews int not null default 0,
  image text not null,
  image_alt text not null default '',
  gallery text[] not null default '{}',
  about text[] not null default '{}',
  facts jsonb not null default '[]',
  stay_hotel text references public.hotels (id),
  stay_note text,
  related text[] not null default '{}',
  map_x numeric(4, 1) not null,
  map_y numeric(4, 1) not null,
  featured boolean not null default false,
  sort int not null default 0
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  bio text check (char_length(bio) <= 300),
  region text,
  phone text check (phone ~ '^[0-9]{7,12}$'),
  phone_code text not null default '+233',
  email_visibility text not null default 'private' check (email_visibility in ('private', 'public')),
  phone_visibility text not null default 'private' check (phone_visibility in ('private', 'public')),
  avatar text check (char_length(avatar) <= 200000),
  prefs jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.visited (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id text not null references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create table public.saved_places (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id text not null references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  start_date date,
  end_date date,
  travellers int not null default 1 check (travellers between 1 and 50),
  budget int check (budget >= 0),
  stops text[] not null default '{}',
  status text not null default 'planned' check (status in ('draft', 'planned', 'booked')),
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hotel_id text not null references public.hotels (id),
  check_in date not null,
  check_out date not null,
  guests int not null check (guests between 1 and 6),
  nights int generated always as (check_out - check_in) stored,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (check_out > check_in)
);

create table public.rooms (
  id text primary key,
  name text not null,
  initials text not null,
  groups text[] not null default '{}',
  members int not null default 0,
  sort int not null default 0
);

create table public.room_members (
  room_id text not null references public.rooms (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.messages (
  id bigint generated always as identity primary key,
  room_id text not null references public.rooms (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  author_name text not null default '',
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index messages_room_time on public.messages (room_id, created_at desc);
create index trips_user on public.trips (user_id, start_date);
create index bookings_user on public.bookings (user_id, check_in);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 80)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.set_message_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.user_id := auth.uid();
  new.created_at := now();
  new.author_name := coalesce((select p.name from public.profiles p where p.id = new.user_id), 'Traveller');
  return new;
end;
$$;

create trigger before_message_insert
  before insert on public.messages
  for each row execute function public.set_message_author();

create function public.count_room_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.rooms set members = members + 1 where id = new.room_id;
    return new;
  end if;
  update public.rooms set members = greatest(members - 1, 0) where id = old.room_id;
  return old;
end;
$$;

create trigger after_member_change
  after insert or delete on public.room_members
  for each row execute function public.count_room_members();

create function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

alter table public.amenities enable row level security;
alter table public.hotels enable row level security;
alter table public.places enable row level security;
alter table public.profiles enable row level security;
alter table public.visited enable row level security;
alter table public.saved_places enable row level security;
alter table public.trips enable row level security;
alter table public.bookings enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;

create policy "Anyone can read amenities" on public.amenities for select to anon, authenticated using (true);
create policy "Anyone can read hotels" on public.hotels for select to anon, authenticated using (true);
create policy "Anyone can read places" on public.places for select to anon, authenticated using (true);
create policy "Anyone can read rooms" on public.rooms for select to anon, authenticated using (true);
create policy "Anyone can read messages" on public.messages for select to anon, authenticated using (true);

create policy "Read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "Read own visited" on public.visited for select to authenticated using (user_id = auth.uid());
create policy "Add own visited" on public.visited for insert to authenticated with check (user_id = auth.uid());
create policy "Remove own visited" on public.visited for delete to authenticated using (user_id = auth.uid());

create policy "Read own saved" on public.saved_places for select to authenticated using (user_id = auth.uid());
create policy "Add own saved" on public.saved_places for insert to authenticated with check (user_id = auth.uid());
create policy "Remove own saved" on public.saved_places for delete to authenticated using (user_id = auth.uid());

create policy "Read own trips" on public.trips for select to authenticated using (user_id = auth.uid());
create policy "Add own trips" on public.trips for insert to authenticated with check (user_id = auth.uid());
create policy "Change own trips" on public.trips for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Remove own trips" on public.trips for delete to authenticated using (user_id = auth.uid());

create policy "Read own bookings" on public.bookings for select to authenticated using (user_id = auth.uid());
create policy "Add own bookings" on public.bookings for insert to authenticated with check (user_id = auth.uid() and status = 'requested');
create policy "Remove own bookings" on public.bookings for delete to authenticated using (user_id = auth.uid());

create policy "Read own memberships" on public.room_members for select to authenticated using (user_id = auth.uid());
create policy "Join rooms" on public.room_members for insert to authenticated with check (user_id = auth.uid());
create policy "Leave rooms" on public.room_members for delete to authenticated using (user_id = auth.uid());

create policy "Members can post" on public.messages for insert to authenticated with check (
  exists (
    select 1 from public.room_members m
    where m.room_id = messages.room_id and m.user_id = auth.uid()
  )
);

alter publication supabase_realtime add table public.messages;

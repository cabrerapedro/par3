-- par3 — Schema SQL
-- Ejecutar en Supabase > SQL Editor

-- ============================================================
-- TABLES
-- ============================================================

-- Instructors (id = auth.uid())
create table if not exists instructors (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text        not null,
  email      text unique not null,
  created_at timestamptz default now()
);

-- Students
create table if not exists students (
  id            uuid primary key default gen_random_uuid(),
  instructor_id uuid        not null references instructors(id) on delete cascade,
  name          text        not null,
  email         text,
  access_code   char(6)     not null unique,
  created_at    timestamptz default now()
);

-- Checkpoints
create table if not exists checkpoints (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid        not null references students(id) on delete cascade,
  name                 text        not null,
  camera_angle         text        not null check (camera_angle in ('face_on', 'dtl')),
  display_order        integer     not null default 0,
  instructor_note      text,
  calibration_video_url    text,
  calibration_skeleton_url text,
  calibration_marks    jsonb       not null default '[]',
  baseline             jsonb,
  status               text        not null default 'pending' check (status in ('calibrated', 'pending')),
  created_at           timestamptz default now()
);

-- Practice sessions
create table if not exists practice_sessions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid        not null references students(id) on delete cascade,
  checkpoint_id    uuid        not null references checkpoints(id) on delete cascade,
  video_url        text,
  date             timestamptz default now(),
  duration_seconds integer     not null default 0,
  results          jsonb       not null default '{}',
  overall_score    integer     not null default 0,
  created_at       timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table instructors       enable row level security;
alter table students          enable row level security;
alter table checkpoints       enable row level security;
alter table practice_sessions enable row level security;

-- Instructors: own row only
create policy "instructors_own"
  on instructors for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Students: instructors manage their students; anon can lookup by code
create policy "students_instructor_all"
  on students for all
  to authenticated
  using (instructor_id = auth.uid())
  with check (instructor_id = auth.uid());

create policy "students_anon_select"
  on students for select
  to anon
  using (true);

-- Checkpoints: instructors manage via student; anon can read
create policy "checkpoints_instructor_all"
  on checkpoints for all
  to authenticated
  using (
    student_id in (
      select id from students where instructor_id = auth.uid()
    )
  );

create policy "checkpoints_anon_select"
  on checkpoints for select
  to anon
  using (true);

-- Practice sessions: anon can insert and select (student usage)
create policy "practice_sessions_anon_insert"
  on practice_sessions for insert
  to anon
  with check (true);

create policy "practice_sessions_anon_select"
  on practice_sessions for select
  to anon
  using (true);

create policy "practice_sessions_instructor"
  on practice_sessions for all
  to authenticated
  using (
    student_id in (
      select id from students where instructor_id = auth.uid()
    )
  );

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

insert into storage.buckets (id, name, public)
values ('calibration-videos', 'calibration-videos', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('practice-videos', 'practice-videos', false)
on conflict do nothing;

insert into storage.buckets (id, name, public)
values ('instructor-notes', 'instructor-notes', true)
on conflict do nothing;

-- Storage: instructors can upload calibration videos (authenticated)
create policy "calibration_videos_instructor_upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'calibration-videos');

-- Storage: anyone can read calibration videos (students use anon role)
create policy "calibration_videos_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'calibration-videos');

-- Storage: instructors can upload audio notes (public read)
create policy "instructor_notes_upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'instructor-notes');

create policy "instructor_notes_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'instructor-notes');

-- Storage: students can upload and read practice videos
create policy "practice_videos_anon_upload"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'practice-videos');

create policy "practice_videos_anon_read"
  on storage.objects for select
  to anon
  using (bucket_id = 'practice-videos');

-- ============================================================
-- TRIGGER: Auto-crear instructor al registrarse
-- (Necesario cuando Supabase requiere confirmación de email)
-- ============================================================

create or replace function handle_new_instructor()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.instructors (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_instructor();


-- ============================================================
-- MIGRATIONS
-- ============================================================

-- Run this if the table already exists (adds the skeleton video column):
-- ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS calibration_skeleton_url text;

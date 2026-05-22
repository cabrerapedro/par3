-- Sweep — Schema SQL
-- Ejecutar en Supabase > SQL Editor

-- ============================================================
-- TABLES
-- ============================================================

-- Instructors (id = auth.uid())
create table if not exists instructors (
  id               uuid primary key references auth.users(id) on delete cascade,
  name             text        not null,
  email            text unique not null,
  preferred_locale text        not null default 'es' check (preferred_locale in ('es', 'en')),
  created_at       timestamptz default now()
);

-- Students
create table if not exists students (
  id               uuid primary key default gen_random_uuid(),
  instructor_id    uuid        not null references instructors(id) on delete cascade,
  name             text        not null,
  email            text,
  access_code      char(6)     not null unique,
  status           text        not null default 'active' check (status in ('active', 'inactive')),
  preferred_locale text        not null default 'es' check (preferred_locale in ('es', 'en')),
  created_at       timestamptz default now()
);

-- Idempotent add for existing databases (create table above is skipped when the
-- table already exists). Re-running this file backfills the column on prod.
alter table students add column if not exists status text not null default 'active'
  check (status in ('active', 'inactive'));

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
  baseline_summary     text,
  selected_metrics     text[]      not null default '{}',
  status               text        not null default 'pending' check (status in ('calibrated', 'pending')),
  created_at           timestamptz default now()
);

-- Practice sessions
create table if not exists practice_sessions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid        not null references students(id) on delete cascade,
  -- Nullable: new clip-based practice sessions populate clip_id/class_id
  -- instead. Kept on the table for legacy rows during the migration window.
  checkpoint_id    uuid        references checkpoints(id) on delete cascade,
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
drop policy if exists "instructors_own" on instructors;
create policy "instructors_own"
  on instructors for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Students: instructors manage their students; anon can lookup by code
drop policy if exists "students_instructor_all" on students;
create policy "students_instructor_all"
  on students for all
  to authenticated
  using (instructor_id = auth.uid())
  with check (instructor_id = auth.uid());

drop policy if exists "students_anon_select" on students;
create policy "students_anon_select"
  on students for select
  to anon
  using (true);

-- Checkpoints: instructors manage via student; anon can read
drop policy if exists "checkpoints_instructor_all" on checkpoints;
create policy "checkpoints_instructor_all"
  on checkpoints for all
  to authenticated
  using (
    student_id in (
      select id from students where instructor_id = auth.uid()
    )
  );

drop policy if exists "checkpoints_anon_select" on checkpoints;
create policy "checkpoints_anon_select"
  on checkpoints for select
  to anon
  using (true);

-- Practice sessions: anon can insert and select (student usage)
drop policy if exists "practice_sessions_anon_insert" on practice_sessions;
create policy "practice_sessions_anon_insert"
  on practice_sessions for insert
  to anon
  with check (true);

drop policy if exists "practice_sessions_anon_select" on practice_sessions;
create policy "practice_sessions_anon_select"
  on practice_sessions for select
  to anon
  using (true);

drop policy if exists "practice_sessions_instructor" on practice_sessions;
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
drop policy if exists "calibration_videos_instructor_upload" on storage.objects;
create policy "calibration_videos_instructor_upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'calibration-videos');

-- Storage: anyone can read calibration videos (students use anon role)
drop policy if exists "calibration_videos_instructor_read" on storage.objects;
drop policy if exists "calibration_videos_public_read" on storage.objects;
create policy "calibration_videos_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'calibration-videos');

-- Storage: instructors can upload audio notes (public read)
drop policy if exists "instructor_notes_upload" on storage.objects;
create policy "instructor_notes_upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'instructor-notes');

drop policy if exists "instructor_notes_public_read" on storage.objects;
create policy "instructor_notes_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'instructor-notes');

-- Storage: students can upload and read practice videos
drop policy if exists "practice_videos_anon_upload" on storage.objects;
create policy "practice_videos_anon_upload"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'practice-videos');

drop policy if exists "practice_videos_anon_read" on storage.objects;
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


-- Student OTPs (email-based login)
create table if not exists student_otps (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid        not null references students(id) on delete cascade,
  code        char(6)     not null,
  expires_at  timestamptz not null,
  used        boolean     default false,
  created_at  timestamptz default now()
);

alter table student_otps enable row level security;

drop policy if exists "student_otps_anon_all" on student_otps;
create policy "student_otps_anon_all"
  on student_otps for all
  to anon
  using (true)
  with check (true);

-- ============================================================
-- MIGRATIONS
-- ============================================================

-- Run this if the table already exists (adds the skeleton video column):
-- ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS calibration_skeleton_url text;

-- Add selected_metrics column + backfill from existing baselines:
-- ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS selected_metrics text[] NOT NULL DEFAULT '{}';
-- UPDATE checkpoints SET selected_metrics = ARRAY(SELECT jsonb_object_keys(baseline))
--   WHERE baseline IS NOT NULL AND baseline != 'null'::jsonb AND selected_metrics = '{}';

-- Add checkpoint_type column (position = static posture, swing = phase-based movement):
-- ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS checkpoint_type text NOT NULL DEFAULT 'position' CHECK (checkpoint_type IN ('position', 'swing'));

-- Add preferred_locale to instructors + students (i18n, May 2026):
-- ALTER TABLE instructors ADD COLUMN IF NOT EXISTS preferred_locale text NOT NULL DEFAULT 'es' CHECK (preferred_locale IN ('es', 'en'));
-- ALTER TABLE students    ADD COLUMN IF NOT EXISTS preferred_locale text NOT NULL DEFAULT 'es' CHECK (preferred_locale IN ('es', 'en'));

-- Ensure the checkpoints table has instructor_audio_url. The legacy
-- calibrate flow referenced this column; the migration script reads it
-- when moving instructor audio into clip_annotations. Some production
-- DBs had the column hot-added without it ever making it into the
-- canonical CREATE TABLE — this ALTER is the canonical placement.
alter table checkpoints add column if not exists instructor_audio_url text;

-- ============================================================
-- ============================================================
-- SECTION 3 / 11 / 12 — CLASS + CLIP DATA MODEL (May 2026)
-- ============================================================
-- New schema for the parell.golf model. Idempotent: safe to re-run.
-- Keeps the legacy `checkpoints` table around during migration; will
-- be dropped once all data is backfilled into `clips`.
-- ============================================================

-- ---------- Tables ----------

create table if not exists classes (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id) on delete cascade,
  instructor_id uuid not null references instructors(id) on delete cascade,
  date          date not null,
  created_at    timestamptz default now()
);

create index if not exists idx_classes_student_date on classes(student_id, date desc);

create table if not exists clips (
  id               uuid primary key default gen_random_uuid(),
  -- NOT NULL: every clip belongs to a class. getOrCreateTodayClass on the
  -- runtime path and the legacy migration script both guarantee a class is
  -- in place before insert. Keeping this nullable would let stray clips
  -- disappear from the per-class UI without surfacing an error.
  class_id         uuid not null references classes(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  instructor_id    uuid not null references instructors(id) on delete cascade,
  name             text not null,
  camera_angle     text not null check (camera_angle in ('face_on', 'dtl')),
  clip_type        text not null default 'position' check (clip_type in ('position', 'swing')),
  display_order    integer not null default 0,
  video_url        text,
  skeleton_url     text,
  baseline         jsonb,
  baseline_summary text,
  selected_metrics text[] not null default '{}',
  status           text not null default 'pending' check (status in ('pending', 'calibrated', 'archived')),
  -- share of sampled frames where MediaPipe detected the body (0..1)
  detection_ratio  real,
  created_at       timestamptz default now()
);

-- Idempotent add for databases created before detection_ratio existed.
alter table clips add column if not exists detection_ratio real;

create index if not exists idx_clips_class    on clips(class_id);
create index if not exists idx_clips_student  on clips(student_id);

create table if not exists clip_frames (
  id           uuid primary key default gen_random_uuid(),
  clip_id      uuid not null references clips(id) on delete cascade,
  frame_index  integer not null,
  timestamp_ms integer not null,
  landmarks    jsonb not null,
  metrics      jsonb,
  created_at   timestamptz default now()
);

create index if not exists idx_clip_frames_clip on clip_frames(clip_id, frame_index);

create table if not exists clip_annotations (
  id                 uuid primary key default gen_random_uuid(),
  clip_id            uuid not null references clips(id) on delete cascade,
  frame_timestamp_ms integer not null,
  -- strokes: array of { type: 'arrow'|'line'|'circle', color, points: [[x,y],...], label? }
  strokes            jsonb not null default '[]',
  audio_url          text,
  audio_transcript   text,
  text_note          text,
  -- composited still (video frame + drawing) captured at annotation time
  snapshot_url       text,
  -- AI "practice card" distilled from the coach's voice/note: { focus, checklist[] }
  practice_card      jsonb,
  created_at         timestamptz default now()
);

-- Idempotent add for databases created before snapshot_url existed.
alter table clip_annotations add column if not exists snapshot_url text;
-- AI practice card (focus + checklist), distilled from the coach's annotation.
alter table clip_annotations add column if not exists practice_card jsonb;

create index if not exists idx_clip_annotations_clip on clip_annotations(clip_id, frame_timestamp_ms);

-- practice_sessions: link to the new model without breaking checkpoint_id
alter table practice_sessions add column if not exists clip_id  uuid references clips(id)   on delete set null;
alter table practice_sessions add column if not exists class_id uuid references classes(id) on delete set null;
-- Drop the NOT NULL on checkpoint_id so new clip-based sessions can insert
-- with checkpoint_id=null. Safe to re-run: ALTER ... DROP NOT NULL is a no-op
-- if the constraint is already gone.
alter table practice_sessions alter column checkpoint_id drop not null;

create table if not exists session_frames (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references practice_sessions(id) on delete cascade,
  frame_index  integer not null,
  timestamp_ms integer not null,
  landmarks    jsonb not null,
  metrics      jsonb,
  created_at   timestamptz default now()
);

create index if not exists idx_session_frames_session on session_frames(session_id, frame_index);

-- ---------- Row Level Security ----------

alter table classes          enable row level security;
alter table clips            enable row level security;
alter table clip_frames      enable row level security;
alter table clip_annotations enable row level security;
alter table session_frames   enable row level security;

-- classes
drop policy if exists "classes_instructor_all" on classes;
create policy "classes_instructor_all"
  on classes for all
  to authenticated
  using (instructor_id = auth.uid())
  with check (instructor_id = auth.uid());

-- Students need to read their own classes via anon role.
drop policy if exists "classes_anon_select" on classes;
create policy "classes_anon_select"
  on classes for select
  to anon
  using (true);

-- clips
drop policy if exists "clips_instructor_all" on clips;
create policy "clips_instructor_all"
  on clips for all
  to authenticated
  using (instructor_id = auth.uid())
  with check (instructor_id = auth.uid());

drop policy if exists "clips_anon_select" on clips;
create policy "clips_anon_select"
  on clips for select
  to anon
  using (true);

-- clip_frames: internal data — only the owning instructor can read/write.
-- Students don't need raw frames; they see the rendered clip + annotations.
drop policy if exists "clip_frames_instructor_all" on clip_frames;
create policy "clip_frames_instructor_all"
  on clip_frames for all
  to authenticated
  using (exists (
    select 1 from clips
    where clips.id = clip_frames.clip_id
      and clips.instructor_id = auth.uid()
  ))
  with check (exists (
    select 1 from clips
    where clips.id = clip_frames.clip_id
      and clips.instructor_id = auth.uid()
  ));

-- clip_annotations: instructor writes, anon reads (student sees them).
drop policy if exists "clip_annotations_instructor_all" on clip_annotations;
create policy "clip_annotations_instructor_all"
  on clip_annotations for all
  to authenticated
  using (exists (
    select 1 from clips
    where clips.id = clip_annotations.clip_id
      and clips.instructor_id = auth.uid()
  ))
  with check (exists (
    select 1 from clips
    where clips.id = clip_annotations.clip_id
      and clips.instructor_id = auth.uid()
  ));

drop policy if exists "clip_annotations_anon_select" on clip_annotations;
create policy "clip_annotations_anon_select"
  on clip_annotations for select
  to anon
  using (true);

-- session_frames: student writes via anon (same pattern as practice_sessions);
-- instructor can read frames of their own students for review/ML.
drop policy if exists "session_frames_anon_insert" on session_frames;
create policy "session_frames_anon_insert"
  on session_frames for insert
  to anon
  with check (true);

drop policy if exists "session_frames_anon_select" on session_frames;
create policy "session_frames_anon_select"
  on session_frames for select
  to anon
  using (true);

drop policy if exists "session_frames_instructor_select" on session_frames;
create policy "session_frames_instructor_select"
  on session_frames for select
  to authenticated
  using (exists (
    select 1
    from practice_sessions ps
    join students s on s.id = ps.student_id
    where ps.id = session_frames.session_id
      and s.instructor_id = auth.uid()
  ));

-- ---------- Storage buckets ----------

-- New bucket for clip videos. Public read so anon students can play them
-- without signed URLs (mirrors the existing calibration-videos pattern).
-- The old `calibration-videos` bucket is left intact during migration.
insert into storage.buckets (id, name, public)
values ('clip-videos', 'clip-videos', true)
on conflict do nothing;

-- Audio recordings from instructor annotations. Public read so the student
-- can play them; uploads restricted to authenticated instructors.
insert into storage.buckets (id, name, public)
values ('clip-annotations-audio', 'clip-annotations-audio', true)
on conflict do nothing;

-- Storage policies — clip videos
drop policy if exists "clip_videos_instructor_upload" on storage.objects;
create policy "clip_videos_instructor_upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'clip-videos');

drop policy if exists "clip_videos_public_read" on storage.objects;
create policy "clip_videos_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'clip-videos');

-- Storage policies — annotation audio
drop policy if exists "clip_annotations_audio_upload" on storage.objects;
create policy "clip_annotations_audio_upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'clip-annotations-audio');

drop policy if exists "clip_annotations_audio_read" on storage.objects;
create policy "clip_annotations_audio_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'clip-annotations-audio');

-- ============================================================
-- ============================================================
-- SECURITY HARDENING — per-student tenant isolation (B3 + B4)
-- ============================================================
-- The student-side client has no Supabase JWT; auth lives in localStorage.
-- To still scope RLS to a single student we send the student's
-- access_code on every request as `x-student-access-code`, resolve it to
-- a student row via `current_student_id()`, and rewrite every anon
-- SELECT / INSERT policy to filter by that ID.
--
-- Storage upload policies for instructor-owned buckets are also tightened
-- to require the first folder segment of the upload path match a student
-- (or clip) the instructor owns, so a malicious authenticated instructor
-- can't pollute another instructor's namespace.
--
-- Idempotent: safe to re-run.

-- ---------- Helper functions ----------

-- Reads the access code from PostgREST's request.headers GUC, looks it up
-- in students, and returns the matching id (or null).
--
-- MUST be SECURITY DEFINER: the anon SELECT policies on students / classes /
-- clips / practice_sessions all filter by `= current_student_id()`. If this
-- function ran as the invoker (anon), its internal `select ... from students`
-- would re-trigger the students RLS policy, which calls current_student_id()
-- again → infinite recursion ("stack depth limit exceeded"), breaking every
-- student-side read. Running as the definer bypasses RLS for this scoped
-- lookup, exactly like login_student() below.
create or replace function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.students
  where access_code = nullif(
    coalesce(
      current_setting('request.headers', true)::json->>'x-student-access-code',
      ''
    ),
    ''
  )
  limit 1
$$;

grant execute on function public.current_student_id() to anon, authenticated;

-- Login bootstrap RPC. SECURITY DEFINER so it can read the students table
-- regardless of the per-row RLS — that's how we can tighten the students
-- table's anon SELECT policy to `id = current_student_id()` without
-- breaking the very first lookup that establishes the session.
--
-- Returns at most one row matching the upper-cased code. revoke + grant
-- explicitly so the function is only callable by anon (the audience
-- that needs it).
create or replace function public.login_student(code text)
returns setof public.students
language sql
stable
security definer
set search_path = public
as $$
  select * from public.students where access_code = upper(trim(code)) limit 1
$$;

revoke all on function public.login_student(text) from public;
grant execute on function public.login_student(text) to anon, authenticated;

-- ---------- Tightened anon SELECT policies ----------

-- students: only the row matching the request's access-code header.
drop policy if exists "students_anon_select" on students;
create policy "students_anon_select"
  on students for select
  to anon
  using (id = public.current_student_id());

-- classes / clips: only rows belonging to the resolved student.
drop policy if exists "classes_anon_select" on classes;
create policy "classes_anon_select"
  on classes for select
  to anon
  using (student_id = public.current_student_id());

drop policy if exists "clips_anon_select" on clips;
create policy "clips_anon_select"
  on clips for select
  to anon
  using (student_id = public.current_student_id());

-- clip_annotations: linked through clips.
drop policy if exists "clip_annotations_anon_select" on clip_annotations;
create policy "clip_annotations_anon_select"
  on clip_annotations for select
  to anon
  using (
    exists (
      select 1 from clips
      where clips.id = clip_annotations.clip_id
        and clips.student_id = public.current_student_id()
    )
  );

-- practice_sessions: own sessions only (anon INSERT + SELECT).
drop policy if exists "practice_sessions_anon_select" on practice_sessions;
create policy "practice_sessions_anon_select"
  on practice_sessions for select
  to anon
  using (student_id = public.current_student_id());

drop policy if exists "practice_sessions_anon_insert" on practice_sessions;
create policy "practice_sessions_anon_insert"
  on practice_sessions for insert
  to anon
  with check (student_id = public.current_student_id());

-- session_frames: anon INSERT only via a session you own; SELECT same.
drop policy if exists "session_frames_anon_insert" on session_frames;
create policy "session_frames_anon_insert"
  on session_frames for insert
  to anon
  with check (
    exists (
      select 1 from practice_sessions ps
      where ps.id = session_frames.session_id
        and ps.student_id = public.current_student_id()
    )
  );

drop policy if exists "session_frames_anon_select" on session_frames;
create policy "session_frames_anon_select"
  on session_frames for select
  to anon
  using (
    exists (
      select 1 from practice_sessions ps
      where ps.id = session_frames.session_id
        and ps.student_id = public.current_student_id()
    )
  );

-- Legacy `checkpoints`: tightened too. After the data migration runs
-- there are no rows here, but until then a student should only see
-- their own checkpoints. The instructor-side keeps managing via the
-- existing checkpoints_instructor_all policy.
drop policy if exists "checkpoints_anon_select" on checkpoints;
create policy "checkpoints_anon_select"
  on checkpoints for select
  to anon
  using (student_id = public.current_student_id());

-- ---------- Tightened storage upload policies (B4) ----------

-- clip-videos uploads (authenticated instructor): first path segment must
-- be a student belonging to this instructor.
--   Path conventions:
--     videos:    ${studentId}/${classId}/${uuid}.${ext}
--     snapshots: ${studentId}/snapshots/${clipId}/${uuid}.jpg
drop policy if exists "clip_videos_instructor_upload" on storage.objects;
create policy "clip_videos_instructor_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'clip-videos'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.students where instructor_id = auth.uid()
    )
  );

-- clip-annotations-audio uploads: first path segment is a clip owned by
-- this instructor.
--   Path convention: ${clipId}/${uuid}.${ext}
drop policy if exists "clip_annotations_audio_upload" on storage.objects;
create policy "clip_annotations_audio_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'clip-annotations-audio'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.clips where instructor_id = auth.uid()
    )
  );

-- practice-videos uploads (anon, student): not actively used by current
-- code but tightened defensively. First segment must equal the student
-- resolved from the access-code header.
drop policy if exists "practice_videos_anon_upload" on storage.objects;
create policy "practice_videos_anon_upload"
  on storage.objects for insert
  to anon
  with check (
    bucket_id = 'practice-videos'
    and (storage.foldername(name))[1]::uuid = public.current_student_id()
  );

-- forat.golf — Schema SQL
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
--
-- ⚠️  LEE ESTO ANTES DE AÑADIR UNA COLUMNA A UNA TABLA ANTIGUA:
-- `create table if not exists` NO modifica una tabla que ya existe. Una
-- columna añadida solo dentro del create-table de arriba jamás llega a la base
-- viva, y el fichero se ejecuta SIN ERROR, así que nadie se entera hasta que
-- algo peta en producción. Julio 2026 nos costó: `preferred_locale` y todo el
-- bloque de perfil del alumno llevaban meses en el código y en los tipos, pero
-- no en la base. Toda columna nueva va SIEMPRE como
-- `alter table ... add column if not exists`, además de en el create table.
alter table students add column if not exists status text not null default 'active'
  check (status in ('active', 'inactive'));

-- Instructor access code — passwordless login ("entra con tu código"), same
-- UX as the student code. The code is looked up ONLY server-side (service
-- role) by /api/instructor/code-login, which mints a one-time magic-link
-- token; RLS on instructors has no anon SELECT, so codes can't be enumerated
-- from the client. 8 chars from an unambiguous alphabet (vs 6 for students)
-- because this grants full instructor access.
alter table instructors add column if not exists access_code text unique;

-- Instructor's verdict on a practice evaluation ("¿refleja lo que ves?").
-- These are the calibration labels for the measurement-validation loop: with
-- enough agree/disagree pairs we can tune the traffic-light thresholds
-- against the coach's eye before giving scores more weight.
alter table practice_sessions add column if not exists instructor_feedback text
  check (instructor_feedback in ('agree', 'disagree'));

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
-- New schema for the forat.golf model. Idempotent: safe to re-run.
-- Keeps the legacy `checkpoints` table around during migration; will
-- be dropped once all data is backfilled into `clips`.
-- ============================================================

-- ---------- Tables ----------

create table if not exists classes (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id) on delete cascade,
  instructor_id uuid not null references instructors(id) on delete cascade,
  date          date not null,
  -- Optional "lesson conclusion" the coach records at the end of class
  -- (guided practice Layer 3). Reinforces the per-clip points for the week.
  conclusion_audio_url  text,
  conclusion_transcript text,
  created_at    timestamptz default now()
);

create index if not exists idx_classes_student_date on classes(student_id, date desc);
-- Idempotent adds for the class conclusion (Layer 3).
alter table classes add column if not exists conclusion_audio_url  text;
alter table classes add column if not exists conclusion_transcript text;

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

-- clip-annotations-audio uploads: first path segment is a clip OR a class
-- owned by this instructor.
--   Per-clip annotation audio:  ${clipId}/${uuid}.${ext}
--   Class conclusion audio:     ${classId}/conclusion-${uuid}.${ext}
drop policy if exists "clip_annotations_audio_upload" on storage.objects;
create policy "clip_annotations_audio_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'clip-annotations-audio'
    and (
      (storage.foldername(name))[1]::uuid in (
        select id from public.clips where instructor_id = auth.uid()
      )
      or (storage.foldername(name))[1]::uuid in (
        select id from public.classes where instructor_id = auth.uid()
      )
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

-- ============================================================
-- ============================================================
-- SECTION — SCHOOL CRM + WHATSAPP CAMPAIGNS (July 2026)
-- ============================================================
-- Contacts CRM fields on students + a message_log for WhatsApp/email
-- sends and inbound replies. Messaging goes through Kapso (managed
-- WhatsApp Business Platform). See docs/CRM/CLAUDE-CODE-BRIEF-whatsapp.md
-- and Decision 22. Idempotent: safe to re-run.
-- ============================================================

-- ---------- Contacts CRM fields on students ----------
-- phone: E.164 (e.g. +34600111222) — required to reach the student on WhatsApp.
-- notes: instructor-managed free text (their address book, not the student bio).
-- level: coarse skill label for segmentation (free text; kept simple on purpose).
-- whatsapp_opt_in_at / _source: consent capture (Meta + GDPR). Marked BY HAND by
--   the instructor. Sending is blocked when opt_in_at is null.
-- whatsapp_window_expires_at: when the student replies, a 24h service window opens
--   during which free-form (AI) text is allowed. Set by the inbound webhook.
alter table students add column if not exists phone                      text;
alter table students add column if not exists notes                      text;
alter table students add column if not exists level                      text;
alter table students add column if not exists whatsapp_opt_in_at         timestamptz;
alter table students add column if not exists whatsapp_opt_in_source     text;
alter table students add column if not exists whatsapp_window_expires_at timestamptz;

-- ---------- message_log ----------
-- One row per outbound send and per inbound reply / status transition source.
-- Instructor-scoped. Server-side webhook writes use the service role (bypasses
-- RLS); the instructor UI reads/manages under the authenticated policy below.
create table if not exists message_log (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references students(id)    on delete cascade,
  instructor_id     uuid not null references instructors(id) on delete cascade,
  channel           text not null default 'whatsapp' check (channel in ('whatsapp', 'email')),
  direction         text not null check (direction in ('outbound', 'inbound')),
  -- Meta message category. utility = reminders (cheap/free in-window),
  -- marketing = reactivation, service = free-form inside the 24h window.
  category          text          check (category in ('marketing', 'utility', 'service')),
  template_name     text,          -- null for free-form / inbound
  body              text,          -- rendered body (variables filled) or inbound text
  locale            text          check (locale in ('es', 'en')),
  status            text not null default 'queued'
                      check (status in ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  kapso_message_id   text,         -- id returned by Kapso for reconciliation with webhooks
  kapso_broadcast_id text,         -- set when the send was part of a campaign broadcast
  error              text,         -- populated on failed status
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_message_log_student    on message_log(student_id, created_at desc);
create index if not exists idx_message_log_instructor on message_log(instructor_id, created_at desc);
create index if not exists idx_message_log_kapso_msg  on message_log(kapso_message_id);
create index if not exists idx_message_log_broadcast  on message_log(kapso_broadcast_id);

alter table message_log enable row level security;

-- Instructor manages the logs of their own students (read + write from the UI).
drop policy if exists "message_log_instructor_all" on message_log;
create policy "message_log_instructor_all"
  on message_log for all
  to authenticated
  using (instructor_id = auth.uid())
  with check (instructor_id = auth.uid());
-- Note: no anon policy. Students never read the message log. Inbound replies
-- and delivery-status updates are written server-side via the service role.

-- ---------- Lifecycle stage (3-state student model) ----------
-- The explicit, human-set lifecycle of a student. Distinct from the DERIVED
-- "dormant" engagement signal (computed in lib/contacts.ts, never stored):
--   prospect — signed up but never came to a lesson yet
--   active   — currently taking lessons
--   former   — lessons ended, but could come back (reactivation target)
-- Steve sets/confirms this by hand ("manual + automatic signal" decision).
-- The legacy `status` (active|inactive) is kept for now; inactive maps to
-- 'former'. The app migrates its reads to lifecycle_stage in the Alumnos phase.
alter table students add column if not exists lifecycle_stage text not null default 'active'
  check (lifecycle_stage in ('prospect', 'active', 'former'));

-- One-time backfill from the legacy status. Guarded so re-running schema.sql
-- doesn't clobber a stage Steve later edited by hand: only rows that are still
-- at the default 'active' but were archived (status='inactive') get moved to
-- 'former'. Once a row is 'former' (or manually changed), this WHERE skips it.
update students set lifecycle_stage = 'former'
  where status = 'inactive' and lifecycle_stage = 'active';

create index if not exists idx_students_instructor_stage
  on students(instructor_id, lifecycle_stage);
-- Case-insensitive name search at scale (Alumnos list). pg_trgm powers ILIKE.
create extension if not exists pg_trgm;
create index if not exists idx_students_name_trgm
  on students using gin (name gin_trgm_ops);

-- ---------- Denormalized last_activity_at (scales the "dormant" filter) ----------
-- "Dormant" = active but no lesson/practice in DORMANT_DAYS. Computing that from
-- nested classes/practice_sessions is fine for a handful of students but doesn't
-- filter/paginate at scale. So we denormalize the most-recent activity onto the
-- student and keep it fresh with triggers. The Alumnos list can then do a plain
-- indexed WHERE (last_activity_at < cutoff) with server-side pagination.
alter table students add column if not exists last_activity_at timestamptz;

create index if not exists idx_students_last_activity
  on students(instructor_id, last_activity_at);

-- Backfill from existing activity (classes.date is a date, practice.date is tz).
-- GREATEST ignores NULLs, returning NULL only when the student has no activity.
update students s set last_activity_at = greatest(
  (select max(c.date::timestamptz) from classes c where c.student_id = s.id),
  (select max(ps.date)             from practice_sessions ps where ps.student_id = s.id)
) where last_activity_at is null;

-- Keep it fresh. SECURITY DEFINER is required: practice_sessions are inserted by
-- the anon (student) role, which has no UPDATE policy on students — without
-- definer the trigger's UPDATE would be blocked by RLS and the insert would fail.
create or replace function public.bump_student_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.students
    set last_activity_at = greatest(coalesce(last_activity_at, to_timestamp(0)), new.date::timestamptz)
    where id = new.student_id;
  return new;
end;
$$;

drop trigger if exists trg_class_activity on classes;
create trigger trg_class_activity
  after insert on classes
  for each row execute function public.bump_student_activity();

drop trigger if exists trg_practice_activity on practice_sessions;
create trigger trg_practice_activity
  after insert on practice_sessions
  for each row execute function public.bump_student_activity();

-- ---------- Journey (Module 4): a simple ordered focus list per student ----------
-- Deliberately simple (no complex builder): an ordered list of focus items the
-- instructor curates for a student and the student sees in their app. `position`
-- drives ordering; `status` tracks progress (todo -> doing -> done).
create table if not exists journey_items (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id)    on delete cascade,
  instructor_id uuid not null references instructors(id) on delete cascade,
  title         text not null,
  note          text,
  position      integer not null default 0,
  status        text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  created_at    timestamptz default now()
);
create index if not exists idx_journey_items_student on journey_items(student_id, position);

alter table journey_items enable row level security;

-- Instructor manages the journeys of their own students.
drop policy if exists "journey_items_instructor_all" on journey_items;
create policy "journey_items_instructor_all"
  on journey_items for all
  to authenticated
  using (instructor_id = auth.uid())
  with check (instructor_id = auth.uid());

-- Student reads their own journey via the anon role (access-code scoped).
drop policy if exists "journey_items_anon_select" on journey_items;
create policy "journey_items_anon_select"
  on journey_items for select
  to anon
  using (student_id = public.current_student_id());

-- ---------- Learning plans container (Fase: plan de aprendizaje) ----------
-- A student can have several named plans ("planes de aprendizaje"); one is the
-- current focus. Each journey_item (step) belongs to one plan via journey_id.
-- A plan may originate from a library plan (journey_templates) or be blank.
create table if not exists journeys (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references students(id)          on delete cascade,
  instructor_id      uuid not null references instructors(id)       on delete cascade,
  name               text not null,
  source_template_id uuid references journey_templates(id)          on delete set null,
  is_focus           boolean not null default false,
  position           integer not null default 0,
  status             text not null default 'active' check (status in ('active', 'archived')),
  created_at         timestamptz default now()
);
create index if not exists idx_journeys_student on journeys(student_id, position);

-- Each step belongs to a plan. Nullable for a safe additive migration; the app
-- always sets it going forward.
alter table journey_items add column if not exists journey_id uuid references journeys(id) on delete cascade;
create index if not exists idx_journey_items_journey on journey_items(journey_id, position);

alter table journeys enable row level security;

drop policy if exists "journeys_instructor_all" on journeys;
create policy "journeys_instructor_all"
  on journeys for all
  to authenticated
  using (instructor_id = auth.uid())
  with check (instructor_id = auth.uid());

drop policy if exists "journeys_anon_select" on journeys;
create policy "journeys_anon_select"
  on journeys for select
  to anon
  using (student_id = public.current_student_id());

-- A clip can be the recorded reference for a plan step ("abre el paso y graba").
-- Ad-hoc recordings (no step chosen) get a step created for them by the app.
alter table clips add column if not exists journey_item_id uuid references journey_items(id) on delete set null;
create index if not exists idx_clips_journey_item on clips(journey_item_id);

-- ---------- Agenda / attendance (Fase 8): lightweight in-app lessons ----------
-- NOT a booking engine (no availability/payments/waitlists) — a simple agenda
-- the instructor manages. A group clinic is just several lessons at the same
-- time, one per student (everything tracks per student). Marking a lesson
-- 'attended' is the attendance signal that keeps "dormant" and lifecycle honest.
-- Google Calendar sync is a future step.
create table if not exists lessons (
  id            uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references instructors(id) on delete cascade,
  student_id    uuid not null references students(id)    on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  status        text not null default 'scheduled'
                  check (status in ('scheduled', 'attended', 'no_show', 'cancelled')),
  note          text,
  created_at    timestamptz default now()
);
create index if not exists idx_lessons_instructor_start on lessons(instructor_id, starts_at);
create index if not exists idx_lessons_student on lessons(student_id, starts_at desc);

alter table lessons enable row level security;

drop policy if exists "lessons_instructor_all" on lessons;
create policy "lessons_instructor_all"
  on lessons for all
  to authenticated
  using (instructor_id = auth.uid())
  with check (instructor_id = auth.uid());

-- Students may read their own lessons (upcoming/next class in their app).
drop policy if exists "lessons_anon_select" on lessons;
create policy "lessons_anon_select"
  on lessons for select
  to anon
  using (student_id = public.current_student_id());

-- Attendance is the source of truth for "dormant": marking a lesson 'attended'
-- bumps the student's last_activity_at, so a student who takes lessons (even
-- without a recorded clip) never looks dormant. SECURITY DEFINER to bypass RLS.
create or replace function public.bump_activity_on_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'attended' then
    update public.students
      set last_activity_at = greatest(coalesce(last_activity_at, to_timestamp(0)), new.starts_at)
      where id = new.student_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lesson_attendance on lessons;
create trigger trg_lesson_attendance
  after insert or update of status on lessons
  for each row execute function public.bump_activity_on_attendance();

-- ---------- Journey library (Fase 9): reusable templates + recommendations ----------
-- Steve builds a LIBRARY of journey templates (some by level/handicap, some
-- corrective) and assigns one to a student at onboarding — the template's items
-- are COPIED into that student's journey_items (then editable per student).
-- Focuses are text + up to 2 images (not video).
create table if not exists journey_templates (
  id            uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references instructors(id) on delete cascade,
  name          text not null,
  category      text,               -- free label: level / handicap / corrective…
  created_at    timestamptz default now()
);
create index if not exists idx_journey_templates_instructor on journey_templates(instructor_id);

create table if not exists journey_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references journey_templates(id) on delete cascade,
  title       text not null,
  note        text,
  images      text[] not null default '{}',
  position    integer not null default 0,
  created_at  timestamptz default now()
);
create index if not exists idx_journey_template_items_template on journey_template_items(template_id, position);

-- Per-student journey items gain images (copied from the template, editable).
alter table journey_items add column if not exists images text[] not null default '{}';

-- Universal recommendations (warm-up, routine…) — one list per instructor, every
-- student of that instructor sees them. Supporting habits, not a progression.
create table if not exists recommendations (
  id            uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references instructors(id) on delete cascade,
  title         text not null,
  note          text,
  images        text[] not null default '{}',
  position      integer not null default 0,
  created_at    timestamptz default now()
);
create index if not exists idx_recommendations_instructor on recommendations(instructor_id, position);

alter table journey_templates      enable row level security;
alter table journey_template_items enable row level security;
alter table recommendations        enable row level security;

-- Templates + their items: instructor-only (students never read templates; the
-- items are copied into journey_items on assignment).
drop policy if exists "journey_templates_instructor_all" on journey_templates;
create policy "journey_templates_instructor_all"
  on journey_templates for all to authenticated
  using (instructor_id = auth.uid()) with check (instructor_id = auth.uid());

drop policy if exists "journey_template_items_instructor_all" on journey_template_items;
create policy "journey_template_items_instructor_all"
  on journey_template_items for all to authenticated
  using (exists (select 1 from journey_templates jt where jt.id = template_id and jt.instructor_id = auth.uid()))
  with check (exists (select 1 from journey_templates jt where jt.id = template_id and jt.instructor_id = auth.uid()));

-- Recommendations: instructor manages; the student (anon) reads their own
-- instructor's list.
drop policy if exists "recommendations_instructor_all" on recommendations;
create policy "recommendations_instructor_all"
  on recommendations for all to authenticated
  using (instructor_id = auth.uid()) with check (instructor_id = auth.uid());

drop policy if exists "recommendations_anon_select" on recommendations;
create policy "recommendations_anon_select"
  on recommendations for select to anon
  using (instructor_id = (select s.instructor_id from public.students s where s.id = public.current_student_id()));

-- Storage bucket for journey/recommendation images (public read; instructor upload).
insert into storage.buckets (id, name, public)
values ('journey-images', 'journey-images', true)
on conflict (id) do update set public = true;

drop policy if exists "journey_images_instructor_upload" on storage.objects;
create policy "journey_images_instructor_upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'journey-images');

drop policy if exists "journey_images_public_read" on storage.objects;
create policy "journey_images_public_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'journey-images');

-- ============================================================================
-- Pilot hardening (julio 2026) — run this file again to apply.
-- ============================================================================

-- 1. student_otps was readable AND writable by anyone holding the anon key
-- (which ships in the browser bundle): any visitor could list every live OTP
-- with its student_id, or insert one and verify it — an account-takeover
-- primitive. The OTP routes must run with the service role (which bypasses
-- RLS), so anon needs no policy at all here.
drop policy if exists "student_otps_anon_all" on student_otps;

-- 2. Storage read policies granted anon a blanket SELECT over whole buckets,
-- so the anon key could enumerate every object of every student
-- (storage.objects SELECT is what powers .list()). Public buckets still serve
-- their files through the public URL, which is what the app actually uses —
-- no code path calls .list(), so dropping anon SELECT costs us nothing and
-- removes the enumeration. Instructors keep listing rights for their own
-- students' folders.
drop policy if exists "clip_videos_public_read" on storage.objects;
create policy "clip_videos_instructor_list"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'clip-videos'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.students where instructor_id = auth.uid()
    )
  );

drop policy if exists "clip_annotations_audio_read" on storage.objects;
create policy "clip_annotations_audio_instructor_list"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'clip-annotations-audio');

drop policy if exists "practice_videos_anon_read" on storage.objects;
create policy "practice_videos_instructor_list"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'practice-videos');

drop policy if exists "calibration_videos_public_read" on storage.objects;
drop policy if exists "instructor_notes_public_read" on storage.objects;
drop policy if exists "journey_images_public_read" on storage.objects;
create policy "journey_images_instructor_list"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'journey-images');

-- 3. student-avatars bucket existed only in the live project (pre-rebrand
-- leftover), so provisioning a fresh Supabase from this file produced an app
-- with a broken avatar upload.
insert into storage.buckets (id, name, public)
values ('student-avatars', 'student-avatars', true)
on conflict (id) do nothing;

-- 3b. Schema drift backfill.
--
-- `create table if not exists` is a no-op on a table that already exists, so
-- EVERY column that was only ever declared inside a create-table body is
-- missing from the live database — silently, for as long as that table has
-- existed. That is how `students.preferred_locale` and the whole student
-- profile block ended up referenced by the code but absent from the database.
-- These idempotent ALTERs are the only way a column reliably lands on both a
-- fresh project and the live one.
alter table instructors add column if not exists preferred_locale text not null default 'es'
  check (preferred_locale in ('es', 'en'));

alter table students add column if not exists preferred_locale text not null default 'es'
  check (preferred_locale in ('es', 'en'));
alter table students add column if not exists avatar_url    text;
alter table students add column if not exists handicap      text;
alter table students add column if not exists dominant_hand text
  check (dominant_hand in ('right', 'left'));
alter table students add column if not exists years_playing integer;
alter table students add column if not exists home_course   text;
alter table students add column if not exists bio           text;

-- 4. The student role could not update its own row (no anon UPDATE policy),
-- so the profile screen and the e-mail capture failed every single time. The
-- policy is scoped to the student's own row, and the column grant keeps them
-- away from instructor-owned fields (instructor_id, access_code, notes, ...).
revoke update on students from anon;
grant update (name, email, avatar_url, handicap, dominant_hand, years_playing,
              home_course, bio, preferred_locale) on students to anon;

drop policy if exists "students_anon_update" on students;
create policy "students_anon_update"
  on students for update
  to anon
  using (id = public.current_student_id())
  with check (id = public.current_student_id());

-- ============================================================================
-- Engine telemetry (agosto 2026) — run this file again to apply.
-- ============================================================================
-- One row per meaningful analysis step (upload, MediaPipe pass, refinement,
-- calibration, evaluation, errors) with its duration and a small non-PII
-- detail payload. Written fire-and-forget from lib/telemetry.ts. Lets us
-- diagnose the engine on Steve's iPad from anywhere instead of waiting for a
-- complaint. Clients can only INSERT; reading is for the instructor (own rows)
-- and for us via the SQL editor.
create table if not exists analysis_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  instructor_id uuid references instructors(id) on delete cascade,
  student_id    uuid references students(id) on delete cascade,
  clip_id       uuid references clips(id) on delete set null,
  session_id    uuid references practice_sessions(id) on delete set null,
  source        text not null,
  step          text not null,
  status        text not null default 'ok' check (status in ('ok', 'error', 'info')),
  duration_ms   integer,
  detail        jsonb,
  ua            text
);
create index if not exists analysis_events_created_idx on analysis_events (created_at desc);
create index if not exists analysis_events_clip_idx on analysis_events (clip_id);

alter table analysis_events enable row level security;

-- Instructor: insert own events, read own events.
drop policy if exists "analysis_events_instructor_insert" on analysis_events;
create policy "analysis_events_instructor_insert"
  on analysis_events for insert
  to authenticated
  with check (instructor_id = auth.uid());

drop policy if exists "analysis_events_instructor_select" on analysis_events;
create policy "analysis_events_instructor_select"
  on analysis_events for select
  to authenticated
  using (
    instructor_id = auth.uid()
    or student_id in (select id from public.students where instructor_id = auth.uid())
  );

-- Student (anon + access-code header): insert only, scoped to themselves.
drop policy if exists "analysis_events_anon_insert" on analysis_events;
create policy "analysis_events_anon_insert"
  on analysis_events for insert
  to anon
  with check (student_id = public.current_student_id() and instructor_id is null);

-- ---------------------------------------------------------------------------
-- 3D world landmarks capture (agosto 2026). MediaPipe returns hip-origin
-- metric-space landmarks alongside the 2D ones; we never stored them, which
-- made any future 3D-angle metric impossible to validate retroactively.
-- Captured from now on (additive column, "capturar todo"); not yet used by
-- any metric.
alter table clip_frames    add column if not exists world_landmarks jsonb;
alter table session_frames add column if not exists world_landmarks jsonb;

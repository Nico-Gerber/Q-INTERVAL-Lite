-- Q-Interval Lite+ : complete Supabase database setup (single script).
--
-- Paste this whole file into Supabase Dashboard > SQL Editor > New query, and click Run.
-- It sets up a NEW project end to end: tables, login-approval workflow, role-based access
-- (row level security), private image storage, and the public patient-report function.
-- Safe to re-run: it only creates what is missing and replaces functions/policies with the same definitions.
--
-- Roles: patient   -> sees only their own sessions
--        clinician -> sees sessions they created + sessions of patients an admin assigned to them; can verify/delete
--        admin     -> sees everything; approves accounts and assigns patients (via the backend, service role)
--
-- AFTER RUNNING, make yourself the first admin: sign up in the app, then run
--   update public.profiles
--      set role = 'admin', status = 'approved', reviewed_at = now()
--    where id = (select id from auth.users where email = 'you@example.com');
--
-- Sections: 1 Tables | 2 Helper functions | 3 Triggers | 4 Row level security | 5 Storage | 6 RPCs, views, public report

create extension if not exists pgcrypto;   -- gen_random_uuid()


-- ═════════════════════════════ 1. TABLES ═════════════════════════════

-- profiles: one row per auth user, created automatically on signup (see handle_new_user).
-- New accounts are 'pending' with no role until an admin approves them.
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text,
  role          text,
  status        text not null default 'pending',
  access_reason text,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid references auth.users (id) on delete set null,
  constraint profiles_role_check   check (role is null or role in ('clinician', 'patient', 'admin')),
  constraint profiles_status_check check (status in ('pending', 'approved', 'rejected')),
  -- An approved account always has a role; unapproved accounts never do.
  constraint profiles_status_role_check check ((status = 'approved' and role is not null) or (status <> 'approved' and role is null))
);

-- clinician <-> patient assignments (many-to-many), managed by admins only.
create table if not exists public.clinician_patients (
  clinician_id uuid not null references public.profiles (id) on delete cascade,
  patient_id   uuid not null references public.profiles (id) on delete cascade,
  assigned_by  uuid references auth.users (id) on delete set null,
  assigned_at  timestamptz not null default now(),
  primary key (clinician_id, patient_id),
  constraint clinician_patients_distinct check (clinician_id <> patient_id)
);
create index if not exists clinician_patients_patient_idx on public.clinician_patients (patient_id);

create table if not exists public.sessions (
  id                       uuid primary key default gen_random_uuid(),
  session_code             text not null unique,                       -- human-readable, e.g. QIL-MA-20261003-1625-D3PM
  analysis_mode            text not null default 'classification',     -- 'classification' | 'future-risk'
  clinician_id             uuid references auth.users (id) on delete set null,
  patient_id               uuid references public.profiles (id) on delete set null,
  verified                 boolean not null default false,             -- true once a clinician has published the session
  verified_at              timestamptz,
  verified_by              text,
  access_token             uuid not null unique default gen_random_uuid(),   -- credential in the patient's private link
  result_snapshot          jsonb,                                      -- model outputs with base64 images stripped
  explanations             jsonb,                                      -- { summary, viewData, audience }
  training_consent         boolean not null default false,             -- opt-in: nothing is training-eligible until consent is recorded
  training_consent_at      timestamptz,
  training_consent_version text,                                       -- version of the terms shown
  created_at               timestamptz not null default now()
);
create index if not exists sessions_patient_idx on public.sessions (patient_id);

create table if not exists public.ai_results (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.sessions (id) on delete cascade,
  view                 text not null,                                  -- 'L-CC' | 'L-MLO' | 'R-CC' | 'R-MLO'
  model                text not null,                                  -- 'Classical' | 'Quantum'
  ai_result            text,                                           -- 'Normal' | 'Benign' | 'Malignant'
  ai_confidence        numeric,
  verified_result      text,                                           -- the clinician-confirmed label
  verification_status  text not null default 'pending',                -- 'pending' | 'approved' | 'overridden'
  verified_at          timestamptz,
  verified_by          text,
  created_at           timestamptz not null default now()
);
create index if not exists ai_results_session_idx on public.ai_results (session_id);

create table if not exists public.risk_assessments (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions (id) on delete cascade,
  model             text not null,
  composite_score   numeric,
  risk_level        text,
  highest_density   text,
  highest_birads    integer,
  created_at        timestamptz not null default now()
);
create index if not exists risk_assessments_session_idx on public.risk_assessments (session_id);

-- Image records; the files themselves live in the private 'session-images' storage bucket (section 5).
create table if not exists public.session_images (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions (id) on delete cascade,
  view         text,                       -- 'L-CC' | 'L-MLO' | 'R-CC' | 'R-MLO' (null if not view-specific)
  exam_id      text,                       -- future-risk sessions upload several dated exams, e.g. 'exam_1' (null for classification)
  kind         text not null check (kind in ('original', 'derived')),
  json_path    text,                       -- for 'derived': where in result_snapshot the base64 belongs, e.g. cnn.views.L-CC.explainability.heatmap_base64
  storage_path text not null unique,
  content_type text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);
create index if not exists session_images_session_idx on public.session_images (session_id);


-- ═════════════════════════════ 2. HELPER FUNCTIONS ═════════════════════════════
-- security definer + empty search_path: they read profiles/sessions regardless of the caller's RLS.

create or replace function public.is_approved_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'approved'
      and p.role in ('clinician', 'patient', 'admin')
  );
$$;

-- Only approved clinicians and admins may verify results (enforced here so patients can't bypass the UI).
create or replace function public.can_verify_results()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'approved'
      and p.role in ('clinician', 'admin')
  );
$$;

create or replace function public.current_app_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.status = 'approved';
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

-- True if the current user is an approved clinician assigned to this patient.
create or replace function public.is_assigned_clinician(p_patient_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinician_patients cp
    join public.profiles c on c.id = cp.clinician_id
    where cp.clinician_id = (select auth.uid())
      and cp.patient_id = p_patient_id
      and c.role = 'clinician' and c.status = 'approved'
  );
$$;

-- Can the current user see this session (and so its ai_results / risk_assessments / images)?
create or replace function public.can_access_session(p_session_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_approved_user() and exists (
    select 1 from public.sessions s
    where s.id = p_session_id
      and (
        public.is_admin()
        or s.patient_id = (select auth.uid())
        or s.clinician_id = (select auth.uid())
        or (s.patient_id is not null and public.is_assigned_clinician(s.patient_id))
      )
  );
$$;

-- Storage objects live at <session_id>/<original|derived>/<file>; access follows the session.
create or replace function public.can_access_session_path(p_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then public.can_access_session(split_part(p_name, '/', 1)::uuid)
    else false
  end;
$$;

revoke all on function public.is_approved_user(), public.can_verify_results(), public.current_app_role(),
                       public.is_admin(), public.is_assigned_clinician(uuid), public.can_access_session(uuid),
                       public.can_access_session_path(text)
  from public, anon;
grant execute on function public.is_approved_user(), public.can_verify_results(), public.current_app_role(),
                          public.is_admin(), public.is_assigned_clinician(uuid), public.can_access_session(uuid),
                          public.can_access_session_path(text)
  to authenticated;


-- ═════════════════════════════ 3. TRIGGERS ═════════════════════════════

-- Every new auth user gets exactly one profile: pending, no role. Role/status in signup metadata are ignored.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, access_reason, status, role)
  values (
    new.id,
    left(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 200),
    left(nullif(btrim(new.raw_user_meta_data ->> 'access_reason'), ''), 2000),
    'pending',
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- clinician_id must be an approved clinician, patient_id an approved patient (check constraints can't read other tables).
create or replace function public.validate_clinician_patient()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.clinician_id and role = 'clinician' and status = 'approved') then
    raise exception 'clinician_id must be an approved clinician';
  end if;
  if not exists (select 1 from public.profiles where id = new.patient_id and role = 'patient' and status = 'approved') then
    raise exception 'patient_id must be an approved patient';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_clinician_patient on public.clinician_patients;
create trigger validate_clinician_patient
  before insert or update on public.clinician_patients
  for each row execute function public.validate_clinician_patient();

-- If someone stops being a clinician/patient (role change, rejection), drop their assignments.
create or replace function public.cleanup_assignments()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.role is distinct from 'clinician' or new.status <> 'approved' then
    delete from public.clinician_patients where clinician_id = new.id;
  end if;
  if new.role is distinct from 'patient' or new.status <> 'approved' then
    delete from public.clinician_patients where patient_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.cleanup_assignments() from public, anon, authenticated;

drop trigger if exists cleanup_assignments on public.profiles;
create trigger cleanup_assignments
  after update of role, status on public.profiles
  for each row execute function public.cleanup_assignments();

-- Only clinicians/admins may write verification fields on ai_results.
create or replace function public.guard_ai_results_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- No end-user JWT (SQL editor / service role): allowed.
  if (select auth.uid()) is null or public.can_verify_results() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verified_result is not null or new.verified_at is not null or new.verified_by is not null then
      raise exception 'Only clinicians and admins can verify results' using errcode = '42501';
    end if;
  elsif new.verification_status is distinct from old.verification_status
     or new.verified_result is distinct from old.verified_result
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by then
    raise exception 'Only clinicians and admins can verify results' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_ai_results_verification on public.ai_results;
create trigger guard_ai_results_verification
  before insert or update on public.ai_results
  for each row execute function public.guard_ai_results_verification();


-- ═════════════════════════════ 4. ROW LEVEL SECURITY ═════════════════════════════

alter table public.profiles           enable row level security;
alter table public.clinician_patients enable row level security;
alter table public.sessions           enable row level security;
alter table public.ai_results         enable row level security;
alter table public.risk_assessments   enable row level security;
alter table public.session_images     enable row level security;

-- profiles: read-only for clients. Users can't change their own role/status; admin actions go through
-- the backend (service role), which verifies the caller is an approved admin.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- A clinician can read the name of patients assigned to them ("My Patients"). Email is not in profiles.
drop policy if exists "profiles_select_assigned_patients" on public.profiles;
create policy "profiles_select_assigned_patients" on public.profiles
  for select to authenticated
  using (role = 'patient' and public.is_assigned_clinician(id));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- clinician_patients: clients can only read rows they're part of; writes go through the admin backend.
drop policy if exists "clinician_patients_select_own" on public.clinician_patients;
create policy "clinician_patients_select_own" on public.clinician_patients
  for select to authenticated
  using (clinician_id = (select auth.uid()) or patient_id = (select auth.uid()));

revoke all on public.clinician_patients from anon, authenticated;
grant select on public.clinician_patients to authenticated;

-- RESTRICTIVE gate, AND-ed with the policies below: pending/rejected users are locked out of everything.
-- (The public report page uses the anon role via get_patient_report, unaffected.)
do $$
declare t text;
begin
  foreach t in array array['sessions', 'ai_results', 'risk_assessments'] loop
    execute format('drop policy if exists "require_approved_user" on public.%I', t);
    execute format(
      'create policy "require_approved_user" on public.%I as restrictive for all to authenticated using (public.is_approved_user()) with check (public.is_approved_user())',
      t
    );
  end loop;
end $$;

-- sessions ------------------------------------------------------
drop policy if exists "sessions_select" on public.sessions;
create policy "sessions_select" on public.sessions for select to authenticated
  using (
    public.is_admin()
    or patient_id = (select auth.uid())
    or clinician_id = (select auth.uid())
    or (patient_id is not null and public.is_assigned_clinician(patient_id))
  );

drop policy if exists "sessions_insert" on public.sessions;
create policy "sessions_insert" on public.sessions for insert to authenticated
  with check (
    public.is_admin()
    or (public.current_app_role() = 'clinician'
        and clinician_id = (select auth.uid())
        and (patient_id is null or public.is_assigned_clinician(patient_id)))
    or (public.current_app_role() = 'patient'
        and patient_id = (select auth.uid())
        and clinician_id is null)
  );

-- Verifying / publishing a session is clinician/admin only.
drop policy if exists "sessions_update" on public.sessions;
create policy "sessions_update" on public.sessions for update to authenticated
  using (
    public.can_verify_results()
    and (public.is_admin()
         or clinician_id = (select auth.uid())
         or (patient_id is not null and public.is_assigned_clinician(patient_id)))
  )
  with check (
    public.can_verify_results()
    and (public.is_admin()
         or clinician_id = (select auth.uid())
         or (patient_id is not null and public.is_assigned_clinician(patient_id)))
  );

-- Only clinicians and admins may delete sessions.
drop policy if exists "sessions_delete" on public.sessions;
create policy "sessions_delete" on public.sessions for delete to authenticated
  using (
    public.is_admin()
    or (public.can_verify_results()
        and (clinician_id = (select auth.uid())
             or (patient_id is not null and public.is_assigned_clinician(patient_id))))
  );

-- ai_results / risk_assessments / session_images follow their parent session -------
drop policy if exists "ai_results_select" on public.ai_results;
create policy "ai_results_select" on public.ai_results for select to authenticated
  using (public.can_access_session(session_id));
drop policy if exists "ai_results_insert" on public.ai_results;
create policy "ai_results_insert" on public.ai_results for insert to authenticated
  with check (public.can_access_session(session_id));
drop policy if exists "ai_results_update" on public.ai_results;
create policy "ai_results_update" on public.ai_results for update to authenticated
  using (public.can_verify_results() and public.can_access_session(session_id))
  with check (public.can_verify_results() and public.can_access_session(session_id));
drop policy if exists "ai_results_delete" on public.ai_results;
create policy "ai_results_delete" on public.ai_results for delete to authenticated
  using (public.can_verify_results() and public.can_access_session(session_id));

drop policy if exists "risk_assessments_select" on public.risk_assessments;
create policy "risk_assessments_select" on public.risk_assessments for select to authenticated
  using (public.can_access_session(session_id));
drop policy if exists "risk_assessments_insert" on public.risk_assessments;
create policy "risk_assessments_insert" on public.risk_assessments for insert to authenticated
  with check (public.can_access_session(session_id));
drop policy if exists "risk_assessments_update" on public.risk_assessments;
create policy "risk_assessments_update" on public.risk_assessments for update to authenticated
  using (public.can_verify_results() and public.can_access_session(session_id))
  with check (public.can_verify_results() and public.can_access_session(session_id));
drop policy if exists "risk_assessments_delete" on public.risk_assessments;
create policy "risk_assessments_delete" on public.risk_assessments for delete to authenticated
  using (public.can_verify_results() and public.can_access_session(session_id));

drop policy if exists "session_images_select" on public.session_images;
create policy "session_images_select" on public.session_images for select to authenticated
  using (public.can_access_session(session_id));
drop policy if exists "session_images_insert" on public.session_images;
create policy "session_images_insert" on public.session_images for insert to authenticated
  with check (public.can_access_session(session_id));
drop policy if exists "session_images_delete" on public.session_images;
create policy "session_images_delete" on public.session_images for delete to authenticated
  using (public.can_verify_results() and public.can_access_session(session_id));

revoke all on public.session_images from anon;
revoke update on public.session_images from authenticated;


-- ═════════════════════════════ 5. PRIVATE IMAGE STORAGE ═════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit)
values ('session-images', 'session-images', false, 52428800)   -- 50 MB per file
on conflict (id) do update set public = false;

drop policy if exists "session_images_read" on storage.objects;
create policy "session_images_read" on storage.objects for select to authenticated
  using (bucket_id = 'session-images' and public.can_access_session_path(name));

drop policy if exists "session_images_write" on storage.objects;
create policy "session_images_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'session-images' and public.can_access_session_path(name));

drop policy if exists "session_images_remove" on storage.objects;
create policy "session_images_remove" on storage.objects for delete to authenticated
  using (bucket_id = 'session-images' and public.can_verify_results() and public.can_access_session_path(name));


-- ═════════════════════════════ 6. RPCs, VIEWS, PUBLIC REPORT ═════════════════════════════

-- Patients can't UPDATE sessions directly, so these two are exposed as functions.
create or replace function public.save_session_explanations(p_session_id uuid, p_explanations jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.can_access_session(p_session_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.sessions set explanations = p_explanations where id = p_session_id;
end;
$$;

-- Grant or withdraw consent for model improvement. Classification sessions only.
create or replace function public.set_training_consent(p_session_id uuid, p_consent boolean, p_version text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.can_access_session(p_session_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.sessions
     set training_consent = p_consent,
         training_consent_at = case when p_consent then now() else null end,
         training_consent_version = case when p_consent then p_version else null end
   where id = p_session_id and analysis_mode = 'classification';
end;
$$;

revoke all on function public.save_session_explanations(uuid, jsonb), public.set_training_consent(uuid, boolean, text)
  from public, anon;
grant execute on function public.save_session_explanations(uuid, jsonb), public.set_training_consent(uuid, boolean, text)
  to authenticated;

-- Per-view clinician-verified labels from consenting classification sessions. Backend/service role only.
-- Deleting a session removes its rows here too.
create or replace view public.training_candidates as
select s.id as session_id,
       r.view,
       r.model,
       r.ai_result,
       r.ai_confidence,
       r.verified_result,            -- the clinician-confirmed label
       r.verification_status,
       r.verified_at,
       s.training_consent_at,
       s.training_consent_version,
       i.storage_path as original_image_path
from public.sessions s
join public.ai_results r on r.session_id = s.id
left join public.session_images i on i.session_id = s.id and i.view = r.view and i.kind = 'original'
where s.training_consent
  and s.analysis_mode = 'classification'
  and r.verification_status in ('approved', 'overridden');

revoke all on public.training_candidates from public, anon, authenticated;

-- Public "open results from link" page. Callable without login, but returns data ONLY for a published
-- (verified) session whose private token matches, and only the patient-safe fields.
create or replace function public.get_patient_report(p_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'session_code', s.session_code,
    'verified_at',  s.verified_at,
    'views', coalesce((
      select jsonb_agg(jsonb_build_object('view', r.view, 'result', coalesce(r.verified_result, r.ai_result)) order by r.view)
      from public.ai_results r
      where r.session_id = s.id and r.model = 'Classical'
    ), '[]'::jsonb),
    'risk', (
      select jsonb_build_object('risk_level', a.risk_level, 'highest_density', a.highest_density, 'highest_birads', a.highest_birads)
      from public.risk_assessments a
      where a.session_id = s.id and a.model = 'Classical'
      limit 1
    )
  )
  from public.sessions s
  where s.access_token::text = p_token and s.verified
$$;

revoke all on function public.get_patient_report(text) from public;
grant execute on function public.get_patient_report(text) to anon, authenticated;

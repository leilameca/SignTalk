-- Run once in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

create table if not exists public.model_training_settings (
  variant text primary key check (variant in ('LSD', 'ASL')),
  minimum_samples integer not null default 1 check (minimum_samples between 1 and 500),
  minimum_participants integer not null default 1 check (minimum_participants between 1 and 100),
  minimum_macro_f1 real not null default 0.70 check (minimum_macro_f1 between 0 and 1),
  minimum_class_recall real not null default 0.45 check (minimum_class_recall between 0 and 1),
  confidence_threshold real not null default 0.68 check (confidence_threshold between 0.5 and 1),
  allow_experimental boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.translations_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sign_text text not null,
  spoken_reply text,
  confidence real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  type text not null check (type in ('sign', 'spoken')),
  category text,
  hand_details text,
  created_at timestamptz not null default now()
);
create index if not exists translations_history_user_created_idx on public.translations_history(user_id, created_at desc);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.dataset_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  pseudonym text not null check (char_length(pseudonym) between 2 and 50),
  dominant_hand text not null default 'right' check (dominant_hand in ('right', 'left', 'both')),
  country_code text not null default 'DO' check (char_length(country_code) = 2),
  is_adult boolean not null check (is_adult),
  consent_version text not null,
  consent_research boolean not null default false,
  consent_product boolean not null default false,
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sign_labels (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  display_name text not null,
  variant text not null check (variant in ('LSD', 'ASL')),
  motion_type text not null default 'static' check (motion_type in ('static', 'dynamic', 'two_hand')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (code, variant)
);

create table if not exists public.sign_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_id uuid not null references public.dataset_participants(id) on delete cascade,
  label_id uuid not null references public.sign_labels(id),
  storage_path text not null unique,
  landmark_sequence jsonb not null,
  duration_ms integer not null check (duration_ms between 250 and 10000),
  frame_count integer not null check (frame_count > 0),
  camera_facing text not null check (camera_facing in ('user', 'environment')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(landmark_sequence) = 'array' and jsonb_array_length(landmark_sequence) between 1 and 200)
);

create table if not exists public.sign_label_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 80),
  variant text not null default 'LSD' check (variant in ('LSD', 'ASL')),
  motion_type text not null default 'dynamic' check (motion_type in ('static', 'dynamic', 'two_hand')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  created_label_id uuid references public.sign_labels(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sign_recordings_user_created_idx on public.sign_recordings(user_id, created_at desc);
create index if not exists sign_recordings_label_status_idx on public.sign_recordings(label_id, status);
alter table public.sign_recordings
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.profiles enable row level security;
alter table public.app_admins enable row level security;
alter table public.model_training_settings enable row level security;
alter table public.translations_history enable row level security;
alter table public.user_preferences enable row level security;
alter table public.dataset_participants enable row level security;
alter table public.sign_labels enable row level security;
alter table public.sign_recordings enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "history_select_own" on public.translations_history;
drop policy if exists "history_insert_own" on public.translations_history;
drop policy if exists "history_update_own" on public.translations_history;
drop policy if exists "history_delete_own" on public.translations_history;
drop policy if exists "preferences_select_own" on public.user_preferences;
drop policy if exists "preferences_insert_own" on public.user_preferences;
drop policy if exists "preferences_update_own" on public.user_preferences;
drop policy if exists "participants_select_own" on public.dataset_participants;
drop policy if exists "participants_insert_own" on public.dataset_participants;
drop policy if exists "participants_update_own" on public.dataset_participants;
drop policy if exists "labels_read_authenticated" on public.sign_labels;
drop policy if exists "recordings_select_own" on public.sign_recordings;
drop policy if exists "recordings_insert_own" on public.sign_recordings;
drop policy if exists "recordings_delete_own" on public.sign_recordings;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "history_select_own" on public.translations_history for select using (auth.uid() = user_id);
create policy "history_insert_own" on public.translations_history for insert with check (auth.uid() = user_id);
create policy "history_update_own" on public.translations_history for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "history_delete_own" on public.translations_history for delete using (auth.uid() = user_id);
create policy "preferences_select_own" on public.user_preferences for select using (auth.uid() = user_id);
create policy "preferences_insert_own" on public.user_preferences for insert with check (auth.uid() = user_id);
create policy "preferences_update_own" on public.user_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "participants_select_own" on public.dataset_participants for select using (auth.uid() = user_id);
create policy "participants_insert_own" on public.dataset_participants for insert with check (auth.uid() = user_id);
create policy "participants_update_own" on public.dataset_participants for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "labels_read_authenticated" on public.sign_labels for select to authenticated using (active);
create policy "recordings_select_own" on public.sign_recordings for select using (auth.uid() = user_id);
create policy "recordings_insert_own" on public.sign_recordings for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.dataset_participants participant
    where participant.id = participant_id
      and participant.user_id = auth.uid()
      and participant.withdrawn_at is null
      and participant.consent_research
      and participant.consent_product
  )
  and exists (
    select 1 from public.sign_labels label
    where label.id = label_id and label.active
  )
);
create policy "recordings_delete_own" on public.sign_recordings for delete using (auth.uid() = user_id);

insert into public.app_admins (email) values ('leilanycristaldedios@gmail.com') on conflict (email) do nothing;
create or replace function public.is_app_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;
drop policy if exists "admins_select_self" on public.app_admins;
drop policy if exists "participants_admin_select" on public.dataset_participants;
drop policy if exists "recordings_admin_select" on public.sign_recordings;
drop policy if exists "recordings_admin_update" on public.sign_recordings;
drop policy if exists "dataset_storage_admin_select" on storage.objects;
create policy "admins_select_self" on public.app_admins for select to authenticated using (email = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "participants_admin_select" on public.dataset_participants for select to authenticated using ((select public.is_app_admin()));
create policy "recordings_admin_select" on public.sign_recordings for select to authenticated using ((select public.is_app_admin()));
create policy "recordings_admin_update" on public.sign_recordings for update to authenticated using ((select public.is_app_admin())) with check ((select public.is_app_admin()));
create policy "dataset_storage_admin_select" on storage.objects for select to authenticated using (bucket_id = 'sign-dataset' and (select public.is_app_admin()));

grant select, insert, update on public.dataset_participants to authenticated;
grant select on public.sign_labels to authenticated;
grant select, insert, delete on public.sign_recordings to authenticated;
grant update (status, rejection_reason, reviewed_by, reviewed_at) on public.sign_recordings to authenticated;
grant select on public.app_admins to authenticated;
insert into public.model_training_settings (variant, minimum_samples, minimum_participants, minimum_macro_f1, minimum_class_recall, confidence_threshold, allow_experimental)
values ('LSD', 1, 1, 0.70, 0.45, 0.68, true) on conflict (variant) do nothing;
drop policy if exists "training_settings_admin_select" on public.model_training_settings;
drop policy if exists "training_settings_admin_update" on public.model_training_settings;
create policy "training_settings_admin_select" on public.model_training_settings for select to authenticated using ((select public.is_app_admin()));
create policy "training_settings_admin_update" on public.model_training_settings for update to authenticated using ((select public.is_app_admin())) with check ((select public.is_app_admin()));
grant select, update on public.model_training_settings to authenticated;

create index if not exists sign_label_proposals_status_created_idx on public.sign_label_proposals(status, created_at desc);
create index if not exists sign_label_proposals_user_created_idx on public.sign_label_proposals(user_id, created_at desc);
create unique index if not exists sign_label_proposals_unique_open_name_idx on public.sign_label_proposals(variant, lower(trim(display_name))) where status in ('pending', 'approved');
alter table public.sign_label_proposals enable row level security;
drop policy if exists "label_proposals_select_own" on public.sign_label_proposals;
drop policy if exists "label_proposals_insert_own" on public.sign_label_proposals;
create policy "label_proposals_select_own" on public.sign_label_proposals for select to authenticated using (auth.uid() = user_id or (select public.is_app_admin()));
create policy "label_proposals_insert_own" on public.sign_label_proposals for insert to authenticated with check (auth.uid() = user_id and status = 'pending' and reviewed_by is null and reviewed_at is null and created_label_id is null);
grant select, insert on public.sign_label_proposals to authenticated;

create or replace function public.review_sign_label_proposal(proposal_id uuid, decision text, reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  proposal public.sign_label_proposals%rowtype;
  generated_label_id uuid;
  generated_code text;
begin
  if not public.is_app_admin() then raise exception 'Acceso administrativo requerido'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'Decisión inválida'; end if;
  select * into proposal from public.sign_label_proposals where id = proposal_id for update;
  if not found then raise exception 'Propuesta no encontrada'; end if;
  if proposal.status <> 'pending' then raise exception 'La propuesta ya fue revisada'; end if;
  if decision = 'rejected' and char_length(trim(coalesce(reason, ''))) < 3 then raise exception 'Indica una razón breve para rechazar'; end if;
  if decision = 'approved' then
    select id into generated_label_id from public.sign_labels where variant = proposal.variant and lower(trim(display_name)) = lower(trim(proposal.display_name)) limit 1;
    if generated_label_id is null then
      generated_code := 'community_' || substr(replace(proposal.id::text, '-', ''), 1, 16);
      insert into public.sign_labels (code, display_name, variant, motion_type, active)
      values (generated_code, trim(proposal.display_name), proposal.variant, proposal.motion_type, true)
      returning id into generated_label_id;
    end if;
  end if;
  update public.sign_label_proposals set status = decision, rejection_reason = case when decision = 'rejected' then trim(reason) else null end, created_label_id = generated_label_id, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = proposal_id;
  return generated_label_id;
end;
$$;
revoke all on function public.review_sign_label_proposal(uuid, text, text) from public;
grant execute on function public.review_sign_label_proposal(uuid, text, text) to authenticated;

insert into public.sign_labels (code, display_name, variant, motion_type) values
  ('hola', 'Hola', 'LSD', 'dynamic'),
  ('gracias', 'Gracias', 'LSD', 'dynamic'),
  ('por_favor', 'Por favor', 'LSD', 'dynamic'),
  ('si', 'Sí', 'LSD', 'dynamic'),
  ('no', 'No', 'LSD', 'dynamic'),
  ('ayuda', 'Ayuda', 'LSD', 'two_hand'),
  ('bano', 'Baño', 'LSD', 'dynamic'),
  ('agua', 'Agua', 'LSD', 'dynamic'),
  ('comer', 'Comer', 'LSD', 'dynamic'),
  ('dolor', 'Dolor', 'LSD', 'dynamic'),
  ('te_quiero', 'Te quiero', 'LSD', 'static'),
  ('none', 'Ninguna / movimiento neutral', 'LSD', 'dynamic'),
  ('hola', 'Hello', 'ASL', 'dynamic'),
  ('gracias', 'Thank you', 'ASL', 'dynamic'),
  ('ayuda', 'Help', 'ASL', 'two_hand'),
  ('none', 'None / neutral movement', 'ASL', 'dynamic')
on conflict (code, variant) do update set display_name = excluded.display_name, motion_type = excluded.motion_type, active = true;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sign-dataset', 'sign-dataset', false, 10485760, array['video/webm', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dataset_storage_insert_own" on storage.objects;
drop policy if exists "dataset_storage_select_own" on storage.objects;
drop policy if exists "dataset_storage_delete_own" on storage.objects;
create policy "dataset_storage_insert_own" on storage.objects for insert to authenticated with check (
  bucket_id = 'sign-dataset' and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy "dataset_storage_select_own" on storage.objects for select to authenticated using (
  bucket_id = 'sign-dataset' and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy "dataset_storage_delete_own" on storage.objects for delete to authenticated using (
  bucket_id = 'sign-dataset' and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

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
  created_at timestamptz not null default now(),
  check (jsonb_typeof(landmark_sequence) = 'array' and jsonb_array_length(landmark_sequence) between 1 and 200)
);

create index if not exists sign_recordings_user_created_idx on public.sign_recordings(user_id, created_at desc);
create index if not exists sign_recordings_label_status_idx on public.sign_recordings(label_id, status);

alter table public.dataset_participants enable row level security;
alter table public.sign_labels enable row level security;
alter table public.sign_recordings enable row level security;

create policy "participants_select_own" on public.dataset_participants for select using (auth.uid() = user_id);
create policy "participants_insert_own" on public.dataset_participants for insert with check (auth.uid() = user_id);
create policy "participants_update_own" on public.dataset_participants for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "labels_read_authenticated" on public.sign_labels for select to authenticated using (active);
create policy "recordings_select_own" on public.sign_recordings for select using (auth.uid() = user_id);
create policy "recordings_insert_own" on public.sign_recordings for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.dataset_participants participant where participant.id = participant_id and participant.user_id = auth.uid() and participant.withdrawn_at is null and participant.consent_research and participant.consent_product)
  and exists (select 1 from public.sign_labels label where label.id = label_id and label.active)
);
create policy "recordings_delete_own" on public.sign_recordings for delete using (auth.uid() = user_id);

grant select, insert, update on public.dataset_participants to authenticated;
grant select on public.sign_labels to authenticated;
grant select, insert, delete on public.sign_recordings to authenticated;

insert into public.sign_labels (code, display_name, variant, motion_type) values
  ('hola', 'Hola', 'LSD', 'dynamic'), ('gracias', 'Gracias', 'LSD', 'dynamic'),
  ('por_favor', 'Por favor', 'LSD', 'dynamic'), ('si', 'Sí', 'LSD', 'dynamic'),
  ('no', 'No', 'LSD', 'dynamic'), ('ayuda', 'Ayuda', 'LSD', 'two_hand'),
  ('bano', 'Baño', 'LSD', 'dynamic'), ('agua', 'Agua', 'LSD', 'dynamic'),
  ('comer', 'Comer', 'LSD', 'dynamic'), ('dolor', 'Dolor', 'LSD', 'dynamic'),
  ('te_quiero', 'Te quiero', 'LSD', 'static'), ('none', 'Ninguna / movimiento neutral', 'LSD', 'dynamic'),
  ('hola', 'Hello', 'ASL', 'dynamic'), ('gracias', 'Thank you', 'ASL', 'dynamic'),
  ('ayuda', 'Help', 'ASL', 'two_hand'), ('none', 'None / neutral movement', 'ASL', 'dynamic')
on conflict (code, variant) do update set display_name = excluded.display_name, motion_type = excluded.motion_type, active = true;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sign-dataset', 'sign-dataset', false, 10485760, array['video/webm', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "dataset_storage_insert_own" on storage.objects for insert to authenticated with check (bucket_id = 'sign-dataset' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "dataset_storage_select_own" on storage.objects for select to authenticated using (bucket_id = 'sign-dataset' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "dataset_storage_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'sign-dataset' and (storage.foldername(name))[1] = (select auth.uid()::text));

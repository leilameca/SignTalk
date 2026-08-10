create table if not exists public.app_admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

insert into public.app_admins (email)
values ('leilanycristaldedios@gmail.com')
on conflict (email) do nothing;

alter table public.app_admins enable row level security;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

drop policy if exists "admins_select_self" on public.app_admins;
create policy "admins_select_self" on public.app_admins
for select to authenticated
using (email = lower(coalesce(auth.jwt() ->> 'email', '')));
grant select on public.app_admins to authenticated;

alter table public.sign_recordings
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

drop policy if exists "participants_admin_select" on public.dataset_participants;
create policy "participants_admin_select" on public.dataset_participants
for select to authenticated using ((select public.is_app_admin()));

drop policy if exists "recordings_admin_select" on public.sign_recordings;
create policy "recordings_admin_select" on public.sign_recordings
for select to authenticated using ((select public.is_app_admin()));

drop policy if exists "recordings_admin_update" on public.sign_recordings;
create policy "recordings_admin_update" on public.sign_recordings
for update to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

grant update (status, rejection_reason, reviewed_by, reviewed_at) on public.sign_recordings to authenticated;

drop policy if exists "dataset_storage_admin_select" on storage.objects;
create policy "dataset_storage_admin_select" on storage.objects
for select to authenticated
using (bucket_id = 'sign-dataset' and (select public.is_app_admin()));


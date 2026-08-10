create table if not exists public.model_training_settings (
  variant text primary key check (variant in ('LSD', 'ASL')),
  minimum_samples integer not null default 1 check (minimum_samples between 1 and 500),
  minimum_participants integer not null default 1 check (minimum_participants between 1 and 100),
  minimum_macro_f1 real not null default 0.70 check (minimum_macro_f1 between 0 and 1),
  minimum_class_recall real not null default 0.45 check (minimum_class_recall between 0 and 1),
  confidence_threshold real not null default 0.82 check (confidence_threshold between 0.5 and 1),
  allow_experimental boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.model_training_settings (
  variant, minimum_samples, minimum_participants, minimum_macro_f1,
  minimum_class_recall, confidence_threshold, allow_experimental
) values ('LSD', 1, 1, 0.70, 0.45, 0.82, true)
on conflict (variant) do update set
  minimum_samples = 1,
  minimum_participants = 1,
  allow_experimental = true,
  updated_at = now();

alter table public.model_training_settings enable row level security;

drop policy if exists "training_settings_admin_select" on public.model_training_settings;
create policy "training_settings_admin_select" on public.model_training_settings
for select to authenticated using ((select public.is_app_admin()));

drop policy if exists "training_settings_admin_update" on public.model_training_settings;
create policy "training_settings_admin_update" on public.model_training_settings
for update to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

grant select, update on public.model_training_settings to authenticated;


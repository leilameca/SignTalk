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

create index if not exists sign_label_proposals_status_created_idx
  on public.sign_label_proposals(status, created_at desc);
create index if not exists sign_label_proposals_user_created_idx
  on public.sign_label_proposals(user_id, created_at desc);
create unique index if not exists sign_label_proposals_unique_open_name_idx
  on public.sign_label_proposals(variant, lower(trim(display_name)))
  where status in ('pending', 'approved');

alter table public.sign_label_proposals enable row level security;

drop policy if exists "label_proposals_select_own" on public.sign_label_proposals;
create policy "label_proposals_select_own" on public.sign_label_proposals
for select to authenticated
using (auth.uid() = user_id or (select public.is_app_admin()));

drop policy if exists "label_proposals_insert_own" on public.sign_label_proposals;
create policy "label_proposals_insert_own" on public.sign_label_proposals
for insert to authenticated
with check (
  auth.uid() = user_id
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and created_label_id is null
);

grant select, insert on public.sign_label_proposals to authenticated;

create or replace function public.review_sign_label_proposal(
  proposal_id uuid,
  decision text,
  reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.sign_label_proposals%rowtype;
  generated_label_id uuid;
  generated_code text;
begin
  if not public.is_app_admin() then
    raise exception 'Acceso administrativo requerido';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'Decisión inválida';
  end if;

  select * into proposal
  from public.sign_label_proposals
  where id = proposal_id
  for update;
  if not found then raise exception 'Propuesta no encontrada'; end if;
  if proposal.status <> 'pending' then raise exception 'La propuesta ya fue revisada'; end if;
  if decision = 'rejected' and char_length(trim(coalesce(reason, ''))) < 3 then
    raise exception 'Indica una razón breve para rechazar';
  end if;

  if decision = 'approved' then
    select id into generated_label_id from public.sign_labels
    where variant = proposal.variant and lower(trim(display_name)) = lower(trim(proposal.display_name))
    limit 1;
    if generated_label_id is null then
      generated_code := 'community_' || substr(replace(proposal.id::text, '-', ''), 1, 16);
      insert into public.sign_labels (code, display_name, variant, motion_type, active)
      values (generated_code, trim(proposal.display_name), proposal.variant, proposal.motion_type, true)
      returning id into generated_label_id;
    end if;
  end if;

  update public.sign_label_proposals
  set status = decision,
      rejection_reason = case when decision = 'rejected' then trim(reason) else null end,
      created_label_id = generated_label_id,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = proposal_id;

  return generated_label_id;
end;
$$;

revoke all on function public.review_sign_label_proposal(uuid, text, text) from public;
grant execute on function public.review_sign_label_proposal(uuid, text, text) to authenticated;

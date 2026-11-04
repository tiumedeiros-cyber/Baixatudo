-- JK Prospect X1 · Fase 0/1: base, leads, buscas, eventos.
--
-- Modelo de acesso: painel de um único dono.
--  * Todas as tabelas têm RLS ligado e só enxergam quem é o dono do workspace.
--  * O primeiro login válido chama claim_workspace() e vira o dono; depois disso
--    qualquer outro usuário autenticado não vê nada (is_owner() = false).
--  * O app só usa a chave publicável + a sessão do dono. Nenhuma chave secreta.

-- ───────────────────────── workspace (dono) ─────────────────────────
create table public.workspace (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null unique references auth.users (id) on delete cascade,
  name       text not null default 'JK Prospect X1',
  created_at timestamptz not null default now()
);
-- no máximo uma linha
create unique index workspace_single_row on public.workspace ((true));

create function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.workspace w where w.owner_id = auth.uid());
$$;

create function public.claim_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select owner_id into current_owner from public.workspace limit 1;
  if current_owner is null then
    insert into public.workspace (owner_id) values (auth.uid());
    return auth.uid();
  end if;
  return current_owner;
end;
$$;

revoke all on function public.is_owner() from public, anon;
revoke all on function public.claim_workspace() from public, anon;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.claim_workspace() to authenticated;

alter table public.workspace enable row level security;
create policy workspace_select_owner on public.workspace
  for select to authenticated using (owner_id = (select auth.uid()));

-- ───────────────────────── buscas ─────────────────────────
create table public.searches (
  id                 uuid primary key default gen_random_uuid(),
  niche              text not null,
  city               text not null,
  state              text,
  requested          int  not null default 0,
  source             text not null check (source in ('apify', 'json', 'demo')),
  status             text not null check (status in ('running', 'ingesting', 'done', 'failed')),
  apify_run_id       text,
  dataset_id         text,
  found              int  not null default 0,
  inserted           int  not null default 0,
  duplicates         int  not null default 0,
  invalid            int  not null default 0,
  eligible           int  not null default 0,
  estimated_cost_usd numeric(8, 4),
  error              text,
  created_at         timestamptz not null default now(),
  finished_at        timestamptz
);
create index searches_created on public.searches (created_at desc);

-- ───────────────────────── leads ─────────────────────────
create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  dedupe_key         text not null unique,
  place_id           text,
  name               text not null,
  category           text,
  niche              text,
  city               text,
  state              text,
  address            text,
  neighborhood       text,
  phone_raw          text,
  phone_e164         text,
  is_mobile          boolean not null default false,
  whatsapp_status    text not null default 'unknown' check (whatsapp_status in ('unknown', 'yes', 'no')),
  website_raw        text,
  website_kind       text not null check (website_kind in ('none', 'social', 'weak', 'real')),
  website_signals    text[] not null default '{}',
  site_checked_at    timestamptz,
  rating             numeric(2, 1),
  reviews_count      int not null default 0,
  maps_url           text,
  lat                double precision,
  lng                double precision,
  permanently_closed boolean not null default false,
  score              int not null default 0 check (score between 0 and 100),
  score_breakdown    jsonb not null default '[]'::jsonb,
  eligible           boolean not null default false,
  ineligible_reason  text check (ineligible_reason in ('sem_celular', 'fechado', 'optout')),
  stage              text not null default 'novo'
                       check (stage in ('novo', 'qualificado', 'contatado', 'respondeu', 'proposta', 'ganho', 'perdido')),
  stage_changed_at   timestamptz not null default now(),
  notes              text not null default '',
  deal_value         numeric(10, 2),
  source             text not null check (source in ('apify', 'json', 'manual', 'demo')),
  search_id          uuid references public.searches (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- o mesmo celular nunca entra duas vezes
create unique index leads_phone_unique on public.leads (phone_e164) where phone_e164 is not null;
create index leads_stage_score on public.leads (stage, score desc, reviews_count desc);
create index leads_search on public.leads (search_id);
create index leads_created on public.leads (created_at desc);
create index leads_eligible_score on public.leads (eligible, score desc);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

-- ───────────────────────── eventos (auditoria e feed) ─────────────────────────
create table public.lead_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid references public.leads (id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index lead_events_lead on public.lead_events (lead_id, created_at desc);
create index lead_events_created on public.lead_events (created_at desc);

-- ───────────────────────── lista de bloqueio e configurações ─────────────────────────
create table public.optouts (
  phone_e164 text primary key,
  reason     text,
  created_at timestamptz not null default now()
);

create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ───────────────────────── RLS: só o dono ─────────────────────────
alter table public.searches    enable row level security;
alter table public.leads       enable row level security;
alter table public.lead_events enable row level security;
alter table public.optouts     enable row level security;
alter table public.settings    enable row level security;

create policy owner_all on public.searches    for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.leads       for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.lead_events for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.optouts     for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.settings    for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ───────────────────────── estatísticas do painel ─────────────────────────
-- security invoker: roda com as permissões de quem chama, então a RLS vale.
create function public.lead_stats()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'total', count(*),
    'eligible', count(*) filter (where eligible),
    'eligible_no_site', count(*) filter (where eligible and website_kind in ('none', 'social')),
    'avg_score', coalesce(round(avg(score))::int, 0),
    'won_value', coalesce(sum(deal_value) filter (where stage = 'ganho'), 0),
    'stages', jsonb_build_object(
      -- o funil só conta quem dá para trabalhar: inelegível parado em "novo" fica de fora
      'novo',        count(*) filter (where stage = 'novo' and eligible),
      'qualificado', count(*) filter (where stage = 'qualificado'),
      'contatado',   count(*) filter (where stage = 'contatado'),
      'respondeu',   count(*) filter (where stage = 'respondeu'),
      'proposta',    count(*) filter (where stage = 'proposta'),
      'ganho',       count(*) filter (where stage = 'ganho'),
      'perdido',     count(*) filter (where stage = 'perdido')
    )
  )
  from public.leads;
$$;

revoke all on function public.lead_stats() from public, anon;
grant execute on function public.lead_stats() to authenticated;

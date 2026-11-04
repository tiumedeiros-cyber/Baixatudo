-- JK Prospect X1: TODAS as migrações em um arquivo só, na ordem certa.
-- Como usar: Supabase > SQL Editor > New query > cole tudo > Run. Rode UMA vez, num projeto novo e vazio.
-- (Os mesmos arquivos estão separados em supabase/migrations, para quem usa 'supabase db push'.)

-- =============================================================================
-- 20261021000000_init.sql
-- =============================================================================
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


-- =============================================================================
-- 20261022010000_outreach.sql
-- =============================================================================
-- Fase 2/3: conversas, mensagens e fila de envio. Só cria coisas novas.

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null unique references public.leads (id) on delete cascade,
  phone_e164       text not null unique,
  status           text not null default 'active'
                     check (status in ('active', 'awaiting_human', 'closed', 'opted_out')),
  human_taken_over boolean not null default false,
  touches          int not null default 0,
  unread           int not null default 0,
  last_inbound_at  timestamptz,
  last_outbound_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index conversations_status on public.conversations (status, last_inbound_at desc);

create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();

create table public.messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.conversations (id) on delete cascade,
  lead_id             uuid not null references public.leads (id) on delete cascade,
  direction           text not null check (direction in ('out', 'in')),
  kind                text not null check (kind in ('opening', 'followup', 'reply', 'manual')),
  step                int not null default 0,
  body                text not null,
  status              text not null
                        check (status in ('draft', 'approved', 'sending', 'sent', 'delivered', 'read',
                                          'simulated', 'failed', 'cancelled', 'received')),
  variant             text,
  intent              text check (intent in ('optout', 'interested', 'price', 'question', 'not_interested',
                                             'audio', 'media', 'other')),
  scheduled_for       timestamptz,
  approved_at         timestamptz,
  sent_at             timestamptz,
  provider_message_id text,
  attempts            int not null default 0,
  error               text,
  created_by          text not null check (created_by in ('system', 'user', 'lead')),
  batch_day           date,
  created_at          timestamptz not null default now()
);

-- o mesmo id do WhatsApp nunca entra duas vezes (o webhook pode repetir a entrega)
create unique index messages_provider_id on public.messages (provider_message_id)
  where provider_message_id is not null;
create index messages_due on public.messages (status, scheduled_for) where direction = 'out';
create index messages_conversation on public.messages (conversation_id, created_at);
create index messages_lead on public.messages (lead_id);
create index messages_batch on public.messages (batch_day) where batch_day is not null;

alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

create policy owner_all on public.conversations for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.messages for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Pega a próxima mensagem aprovada e vencida e a marca como "sending", sem dois workers
-- pegarem a mesma. Só o worker (chave secreta) chama.
create function public.claim_next_message(p_now timestamptz)
returns setof public.messages
language plpgsql
set search_path = public
as $$
declare
  picked public.messages;
begin
  select * into picked
  from public.messages
  where direction = 'out'
    and status = 'approved'
    and (scheduled_for is null or scheduled_for <= p_now)
  order by scheduled_for nulls first, created_at
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update public.messages
     set status = 'sending', attempts = attempts + 1
   where id = picked.id
  returning * into picked;

  return next picked;
end;
$$;

revoke all on function public.claim_next_message(timestamptz) from public, anon, authenticated;


-- =============================================================================
-- 20261022020000_message_counts.sql
-- =============================================================================
-- Contadores do painel de envio, numa chamada só. security invoker: a RLS vale.
create function public.message_counts()
returns jsonb
language sql
stable
set search_path = public
as $$
  with sent as (
    select distinct conversation_id
    from public.messages
    where direction = 'out'
      and kind in ('opening', 'followup')
      and status in ('sent', 'delivered', 'read')
  )
  select jsonb_build_object(
    'prospecting_sent', (
      select count(*) from public.messages
      where direction = 'out' and kind in ('opening', 'followup') and status in ('sent', 'delivered', 'read')
    ),
    'conversations_replied', (
      select count(distinct m.conversation_id)
      from public.messages m
      join sent s on s.conversation_id = m.conversation_id
      where m.direction = 'in'
    ),
    'draft',     (select count(*) from public.messages where direction = 'out' and status = 'draft'),
    'approved',  (select count(*) from public.messages where direction = 'out' and status = 'approved'),
    'simulated', (select count(*) from public.messages where direction = 'out' and status = 'simulated'),
    'failed',    (select count(*) from public.messages where direction = 'out' and status = 'failed')
  );
$$;

revoke all on function public.message_counts() from public, anon;
grant execute on function public.message_counts() to authenticated;


-- =============================================================================
-- 20261023000000_deals.sql
-- =============================================================================
-- Fase 4 e 5: prévia do site, propostas (Pix manual) e produção. Só cria coisas novas.

-- ───────────────────────── prévias do site ─────────────────────────
create table public.demos (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads (id) on delete cascade,
  -- o link é a única proteção da prévia: token longo e aleatório, nunca o id
  slug            text not null unique check (slug ~ '^[a-z0-9]{16,40}$'),
  template        text not null check (template in ('estetica', 'barbearia', 'clinica', 'generico')),
  palette         text not null check (palette in ('rose', 'sage', 'noir', 'ocean')),
  content         jsonb not null,
  status          text not null default 'published' check (status in ('published', 'archived')),
  views           int not null default 0 check (views >= 0),
  first_viewed_at timestamptz,
  last_viewed_at  timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index demos_lead on public.demos (lead_id, created_at desc);

create trigger demos_touch before update on public.demos
  for each row execute function public.touch_updated_at();

-- ───────────────────────── propostas ─────────────────────────
create table public.proposals (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads (id) on delete cascade,
  demo_id       uuid references public.demos (id) on delete set null,
  title         text not null check (char_length(title) between 1 and 120),
  amount_cents  int not null check (amount_cents between 100 and 100000000),
  entry_pct     int not null default 50 check (entry_pct between 0 and 100),
  delivery_days int not null default 7 check (delivery_days between 1 and 90),
  status        text not null default 'draft'
                  check (status in ('draft', 'sent', 'accepted', 'entry_paid', 'paid', 'cancelled')),
  notes         text not null default '',
  sent_at       timestamptz,
  accepted_at   timestamptz,
  entry_paid_at timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index proposals_lead on public.proposals (lead_id, created_at desc);
create index proposals_status on public.proposals (status);

create trigger proposals_touch before update on public.proposals
  for each row execute function public.touch_updated_at();

-- ───────────────────────── produção ─────────────────────────
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads (id) on delete cascade,
  -- um projeto por proposta (várias linhas sem proposta continuam permitidas)
  proposal_id  uuid unique references public.proposals (id) on delete set null,
  status       text not null default 'briefing' check (status in ('briefing', 'producao', 'revisao', 'entregue')),
  due_date     date,
  checklist    jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  briefing     text not null default '',
  delivered_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index projects_status on public.projects (status, due_date);
create index projects_lead on public.projects (lead_id);

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ───────────────────────── RLS: só o dono ─────────────────────────
alter table public.demos     enable row level security;
alter table public.proposals enable row level security;
alter table public.projects  enable row level security;

create policy owner_all on public.demos for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.proposals for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.projects for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ───────────────────────── a única porta pública ─────────────────────────
-- A página /p/<slug> é aberta por quem recebeu o link, sem login. Esta função é a ÚNICA coisa que
-- o visitante anônimo consegue chamar: ela só devolve o conteúdo (nunca o id, o lead ou qualquer
-- outro dado interno) de uma prévia publicada, e só para o slug exato. Com p_count = false só lê
-- (usado por robôs de pré-visualização do WhatsApp e pelo próprio painel, que não contam como visita).
create function public.view_demo(p_slug text, p_count boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.demos;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]{16,40}$' then
    return null;
  end if;

  if p_count then
    update public.demos
       set views = views + 1,
           first_viewed_at = coalesce(first_viewed_at, now()),
           last_viewed_at = now()
     where slug = p_slug and status = 'published'
    returning * into r;
  else
    select * into r from public.demos where slug = p_slug and status = 'published';
  end if;

  if not found then
    return null;
  end if;

  return jsonb_build_object('template', r.template, 'palette', r.palette, 'content', r.content);
end;
$$;

revoke all on function public.view_demo(text, boolean) from public;
grant execute on function public.view_demo(text, boolean) to anon, authenticated;


-- =============================================================================
-- 20261024000000_message_counts_auto_reply.sql
-- =============================================================================
-- Resposta automática do negócio (aviso de ausência, saudação do WhatsApp Business, menu) não conta como resposta do lead.
-- O painel marca essas mensagens recebidas com variant = 'resposta-automatica' (src/lib/outreach/autoreply.ts).
-- Só substitui a função; nenhuma tabela, coluna ou dado muda. Sem esta migration tudo funciona, só que o contador
-- "Respostas" do Comando passa a incluir os robôs.
create or replace function public.message_counts()
returns jsonb
language sql
stable
set search_path = public
as $$
  with sent as (
    select distinct conversation_id
    from public.messages
    where direction = 'out'
      and kind in ('opening', 'followup')
      and status in ('sent', 'delivered', 'read')
  )
  select jsonb_build_object(
    'prospecting_sent', (
      select count(*) from public.messages
      where direction = 'out' and kind in ('opening', 'followup') and status in ('sent', 'delivered', 'read')
    ),
    'conversations_replied', (
      select count(distinct m.conversation_id)
      from public.messages m
      join sent s on s.conversation_id = m.conversation_id
      where m.direction = 'in'
        and coalesce(m.variant, '') <> 'resposta-automatica'
    ),
    'draft',     (select count(*) from public.messages where direction = 'out' and status = 'draft'),
    'approved',  (select count(*) from public.messages where direction = 'out' and status = 'approved'),
    'simulated', (select count(*) from public.messages where direction = 'out' and status = 'simulated'),
    'failed',    (select count(*) from public.messages where direction = 'out' and status = 'failed')
  );
$$;

revoke all on function public.message_counts() from public, anon;
grant execute on function public.message_counts() to authenticated;


-- =============================================================================
-- 20261027000000_numbers.sql
-- =============================================================================
-- Vários números de WhatsApp. Só acrescenta: nada que já existe é apagado e, com um número só, tudo segue igual.
--
-- • whatsapp_accounts: cada número (um aparelho do GOWA) com nome, freio, teto e aquecimento próprios.
-- • conversations.account_id: o número dono da conversa. Vale para sempre (um lead fala com um número só).
-- • messages.account_id: copiado da conversa; é o que separa a fila de cada número.
-- • claim_next_message ganha o número como filtro opcional (sem ele, pega de qualquer um, como antes).

create table public.whatsapp_accounts (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(btrim(name)) between 1 and 60),
  gowa_device_id       text unique,
  phone_e164           text,
  jid                  text,
  legacy               boolean not null default false,
  paused               boolean not null default false,
  paused_reason        text,
  retired              boolean not null default false,
  position             int not null default 0,
  caps                 jsonb,
  warmup_start         date,
  last_send_at         timestamptz,
  consecutive_failures int not null default 0,
  last_result          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- só um número pode ser o original
create unique index whatsapp_accounts_one_legacy on public.whatsapp_accounts (legacy) where legacy;

create trigger whatsapp_accounts_touch before update on public.whatsapp_accounts
  for each row execute function public.touch_updated_at();

alter table public.whatsapp_accounts enable row level security;
create policy owner_all on public.whatsapp_accounts for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- O número que já existia vira o "Número 1". O estado de envio dele continua em settings.automation_state.
insert into public.whatsapp_accounts (name, legacy, position) values ('Número 1', true, 1);

alter table public.conversations add column account_id uuid references public.whatsapp_accounts (id);
alter table public.messages      add column account_id uuid references public.whatsapp_accounts (id);

-- tudo o que já existia pertence ao número original (sem mexer em updated_at das conversas)
alter table public.conversations disable trigger conversations_touch;
update public.conversations set account_id = (select id from public.whatsapp_accounts where legacy) where account_id is null;
alter table public.conversations enable trigger conversations_touch;

update public.messages m
   set account_id = c.account_id
  from public.conversations c
 where c.id = m.conversation_id and m.account_id is null;

create index conversations_account on public.conversations (account_id);
create index messages_account_due on public.messages (account_id, status, scheduled_for) where direction = 'out';

-- Conversa nova sem número escolhido fica com o original.
create function public.conversations_default_account() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.account_id is null then
    select id into new.account_id from public.whatsapp_accounts where legacy;
  end if;
  return new;
end;
$$;

create trigger conversations_default_account before insert on public.conversations
  for each row execute function public.conversations_default_account();

-- Depois do primeiro contato a conversa fica com o número que abordou o lead (a regra "1 lead = 1 número" fica no banco).
-- Antes disso (só rascunhos, nada enviado nem recebido) o dono ainda pode trocar o número.
create function public.conversations_keep_account() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.account_id is not null and new.account_id is distinct from old.account_id
     and (old.touches > 0 or old.last_inbound_at is not null or old.last_outbound_at is not null) then
    raise exception 'O número de uma conversa não pode mudar.';
  end if;
  return new;
end;
$$;

create trigger conversations_keep_account before update on public.conversations
  for each row execute function public.conversations_keep_account();

-- A mensagem nasce com o número da conversa.
create function public.messages_default_account() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.account_id is null then
    select account_id into new.account_id from public.conversations where id = new.conversation_id;
  end if;
  return new;
end;
$$;

create trigger messages_default_account before insert on public.messages
  for each row execute function public.messages_default_account();

-- Fila por número: com p_account, só as mensagens daquele número; sem, de qualquer um (comportamento antigo).
drop function if exists public.claim_next_message(timestamptz);

create function public.claim_next_message(p_now timestamptz, p_account uuid default null)
returns setof public.messages
language plpgsql
set search_path = public
as $$
declare
  picked public.messages;
begin
  select * into picked
  from public.messages
  where direction = 'out'
    and status = 'approved'
    and (scheduled_for is null or scheduled_for <= p_now)
    and (p_account is null or account_id = p_account)
  order by scheduled_for nulls first, created_at
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update public.messages
     set status = 'sending', attempts = attempts + 1
   where id = picked.id
  returning * into picked;

  return next picked;
end;
$$;

revoke all on function public.claim_next_message(timestamptz, uuid) from public, anon, authenticated;


-- =============================================================================
-- 20261029000000_app_pulse.sql
-- =============================================================================
-- Pulso do painel: uma assinatura curta do que as telas mostram. A tela aberta pergunta de poucos em poucos segundos e só
-- recarrega quando a assinatura muda (mensagem nova, recibo de entrega/leitura, resposta do lead, etapa do lead, evento,
-- configuração). Só cria uma função de LEITURA; nenhuma tabela, coluna ou dado muda. Sem esta migration tudo funciona, só que
-- a tela passa a recarregar a cada 20 s em vez de na hora (veja `pulse` em src/lib/repo/supabase.ts).
--
-- Fica de fora de propósito o estado interno do worker (settings.automation_state muda a cada volta de ~20 s), senão a tela
-- recarregaria à toa.
create or replace function public.app_pulse()
returns text
language sql
stable
set search_path = public
as $$
  select md5(concat_ws('|',
    -- mensagens: quantas em cada status (pega enviada → entregue → lida), novas, reagendadas e com erro
    (select coalesce(string_agg(status || ':' || n, ',' order by status), '')
       from (select status, count(*) as n from public.messages group by status) s),
    (select concat_ws(',', coalesce(max(created_at)::text, ''), coalesce(sum(attempts), 0), count(error),
                      coalesce(sum(extract(epoch from scheduled_for)), 0))
       from public.messages),
    -- conversas: novas, não lidas e qualquer mudança
    (select concat_ws(',', count(*), coalesce(sum(unread), 0), coalesce(max(updated_at)::text, ''))
       from public.conversations),
    (select concat_ws(',', count(*), coalesce(max(updated_at)::text, '')) from public.leads),
    (select concat_ws(',', count(*), coalesce(max(created_at)::text, '')) from public.lead_events),
    (select count(*) from public.optouts),
    -- configurações do painel e da automação (não o estado do worker)
    (select coalesce(max(updated_at)::text, '') from public.settings where key in ('app', 'automation')),
    (select concat_ws(',', count(*), coalesce(max(updated_at)::text, '')) from public.whatsapp_accounts),
    (select concat_ws(',', count(*), coalesce(max(updated_at)::text, '')) from public.demos),
    (select concat_ws(',', count(*), coalesce(max(updated_at)::text, '')) from public.proposals),
    (select concat_ws(',', count(*), coalesce(max(updated_at)::text, '')) from public.projects)
  ));
$$;

revoke all on function public.app_pulse() from public, anon;
grant execute on function public.app_pulse() to authenticated;


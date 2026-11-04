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

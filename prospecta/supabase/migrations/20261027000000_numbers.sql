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

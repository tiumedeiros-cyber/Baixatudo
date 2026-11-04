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

-- =========================================================
-- EDITOR STUDIO - Schema principal
-- =========================================================
create extension if not exists "pgcrypto";

-- ---------- helpers ----------
create or replace function public.es_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create table if not exists public.es_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'client' check (role in ('client','admin')),
  status text not null default 'active' check (status in ('active','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_email_idx on public.es_profiles(lower(email));

create or replace function public.es_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.es_profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.es_is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.es_profiles p where p.id = auth.uid() and p.status = 'active');
$$;

-- ---------- plans ----------
create table if not exists public.es_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  price_monthly numeric(10,2) not null default 0,
  price_yearly numeric(10,2) not null default 0,
  description text,
  features jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  trial_days int not null default 0,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_plans_updated on public.es_plans;
create trigger trg_plans_updated before update on public.es_plans for each row execute function public.es_set_updated_at();

-- ---------- subscriptions ----------
create table if not exists public.es_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.es_profiles(id) on delete cascade,
  plan_id uuid not null references public.es_plans(id),
  status text not null default 'trial' check (status in ('trial','active','past_due','canceled','expired')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','yearly')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  gateway text default 'demo',
  gateway_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.es_subscriptions(user_id);
create unique index if not exists subscriptions_one_live_per_user
  on public.es_subscriptions(user_id) where status in ('trial','active','past_due');
drop trigger if exists trg_subs_updated on public.es_subscriptions;
create trigger trg_subs_updated before update on public.es_subscriptions for each row execute function public.es_set_updated_at();

-- ---------- payments ----------
create table if not exists public.es_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.es_profiles(id) on delete cascade,
  subscription_id uuid references public.es_subscriptions(id) on delete set null,
  plan_id uuid references public.es_plans(id) on delete set null,
  amount numeric(10,2) not null default 0,
  currency text not null default 'BRL',
  status text not null default 'pending' check (status in ('pending','approved','refused','refunded')),
  gateway text not null default 'demo' check (gateway in ('stripe','mercadopago','demo','manual')),
  gateway_payment_id text,
  risk_score int not null default 0,
  risk_flags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payments_user_idx on public.es_payments(user_id);
create unique index if not exists payments_gateway_ref_idx on public.es_payments(gateway, gateway_payment_id)
  where gateway_payment_id is not null;

-- ---------- projects ----------
create table if not exists public.es_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.es_profiles(id) on delete cascade,
  name text not null default 'Novo projeto',
  type text not null default 'video' check (type in ('video','image')),
  status text not null default 'draft' check (status in ('draft','editing','published')),
  thumb_url text,
  width int not null default 1920,
  height int not null default 1080,
  fps int not null default 30,
  duration numeric not null default 20,
  timeline jsonb not null default '{"tracks":[],"clips":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_idx on public.es_projects(user_id);
drop trigger if exists trg_projects_updated on public.es_projects;
create trigger trg_projects_updated before update on public.es_projects for each row execute function public.es_set_updated_at();

-- ---------- library assets ----------
create table if not exists public.es_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('video','image','audio','sfx','music','transition','font','object3d','overlay','sticker')),
  category text not null default 'geral',
  url text,
  preview_url text,
  premium boolean not null default false,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists assets_type_idx on public.es_assets(type);

-- ---------- user assets ----------
create table if not exists public.es_user_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.es_profiles(id) on delete cascade,
  name text not null,
  type text not null check (type in ('video','image','audio')),
  url text not null,
  storage_path text,
  size_bytes bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists user_assets_user_idx on public.es_user_assets(user_id);

-- ---------- TTS/STT ----------
create table if not exists public.es_conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.es_profiles(id) on delete cascade,
  project_id uuid references public.es_projects(id) on delete set null,
  type text not null check (type in ('tts','stt')),
  input_text text,
  output_url text,
  voice text,
  language text default 'pt-BR',
  engine text default 'browser',
  status text not null default 'done' check (status in ('pending','processing','done','error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- downloads (Baixa Tudo) ----------
create table if not exists public.es_downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.es_profiles(id) on delete set null,
  source_url text not null,
  service text,
  media_type text default 'video',
  status text not null default 'pending' check (status in ('pending','ready','error')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists downloads_user_idx on public.es_downloads(user_id);

-- ---------- audit ----------
create table if not exists public.es_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.es_profiles(id) on delete set null,
  actor_email text,
  action text not null,
  entity text,
  entity_id text,
  ip text,
  user_agent text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.es_audit_logs(created_at desc);

-- ---------- settings ----------
create table if not exists public.es_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- webhook idempotency ----------
create table if not exists public.es_webhook_events (
  id text primary key,
  gateway text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

-- =========================================================
-- RLS
-- =========================================================
alter table public.es_profiles enable row level security;
alter table public.es_plans enable row level security;
alter table public.es_subscriptions enable row level security;
alter table public.es_payments enable row level security;
alter table public.es_projects enable row level security;
alter table public.es_assets enable row level security;
alter table public.es_user_assets enable row level security;
alter table public.es_conversions enable row level security;
alter table public.es_downloads enable row level security;
alter table public.es_audit_logs enable row level security;
alter table public.es_settings enable row level security;
alter table public.es_webhook_events enable row level security;

drop policy if exists es_profiles_select on public.es_profiles;
create policy es_profiles_select on public.es_profiles for select using (id = auth.uid() or public.es_is_admin());
drop policy if exists es_profiles_update on public.es_profiles;
create policy es_profiles_update on public.es_profiles for update using (id = auth.uid() or public.es_is_admin())
  with check (id = auth.uid() or public.es_is_admin());

drop policy if exists es_plans_select on public.es_plans;
create policy es_plans_select on public.es_plans for select using (is_active or public.es_is_admin());
drop policy if exists es_plans_admin on public.es_plans;
create policy es_plans_admin on public.es_plans for all using (public.es_is_admin()) with check (public.es_is_admin());

drop policy if exists es_subs_select on public.es_subscriptions;
create policy es_subs_select on public.es_subscriptions for select using (user_id = auth.uid() or public.es_is_admin());

drop policy if exists es_payments_select on public.es_payments;
create policy es_payments_select on public.es_payments for select using (user_id = auth.uid() or public.es_is_admin());

drop policy if exists es_projects_all on public.es_projects;
create policy es_projects_all on public.es_projects for all
  using (user_id = auth.uid() or public.es_is_admin())
  with check (user_id = auth.uid() and public.es_is_active());

drop policy if exists es_assets_select on public.es_assets;
create policy es_assets_select on public.es_assets for select using (is_active or public.es_is_admin());
drop policy if exists es_assets_admin on public.es_assets;
create policy es_assets_admin on public.es_assets for all using (public.es_is_admin()) with check (public.es_is_admin());

drop policy if exists es_user_assets_all on public.es_user_assets;
create policy es_user_assets_all on public.es_user_assets for all
  using (user_id = auth.uid() or public.es_is_admin())
  with check (user_id = auth.uid() and public.es_is_active());

drop policy if exists es_conversions_own on public.es_conversions;
create policy es_conversions_own on public.es_conversions for all
  using (user_id = auth.uid() or public.es_is_admin())
  with check (user_id = auth.uid());

drop policy if exists es_downloads_own on public.es_downloads;
create policy es_downloads_own on public.es_downloads for all
  using (user_id = auth.uid() or public.es_is_admin())
  with check (user_id = auth.uid());

drop policy if exists es_audit_admin on public.es_audit_logs;
create policy es_audit_admin on public.es_audit_logs for select using (public.es_is_admin());

drop policy if exists es_settings_admin on public.es_settings;
create policy es_settings_admin on public.es_settings for all using (public.es_is_admin()) with check (public.es_is_admin());

-- =========================================================
-- Anti privilege escalation
-- =========================================================
create or replace function public.es_guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status) and not public.es_is_admin() then
    raise exception 'Apenas administradores podem alterar papel ou status';
  end if;
  return new;
end; $$;

drop trigger if exists trg_guard_profile on public.es_profiles;
create trigger trg_guard_profile before update on public.es_profiles
for each row execute function public.es_guard_profile_update();

-- =========================================================
-- Novo usuário: perfil + trial
-- =========================================================
create or replace function public.es_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare trial_plan public.es_plans%rowtype;
begin
  insert into public.es_profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1))
  ) on conflict (id) do nothing;

  select * into trial_plan from public.es_plans where is_active order by sort_order asc limit 1;
  if trial_plan.id is not null and trial_plan.trial_days > 0 then
    insert into public.es_subscriptions (user_id, plan_id, status, current_period_end, gateway)
    values (new.id, trial_plan.id, 'trial', now() + (trial_plan.trial_days || ' days')::interval, 'demo')
    on conflict do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.es_handle_new_user();

-- =========================================================
-- Storage (bucket público de mídia)
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 524288000)
on conflict (id) do update set public = true, file_size_limit = 524288000;

drop policy if exists es_media_read on storage.objects;
create policy es_media_read on storage.objects for select using (bucket_id = 'media');
drop policy if exists es_media_insert on storage.objects;
create policy es_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists es_media_update on storage.objects;
create policy es_media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists es_media_delete on storage.objects;
create policy es_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- =========================================================
-- Seed: planos
-- =========================================================
insert into public.es_plans (name, slug, price_monthly, price_yearly, description, features, limits, trial_days, sort_order)
values
('Básico', 'basico', 49.90, 479.00, 'Para quem está começando a criar conteúdo.',
 '["Editor com timeline completa","Exportação até 1080p","5 GB de armazenamento","Biblioteca gratuita de transições e sons","Legendas automáticas (navegador)","2 projetos ativos"]'::jsonb,
 '{"projects":5,"storage_gb":5,"max_quality":1080,"export_4k":false,"premium_library":false,"tts_minutes":30,"downloads_per_day":20}'::jsonb,
 7, 1),
('Pro', 'pro', 97.90, 939.00, 'O mais escolhido por editores profissionais.',
 '["Tudo do Básico","Exportação 4K","50 GB de armazenamento","Biblioteca premium completa","Objetos 3D e rotação 360°","Baixa Tudo integrado (sem limite)","Narração TTS premium (200 min/mês)"]'::jsonb,
 '{"projects":50,"storage_gb":50,"max_quality":2160,"export_4k":true,"premium_library":true,"tts_minutes":200,"downloads_per_day":200}'::jsonb,
 7, 2),
('Studio', 'studio', 197.90, 1899.00, 'Para estúdios e equipes que produzem em escala.',
 '["Tudo do Pro","500 GB de armazenamento","Fila de exportação prioritária","Keyframes avançados e LUTs","Marca d''água removível e assets exclusivos","Suporte prioritário"]'::jsonb,
 '{"projects":500,"storage_gb":500,"max_quality":2160,"export_4k":true,"premium_library":true,"tts_minutes":1000,"downloads_per_day":1000}'::jsonb,
 7, 3)
on conflict (slug) do nothing;

-- =========================================================
-- Seed: biblioteca de assets procedurais
-- =========================================================
insert into public.es_assets (name, type, category, url, premium, tags, metadata)
values
('Fade suave','transition','transicoes','builtin:fade',false,'{fade,suave}','{"engine":"builtin"}'::jsonb),
('Deslizar lateral','transition','transicoes','builtin:slide',false,'{slide,lateral}','{"engine":"builtin"}'::jsonb),
('Zoom impacto','transition','transicoes','builtin:zoom',false,'{zoom,impacto}','{"engine":"builtin"}'::jsonb),
('Wipe diagonal','transition','transicoes','builtin:wipe',true,'{wipe,diagonal}','{"engine":"builtin"}'::jsonb),
('Glitch RGB','transition','transicoes','builtin:glitch',true,'{glitch,rgb}','{"engine":"builtin"}'::jsonb),
('Flash de luz','transition','transicoes','builtin:flash',true,'{flash,luz}','{"engine":"builtin"}'::jsonb),
('Whoosh','sfx','sons','builtin:whoosh',false,'{whoosh,transicao}','{"engine":"builtin","duration":0.8}'::jsonb),
('Clique UI','sfx','sons','builtin:click',false,'{click,ui}','{"engine":"builtin","duration":0.15}'::jsonb),
('Riser tensão','sfx','sons','builtin:riser',true,'{riser,tensao}','{"engine":"builtin","duration":2.5}'::jsonb),
('Impacto cinematográfico','sfx','sons','builtin:impact',false,'{impacto,boom}','{"engine":"builtin","duration":1.2}'::jsonb),
('Sino suave','sfx','sons','builtin:bell',false,'{sino,suave}','{"engine":"builtin","duration":1.5}'::jsonb),
('Ambiente lo-fi','music','musicas','builtin:lofi',true,'{lofi,ambiente}','{"engine":"builtin","duration":20}'::jsonb),
('Pulso cinematográfico','music','musicas','builtin:cinematic',true,'{cinema,pulso}','{"engine":"builtin","duration":20}'::jsonb),
('Cubo 3D','object3d','objetos3d','builtin:cube',false,'{cubo,3d}','{"engine":"builtin","shape":"box"}'::jsonb),
('Esfera 3D','object3d','objetos3d','builtin:sphere',false,'{esfera,3d}','{"engine":"builtin","shape":"sphere"}'::jsonb),
('Torus 3D','object3d','objetos3d','builtin:torus',true,'{torus,3d}','{"engine":"builtin","shape":"torus"}'::jsonb),
('Nó 3D','object3d','objetos3d','builtin:knot',true,'{no,3d}','{"engine":"builtin","shape":"knot"}'::jsonb),
('Vinheta','overlay','overlays','builtin:vignette',false,'{vinheta,overlay}','{"engine":"builtin"}'::jsonb),
('Grão de filme','overlay','overlays','builtin:grain',true,'{grao,filme}','{"engine":"builtin"}'::jsonb),
('Moldura clássica','sticker','stickers','builtin:frame',false,'{moldura}','{"engine":"builtin"}'::jsonb),
('Formas geométricas','sticker','stickers','builtin:shapes',false,'{formas}','{"engine":"builtin"}'::jsonb),
('Inter','font','fontes','font:Inter',false,'{sans,moderna}','{"engine":"google"}'::jsonb),
('Poppins','font','fontes','font:Poppins',false,'{sans,arredondada}','{"engine":"google"}'::jsonb),
('Bebas Neue','font','fontes','font:Bebas Neue',false,'{condensada,titulo}','{"engine":"google"}'::jsonb),
('Playfair Display','font','fontes','font:Playfair Display',false,'{serifada,elegante}','{"engine":"google"}'::jsonb),
('Montserrat','font','fontes','font:Montserrat',false,'{sans,corporativa}','{"engine":"google"}'::jsonb),
('Anton','font','fontes','font:Anton',true,'{impacto,titulo}','{"engine":"google"}'::jsonb)
on conflict do nothing;

insert into public.es_settings (key, value) values
('general', '{"site_name":"Editor Studio","support_email":"suporte@editorstudio.app","max_upload_mb":500,"watermark_free":true}'::jsonb),
('payments', '{"currency":"BRL","demo_mode":true,"stripe_enabled":false,"mercadopago_enabled":false,"tax_percent":0}'::jsonb),
('security', '{"max_login_attempts":5,"rate_limit_per_minute":60,"require_2fa_admin":false}'::jsonb)
on conflict (key) do nothing;

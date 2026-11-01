-- =========================================================
-- 0010 — Integrações de IA por usuário (chaves do próprio cliente)
-- =========================================================
-- Cada cliente pode guardar a própria chave da Kie AI (Kling) e da Postiz.
-- O admin decide se aceita chaves de clientes e se a chave da plataforma
-- pode ser usada — assim ninguém consome crédito de outro sem querer.
-- As chaves ficam criptografadas (AES-256-GCM) pela aplicação.

create table if not exists public.es_user_integrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kie_key text,
  postiz_key text,
  postiz_tiktok text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.es_user_integrations enable row level security;

-- O usuário lê o próprio registro (as chaves continuam criptografadas);
-- escrita e leitura das chaves em texto acontecem no servidor.
drop policy if exists es_user_integrations_own on public.es_user_integrations;
create policy es_user_integrations_own on public.es_user_integrations
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- Armazenamento: teto real do provedor + limite por arquivo
-- ---------------------------------------------------------
-- O plano vendido ao cliente (10 GB, 150 GB, 1 TB…) é o limite lógico.
-- O provedor (Supabase) tem um teto físico e um limite por arquivo: guardamos
-- esses números nas configurações para o sistema avisar antes de estourar.
update public.es_settings
set value = value
  || jsonb_build_object(
       'provider_file_limit_mb', coalesce((value->>'provider_file_limit_mb')::int, 50),
       'storage_capacity_gb', coalesce((value->>'storage_capacity_gb')::int, 1)
     ),
    updated_at = now()
where key = 'general';

alter table public.es_settings
  alter column value set default '{}'::jsonb;

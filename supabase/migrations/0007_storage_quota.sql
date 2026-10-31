-- =========================================================
-- 0007 — Armazenamento com cota (sem varrer tabela inteira)
-- =========================================================
-- O plano guarda o limite (`limits.storage_gb`). Aqui mantemos um contador
-- denormalizado por usuário para a checagem de cota ser O(1) mesmo com
-- milhões de arquivos. O contador é mantido por trigger — nunca "na mão".

alter table public.es_profiles
  add column if not exists storage_used_bytes bigint not null default 0;

-- backfill (idempotente): soma o que já existe hoje
update public.es_profiles p
set storage_used_bytes = coalesce((
  select sum(a.size_bytes) from public.es_user_assets a where a.user_id = p.id
), 0);

create index if not exists user_assets_user_created_idx
  on public.es_user_assets(user_id, created_at desc);

create or replace function public.es_sync_storage_used()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.es_profiles
      set storage_used_bytes = greatest(0, storage_used_bytes + coalesce(new.size_bytes, 0))
      where id = new.user_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.es_profiles
      set storage_used_bytes = greatest(0, storage_used_bytes - coalesce(old.size_bytes, 0))
      where id = old.user_id;
    return old;
  else
    if new.user_id <> old.user_id then
      update public.es_profiles
        set storage_used_bytes = greatest(0, storage_used_bytes - coalesce(old.size_bytes, 0))
        where id = old.user_id;
      update public.es_profiles
        set storage_used_bytes = greatest(0, storage_used_bytes + coalesce(new.size_bytes, 0))
        where id = new.user_id;
    elsif new.size_bytes <> old.size_bytes then
      update public.es_profiles
        set storage_used_bytes = greatest(0, storage_used_bytes - coalesce(old.size_bytes, 0) + coalesce(new.size_bytes, 0))
        where id = new.user_id;
    end if;
    return new;
  end if;
end; $$;

drop trigger if exists trg_user_assets_storage on public.es_user_assets;
create trigger trg_user_assets_storage
  after insert or delete or update of size_bytes, user_id on public.es_user_assets
  for each row execute function public.es_sync_storage_used();

-- Função de consulta de cota (usada pelo app e por futuros relatórios)
create or replace function public.es_storage_used(uid uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select storage_used_bytes from public.es_profiles where id = uid), 0);
$$;

-- Mais espaço em todos os planos (o catálogo do sistema não ocupa storage:
-- ele vive no código do app, não no Supabase).
update public.es_plans
set limits = jsonb_set(limits, '{storage_gb}', '10')
where slug = 'basico';
update public.es_plans
set limits = jsonb_set(limits, '{storage_gb}', '150')
where slug = 'pro';
update public.es_plans
set limits = jsonb_set(limits, '{storage_gb}', '1000')
where slug = 'studio';

-- =========================================================
-- Limpeza de arquivos órfãos: remove do storage o que não está
-- em es_user_assets nem em es_assets (executa quando o admin pedir,
-- via /api/admin/storage/gc). A função só LISTA; a remoção é feita pelo app.
-- =========================================================
create or replace function public.es_storage_orphans(limit_rows int default 200)
returns table (name text, size bigint)
language sql stable security definer set search_path = public, storage as $$
  select o.name::text, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id = 'media'
    and not exists (select 1 from public.es_user_assets a where a.storage_path = o.name)
    and not exists (select 1 from public.es_assets s where s.url like '%' || o.name)
  limit limit_rows;
$$;

revoke all on function public.es_storage_orphans(int) from anon, authenticated;

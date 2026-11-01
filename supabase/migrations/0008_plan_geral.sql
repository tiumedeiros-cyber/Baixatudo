-- =========================================================
-- 0008 — Plano "Geral" (uso livre)
-- =========================================================
insert into public.es_plans (name, slug, price_monthly, price_yearly, description, features, limits, trial_days, is_active, sort_order)
values (
  'Geral',
  'geral',
  297.90,
  2899.00,
  'Uso livre: sem limite de exportação, armazenamento em massa e todos os recursos do sistema liberados.',
  '["Tudo do Studio","Exportação 4K ilimitada","5 TB de armazenamento","Avatares falantes sem limite","Vozes em 68 idiomas","Baixa Tudo ilimitado","Render sem fila","Suporte prioritário no WhatsApp"]'::jsonb,
  '{"projects":9999,"storage_gb":5000,"max_quality":2160,"export_4k":true,"premium_library":true,"tts_minutes":9999,"downloads_per_day":9999,"unlimited":true}'::jsonb,
  7,
  true,
  4
)
on conflict (slug) do update
set name = excluded.name,
    price_monthly = excluded.price_monthly,
    price_yearly = excluded.price_yearly,
    description = excluded.description,
    features = excluded.features,
    limits = excluded.limits,
    is_active = true,
    sort_order = excluded.sort_order;

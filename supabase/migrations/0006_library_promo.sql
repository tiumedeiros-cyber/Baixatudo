-- =========================================================
-- 0006 · Biblioteca profissional de anúncios
-- Fundos 4K/Full HD reais (arquivos em /public/library) +
-- fundos animados (generator) + selos/etiquetas de promoção.
-- Idempotente: só insere o que ainda não existe (por url).
-- =========================================================

-- o tipo 'generator' passa a existir na biblioteca
alter table public.es_assets drop constraint if exists es_assets_type_check;
alter table public.es_assets
  add constraint es_assets_type_check
  check (type in ('video','image','audio','sfx','music','transition','font','object3d','overlay','sticker','generator'));

insert into public.es_assets (name, type, category, url, premium, tags, metadata)
select v.name, v.type, v.category, v.url, v.premium, v.tags, v.metadata
from (values
  -- fundos estáticos (1920×1080, prontos para 4K por upscale do editor)
  ('Fundo vitrine laranja','image','fundos','/library/bg-marketplace.webp',false,'{fundo,marketplace,laranja,vitrine}'::text[],'{"engine":"file","width":1920,"height":1080,"space":"texto à esquerda"}'::jsonb),
  ('Fundo flash sale neon','image','fundos','/library/bg-flashsale.webp',false,'{fundo,neon,flash,oferta}'::text[],'{"engine":"file","width":1920,"height":1080,"space":"texto ao centro"}'::jsonb),
  ('Fundo delivery','image','fundos','/library/bg-delivery.webp',false,'{fundo,delivery,comida,entrega}'::text[],'{"engine":"file","width":1920,"height":1080,"space":"texto ao centro"}'::jsonb),
  ('Fundo pódio pastel','image','fundos','/library/bg-podium.webp',false,'{fundo,podio,produto,pastel}'::text[],'{"engine":"file","width":1920,"height":1080,"space":"produto no centro"}'::jsonb),
  ('Fundo black friday','image','fundos','/library/bg-blackfriday.webp',false,'{fundo,blackfriday,preto,dourado}'::text[],'{"engine":"file","width":1920,"height":1080,"space":"texto ao centro"}'::jsonb),
  ('Fundo malha gradiente','image','fundos','/library/bg-gradientmesh.webp',false,'{fundo,gradiente,mesh,abstrato}'::text[],'{"engine":"file","width":1920,"height":1080,"space":"texto ao centro"}'::jsonb),
  -- fundos animados (renderizados no canvas, qualquer resolução)
  ('Aurora animada','generator','fundos','builtin:aurora',false,'{animado,aurora,gradiente}'::text[],'{"engine":"generator","preset":"aurora","colorA":"#4338ca","colorB":"#22d3ee"}'::jsonb),
  ('Ondas fluidas','generator','fundos','builtin:waves',false,'{animado,ondas,fluido}'::text[],'{"engine":"generator","preset":"waves","colorA":"#7c3aed","colorB":"#ec4899"}'::jsonb),
  ('Partículas douradas','generator','fundos','builtin:particles',false,'{animado,particulas,dourado}'::text[],'{"engine":"generator","preset":"particles","colorA":"#0f172a","colorB":"#fbbf24"}'::jsonb),
  ('Grid neon','generator','fundos','builtin:grid',true,'{animado,grid,neon,tech}'::text[],'{"engine":"generator","preset":"grid","colorA":"#0b1220","colorB":"#22d3ee"}'::jsonb),
  ('Bokeh quente','generator','fundos','builtin:bokeh',false,'{animado,bokeh,quente}'::text[],'{"engine":"generator","preset":"bokeh","colorA":"#fb7185","colorB":"#fbbf24"}'::jsonb),
  ('Feixe de luz','generator','fundos','builtin:sweep',false,'{animado,luz,feixe}'::text[],'{"engine":"generator","preset":"sweep","colorA":"#111827","colorB":"#e0f2fe"}'::jsonb),
  ('Raios de sol','generator','fundos','builtin:rays',true,'{animado,raios,sol}'::text[],'{"engine":"generator","preset":"rays","colorA":"#f97316","colorB":"#fde047"}'::jsonb),
  ('Holofote de palco','generator','fundos','builtin:spotlight',false,'{animado,holofote,palco}'::text[],'{"engine":"generator","preset":"spotlight","colorA":"#020617","colorB":"#3b82f6"}'::jsonb),
  ('Listras diagonais','generator','fundos','builtin:stripes',false,'{animado,listras,diagonal}'::text[],'{"engine":"generator","preset":"stripes","colorA":"#6d28d9","colorB":"#f97316"}'::jsonb),
  ('Gradiente suave','generator','fundos','builtin:gradient',false,'{animado,gradiente,suave}'::text[],'{"engine":"generator","preset":"gradient","colorA":"#06b6d4","colorB":"#8b5cf6"}'::jsonb),
  -- selos e etiquetas de promoção
  ('Explosão de oferta','sticker','promo','builtin:burst',false,'{selo,explosao,oferta}'::text[],'{"engine":"builtin"}'::jsonb),
  ('Etiqueta de preço','sticker','promo','builtin:tag',false,'{etiqueta,preco}'::text[],'{"engine":"builtin"}'::jsonb),
  ('Faixa de desconto','sticker','promo','builtin:ribbon',false,'{faixa,desconto}'::text[],'{"engine":"builtin"}'::jsonb),
  ('Selo de garantia','sticker','promo','builtin:seal',false,'{selo,garantia}'::text[],'{"engine":"builtin"}'::jsonb),
  ('Estrela de avaliação','sticker','promo','builtin:star',false,'{estrela,avaliacao}'::text[],'{"engine":"builtin"}'::jsonb),
  ('Pílula de destaque','sticker','promo','builtin:pill',false,'{pilula,destaque}'::text[],'{"engine":"builtin"}'::jsonb),
  ('Seta indicativa','sticker','promo','builtin:arrow',false,'{seta,indicacao}'::text[],'{"engine":"builtin"}'::jsonb),
  ('Anéis concêntricos','sticker','promo','builtin:rings',true,'{aneis,circulos}'::text[],'{"engine":"builtin"}'::jsonb)
) as v(name, type, category, url, premium, tags, metadata)
where not exists (select 1 from public.es_assets a where a.url = v.url);

update public.es_assets set is_active = true where url like '/library/bg-%';

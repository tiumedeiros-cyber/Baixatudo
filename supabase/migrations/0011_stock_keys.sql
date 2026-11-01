-- Chaves gratuitas dos bancos de mídia por usuário (Pexels, Unsplash, Pixabay, Freesound).
-- Ficam criptografadas, como as chaves de IA. Sem chave do usuário, vale a chave
-- compartilhada da plataforma (Admin → Configurações → Integrações) ou a variável de ambiente.
alter table es_user_integrations
  add column if not exists pexels_key text,
  add column if not exists unsplash_key text,
  add column if not exists pixabay_key text,
  add column if not exists freesound_key text;

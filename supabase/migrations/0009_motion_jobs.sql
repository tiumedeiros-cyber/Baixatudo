-- Jobs de "Animação IA" (Kling Motion Control via Kie AI).
create table if not exists public.es_motion_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'kling-2.6-motion',
  status text not null default 'queued',
  image_url text not null,
  video_url text not null,
  prompt text,
  mode text not null default '720p',
  task_id text,
  result_url text,
  asset_id uuid,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists es_motion_jobs_user_idx on public.es_motion_jobs (user_id, created_at desc);

alter table public.es_motion_jobs enable row level security;

drop policy if exists es_motion_jobs_own on public.es_motion_jobs;
create policy es_motion_jobs_own on public.es_motion_jobs
  for select using (auth.uid() = user_id);

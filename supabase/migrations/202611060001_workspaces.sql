-- Applied to the authorized Baixatudo project soosjvzvcznlrbingyfp. Keep as schema history; do not reapply blindly.
create table public.baixatudo_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 10000000),
 revision bigint not null default 1 check (revision > 0),
 updated_at timestamptz not null default now()
);
alter table public.baixatudo_workspaces enable row level security;
alter table public.baixatudo_workspaces force row level security;
revoke all on public.baixatudo_workspaces from anon;
grant select, insert, update, delete on public.baixatudo_workspaces to authenticated;
create policy "read_own_workspace" on public.baixatudo_workspaces for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert_own_workspace" on public.baixatudo_workspaces for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update_own_workspace" on public.baixatudo_workspaces for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete_own_workspace" on public.baixatudo_workspaces for delete to authenticated using ((select auth.uid()) = user_id);

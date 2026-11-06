-- Platform administration. No passwords, API credentials or personal owner IDs in this migration.
create table public.baixatudo_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.baixatudo_admins enable row level security;
alter table public.baixatudo_admins force row level security;
revoke all on public.baixatudo_admins from anon, authenticated;

create table public.baixatudo_platform (
 singleton boolean primary key default true check(singleton),
 capture_enabled boolean not null default true,
 inference_enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
insert into public.baixatudo_platform(singleton) values(true);
create table public.baixatudo_entitlements (
 user_id uuid primary key references auth.users(id) on delete cascade,
 ai_limit integer not null default 1 check(ai_limit between 0 and 1000000),
 ai_used integer not null default 0 check(ai_used>=0),
 blocked boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.baixatudo_capture_usage (
 user_id uuid references auth.users(id) on delete cascade,
 usage_day date not null,
 used integer not null check(used>=0),
 primary key(user_id,usage_day)
);
create table public.baixatudo_admin_audit (
 id bigint generated always as identity primary key,
 actor uuid not null,
 action text not null,
 detail jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.baixatudo_platform enable row level security;
alter table public.baixatudo_platform force row level security;
alter table public.baixatudo_entitlements enable row level security;
alter table public.baixatudo_entitlements force row level security;
alter table public.baixatudo_capture_usage enable row level security;
alter table public.baixatudo_capture_usage force row level security;
alter table public.baixatudo_admin_audit enable row level security;
alter table public.baixatudo_admin_audit force row level security;
revoke all on public.baixatudo_platform, public.baixatudo_entitlements, public.baixatudo_capture_usage, public.baixatudo_admin_audit from anon, authenticated;

create function public.baixatudo_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.baixatudo_admins where user_id=(select auth.uid()));
$$;
create function public.baixatudo_account_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select jsonb_build_object('isAdmin',public.baixatudo_is_admin(),'captureEnabled',p.capture_enabled,'inferenceEnabled',p.inference_enabled,'aiLimit',coalesce(e.ai_limit,1),'aiUsed',coalesce(e.ai_used,0),'blocked',coalesce(e.blocked,false)) into result from public.baixatudo_platform p left join public.baixatudo_entitlements e on e.user_id=auth.uid() where p.singleton;
 return result;
end $$;

-- Atomic durable reservation, before an external request. Counts attempts, not successful clones/tokens.
create function public.baixatudo_reserve_request(p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); cfg public.baixatudo_platform%rowtype; ent public.baixatudo_entitlements%rowtype; affected integer;
begin
 if who is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_action not in ('capture','inference') or p_action is null then raise exception 'Invalid action'; end if;
 select * into cfg from public.baixatudo_platform where singleton for share;
 if not found then raise exception 'Platform configuration missing'; end if;
 insert into public.baixatudo_entitlements(user_id) values(who) on conflict do nothing;
 select * into ent from public.baixatudo_entitlements where user_id=who for update;
 if ent.blocked then return jsonb_build_object('allowed',false,'reason','blocked'); end if;
 if (p_action='capture' and not cfg.capture_enabled) or (p_action='inference' and not cfg.inference_enabled) then return jsonb_build_object('allowed',false,'reason','disabled'); end if;
 if p_action='inference' then
  if ent.ai_used>=ent.ai_limit then return jsonb_build_object('allowed',false,'reason','quota'); end if;
  update public.baixatudo_entitlements set ai_used=ai_used+1,updated_at=now() where user_id=who;
 else
  insert into public.baixatudo_capture_usage(user_id,usage_day,used) values(who,(now() at time zone 'UTC')::date,1)
   on conflict(user_id,usage_day) do update set used=public.baixatudo_capture_usage.used+1 where public.baixatudo_capture_usage.used<20;
  get diagnostics affected=row_count;
  if affected=0 then return jsonb_build_object('allowed',false,'reason','quota'); end if;
 end if;
 return jsonb_build_object('allowed',true);
end $$;

create function public.baixatudo_admin_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.baixatudo_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
 return jsonb_build_object(
 'settings',(select jsonb_build_object('captureEnabled',capture_enabled,'inferenceEnabled',inference_enabled) from public.baixatudo_platform where singleton),
 'totalUsers',(select count(*) from auth.users),
 'totalWorkspaces',(select count(*) from public.baixatudo_workspaces),
 'users',(select coalesce(jsonb_agg(row_to_json(u)),'[]'::jsonb) from (
  select a.id,a.email,a.email_confirmed_at is not null as confirmed,a.created_at,coalesce(e.ai_limit,1) as ai_limit,coalesce(e.ai_used,0) as ai_used,coalesce(e.blocked,false) as blocked,
   coalesce(jsonb_array_length(w.payload->'projects'),0) as projects
  from auth.users a left join public.baixatudo_entitlements e on e.user_id=a.id left join public.baixatudo_workspaces w on w.user_id=a.id order by a.created_at desc,a.id limit 100
 ) u),
 'audit',(select coalesce(jsonb_agg(row_to_json(log)),'[]'::jsonb) from (select action,detail,created_at from public.baixatudo_admin_audit order by id desc limit 20) log)
 );
end $$;
create function public.baixatudo_admin_set_features(p_capture boolean,p_inference boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.baixatudo_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_capture is null or p_inference is null then raise exception 'Invalid settings'; end if;
 update public.baixatudo_platform set capture_enabled=p_capture,inference_enabled=p_inference,updated_at=now() where singleton;
 insert into public.baixatudo_admin_audit(actor,action,detail) values(auth.uid(),'features',jsonb_build_object('capture',p_capture,'inference',p_inference));
 return jsonb_build_object('saved',true);
end $$;
create function public.baixatudo_admin_set_user(p_user_id uuid,p_ai_limit integer,p_blocked boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.baixatudo_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_ai_limit is null or p_ai_limit<0 or p_ai_limit>1000000 or p_blocked is null then raise exception 'Invalid limits'; end if;
 if p_user_id=auth.uid() and p_blocked then raise exception 'Cannot block own administrator'; end if;
 insert into public.baixatudo_entitlements(user_id,ai_limit,blocked) values(p_user_id,p_ai_limit,p_blocked)
 on conflict(user_id) do update set ai_limit=excluded.ai_limit,blocked=excluded.blocked,updated_at=now();
 insert into public.baixatudo_admin_audit(actor,action,detail) values(auth.uid(),'user_limits',jsonb_build_object('user',p_user_id,'limit',p_ai_limit,'blocked',p_blocked));
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.baixatudo_is_admin(), public.baixatudo_account_status(), public.baixatudo_reserve_request(text), public.baixatudo_admin_overview(), public.baixatudo_admin_set_features(boolean,boolean), public.baixatudo_admin_set_user(uuid,integer,boolean) from public,anon;
grant execute on function public.baixatudo_is_admin(), public.baixatudo_account_status(), public.baixatudo_reserve_request(text), public.baixatudo_admin_overview(), public.baixatudo_admin_set_features(boolean,boolean), public.baixatudo_admin_set_user(uuid,integer,boolean) to authenticated;

-- A malformed user workspace must not break the administrative overview.
create or replace function public.baixatudo_admin_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.baixatudo_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
 return jsonb_build_object(
 'settings',(select jsonb_build_object('captureEnabled',capture_enabled,'inferenceEnabled',inference_enabled) from public.baixatudo_platform where singleton),
 'totalUsers',(select count(*) from auth.users),
 'totalWorkspaces',(select count(*) from public.baixatudo_workspaces),
 'users',(select coalesce(jsonb_agg(row_to_json(u)),'[]'::jsonb) from (
  select a.id,a.email,a.email_confirmed_at is not null as confirmed,a.created_at,coalesce(e.ai_limit,1) as ai_limit,coalesce(e.ai_used,0) as ai_used,coalesce(e.blocked,false) as blocked,
   case when jsonb_typeof(w.payload->'projects')='array' then jsonb_array_length(w.payload->'projects') else 0 end as projects
  from auth.users a left join public.baixatudo_entitlements e on e.user_id=a.id left join public.baixatudo_workspaces w on w.user_id=a.id order by a.created_at desc,a.id limit 100
 ) u),
 'audit',(select coalesce(jsonb_agg(row_to_json(log)),'[]'::jsonb) from (select action,detail,created_at from public.baixatudo_admin_audit order by id desc limit 20) log)
 );
end $$;

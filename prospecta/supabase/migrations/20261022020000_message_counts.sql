-- Contadores do painel de envio, numa chamada só. security invoker: a RLS vale.
create function public.message_counts()
returns jsonb
language sql
stable
set search_path = public
as $$
  with sent as (
    select distinct conversation_id
    from public.messages
    where direction = 'out'
      and kind in ('opening', 'followup')
      and status in ('sent', 'delivered', 'read')
  )
  select jsonb_build_object(
    'prospecting_sent', (
      select count(*) from public.messages
      where direction = 'out' and kind in ('opening', 'followup') and status in ('sent', 'delivered', 'read')
    ),
    'conversations_replied', (
      select count(distinct m.conversation_id)
      from public.messages m
      join sent s on s.conversation_id = m.conversation_id
      where m.direction = 'in'
    ),
    'draft',     (select count(*) from public.messages where direction = 'out' and status = 'draft'),
    'approved',  (select count(*) from public.messages where direction = 'out' and status = 'approved'),
    'simulated', (select count(*) from public.messages where direction = 'out' and status = 'simulated'),
    'failed',    (select count(*) from public.messages where direction = 'out' and status = 'failed')
  );
$$;

revoke all on function public.message_counts() from public, anon;
grant execute on function public.message_counts() to authenticated;

-- Resposta automática do negócio (aviso de ausência, saudação do WhatsApp Business, menu) não conta como resposta do lead.
-- O painel marca essas mensagens recebidas com variant = 'resposta-automatica' (src/lib/outreach/autoreply.ts).
-- Só substitui a função; nenhuma tabela, coluna ou dado muda. Sem esta migration tudo funciona, só que o contador
-- "Respostas" do Comando passa a incluir os robôs.
create or replace function public.message_counts()
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
        and coalesce(m.variant, '') <> 'resposta-automatica'
    ),
    'draft',     (select count(*) from public.messages where direction = 'out' and status = 'draft'),
    'approved',  (select count(*) from public.messages where direction = 'out' and status = 'approved'),
    'simulated', (select count(*) from public.messages where direction = 'out' and status = 'simulated'),
    'failed',    (select count(*) from public.messages where direction = 'out' and status = 'failed')
  );
$$;

revoke all on function public.message_counts() from public, anon;
grant execute on function public.message_counts() to authenticated;

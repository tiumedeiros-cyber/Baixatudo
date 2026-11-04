-- Pulso do painel: uma assinatura curta do que as telas mostram. A tela aberta pergunta de poucos em poucos segundos e só
-- recarrega quando a assinatura muda (mensagem nova, recibo de entrega/leitura, resposta do lead, etapa do lead, evento,
-- configuração). Só cria uma função de LEITURA; nenhuma tabela, coluna ou dado muda. Sem esta migration tudo funciona, só que
-- a tela passa a recarregar a cada 20 s em vez de na hora (veja `pulse` em src/lib/repo/supabase.ts).
--
-- Fica de fora de propósito o estado interno do worker (settings.automation_state muda a cada volta de ~20 s), senão a tela
-- recarregaria à toa.
create or replace function public.app_pulse()
returns text
language sql
stable
set search_path = public
as $$
  select md5(concat_ws('|',
    -- mensagens: quantas em cada status (pega enviada → entregue → lida), novas, reagendadas e com erro
    (select coalesce(string_agg(status || ':' || n, ',' order by status), '')
       from (select status, count(*) as n from public.messages group by status) s),
    (select concat_ws(',', coalesce(max(created_at)::text, ''), coalesce(sum(attempts), 0), count(error),
                      coalesce(sum(extract(epoch from scheduled_for)), 0))
       from public.messages),
    -- conversas: novas, não lidas e qualquer mudança
    (select concat_ws(',', count(*), coalesce(sum(unread), 0), coalesce(max(updated_at)::text, ''))
       from public.conversations),
    (select concat_ws(',', count(*), coalesce(max(updated_at)::text, '')) from public.leads),
    (select concat_ws(',', count(*), coalesce(max(created_at)::text, '')) from public.lead_events),
    (select count(*) from public.optouts),
    -- configurações do painel e da automação (não o estado do worker)
    (select coalesce(max(updated_at)::text, '') from public.settings where key in ('app', 'automation')),
    (select concat_ws(',', count(*), coalesce(max(updated_at)::text, '')) from public.whatsapp_accounts),
    (select concat_ws(',', count(*), coalesce(max(updated_at)::text, '')) from public.demos),
    (select concat_ws(',', count(*), coalesce(max(updated_at)::text, '')) from public.proposals),
    (select concat_ws(',', count(*), coalesce(max(updated_at)::text, '')) from public.projects)
  ));
$$;

revoke all on function public.app_pulse() from public, anon;
grant execute on function public.app_pulse() to authenticated;

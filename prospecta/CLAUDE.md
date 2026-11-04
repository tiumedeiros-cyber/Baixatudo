# CLAUDE.md: adaptar o JK Prospect X1

Painel de prospecção por WhatsApp (Next.js 16, React 19, Supabase, Vitest). Caça negócios locais no Google Maps (Apify), dá
nota, organiza num funil, escreve a abordagem, envia uma mensagem de cada vez por um WhatsApp local (GOWA) e atende as
respostas com um agente. Leia o `README.md` (visão geral, estrutura, segurança) e o `LEIA-ME-AMIGOS.md` (instalação) antes
de mexer. Responda ao dono em português.

**Next.js 16 tem mudanças que você não conhece:** antes de escrever código de Next, leia o guia certo em
`node_modules/next/dist/docs/` (veja `AGENTS.md`).

Esta é uma cópia entregue a quem vai usar por conta própria. Os **padrões** do sistema ainda são do autor original (Jonathan
Kelvin / Kelvin Studio, Fortaleza-CE). O seu trabalho é trocar isso pelos dados do dono atual.

## Regras que não podem ser quebradas

- **Nunca envie mensagem real, nem libere o envio automático, sem o dono pedir.** O motor nasce pausado e em simulação; deixe assim.
  Em testes, use o provedor simulado e o modo demonstração.
- **Nunca** mostre, copie, commite nem suba o `.env.local` nem a pasta `gowa/` (a sessão do WhatsApp equivale a estar logado no número).
- Lead com `source = 'demo'` nunca entra no envio real. Antes de qualquer envio: respeitar `optouts`, janela de horário e limites diários.
- Nenhuma mensagem sai sem aprovação do dono (modo copiloto), inclusive a da prévia, a da proposta e as do agente.
- O agente **nunca inventa** preço, prazo, link nem Pix: a trava de fatos (`src/lib/agent/guard.ts`) confere. Não afrouxe.
- Dinheiro é sempre em centavos e só entra no caixa quando o dono marca que recebeu.
- A chave `SUPABASE_SECRET_KEY` nunca vai ao navegador. Todo acesso a dados passa por `getRepo()`.

## O que trocar para o dono atual

| O quê | Onde |
|---|---|
| **Nome, marca, apresentação, oferta, preço, prazo, Pix, WhatsApp** | Pela tela **Configurações** (fica no banco). Os padrões estão em `src/lib/leads/types.ts` (`DEFAULT_SETTINGS`) e `src/lib/agent/context.ts` (`BASE_FACTS`) |
| **Textos fixos do agente e das aberturas** | `src/lib/agent/` (`playbook.ts`, `rules.ts`, `topics.ts`, `compose.ts`) e `src/lib/outreach/` (`templates.ts`, `opening.ts`). A prosa é em português do Brasil e fala em primeira pessoa como o dono |
| **Visual da marca** | `src/app/globals.css` (tokens: escuro, um acento lime, raio zero), `src/components/brand/jk-mark.tsx` e `src/lib/jk-geometry.ts` (monograma JK), `src/app/login/page.tsx` (rodapé "Kelvin Studio"), `src/app/layout.tsx` (descrição) |
| **Atalhos de Windows** | `Ligar-sistema.bat`, `scripts/ligar-tudo.ps1` (cita o usuário `jk` do GOWA), `scripts/gowa-start.ps1` |
| **Cidade, fuso e DDD** | Fuso `America/Fortaleza` em `src/lib/utils.ts`, `src/lib/deals/service.ts`, `src/components/numbers/number-card.tsx`; horário comercial e limites em `src/lib/outreach/config.ts` (`DEFAULT_AUTOMATION`); telefone brasileiro em `src/lib/brazil/phone.ts`. A cidade e o nicho das buscas se digitam no Caçador |
| **O que o sistema vende** | Hoje: landing page, site da empresa e sistema (fluxo "qualificar") e prévia do site (fluxo "prévia"). Para vender outra coisa, mexa no roteiro em `src/lib/agent/` e nas aberturas em `src/lib/outreach/` |
| **Nota dos leads e nichos** | `src/lib/leads/score.ts`, `niches.ts`, `site.ts` (para o autor, "só Instagram" conta como "sem site"). Veja "Como a nota funciona" no README |
| **Prévia pública e `SITE_URL`** | `src/app/p/[slug]`, `docs/PREVIAS.md` |

## Testes e o nome do autor

Os testes usam "Jonathan Kelvin" e "Kelvin Studio" como identidade fixa (sobretudo `src/lib/agent/scenarios.ts` e
`src/lib/outreach/*.test.ts`). Se você trocar os **padrões no código**, vários testes vão falhar até acompanharem o novo nome:
troque nos testes também, nunca apague um teste para fazê-lo passar. Trocar só pela tela Configurações não afeta os testes.

## Como validar

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

Para ver na tela sem Supabase: apague ou renomeie o `.env.local` e rode `npm run dev` (modo demonstração, dados fictícios em
memória), ou use `npm run dev:demo` (porta 3200). `npm run agent:eval` e `npm run agent:opening` chamam a IA de verdade e
gastam cota: só rode se o dono pedir.

## Sobre `docs/`

`docs/stories/` é o histórico de como o sistema foi construído (uma história por entrega, com critérios e decisões). Não é
tarefa pendente. `docs/AGENTE.md` explica como o agente decide; `docs/WHATSAPP.md`, como ligar o envio; `docs/MULTI-NUMERO.md`,
os vários números; `docs/VPS-COOLIFY.md`, como hospedar num servidor.

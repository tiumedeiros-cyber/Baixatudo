import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Clapperboard,
  Download,
  Film,
  Layers,
  Mic,
  MonitorPlay,
  Music4,
  Play,
  Scissors,
  ShieldCheck,
  Sparkles,
  Subtitles,
  Timer,
  Wand2,
  Zap,
} from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Badge, ButtonLink, Card, Logo } from '@/components/ui';
import { SiteHeader } from '@/components/marketing/SiteHeader';
import { brl } from '@/lib/utils';
import type { Plan } from '@/lib/types';

export const dynamic = 'force-dynamic';

const FALLBACK_PLANS: Plan[] = [
  {
    id: '1', name: 'Básico', slug: 'basico', price_monthly: 49.9, price_yearly: 479,
    description: 'Para quem está começando a criar conteúdo.',
    features: ['Editor com timeline completa', 'Exportação até 1080p', '5 GB de armazenamento', 'Biblioteca gratuita', '5 projetos'],
    limits: { projects: 5, storage_gb: 5, max_quality: 1080, export_4k: false, premium_library: false, tts_minutes: 30, downloads_per_day: 20 },
    trial_days: 7, is_active: true, sort_order: 1,
  },
  {
    id: '2', name: 'Pro', slug: 'pro', price_monthly: 97.9, price_yearly: 939,
    description: 'O mais escolhido por editores profissionais.',
    features: ['Tudo do Básico', 'Exportação 4K', '50 GB de armazenamento', 'Biblioteca premium', 'Objetos 3D + 360°', 'Baixa Tudo integrado'],
    limits: { projects: 50, storage_gb: 50, max_quality: 2160, export_4k: true, premium_library: true, tts_minutes: 200, downloads_per_day: 200 },
    trial_days: 7, is_active: true, sort_order: 2,
  },
  {
    id: '3', name: 'Studio', slug: 'studio', price_monthly: 197.9, price_yearly: 1899,
    description: 'Para estúdios e equipes que produzem em escala.',
    features: ['Tudo do Pro', '500 GB de armazenamento', 'Fila prioritária', 'Keyframes avançados', 'Assets exclusivos', 'Suporte prioritário'],
    limits: { projects: 500, storage_gb: 500, max_quality: 2160, export_4k: true, premium_library: true, tts_minutes: 1000, downloads_per_day: 1000 },
    trial_days: 7, is_active: true, sort_order: 3,
  },
];

const FEATURES = [
  { icon: Clapperboard, title: 'Timeline de nível profissional', text: 'Múltiplas trilhas, arrastar e soltar, corte nas bordas, split com C, snap magnético e zoom com Ctrl + rolagem.' },
  { icon: Wand2, title: 'Efeitos e correção de cor', text: 'Brilho, contraste, saturação, blur, matiz, LUTs e transições cinematográficas aplicadas em tempo real.' },
  { icon: Layers, title: 'Objetos 3D e rotação 360°', text: 'Insira cubos, esferas e torus renderizados em WebGL com rotação em X, Y e Z e keyframes de movimento.' },
  { icon: Mic, title: 'Texto ↔ Áudio (TTS/STT)', text: 'Transforme texto em narração com vozes naturais e transcreva áudios em legendas editáveis automaticamente.' },
  { icon: Music4, title: 'Biblioteca de sons', text: 'Whoosh, impactos, risers, cliques e trilhas geradas em tempo real — licenciamento livre para uso comercial.' },
  { icon: Download, title: 'Baixa Tudo integrado', text: 'Baixe vídeos, imagens e áudios de YouTube, TikTok, Instagram, X e mais, direto para a biblioteca do editor.' },
  { icon: Timer, title: '5x mais rápido', text: 'Atalhos completos, autosave a cada 2s, modelos prontos e preview instantâneo. Menos cliques, mais entrega.' },
  { icon: ShieldCheck, title: 'Segurança de verdade', text: 'RLS no banco, RBAC, rate limiting, headers de segurança, webhooks assinados e logs de auditoria.' },
];

const STEPS = [
  { n: '01', title: 'Importe', text: 'Arraste arquivos do computador ou baixe com o Baixa Tudo em 1 clique.' },
  { n: '02', title: 'Monte na régua', text: 'Solta na timeline, corta arrastando as bordas, encaixa com snap e aplica transições.' },
  { n: '03', title: 'Dê vida', text: 'Textos, 3D, narração por IA, trilha e legendas automáticas em poucos segundos.' },
  { n: '04', title: 'Exporte', text: 'Renderize MP4, MOV, WebM ou GIF até 4K direto no navegador — sem instalar nada.' },
];

const TESTIMONIALS = [
  { name: 'Rafa Martins', role: 'Editor de conteúdo · 1,2M seguidores', text: 'Fechei 3 cortes de reels no tempo que eu levava pra abrir o Premiere. A régua responde igual app nativo.' },
  { name: 'Bianca Souza', role: 'Social media · agência Vórtex', text: 'O Baixa Tudo dentro do editor salvou meu fluxo: acho o vídeo, baixo e jogo na timeline sem sair da aba.' },
  { name: 'Diego Alcântara', role: 'Produtor audiovisual', text: 'Narração por IA + legendas automáticas no mesmo lugar. Entrego VSL completo em uma tarde.' },
];

const FAQ = [
  { q: 'Preciso instalar algo?', a: 'Não. O Editor Studio roda 100% no navegador (Chrome, Edge, Firefox e Safari) e também em tablets com toque.' },
  { q: 'Como funciona o Baixa Tudo integrado?', a: 'Já vem embutido na plataforma: cole o link do vídeo, escolha qualidade ou só o áudio, e o arquivo cai na sua biblioteca para usar na timeline. Não precisa instalar nada.' },
  { q: 'Os arquivos ficam salvos?', a: 'Sim. Seus uploads vão para o armazenamento da sua conta conforme o plano, e os projetos têm autosave a cada 2 segundos.' },
  { q: 'Posso exportar em 4K?', a: 'Nos planos Pro e Studio a exportação chega a 4K. No Básico, até 1080p.' },
  { q: 'Como funciona o pagamento?', a: 'Checkout com cartão, PIX ou boleto conforme o gateway configurado. A confirmação é automática via webhook assinado e a assinatura é liberada na hora.' },
  { q: 'Posso cancelar quando quiser?', a: 'Sim. O cancelamento fica agendado para o fim do período e você mantém o acesso até lá.' },
];

export default async function LandingPage() {
  let plans: Plan[] = FALLBACK_PLANS;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('es_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (data && data.length) plans = data as unknown as Plan[];
  } catch {
    /* mantém fallback */
  }

  return (
    <div className="relative overflow-hidden">
      <SiteHeader />

      {/* HERO */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-40 [mask-image:radial-gradient(700px_400px_at_50%_0%,#000,transparent)]" />
        <div className="mx-auto max-w-7xl px-5 pb-16 pt-16 md:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-200">
                <Sparkles className="h-3.5 w-3.5" /> 7 dias grátis · sem cartão
              </div>
              <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-white text-balance md:text-6xl">
                Edição profissional de <span className="gradient-text">vídeo e imagem</span> direto no navegador
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-300 md:text-base">
                Timeline com régua, corte por frame, objetos 3D, biblioteca infinita de assets, narração por IA e o
                <strong className="text-white"> Baixa Tudo</strong> integrado para trazer vídeos, imagens e áudios direto para a sua biblioteca.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <ButtonLink href="/cadastro" size="lg" className="btn-shine w-full sm:w-auto">
                  Criar minha conta <ArrowRight className="h-4 w-4" />
                </ButtonLink>
                <ButtonLink href="/dashboard/projetos" size="lg" variant="secondary" className="w-full sm:w-auto">
                  <Play className="h-4 w-4" /> Abrir o editor
                </ButtonLink>
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
                {['Sem instalação', 'Funciona em tablet', 'Autosave a cada 2s', 'Export até 4K'].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-400" /> {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Mock do editor */}
            <div className="relative" id="editor">
              <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-tr from-brand-500/25 via-transparent to-neon-cyan/20 blur-2xl" />
              <Card className="relative overflow-hidden p-0 shadow-card">
                <div className="flex items-center gap-2 border-b border-white/8 bg-ink-900/80 px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                  <span className="ml-3 text-[11px] text-slate-400">Reels · Lançamento · 1080×1920</span>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> autosave
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-0 sm:grid-cols-[1fr_120px]">
                  <div className="studio-checker relative aspect-video overflow-hidden border-b border-white/8">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/40 via-fuchsia-500/20 to-cyan-400/30" />
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="rotate-6 rounded-2xl border border-white/25 bg-white/10 px-6 py-4 text-center backdrop-blur">
                        <p className="font-display text-2xl font-extrabold text-white drop-shadow">NOVO DROP</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/70">coleção 2026</p>
                      </div>
                    </div>
                    <div className="absolute left-3 top-3 rounded-md bg-black/50 px-2 py-1 text-[10px] text-white/80">00:00:04:12</div>
                  </div>
                  <div className="hidden space-y-2 border-b border-white/8 p-2 sm:block">
                    {[38, 62, 24, 48].map((w, i) => (
                      <div key={i} className="space-y-1">
                        <div className="h-1 w-8 rounded bg-white/20" />
                        <div className="h-2 rounded bg-gradient-to-r from-brand-400/70 to-brand-300/30" style={{ width: `${w + 60}px` }} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5 bg-ink-900/80 p-3">
                  {[
                    { c: 'from-indigo-500 to-violet-500', w: '72%', l: 'Vídeo 1' },
                    { c: 'from-cyan-400 to-teal-500', w: '38%', l: 'Texto' },
                    { c: 'from-emerald-400 to-lime-500', w: '88%', l: 'Trilha' },
                    { c: 'from-amber-400 to-orange-500', w: '26%', l: 'SFX' },
                  ].map((row) => (
                    <div key={row.l} className="flex items-center gap-2">
                      <span className="w-12 text-[9px] uppercase tracking-wide text-slate-500">{row.l}</span>
                      <div className="relative h-4 flex-1 rounded bg-white/[0.04]">
                        <div className={`absolute inset-y-0 left-0 rounded bg-gradient-to-r ${row.c}`} style={{ width: row.w }} />
                        <div className="absolute -top-2 bottom-[-8px] left-[46%] w-px bg-white/70" />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <div className="absolute -bottom-5 -left-4 hidden items-center gap-2 rounded-xl border border-white/10 bg-ink-850/90 px-3 py-2 text-xs shadow-card backdrop-blur md:flex">
                <Zap className="h-4 w-4 text-amber-300" /> Render local · sem fila
              </div>
            </div>
          </div>

          {/* métricas */}
          <div className="mt-16 grid grid-cols-2 gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-6 md:grid-cols-4">
            {[
              ['12.4M', 'frames exportados'],
              ['98%', 'menos tempo de corte'],
              ['+500', 'assets e efeitos'],
              ['4K', 'qualidade máxima'],
            ].map(([v, l]) => (
              <div key={l}>
                <p className="font-display text-2xl font-bold text-white md:text-3xl">{v}</p>
                <p className="text-xs text-slate-400">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RECURSOS */}
      <section id="recursos" className="mx-auto max-w-7xl px-5 py-16">
        <div className="max-w-2xl">
          <Badge tone="brand">Recursos</Badge>
          <h2 className="mt-3 font-display text-3xl font-bold text-white md:text-4xl">
            Tudo que um estúdio precisa, <span className="gradient-text">sem sair da aba</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Cada recurso abaixo é funcional de verdade — nada de botão que não faz nada. Timeline, WebGL, WebAudio,
            Web Speech e storage integrados na mesma aplicação.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title} className="card-hover p-5">
              <div className="mb-4 inline-flex rounded-xl border border-brand-400/20 bg-brand-500/10 p-2.5 text-brand-200">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-[15px] font-semibold text-white">{f.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{f.text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="border-y border-white/5 bg-white/[0.015] py-16">
        <div className="mx-auto max-w-7xl px-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Badge tone="cyan">Fluxo</Badge>
              <h2 className="mt-3 font-display text-3xl font-bold text-white md:text-4xl">Do link ao export em 4 passos</h2>
            </div>
            <ButtonLink href="/cadastro" variant="secondary">Testar agora <ArrowRight className="h-4 w-4" /></ButtonLink>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-white/8 bg-ink-900/60 p-5">
                <span className="font-display text-3xl font-black text-white/10">{s.n}</span>
                <h3 className="mt-2 font-semibold text-white">{s.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BAIXA TUDO */}
      <section id="baixa-tudo" className="mx-auto max-w-7xl px-5 py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <Badge tone="success">Integrado</Badge>
            <h2 className="mt-3 font-display text-3xl font-bold text-white md:text-4xl">
              O <span className="gradient-text">Baixa Tudo</span> agora vive dentro do seu editor
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              A ferramenta roda dentro do próprio sistema: cole o link de um vídeo, escolha a qualidade
              (ou apenas o áudio em MP3) e o arquivo entra direto na sua biblioteca de mídia para arrastar na timeline.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-slate-300">
              {[
                'YouTube, TikTok, Instagram, X, Facebook, Reddit, Pinterest, Vimeo e mais',
                'Vídeo, foto, GIF e áudio (MP3) importados para a biblioteca',
                'Itens múltiplos (carrossel / galeria) em um clique',
                'Histórico das importações e envio direto para o projeto',
                'Roda 100% dentro do sistema — sem instalar extensão',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {t}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink href="/cadastro">Criar conta grátis <ArrowRight className="h-4 w-4" /></ButtonLink>
            </div>
          </div>
          <Card className="p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <MonitorPlay className="h-4 w-4 text-brand-300" /> Dentro do editor · biblioteca de mídia
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-ink-900/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Link do vídeo</div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 truncate rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-slate-300">
                  https://www.youtube.com/watch?v=dQw4w9WgXcQ
                </div>
                <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300">Importar</span>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {[
                ['1080p · MP4', 'Vídeo · 34,2 MB', 'from-indigo-500 to-violet-500'],
                ['Áudio · MP3', '320 kbps · 4,1 MB', 'from-emerald-400 to-teal-500'],
                ['Thumbnail · JPG', '1280×720 · 240 KB', 'from-amber-400 to-orange-500'],
              ].map(([t, s, c]) => (
                <div key={t} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                  <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${c}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">{t}</p>
                    <p className="text-[11px] text-slate-500">{s}</p>
                  </div>
                  <BadgeCheck className="h-4 w-4 text-emerald-400" />
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Área exclusiva de clientes: a importação só aparece depois do login. Respeite os direitos autorais.
            </p>
          </Card>
        </div>
      </section>

      {/* PLANOS */}
      <section id="planos" className="mx-auto max-w-7xl px-5 py-16">
        <div className="text-center">
          <Badge tone="brand">Planos</Badge>
          <h2 className="mt-3 font-display text-3xl font-bold text-white md:text-4xl">Escolha o plano do seu ritmo</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
            7 dias grátis em qualquer plano. Sem fidelidade, cancele quando quiser.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {plans.map((plan, i) => {
            const highlight = plans.length === 3 ? i === 1 : false;
            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col p-6 ${highlight ? 'border-brand-400/50 shadow-glow' : ''}`}
              >
                {highlight ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500 to-neon-cyan px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    Mais popular
                  </span>
                ) : null}
                <h3 className="font-display text-xl font-bold text-white">{plan.name}</h3>
                <p className="mt-1 min-h-[36px] text-xs text-slate-400">{plan.description}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="font-display text-4xl font-extrabold text-white">{brl(plan.price_monthly)}</span>
                  <span className="mb-1 text-xs text-slate-400">/mês</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">ou {brl(plan.price_yearly)}/ano — 2 meses grátis</p>
                <ul className="mt-5 flex-1 space-y-2 text-[13px] text-slate-300">
                  {plan.features?.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> {f}
                    </li>
                  ))}
                </ul>
                <ButtonLink
                  href={`/checkout/${plan.slug}`}
                  variant={highlight ? 'primary' : 'secondary'}
                  className="mt-6 w-full"
                >
                  Assinar {plan.name}
                </ButtonLink>
              </Card>
            );
          })}
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section className="border-y border-white/5 bg-white/[0.015] py-16">
        <div className="mx-auto max-w-7xl px-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-3xl font-bold text-white">Quem edita com a gente</h2>
            <div className="flex items-center gap-1 text-amber-300">{'★★★★★'}</div>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <Card key={t.name} className="p-5">
                <p className="text-[13px] leading-relaxed text-slate-300">“{t.text}”</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-neon-pink text-xs font-bold text-white">
                    {t.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-[11px] text-slate-500">{t.role}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-5 py-16">
        <div className="text-center">
          <Badge tone="cyan">FAQ</Badge>
          <h2 className="mt-3 font-display text-3xl font-bold text-white">Perguntas frequentes</h2>
        </div>
        <div className="mt-8 space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-xl border border-white/8 bg-white/[0.02] p-4 transition open:border-brand-400/30">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-white">
                {item.q}
                <span className="text-brand-300 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2.5 text-[13px] leading-relaxed text-slate-400">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* PLANO POR HORA */}
      <section id="por-hora" className="mx-auto max-w-7xl px-5 pb-4">
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-white/10 bg-ink-900 p-6 sm:flex-row sm:items-center">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-200">
              <Timer className="h-3.5 w-3.5" /> Sem mensalidade
            </p>
            <h3 className="mt-1 font-display text-xl font-bold text-white">Plano por hora: edite só o tempo que precisar</h3>
            <p className="mt-1 text-sm text-slate-400">
              A partir de {brl(19.9)} a hora, com cronômetro que só corre no editor e progresso do saldo no seu painel.
            </p>
          </div>
          <ButtonLink href="/cadastro" variant="secondary" className="shrink-0">
            Começar com horas <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-5 pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-brand-400/25 bg-gradient-to-br from-brand-600/25 via-ink-900 to-ink-950 p-10 text-center">
          <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
          <div className="relative">
            <Film className="mx-auto h-8 w-8 text-brand-300" />
            <h2 className="mt-4 font-display text-3xl font-bold text-white md:text-4xl">Seu próximo corte começa agora</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-slate-300">
              Crie sua conta, ganhe 7 dias do plano Básico e edite o primeiro vídeo em menos de 5 minutos.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/cadastro" size="lg" className="btn-shine">Criar conta grátis <ArrowRight className="h-4 w-4" /></ButtonLink>
              <ButtonLink href="/login" size="lg" variant="secondary">Já tenho conta</ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Editor Studio é uma plataforma SaaS de edição de imagens e vídeos com timeline profissional, biblioteca
              de assets e ferramentas de IA. Feito para criadores que não perdem tempo.
            </p>
          </div>
          <div className="flex flex-wrap gap-10 text-xs text-slate-400">
            <div className="space-y-2">
              <p className="font-semibold text-white">Produto</p>
              <a className="block hover:text-white" href="#recursos">Recursos</a>
              <a className="block hover:text-white" href="#planos">Planos</a>
              <a className="block hover:text-white" href="#baixa-tudo">Baixa Tudo</a>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-white">Legal</p>
              <Link className="block hover:text-white" href="/termos">Termos de uso</Link>
              <Link className="block hover:text-white" href="/privacidade">Privacidade (LGPD)</Link>
              <a className="block hover:text-white" href="mailto:suporte@editorstudio.app">Suporte</a>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-white">Conta</p>
              <Link className="block hover:text-white" href="/login">Entrar</Link>
              <Link className="block hover:text-white" href="/cadastro">Criar conta</Link>
              <Link className="block hover:text-white" href="/dashboard">Meu painel</Link>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-8 flex max-w-7xl flex-wrap items-center justify-between gap-2 border-t border-white/5 px-5 pt-6 text-[11px] text-slate-500">
          <span>© {new Date().getFullYear()} Editor Studio. Todos os direitos reservados.</span>
          <span className="inline-flex items-center gap-1.5"><Subtitles className="h-3.5 w-3.5" /> Interface em português · Pagamentos em BRL</span>
        </div>
      </footer>
    </div>
  );
}

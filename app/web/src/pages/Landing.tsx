import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Professional, type Service } from '../lib/api';
import { brl, durationLabel, fmtDate, timeStr } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Badge, Button, Icon, SectionTitle, StarRating } from '../components/ui';

type Review = { id: string; rating: number; comment: string; client_name: string; professional_name: string; created_at: string };
type Plan = { id: string; name: string; price_cents: number; credits: number; discount_pct: number; perks: string[]; billing: string };

const categoryLabel: Record<string, string> = {
  cabelo: 'Cabelo',
  barba: 'Barba',
  combo: 'Combo',
  coloracao: 'Coloração',
  estetica: 'Estética',
  tratamento: 'Tratamento',
};

const faqs = [
  {
    q: 'Preciso pagar para reservar?',
    a: 'Não. Você escolhe pagar na barbearia, no Pix, no cartão ou pré-autorizar o cartão — o valor só é capturado após o atendimento.',
  },
  {
    q: 'Qual a política de cancelamento?',
    a: 'Cancelamentos com mais de 24h de antecedência têm reembolso integral. Entre 4h e 24h, 50% do valor. Menos de 4h, sem reembolso.',
  },
  {
    q: 'Como funciona o Clube Navalha?',
    a: 'A assinatura mensal inclui créditos de atendimento, descontos em serviços extras e prioridade na agenda. Você cancela quando quiser.',
  },
  {
    q: 'Posso escolher qualquer barbeiro?',
    a: 'Sim. Se não tiver preferência, use a opção “qualquer barbeiro disponível” e o sistema encontra o primeiro horário livre.',
  },
  {
    q: 'O app funciona offline?',
    a: 'Sim. A Navalha é um PWA: você instala no celular e os últimos dados ficam disponíveis mesmo sem conexão.',
  },
];

export function Landing() {
  const { t } = useI18n();
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    Promise.all([
      api.get<Service[]>('/services?branch=brn_centro'),
      api.get<Professional[]>('/professionals'),
      api.get<Review[]>('/reviews?limit=6'),
      api.get<Plan[]>('/plans'),
    ])
      .then(([s, p, r, pl]) => {
        setServices(s);
        setProfessionals(p);
        setReviews(r);
        setPlans(pl);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src="/img/hero.jpg" alt="Interior da barbearia Navalha" className="h-full w-full object-cover object-center opacity-55" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent" />
        </div>
        <div className="container-page relative grid gap-12 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div className="animate-rise">
            <span className="chip mb-6 border-brass-400/30 bg-brass-400/10 text-brass-200">
              <span className="h-1.5 w-1.5 rounded-full bg-brass-300 animate-pulse-soft" /> {t('hero.eyebrow')}
            </span>
            <h1 className="max-w-2xl text-4xl leading-[1.05] text-cream-50 sm:text-5xl lg:text-6xl">{t('hero.title')}</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-cream-200/80 sm:text-lg">{t('hero.subtitle')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/agendar" className="btn-primary px-6 py-3">
                {t('hero.cta')} <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
              <a href="#clube" className="btn-ghost px-6 py-3">
                {t('hero.secondary')}
              </a>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6">
              {[
                ['12k+', t('hero.stat1')],
                ['4.9', t('hero.stat2')],
                ['2', t('hero.stat3')],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="font-display text-3xl text-cream-50">{value}</dt>
                  <dd className="mt-1 text-[11px] uppercase tracking-[0.16em] text-cream-300/60">{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative hidden lg:block">
            <div className="absolute -right-4 top-6 w-[330px] rotate-2 rounded-3xl border border-white/10 bg-ink-900/85 p-6 shadow-[var(--shadow-lift)] backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.18em] text-brass-300">Hoje · agenda</p>
                <Badge tone="success">ao vivo</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {['09:00', '10:30', '13:00', '15:30'].map((hour, i) => (
                  <div key={hour} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                    <span className="text-sm text-cream-100">{hour}</span>
                    <div className="flex-1">
                      <p className="text-xs text-cream-200/80">{['Degradê navalhado', 'Corte + barba', 'Barba terapia', 'Platinado'][i]}</p>
                      <p className="text-[10px] text-cream-300/50">{['Diego', 'Bruno', 'Lucas', 'Aline'][i]}</p>
                    </div>
                    <span className={`h-2 w-2 rounded-full ${i === 0 ? 'bg-moss-400' : i === 1 ? 'bg-brass-400' : 'bg-white/25'}`} />
                  </div>
                ))}
              </div>
              <Link to="/agendar" className="btn-primary mt-5 w-full">Ver horários livres</Link>
            </div>
            <div className="absolute -left-6 bottom-0 w-[240px] -rotate-3 rounded-2xl border border-white/10 bg-ink-800/90 p-5 backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-moss-400/15 p-1.5 text-moss-400"><Icon name="check" className="h-4 w-4" /></span>
                <p className="text-sm text-cream-100">Confirmação instantânea</p>
              </div>
              <p className="mt-2 text-xs text-cream-300/70">E-mail, SMS e push. Lembrete 24h antes, sem spam.</p>
            </div>
          </div>
        </div>
      </section>

      {/* DESTAQUES */}
      <section className="border-y border-white/6 bg-ink-900/40">
        <div className="container-page grid gap-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['calendar', 'Agende em 3 passos', 'Serviço, barbeiro e horário — sem cadastro interminável.'],
            ['clock', 'Fila em tempo real', 'Estimativa de espera atualizada conforme o atendimento avança.'],
            ['shield', 'Pague como quiser', 'Pix, cartão, pré-autorização ou direto no balcão.'],
            ['star', 'Avaliação verificada', 'Só quem foi atendido pode avaliar o profissional.'],
          ].map(([icon, title, desc]) => (
            <div key={title} className="flex gap-3">
              <span className="mt-0.5 rounded-xl border border-brass-400/20 bg-brass-400/10 p-2 text-brass-300">
                <Icon name={icon as 'calendar'} className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-cream-50">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-cream-300/70">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SERVIÇOS */}
      <section id="servicos" className="container-page scroll-mt-24 py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionTitle eyebrow="cardápio" title={t('services.title')} description={t('services.subtitle')} />
          <Link to="/agendar" className="btn-ghost">
            Ver agenda completa <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <article key={service.id} className="group card flex flex-col justify-between transition hover:border-brass-400/30 hover:bg-ink-900">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <span className="chip">{categoryLabel[service.category] || service.category}</span>
                  <span className="text-xs text-cream-300/60">{durationLabel(service.duration_min)}</span>
                </div>
                <h3 className="mt-4 text-xl text-cream-50">{service.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-cream-300/75">{service.description}</p>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <p className="font-display text-2xl text-brass-200">{brl(service.price_cents)}</p>
                <Link
                  to={`/agendar?service=${service.id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-cream-100 opacity-70 transition group-hover:opacity-100"
                >
                  Agendar <Icon name="arrow-right" className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* BARBEIROS */}
      <section id="barbeiros" className="scroll-mt-24 border-y border-white/6 bg-ink-900/30 py-20">
        <div className="container-page">
          <SectionTitle eyebrow="time" title={t('pro.title')} description={t('pro.subtitle')} align="center" />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {professionals.slice(0, 4).map((pro) => (
              <article key={pro.id} className="card flex flex-col items-center text-center transition hover:border-brass-400/30">
                <div className="relative">
                  <div className="grid h-20 w-20 place-items-center rounded-full border border-brass-400/30 bg-gradient-to-br from-brass-400/25 to-transparent font-display text-2xl text-brass-200">
                    {pro.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </div>
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-ink-900 px-2 py-0.5 text-[10px] text-brass-200">
                    ★ {Number(pro.avg_rating ?? pro.rating).toFixed(1)}
                  </span>
                </div>
                <h3 className="mt-4 text-lg text-cream-50">{pro.name}</h3>
                <p className="mt-2 text-xs leading-relaxed text-cream-300/70">{pro.bio}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-1">
                  {(pro.specialties || []).map((s) => (
                    <span key={s} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-cream-300/80">{s}</span>
                  ))}
                </div>
                <Link to={`/agendar?professional=${pro.id}`} className="btn-ghost mt-5 w-full !py-2 text-xs">
                  Agendar com {pro.name.split(' ')[0]}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CLUBE */}
      <section id="clube" className="container-page scroll-mt-24 py-20">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <SectionTitle eyebrow="assinatura" title={t('plans.title')} description={t('plans.subtitle')} />
            <div className="mt-8 overflow-hidden rounded-3xl border border-white/10">
              <img src="/img/atelier.jpg" alt="Ferramentas de barbeiro sobre bancada de madeira" className="h-56 w-full object-cover" />
            </div>
            <ul className="mt-6 space-y-2 text-sm text-cream-300/80">
              {['Cancele quando quiser, sem multa', 'Créditos acumulam por 30 dias', 'Prioridade em horários de pico', 'Desconto em produtos'].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Icon name="check" className="h-4 w-4 text-moss-400" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {plans.map((plan, index) => (
              <div key={plan.id} className={`card relative flex flex-col ${index === 1 ? 'border-brass-400/40 bg-brass-400/[0.06]' : ''}`}>
                {index === 1 && <span className="absolute -top-3 left-6 rounded-full bg-brass-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-950">mais vendido</span>}
                <h3 className="text-xl text-cream-50">{plan.name}</h3>
                <p className="mt-3 font-display text-3xl text-brass-200">
                  {brl(plan.price_cents)}
                  <span className="ml-1 font-sans text-xs text-cream-300/60">/{plan.billing}</span>
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-cream-300/80">
                  {(plan.perks || []).map((perk) => (
                    <li key={perk} className="flex items-start gap-2">
                      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-moss-400" /> {perk}
                    </li>
                  ))}
                </ul>
                <Link to="/clube" className={index === 1 ? 'btn-primary mt-6 w-full' : 'btn-ghost mt-6 w-full'}>
                  Assinar
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AVALIAÇÕES */}
      <section id="avaliacoes" className="scroll-mt-24 border-y border-white/6 bg-ink-900/30 py-20">
        <div className="container-page">
          <SectionTitle eyebrow="avaliações" title={t('reviews.title')} description="Notas e comentários reais de quem passou pela cadeira." align="center" />
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviews.slice(0, 6).map((review) => (
              <article key={review.id} className="card-tight">
                <div className="flex items-center justify-between">
                  <StarRating value={review.rating} />
                  <span className="text-[11px] text-cream-300/50">{fmtDate(review.created_at)}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-cream-200/90">“{review.comment}”</p>
                <p className="mt-4 text-xs text-cream-300/60">
                  {review.client_name} · atendido por {review.professional_name}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ + CTA */}
      <section className="container-page py-20">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionTitle eyebrow="faq" title={t('faq.title')} />
            <div className="mt-8 divide-y divide-white/8 border-y border-white/8">
              {faqs.map((faq, index) => (
                <div key={faq.q}>
                  <button
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                    className="flex w-full items-center justify-between gap-4 py-4 text-left"
                    aria-expanded={openFaq === index}
                  >
                    <span className="text-sm font-medium text-cream-100">{faq.q}</span>
                    <Icon name={openFaq === index ? 'x' : 'plus'} className="h-4 w-4 shrink-0 text-brass-300" />
                  </button>
                  {openFaq === index && <p className="pb-4 text-sm leading-relaxed text-cream-300/75">{faq.a}</p>}
                </div>
              ))}
            </div>
          </div>
          <div className="card grain relative overflow-hidden bg-gradient-to-br from-brass-500/20 via-ink-900 to-ink-900 p-8">
            <h3 className="relative text-2xl text-cream-50">Pronto para sentar na cadeira?</h3>
            <p className="relative mt-3 max-w-md text-sm text-cream-200/80">
              Escolha o serviço, o barbeiro e o horário. Você recebe a confirmação na hora — e um lembrete antes de sair de casa.
            </p>
            <div className="relative mt-6 flex flex-wrap gap-3">
              <Link to="/agendar" className="btn-primary">
                Agendar agora <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
              <Link to="/entrar" className="btn-ghost">
                Já sou cliente
              </Link>
            </div>
            <div className="relative mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-6 text-xs text-cream-200/70">
              <div>
                <p className="text-cream-50">Centro</p>
                <p>Rua Marechal Deodoro, 245</p>
                <p>Joaçaba · SC</p>
              </div>
              <div>
                <p className="text-cream-50">Zona Norte</p>
                <p>Av. Sete de Setembro, 1420</p>
                <p>Joaçaba · SC</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

import { ArrowUpRight, Check, MapPin, MessageCircle, Phone, Star } from "lucide-react";
import { ctaLabel, SHOWCASE_MIN_RATING, whatsappHref } from "@/lib/deals/demo-content";
import type { DemoPalette, DemoTemplate, DemoContent } from "@/lib/deals/types";
import { themeVars } from "./theme";

function ratingText(r: number): string {
  return r.toFixed(1).replace(".", ",");
}

/** `tel:` só com dígitos; descarta o que não parece um telefone brasileiro. */
function telHref(display: string | null, whatsappDigits: string | null): string | null {
  const digits = whatsappDigits ?? (display ?? "").replace(/\D/g, "");
  if (!/^(55)?\d{10,11}$/.test(digits)) return null;
  return `tel:+${digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`}`;
}

const btn =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-(--d-r-btn) px-6 text-[15px] font-semibold transition-[transform,opacity] duration-200 hover:-translate-y-px hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--d-accent) motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/**
 * A prévia pública do site. É um componente de servidor puro: sem JavaScript no navegador, sem
 * requisições externas, sem rastreio. Todo texto passa pelo React (escapado) e todo link é montado
 * aqui a partir de dígitos ou de endereços já validados.
 */
export function DemoSite({
  template,
  palette,
  content: c,
}: {
  template: DemoTemplate;
  palette: DemoPalette;
  content: DemoContent;
}) {
  const place = [c.neighborhood, c.city].filter(Boolean).join(", ");
  const bookText = `Olá! Vi o site de vocês e gostaria de ${template === "generico" ? "pedir um orçamento" : "agendar"}.`;
  const bookHref = c.whatsappDigits ? whatsappHref(c.whatsappDigits, bookText) : null;
  const tel = telHref(c.phoneDisplay, c.whatsappDigits);
  const wantHref = c.ownerWhatsappDigits
    ? whatsappHref(c.ownerWhatsappDigits, `Oi, ${c.madeBy.sender}! Vi a prévia do site da ${c.businessName} e gostei. Quero conversar sobre ele.`)
    : null;
  const label = ctaLabel(template);
  const head = "[font-family:var(--d-head-font)] [font-weight:var(--d-head-weight)] [text-transform:var(--d-head-transform)]";

  return (
    <div
      style={themeVars(template, palette)}
      className="min-h-dvh bg-(--d-bg) font-sans text-[16px] leading-relaxed text-(--d-ink) antialiased"
    >
      {/* faixa de aviso: deixa claro que é uma prévia, quem fez e como falar com quem fez */}
      <div className="sticky top-0 z-30 border-b border-(--d-line) bg-(--d-ink) text-(--d-bg)">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-[13px] sm:px-6">
          <p className="min-w-0 flex-1 basis-60">
            <strong className="font-semibold">Prévia</strong> para {c.businessName}, criada por {c.madeBy.brand}. Ainda não é o site final.
          </p>
          {wantHref ? (
            <a
              href={wantHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-(--d-r-btn) bg-(--d-accent) px-4 text-[13px] font-semibold text-(--d-accent-ink) hover:opacity-90"
            >
              Gostei, quero este site
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <p className={`${head} min-w-0 text-[18px] leading-tight tracking-(--d-head-tracking) sm:text-[22px]`}>
          {c.businessName}
        </p>
        <nav aria-label="Seções" className="hidden items-center gap-7 text-[14px] text-(--d-muted) md:flex">
          <a className="hover:text-(--d-ink)" href="#servicos">Serviços</a>
          <a className="hover:text-(--d-ink)" href="#sobre">Sobre</a>
          <a className="hover:text-(--d-ink)" href="#contato">Contato</a>
        </nav>
        {bookHref ? (
          <a
            href={bookHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`${btn} min-h-10 shrink-0 whitespace-nowrap bg-(--d-accent) px-4 text-[14px] text-(--d-accent-ink) sm:px-5`}
          >
            {label}
          </a>
        ) : null}
      </header>

      <main>
        {/* topo */}
        <section className="relative isolate overflow-hidden">
          <div aria-hidden className="absolute -right-24 -top-24 -z-10 size-[420px] rounded-full bg-(--d-soft) opacity-90 blur-2xl sm:size-[560px]" />
          <div aria-hidden className="absolute -bottom-32 -left-20 -z-10 size-[300px] rounded-full bg-(--d-soft) opacity-60 blur-3xl" />
          <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div className="rise">
              <p className="mb-5 inline-flex items-center gap-2 text-[13px] font-medium tracking-[0.14em] text-(--d-accent) uppercase">
                <span aria-hidden className="h-px w-8 bg-(--d-accent)" />
                {c.category}
              </p>
              <h1
                className={`${head} text-[40px] leading-[1.05] tracking-(--d-head-tracking) text-balance sm:text-[60px] lg:text-[72px]`}
              >
                {c.businessName}
              </h1>
              <p className="mt-5 max-w-xl text-[18px] text-(--d-muted) sm:text-[20px]">{c.tagline}</p>
              <div className="mt-9 flex flex-wrap gap-3">
                {bookHref ? (
                  <a href={bookHref} target="_blank" rel="noopener noreferrer" className={`${btn} bg-(--d-accent) text-(--d-accent-ink)`}>
                    <MessageCircle className="size-[18px]" aria-hidden />
                    {label} pelo WhatsApp
                  </a>
                ) : tel ? (
                  <a href={tel} className={`${btn} bg-(--d-accent) text-(--d-accent-ink)`}>
                    <Phone className="size-[18px]" aria-hidden />
                    Ligar agora
                  </a>
                ) : null}
                <a href="#servicos" className={`${btn} border border-(--d-line) bg-(--d-surface) text-(--d-ink)`}>
                  Ver serviços
                </a>
              </div>
            </div>

            {c.rating != null && c.rating >= SHOWCASE_MIN_RATING ? (
              <aside
                aria-label="Avaliação no Google"
                className="rise rounded-(--d-r-card) border border-(--d-line) bg-(--d-surface) p-7"
                style={{ ["--i" as never]: 2 }}
              >
                <p className={`${head} flex items-baseline gap-2 text-[56px] leading-none`}>
                  {ratingText(c.rating)}
                  <Star className="size-7 fill-(--d-accent) text-(--d-accent)" aria-hidden />
                </p>
                <p className="mt-3 text-[15px] text-(--d-muted)">
                  {c.reviewsCount >= 5 ? `${c.reviewsCount} avaliações no Google` : "Nota no Google"}
                </p>
              </aside>
            ) : null}
          </div>

          {c.highlights.length > 0 ? (
            <ul className="mx-auto flex max-w-6xl flex-wrap gap-x-8 gap-y-3 border-t border-(--d-line) px-4 py-5 text-[14px] text-(--d-muted) sm:px-6">
              {c.highlights.map((h) => (
                <li key={h} className="inline-flex items-center gap-2">
                  <Check className="size-4 text-(--d-accent)" aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/* serviços */}
        <section id="servicos" className="scroll-mt-16 bg-(--d-surface) py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-3">
              <h2
                className={`${head} text-[32px] tracking-(--d-head-tracking) sm:text-[44px]`}
              >
                Serviços
              </h2>
              <p className="max-w-xs text-[13px] text-(--d-muted)">
                Exemplos do ramo, só para você visualizar. No site final entram os seus serviços de verdade.
              </p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {c.services.map((s, i) => (
                <li key={s.name} className="rounded-(--d-r-card) border border-(--d-line) bg-(--d-bg) p-6">
                  <p className="num mb-5 text-[13px] text-(--d-accent)">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className={`${head} text-[22px] tracking-(--d-head-tracking)`}>
                    {s.name}
                  </h3>
                  <p className="mt-2 text-[15px] text-(--d-muted)">{s.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* sobre */}
        <section id="sobre" className="scroll-mt-16 py-16 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
            <h2
              className={`${head} text-[32px] tracking-(--d-head-tracking) sm:text-[44px]`}
            >
              Sobre
            </h2>
            <p className="max-w-2xl text-[19px] leading-relaxed text-(--d-ink) sm:text-[22px]">{c.about}</p>
          </div>
        </section>

        {/* contato */}
        <section id="contato" className="scroll-mt-16 bg-(--d-ink) py-16 text-(--d-bg) sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <h2
                className={`${head} text-[32px] tracking-(--d-head-tracking) sm:text-[44px]`}
              >
                {template === "generico" ? "Fale com a gente" : "Vamos conversar?"}
              </h2>
              <p className="mt-4 max-w-md text-[17px] opacity-80">
                {bookHref ? "A forma mais rápida é pelo WhatsApp." : "Entre em contato pelos dados ao lado."}
              </p>
              {bookHref ? (
                <a
                  href={bookHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${btn} mt-8 bg-(--d-accent) text-(--d-accent-ink)`}
                >
                  <MessageCircle className="size-[18px]" aria-hidden />
                  {label} pelo WhatsApp
                </a>
              ) : null}
            </div>
            <dl className="grid content-start gap-6 text-[16px]">
              {c.address || place ? (
                <div className="flex gap-4">
                  <MapPin className="mt-1 size-5 shrink-0 text-(--d-accent)" aria-hidden />
                  <div>
                    <dt className="text-[13px] tracking-[0.14em] uppercase opacity-60">Endereço</dt>
                    <dd>{c.address ?? place}</dd>
                  </div>
                </div>
              ) : null}
              {c.phoneDisplay ? (
                <div className="flex gap-4">
                  <Phone className="mt-1 size-5 shrink-0 text-(--d-accent)" aria-hidden />
                  <div>
                    <dt className="text-[13px] tracking-[0.14em] uppercase opacity-60">Telefone</dt>
                    <dd>
                      {tel ? (
                        <a href={tel} className="underline decoration-1 underline-offset-4 hover:opacity-80">
                          {c.phoneDisplay}
                        </a>
                      ) : (
                        c.phoneDisplay
                      )}
                    </dd>
                  </div>
                </div>
              ) : null}
              {c.instagramUrl ? (
                <div className="flex gap-4">
                  <ArrowUpRight className="mt-1 size-5 shrink-0 text-(--d-accent)" aria-hidden />
                  <div>
                    <dt className="text-[13px] tracking-[0.14em] uppercase opacity-60">Redes</dt>
                    <dd>
                      <a
                        href={c.instagramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-1 underline-offset-4 hover:opacity-80"
                      >
                        {c.instagramUrl.replace(/^https:\/\//, "")}
                      </a>
                    </dd>
                  </div>
                </div>
              ) : null}
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-(--d-line) px-4 py-8 text-center text-[13px] text-(--d-muted) sm:px-6">
        Prévia criada por {c.madeBy.brand} ({c.madeBy.sender}) para {c.businessName}. Textos e serviços são exemplos e não representam o
        negócio.
      </footer>
    </div>
  );
}

import Link from 'next/link';
import { Check } from 'lucide-react';
import { Logo } from '@/components/ui';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/5 p-10 lg:flex">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
        <div className="pointer-events-none absolute -left-24 top-1/3 h-[420px] w-[420px] rounded-full bg-brand-500/25 blur-[120px]" />
        <div className="relative">
          <Logo size="md" />
          <h2 className="mt-16 max-w-md font-display text-4xl font-extrabold leading-tight text-white">
            A régua que respeita o seu tempo.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
            Timeline com magnetismo, corte por frame, 3D em WebGL e downloader integrado. Tudo no navegador.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {[
              '7 dias grátis no plano Básico',
              'Autosave a cada 2 segundos',
              'Exportação WebM/MP4 até 4K',
              'Baixa Tudo já incluído',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
                  <Check className="h-3 w-3" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[11px] text-slate-500">
          © {new Date().getFullYear()} Editor Studio · <Link href="/termos" className="hover:text-slate-300">Termos</Link> ·{' '}
          <Link href="/privacidade" className="hover:text-slate-300">Privacidade</Link>
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6 text-center text-sm text-slate-400">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

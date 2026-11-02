import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Avatar, Button, Icon } from './ui';

export const Logo = ({ compact = false }: { compact?: boolean }) => (
  <Link to="/" className="flex items-center gap-2.5" aria-label="Navalha — página inicial">
    <span className="grid h-9 w-9 place-items-center rounded-xl border border-brass-400/40 bg-brass-400/15 text-brass-300">
      <Icon name="scissors" className="h-5 w-5" strokeWidth={1.8} />
    </span>
    {!compact && (
      <span className="leading-none">
        <span className="block font-display text-lg tracking-tight text-cream-50">Navalha</span>
        <span className="block text-[10px] uppercase tracking-[0.3em] text-brass-300/80">barbershop</span>
      </span>
    )}
  </Link>
);

function LanguageSwitch() {
  const { locale, setLocale, locales } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="nav-link flex items-center gap-1.5" aria-haspopup="listbox" aria-expanded={open}>
        <Icon name="globe" className="h-4 w-4" />
        <span className="text-xs uppercase">{locale.split('-')[0]}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-white/10 bg-ink-900 py-1 shadow-2xl" role="listbox">
            {locales.map((item) => (
              <li key={item.code}>
                <button
                  onClick={() => {
                    setLocale(item.code);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 ${locale === item.code ? 'text-brass-300' : 'text-cream-200'}`}
                >
                  <span>{item.flag}</span> {item.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const links = [
    { to: '/#servicos', label: t('nav.services') },
    { to: '/#barbeiros', label: t('nav.professionals') },
    { to: '/clube', label: t('nav.plans') },
    { to: '/#avaliacoes', label: t('nav.reviews') },
  ];

  const home = user?.role === 'ADMIN' ? '/admin' : user?.role === 'PROFESSIONAL' ? '/pro' : '/app';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-white/6 bg-ink-950/85 backdrop-blur-xl">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="principal">
            {links.map((link) => (
              <Link key={link.to} to={link.to} className="nav-link">
                {link.label}
              </Link>
            ))}
            {user && (
              <Link to={home} className="nav-link">
                {user.role === 'CLIENT' ? t('nav.account') : t('nav.panel')}
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <LanguageSwitch />
            </div>
            {user ? (
              <Link to={home} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 hover:bg-white/10">
                <Avatar name={user.name} url={user.avatar_url} size={30} />
                <span className="hidden text-xs font-medium text-cream-100 sm:block">{user.name.split(' ')[0]}</span>
              </Link>
            ) : (
              <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => navigate('/entrar')}>
                {t('nav.login')}
              </Button>
            )}
            <Button onClick={() => navigate('/agendar')} className="whitespace-nowrap">
              {t('nav.book')}
            </Button>
            <button className="rounded-full p-2 text-cream-200 hover:bg-white/10 lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Abrir menu">
              <Icon name={open ? 'x' : 'menu'} />
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-white/6 bg-ink-950/95 lg:hidden">
            <nav className="container-page grid gap-1 py-3">
              {links.map((link) => (
                <Link key={link.to} to={link.to} onClick={() => setOpen(false)} className="nav-link">
                  {link.label}
                </Link>
              ))}
              {!user && (
                <Link to="/entrar" onClick={() => setOpen(false)} className="nav-link">
                  {t('nav.login')}
                </Link>
              )}
              <div className="pt-2">
                <LanguageSwitch />
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-white/6 bg-ink-950">
        <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <Logo />
            <p className="text-sm leading-relaxed text-cream-300/70">
              Barbearia contemporânea com agenda inteligente, clube de assinatura e atendimento que respeita o seu tempo.
            </p>
            <div className="flex gap-2 pt-1">
              <a href="https://instagram.com" target="_blank" rel="noreferrer" className="rounded-full border border-white/10 p-2 text-cream-300 hover:text-brass-300" aria-label="Instagram">
                <Icon name="instagram" className="h-4 w-4" />
              </a>
              <a href="https://wa.me/554935221180" target="_blank" rel="noreferrer" className="rounded-full border border-white/10 p-2 text-cream-300 hover:text-brass-300" aria-label="WhatsApp">
                <Icon name="phone" className="h-4 w-4" />
              </a>
              <a href="mailto:contato@navalha.app" className="rounded-full border border-white/10 p-2 text-cream-300 hover:text-brass-300" aria-label="E-mail">
                <Icon name="mail" className="h-4 w-4" />
              </a>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-brass-300">Navegar</p>
            <ul className="space-y-2 text-sm text-cream-300/80">
              <li><Link to="/agendar" className="hover:text-cream-50">Agendar horário</Link></li>
              <li><Link to="/clube" className="hover:text-cream-50">Clube Navalha</Link></li>
              <li><Link to="/app" className="hover:text-cream-50">Minha conta</Link></li>
              <li><Link to="/entrar" className="hover:text-cream-50">Entrar / criar conta</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-brass-300">Unidades</p>
            <ul className="space-y-2 text-sm text-cream-300/80">
              <li>Centro — Rua Marechal Deodoro, 245</li>
              <li>Zona Norte — Av. Sete de Setembro, 1420</li>
              <li>Joaçaba · SC</li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-brass-300">Horários</p>
            <ul className="space-y-2 text-sm text-cream-300/80">
              <li>Terça a sexta · 09h–20h</li>
              <li>Sábado · 09h–18h</li>
              <li>Domingo e segunda · fechado</li>
            </ul>
            <p className="mt-4 text-xs text-cream-300/50">© {new Date().getFullYear()} Navalha Barbearia. {t('footer.rights')}</p>
          </div>
        </div>
      </footer>
      {location.pathname.startsWith('/agendar') && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink-950/90 p-3 backdrop-blur sm:hidden">
          <p className="text-center text-xs text-cream-300/70">Prefere falar com a gente?</p>
          <a href="https://wa.me/554935221180" className="btn-ghost mt-2 w-full" target="_blank" rel="noreferrer">
            <Icon name="phone" className="h-4 w-4" /> WhatsApp da barbearia
          </a>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Layout do painel --------------------------- */
export function PanelLayout({
  title,
  subtitle,
  nav,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  nav: { to: string; label: string; icon: Parameters<typeof Icon>[0]['name']; end?: boolean }[];
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const navContent = (
    <nav className="space-y-1" aria-label="painel">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              isActive ? 'bg-brass-400/15 text-brass-200' : 'text-cream-300/80 hover:bg-white/5 hover:text-cream-50'
            }`
          }
        >
          <Icon name={item.icon} className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-ink-950">
      <div className="mx-auto flex w-full max-w-[1500px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/6 bg-ink-900/40 p-5 lg:flex">
          <Logo />
          <div className="mt-8 flex-1">{navContent}</div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="flex items-center gap-2">
              <Avatar name={user?.name} url={user?.avatar_url} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-cream-100">{user?.name}</p>
                <p className="truncate text-[11px] uppercase tracking-wider text-brass-300/80">{user?.role}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Link to="/" className="btn-ghost flex-1 !px-2 !py-1.5 text-xs">Site</Link>
              <button
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                className="btn-dark flex-1 !px-2 !py-1.5 text-xs"
              >
                Sair
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-white/6 bg-ink-950/90 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-8">
              <div className="flex items-center gap-3">
                <button className="rounded-lg p-2 text-cream-200 hover:bg-white/10 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
                  <Icon name="menu" />
                </button>
                <div>
                  <h1 className="font-display text-xl text-cream-50">{title}</h1>
                  {subtitle && <p className="text-xs text-cream-300/60">{subtitle}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">{actions}</div>
            </div>
          </header>
          <div className="px-4 py-6 pb-24 sm:px-8">{children}</div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 animate-rise border-r border-white/10 bg-ink-900 p-5">
            <div className="mb-6 flex items-center justify-between">
              <Logo />
              <button onClick={() => setOpen(false)} aria-label="Fechar menu" className="rounded-lg p-2 hover:bg-white/10">
                <Icon name="x" />
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      )}
    </div>
  );
}

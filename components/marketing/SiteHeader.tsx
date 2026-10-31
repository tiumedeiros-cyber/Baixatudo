'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Menu, X } from 'lucide-react';
import { ButtonLink, Logo } from '@/components/ui';

const NAV = [
  { href: '#recursos', label: 'Recursos' },
  { href: '#editor', label: 'Editor' },
  { href: '#baixa-tudo', label: 'Baixa Tudo' },
  { href: '#planos', label: 'Planos' },
  { href: '#faq', label: 'FAQ' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-5">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="transition hover:text-white">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Entrar
          </ButtonLink>
          <ButtonLink href="/cadastro" size="sm" className="btn-shine">
            Começar grátis <ArrowRight className="h-4 w-4" />
          </ButtonLink>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-200 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[95] md:hidden">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 top-0 rounded-b-3xl border-b border-white/10 bg-ink-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Logo size="sm" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="mt-5 grid gap-1">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm font-medium text-slate-200 hover:bg-white/5"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="mt-4 grid gap-2">
              <ButtonLink href="/dashboard/projetos" onClick={() => setOpen(false)} className="w-full">
                Abrir o editor <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/login" variant="secondary" onClick={() => setOpen(false)} className="w-full">
                Entrar
              </ButtonLink>
              <ButtonLink href="/cadastro" variant="ghost" onClick={() => setOpen(false)} className="w-full">
                Criar conta grátis
              </ButtonLink>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

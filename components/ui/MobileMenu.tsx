'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';

/**
 * Menu sanduíche com drawer lateral — usado nos painéis (cliente e admin).
 *
 * O drawer é renderizado em um portal no `document.body`: headers com
 * `backdrop-filter`/`transform` viram "containing block" de elementos
 * `position: fixed` e a gaveta ficava presa (e invisível) dentro do header.
 */
export function MobileMenu({
  children,
  title = 'Menu',
  signedIn = true,
}: {
  children: ReactNode;
  title?: string;
  signedIn?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const drawer = open ? (
    <div className="fixed inset-0 z-[120] lg:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/80" onClick={() => setOpen(false)} />
      <div className="absolute inset-y-0 left-0 flex w-[88%] max-w-xs flex-col border-r border-white/10 bg-[#0a0c14] p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{title}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-2" onClick={() => setOpen(false)}>
          {children}
        </div>
        {signedIn ? (
          <form action="/auth/signout" method="post" className="mt-3 border-t border-white/10 pt-3">
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-200 transition hover:bg-rose-500/10">
              <LogOut className="h-4 w-4" /> Sair da conta
            </button>
          </form>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
        aria-expanded={open}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      {mounted && drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}

'use client';

/**
 * Drawer — gaveta offcanvas reutilizável do editor.
 *
 * • Celular: sobe de baixo (bottom sheet), altura 82dvh, arrastável para fechar.
 * • Tablet/desktop estreito: entra pela direita (320–420 px).
 * • Sempre montada: abre/fecha com transição suave, sem espremer o editor.
 * • Fecha com Escape, clique no fundo ou arrasto para baixo.
 *
 * Componente isolado — quem usa decide o conteúdo (Biblioteca, Ajustes, etc.).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Drawer({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  width = 'sm:w-[400px]',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const dragging = useRef(false);

  // Escape fecha (só quando está aberto)
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    // trava o scroll do body enquanto a gaveta está aberta
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setDrag(0);
  }, [open]);

  function pointerDown(event: React.PointerEvent) {
    startY.current = event.clientY;
    dragging.current = true;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event: React.PointerEvent) {
    if (!dragging.current || startY.current === null) return;
    const delta = event.clientY - startY.current;
    setDrag(Math.max(0, delta));
  }

  function pointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    startY.current = null;
    if (drag > 90) {
      setDrag(0);
      onClose();
    } else {
      setDrag(0);
    }
  }

  return (
    <div
      className={cn('fixed inset-0 z-[70] lg:hidden', open ? 'pointer-events-auto' : 'pointer-events-none')}
      aria-hidden={!open}
    >
      {/* fundo */}
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          'absolute inset-0 bg-black/70 backdrop-blur-[2px] transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* gaveta */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={drag ? { transform: `translate3d(0, ${drag}px, 0)`, transition: 'none' } : undefined}
        className={cn(
          'absolute inset-x-0 bottom-0 flex h-[82dvh] flex-col overflow-hidden rounded-t-2xl border-t border-white/10 bg-ink-950 shadow-[0_-12px_40px_rgba(0,0,0,0.6)]',
          'sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:rounded-none sm:border-l sm:border-t-0 sm:shadow-[-12px_0_40px_rgba(0,0,0,0.6)]',
          width,
          'transition-transform duration-300 ease-out will-change-transform',
          open ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-y-0 sm:translate-x-full',
        )}
      >
        {/* puxador (arrastar para fechar) */}
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center py-2 sm:hidden"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
        >
          <span className="h-1 w-10 rounded-full bg-white/25" />
        </div>

        <div className="flex shrink-0 items-center gap-2 border-b border-white/8 px-3 pb-2 sm:pt-2">
          {icon ? <span className="text-brand-300">{icon}</span> : null}
          <span className="text-xs font-semibold text-white">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel"
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg bg-white/8 text-slate-200 transition hover:bg-white/15"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-white/8 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">{footer}</div>
        ) : (
          <div className="h-[env(safe-area-inset-bottom)] shrink-0" />
        )}
      </div>
    </div>
  );
}

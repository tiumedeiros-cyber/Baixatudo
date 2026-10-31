'use client';
import { MessageCircle, Mail, Headset } from 'lucide-react';
import { useState } from 'react';

/**
 * Botão flutuante de suporte (WhatsApp e/ou e-mail).
 * Quais canais aparecem é decidido pelo admin em Configurações.
 */
export function SupportFab({
  whatsapp,
  email,
  message,
}: {
  whatsapp: string;
  email: string;
  message?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!whatsapp && !email) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 print:hidden">
      {open ? (
        <div className="w-[240px] rounded-2xl border border-white/10 bg-ink-900/95 p-3 shadow-2xl backdrop-blur">
          <p className="text-[11px] font-semibold text-white">Precisa de ajuda?</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">Fale com o suporte{message ? `: ${message}` : '.'}</p>
          <div className="mt-2 space-y-1.5">
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-xl bg-emerald-500 px-2.5 py-2 text-[11px] font-bold text-black hover:bg-emerald-400"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            ) : null}
            {email ? (
              <a
                href={email}
                className="flex items-center gap-2 rounded-xl border border-white/15 px-2.5 py-2 text-[11px] font-semibold text-slate-200 hover:bg-white/5"
              >
                <Mail className="h-3.5 w-3.5" /> E-mail
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Abrir suporte"
        className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-neon-pink text-white shadow-[0_14px_30px_-12px_rgba(99,102,241,0.9)] transition hover:scale-105"
      >
        <Headset className="h-5 w-5" />
      </button>
    </div>
  );
}

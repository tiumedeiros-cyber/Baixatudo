'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Download,
  FolderKanban,
  Gauge,
  Image as ImageIcon,
  LifeBuoy,
  ShieldCheck,
  UserRound,
  CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/dashboard', label: 'Visão geral', icon: Gauge },
  { href: '/dashboard/projetos', label: 'Meus projetos', icon: FolderKanban },
  { href: '/dashboard/arquivos', label: 'Meus arquivos', icon: ImageIcon },
  { href: '/dashboard/baixa-tudo', label: 'Baixa Tudo', icon: Download, badge: 'novo' },
  { href: '/dashboard/assinatura', label: 'Assinatura', icon: CreditCard },
  { href: '/dashboard/perfil', label: 'Perfil', icon: UserRound },
  { href: '/dashboard/suporte', label: 'Suporte', icon: LifeBuoy },
];

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {LINKS.map((link) => {
        const active = link.href === '/dashboard' ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition',
              active ? 'bg-brand-500/15 text-white ring-1 ring-brand-400/25' : 'text-slate-400 hover:bg-white/5 hover:text-white',
            )}
          >
            <link.icon className={cn('h-4 w-4', active ? 'text-brand-300' : 'text-slate-500 group-hover:text-slate-300')} />
            <span className="flex-1">{link.label}</span>
            {link.badge ? (
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">{link.badge}</span>
            ) : null}
          </Link>
        );
      })}
      {isAdmin ? (
        <Link
          href="/admin"
          className="mt-3 flex items-center gap-2.5 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500/15"
        >
          <ShieldCheck className="h-4 w-4" /> Painel administrativo
        </Link>
      ) : null}
    </nav>
  );
}

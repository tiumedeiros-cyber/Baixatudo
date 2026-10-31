'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CreditCard,
  Download,
  FolderOpen,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/usuarios', label: 'Usuários', icon: Users },
  { href: '/admin/planos', label: 'Planos', icon: FolderOpen },
  { href: '/admin/pagamentos', label: 'Pagamentos', icon: CreditCard },
  { href: '/admin/biblioteca', label: 'Biblioteca', icon: BarChart3 },
  { href: '/admin/downloads', label: 'Downloads', icon: Download },
  { href: '/admin/configuracoes', label: 'Configurações', icon: Settings },
  { href: '/admin/logs', label: 'Logs & auditoria', icon: ScrollText },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {LINKS.map((l) => {
        const active = l.href === '/admin' ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition',
              active ? 'bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/25' : 'text-slate-400 hover:bg-white/5 hover:text-white',
            )}
          >
            <l.icon className="h-4 w-4" /> {l.label}
          </Link>
        );
      })}
      <Link href="/dashboard" className="mt-3 flex items-center gap-2.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">
        <ShieldCheck className="h-4 w-4" /> Área do cliente
      </Link>
    </nav>
  );
}

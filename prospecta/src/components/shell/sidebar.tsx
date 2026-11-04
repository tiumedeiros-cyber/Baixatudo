"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  Crosshair,
  Eye,
  Hammer,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageSquare,
  Settings,
  Smartphone,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { JKMark } from "@/components/brand/jk-mark";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; badge?: number };
type Group = { title: string; items: Item[] };

/** O menu em três blocos, na ordem em que o trabalho acontece: achar, falar, vender. */
const GROUPS: Group[] = [
  {
    title: "Prospecção",
    items: [
      { href: "/", label: "Comando", icon: LayoutDashboard },
      { href: "/cacador", label: "Caçador", icon: Crosshair },
      { href: "/funil", label: "Funil", icon: KanbanSquare },
      { href: "/fila", label: "Fila", icon: ListChecks },
      { href: "/conversas", label: "Conversas", icon: MessageSquare },
      { href: "/numeros", label: "Números", icon: Smartphone },
    ],
  },
  {
    title: "Vendas",
    items: [
      { href: "/demos", label: "Demos", icon: Eye },
      { href: "/producao", label: "Produção", icon: Hammer },
      { href: "/financeiro", label: "Financeiro", icon: Wallet },
    ],
  },
  {
    title: "Sistema",
    items: [{ href: "/agente", label: "Agente", icon: Brain }],
  },
];

export type AutomationPulse = { state: "on" | "paused" | "sim"; label: string };

const PULSE_STYLE: Record<AutomationPulse["state"], { dot: string; text: string; ring: string }> = {
  on: { dot: "text-accent pulse-sq", text: "text-accent", ring: "border-accent-line" },
  paused: { dot: "text-warn", text: "text-warn", ring: "border-warn/35" },
  sim: { dot: "text-info", text: "text-info", ring: "border-info/35" },
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname }: { item: Item; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 px-3 text-[13px] font-medium transition-colors",
        active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-1 hover:text-fg",
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-1.5 left-0 w-0.5 bg-accent transition-opacity", active ? "opacity-100" : "opacity-0")}
      />
      <Icon className={cn("size-4 shrink-0 transition-colors", active ? "text-accent" : "text-faint group-hover:text-muted")} aria-hidden />
      <span className="flex-1">{item.label}</span>
      {item.badge ? (
        <span
          className="num grid h-5 min-w-5 place-items-center bg-accent px-1 text-[11px] font-medium text-accent-ink"
          aria-label={`${item.badge} pendentes`}
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function Pulse({ pulse }: { pulse: AutomationPulse }) {
  const s = PULSE_STYLE[pulse.state];
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2.5 border bg-surface-1 px-3 py-2 transition-colors hover:bg-surface-2", s.ring)}
      title="Ver a automação no Comando"
    >
      <span aria-hidden className={cn("dot", s.dot)} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="label text-[9px] text-faint">Automação</span>
        <span className={cn("truncate text-[12px] font-medium", s.text)}>{pulse.label}</span>
      </span>
    </Link>
  );
}

export function Sidebar({
  email,
  demo,
  signOutAction,
  badges,
  pulse,
}: {
  email: string;
  demo: boolean;
  signOutAction: () => Promise<void>;
  /** Pendências por rota: rascunhos na Fila, conversas que precisam do dono em Conversas. */
  badges: Record<string, number>;
  pulse: AutomationPulse;
}) {
  const pathname = usePathname();
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.map((item) => ({ ...item, badge: badges[item.href] ?? 0 })) }));
  const flat = [...groups.flatMap((g) => g.items), { href: "/configuracoes", label: "Ajustes", icon: Settings, badge: 0 }];

  return (
    <>
      {/* Telas pequenas: barra superior com a navegação em linha */}
      <header className="sticky top-0 z-30 flex flex-col border-b border-line bg-bg/90 backdrop-blur lg:hidden">
        <div className="flex h-12 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <JKMark className="h-5 w-auto" title="JK" />
            <span className="label text-muted">Prospect X1</span>
          </Link>
          <span className="flex items-center gap-3">
            <span className={cn("label inline-flex items-center gap-1.5 text-[10px]", PULSE_STYLE[pulse.state].text)}>
              <span aria-hidden className={cn("dot", PULSE_STYLE[pulse.state].dot)} />
              {pulse.label}
            </span>
            {demo ? <span className="label text-warn">demo</span> : null}
          </span>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Principal">
          {flat.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "label h-8 shrink-0 px-3 leading-8",
                  active ? "bg-accent text-accent-ink" : "text-muted hover:text-fg",
                )}
              >
                {item.label}
                {item.badge ? <span className="num pl-1.5 text-[11px]">{item.badge}</span> : null}
              </Link>
            );
          })}
        </nav>
      </header>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-surface-0 lg:flex">
        <Link href="/" className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-5">
          <JKMark className="h-6 w-auto shrink-0" title="JK" />
          <span className="label leading-none text-muted">
            <span className="text-accent">/</span> Prospect X1
          </span>
        </Link>

        <div className="px-3 pt-4">
          <Pulse pulse={pulse} />
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-5" aria-label="Principal">
          {groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-0.5">
              <p className="label px-3 pb-1.5 text-[9px] text-faint">{group.title}</p>
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-1 border-t border-line p-2">
          <NavLink item={{ href: "/configuracoes", label: "Configurações", icon: Settings }} pathname={pathname} />
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              {demo ? <p className="label text-[9px] text-warn">Modo demonstração</p> : <p className="label text-[9px] text-faint">Dono</p>}
              <p className="truncate text-[12px] text-muted" title={email}>
                {demo ? "Dados fictícios em memória" : email}
              </p>
            </div>
            {demo ? null : (
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="grid size-8 place-items-center text-muted transition-colors hover:bg-surface-3 hover:text-fg"
                  aria-label="Sair"
                  title="Sair"
                >
                  <LogOut className="size-4" aria-hidden />
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

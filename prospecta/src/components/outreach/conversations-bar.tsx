import { Columns3, Inbox } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";

/** Os endereços do quadro e da caixa, mantendo o número escolhido no filtro (se houver). */
export function conversationViewItems(numero: string | null = null) {
  const q = numero ? `&numero=${numero}` : "";
  return [
    { value: "quadro", label: "Quadro", href: numero ? `/conversas?numero=${numero}` : "/conversas", icon: Columns3 },
    { value: "lista", label: "Caixa", href: `/conversas?vista=lista${q}`, icon: Inbox },
  ];
}

/** A barra de cima das Conversas: o título e a troca entre o quadro (quem precisa de quê) e a caixa de entrada (ler e responder). */
export function ConversationsBar({ view, numero = null }: { view: "quadro" | "lista"; numero?: string | null }) {
  return (
    <>
      <p className="label kicker hidden text-[11px] text-accent sm:inline-flex">05 — Conversas</p>
      <Segmented label="Forma de ver as conversas" value={view} items={conversationViewItems(numero)} />
    </>
  );
}

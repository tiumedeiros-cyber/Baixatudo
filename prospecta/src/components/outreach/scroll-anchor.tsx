"use client";

import { useEffect, useRef } from "react";

/** Quanto falta para o fim da conversa, em px, e ainda contar como "estou lendo o fim". */
const NEAR_END_PX = 120;

// Lembrados entre uma mensagem nova e outra (o componente é refeito a cada mensagem, pela `key`).
let lastConversation: string | null = null;
let atEnd = true;

/**
 * Fica no fim da conversa e traz esse ponto à vista quando a página abre ou chega mensagem nova. Use `key` com o id da
 * última mensagem: ao mudar, o componente é refeito e decide se rola. A rolagem acontece só dentro da coluna da conversa.
 *
 * Com a tela se atualizando sozinha, mensagem nova não pode puxar quem está lendo o começo da conversa: só rola se a conversa
 * acabou de abrir, se quem estava lendo já estava no fim, ou se a última mensagem é do dono (acabou de enviar).
 */
export function ScrollAnchor({ conversationId, own = false }: { conversationId: string; own?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.closest<HTMLElement>("[data-thread-scroll]");
    const opened = lastConversation !== conversationId;
    lastConversation = conversationId;
    if (opened || own || atEnd) {
      el.scrollIntoView({ block: "end" });
      atEnd = true;
    }
    if (!box) return;
    const onScroll = () => {
      atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_END_PX;
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, [conversationId, own]);
  return <div ref={ref} aria-hidden className="h-px" />;
}

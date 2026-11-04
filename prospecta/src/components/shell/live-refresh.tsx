"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 3_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Mantém a tela atualizada sem apertar F5. De poucos em poucos segundos pergunta ao servidor o "pulso" do painel (uma
 * assinatura curta de mensagens, recibos, conversas, leads, eventos e configurações) e só recarrega os dados da página quando
 * ele muda. O que está sendo digitado, a rolagem e as caixas abertas ficam como estão (é o `router.refresh()` do Next, que
 * troca só o que veio novo do servidor).
 *
 * Boas maneiras:
 *  - aba escondida não consulta; ao voltar, consulta na hora;
 *  - com o botão do mouse apertado (arrastando um cartão do funil) espera soltar, para não mexer na tela debaixo do dedo;
 *  - se o servidor falhar ou cair, espaça as consultas (até 30 s) em vez de insistir;
 *  - sessão encerrada (401): recarrega uma vez, e a página leva para o login.
 *
 * `initial` é o pulso de quando o servidor montou esta página: se algo mudou entre montar e abrir, já recarrega.
 */
export function LiveRefresh({ initial }: { initial: string | null }) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let known = initial;
    let failures = 0;
    let pointerDown = false;
    let controller: AbortController | undefined;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(poll, ms);
    };

    async function poll() {
      if (stopped || document.visibilityState !== "visible") return; // volta no visibilitychange
      clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch("/api/pulse", { cache: "no-store", signal: controller.signal });
        if (res.status === 401) {
          stopped = true;
          router.refresh();
          return;
        }
        if (!res.ok) throw new Error(`pulso ${res.status}`);
        const { v } = (await res.json()) as { v?: string };
        if (typeof v !== "string") throw new Error("pulso sem valor");
        failures = 0;
        if (known === null) known = v;
        else if (v !== known && !pointerDown) {
          known = v;
          router.refresh();
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        failures++;
      }
      schedule(Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS));
    }

    const wake = () => {
      if (document.visibilityState === "visible") void poll();
      else clearTimeout(timer);
    };
    const down = () => {
      pointerDown = true;
    };
    const up = () => {
      pointerDown = false;
    };

    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    void poll();

    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, [initial, router]);

  return null;
}

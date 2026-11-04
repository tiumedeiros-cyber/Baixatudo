/**
 * Uma abordagem pode sair em mais de uma mensagem, como uma pessoa escreve: um cumprimento curto, depois o assunto.
 * O texto guardado é um só e cada parágrafo (separado por uma linha em branco) vira uma mensagem no WhatsApp, em ordem,
 * com o "digitando…" de cada uma. Só vale para abordagem e follow-up; resposta a quem escreveu sai inteira.
 */

export const MAX_PARTS = 3;

/** As mensagens que o lead vai receber. Parágrafos além do terceiro entram juntos no último. */
export function splitMessageParts(body: string, max: number = MAX_PARTS): string[] {
  const parts = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= max) return parts.length > 0 ? parts : [body.trim()];
  return [...parts.slice(0, max - 1), parts.slice(max - 1).join("\n\n")];
}

/** Quantas mensagens o texto vira (para mostrar ao dono na Fila). */
export function countParts(body: string): number {
  return splitMessageParts(body).length;
}

/** Pausa entre uma mensagem e a seguinte, como quem termina de enviar e já escreve a próxima. */
export function betweenPartsMs(rng: () => number): number {
  return Math.round(700 + rng() * 1300);
}

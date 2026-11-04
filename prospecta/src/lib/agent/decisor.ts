import { parsePhoneBR } from "@/lib/brazil/phone";
import { norm } from "@/lib/utils";

/**
 * Quem decide. Quase toda pessoa que responde a uma clínica é a recepção ou a consultora ("Sou a Ju, recepcionista… a Dra. Joyce é
 * responsável pela divulgação"), e o que fecha venda é o contato de quem decide. Aqui sai do que a recepção escreveu: o nome (com
 * o título), o celular, o melhor horário e quem passou a informação. Tudo inferido do texto, sem coluna nova: é a mesma ideia da
 * ficha, e o que não aparece fica nulo.
 */

export interface Decisor {
  /** Quem decide, com o título ("Dra. Joyce"); nulo se só passaram o telefone. */
  name: string | null;
  /** Como falar dessa pessoa: "ela", "ele", ou nulo quando o título não diz. */
  pronoun: "ela" | "ele" | null;
  /** O celular dela, no formato internacional, se passaram. */
  phone: string | null;
  /** O mesmo celular, para ler: (85) 99123-4567. */
  phoneDisplay: string | null;
  /** Quando falar com ela ("amanhã de manhã", "depois das 14h"). */
  when: string | null;
  /** Quem passou a informação, como se apresentou ("Ju, recepcionista"); nulo se não se identificou. */
  via: string | null;
  /** Só o primeiro nome de quem passou, para agradecer ("Ju"). */
  viaName: string | null;
  /** Quem passou se apresentou com um cargo de atendimento (recepcionista, secretária, consultora…). */
  staff: boolean;
}

const NOT_NAMES = new Set(["dra", "dr", "doutora", "doutor", "dona", "instagram", "whatsapp", "google", "clinica", "consultorio", "odonto", "bom", "boa", "dia", "tarde", "noite", "obrigado", "obrigada"]);

const TITLE_NAME = /\b(Dra?|Doutora?|Doutor|Dona|Sra?|Seu)\.?\s*([\p{Lu}][\p{L}]{2,})/u;
/** O próprio lead se apresentando com o título ("Sou a Dra. Joyce"): não é outra pessoa, é quem decide falando. */
const SELF_TITLE = /\b(?:[Ss]ou|[Ee]u sou|[Mm]eu nome [ée]|[Mm]e chamo)\s+(?:a |o )?(?:Dra?|Doutora?|Doutor)\.?\s*\p{Lu}\p{L}+/gu;
const PLAIN_NAME = [
  /\b(?:respons[áa]vel|dono|dona|propriet[áa]ri[oa]|gerente|diretor[a]?|quem (?:cuida|decide|resolve)(?: disso)?)\s*(?:[ée]|eh|:|-)\s*(?:o |a )?([\p{Lu}][\p{L}]{2,})/u,
  /\b[Ff]al(?:a|e|ar) com (?:a |o )?([\p{Lu}][\p{L}]{2,})/u,
];
const SPEAKER = /\b(?:[Ss]ou|[Mm]e chamo|[Mm]eu nome [ée]|[Aa]qui [ée])\s+(?:a |o )?(\p{Lu}[\p{L}]{1,})\b(?:\s*,?\s*(?:a |o |uma |um )?(recepcionista|secret[áa]ria|atendente|auxiliar|assistente|consultora?|gerente))?/u;
const WHEN =
  /\b(?:amanh[ãa]|hoje|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)(?:[- ]feira)?(?:\s+(?:de\s+)?(?:manh[ãa]|tarde|noite))?|\b(?:de|pela|[àa])\s+(?:manh[ãa]|tarde|noite)(?![\p{L}])|\b(?:depois|antes)\s+d(?:as|o)\s+\d{1,2}(?:h|:\d{2}| horas?)?|\b[àa]s\s+\d{1,2}(?:h|:\d{2})?\b|\bhor[áa]rio comercial\b/gu;
const PHONE_LIKE = /\+?\d[\d\s().-]{8,16}\d/g;

function cleanTitle(raw: string): { title: string; pronoun: "ela" | "ele" | null } {
  const t = norm(raw).replace(/\./g, "");
  if (t === "dra" || t === "doutora") return { title: "Dra.", pronoun: "ela" };
  if (t === "dr" || t === "doutor") return { title: "Dr.", pronoun: "ele" };
  if (t === "dona") return { title: "Dona", pronoun: "ela" };
  if (t === "sra") return { title: "Sra.", pronoun: "ela" };
  if (t === "sr") return { title: "Sr.", pronoun: "ele" };
  return { title: "Seu", pronoun: "ele" };
}

/** O que UMA mensagem diz sobre quem decide. Campos vazios ficam nulos. */
export function decisorFromText(text: string | null | undefined): Partial<Decisor> {
  const raw = (text ?? "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (!raw) return {};
  const out: Partial<Decisor> = {};

  const speaker = SPEAKER.exec(raw);
  if (speaker && !NOT_NAMES.has(norm(speaker[1]))) {
    out.viaName = speaker[1];
    out.staff = !!speaker[2];
    out.via = speaker[2] ? `${speaker[1]}, ${speaker[2].toLowerCase()}` : speaker[1];
  }

  // o título de quem está escrevendo ("Sou a Dra. Joyce") não é "outra pessoa que decide"
  const others = raw.replace(SELF_TITLE, " ");
  const titled = TITLE_NAME.exec(others);
  if (titled && !NOT_NAMES.has(norm(titled[2]))) {
    const t = cleanTitle(titled[1]);
    out.name = `${t.title} ${titled[2]}`;
    out.pronoun = t.pronoun;
  } else {
    for (const re of PLAIN_NAME) {
      const m = re.exec(others);
      if (m && !NOT_NAMES.has(norm(m[1])) && m[1] !== out.viaName) {
        out.name = m[1];
        out.pronoun = null;
        break;
      }
    }
  }

  for (const m of raw.matchAll(PHONE_LIKE)) {
    const p = parsePhoneBR(m[0]);
    if (p.e164 && p.isMobile) {
      out.phone = p.e164;
      out.phoneDisplay = p.display;
      break;
    }
  }

  const when = [...new Set([...raw.toLowerCase().matchAll(WHEN)].map((m) => m[0].trim()))].slice(0, 2);
  if (when.length > 0) out.when = when.join(", ");
  return out;
}

/** Junta o que a conversa toda diz (o que vem depois vale mais): o nome numa mensagem, o telefone em outra. Nulo se não há nada. */
export function decisorFromTexts(texts: (string | null | undefined)[]): Decisor | null {
  const d: Decisor = { name: null, pronoun: null, phone: null, phoneDisplay: null, when: null, via: null, viaName: null, staff: false };
  for (const t of texts) {
    const p = decisorFromText(t);
    if (p.name) {
      d.name = p.name;
      d.pronoun = p.pronoun ?? null;
    }
    if (p.phone) {
      d.phone = p.phone;
      d.phoneDisplay = p.phoneDisplay ?? null;
    }
    if (p.when) d.when = p.when;
    if (p.via) {
      d.via = p.via;
      d.viaName = p.viaName ?? null;
      d.staff = d.staff || !!p.staff;
    }
  }
  return d.name || d.phone || d.viaName ? d : null;
}

/** "da Dra. Joyce", "do Dr. Giovanni", "dela" quando não há nome. */
export function ofDecisor(d: Pick<Decisor, "name" | "pronoun">): string {
  if (!d.name) return d.pronoun === "ele" ? "dele" : "dela";
  return `${d.pronoun === "ele" ? "do" : "da"} ${d.name}`;
}


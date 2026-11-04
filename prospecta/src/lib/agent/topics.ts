import { norm } from "@/lib/utils";
import { classifyReply, SOFT_SITE_OBJECTION, type InboundMedia } from "@/lib/outreach/classify";
import type { AgentFlow } from "@/lib/leads/types";
import type { Product, Topic } from "./types";

/**
 * Entende o assunto da mensagem do lead. Sem IA: expressões sobre o texto sem acento e em minúsculas,
 * em ordem de prioridade (a primeira que casa é o assunto principal). Quando a mensagem tem mais de um
 * assunto ("quanto custa e quanto tempo demora?") todos voltam, na ordem de prioridade.
 *
 * Cada expressão nasceu de uma resposta real de dono de negócio no WhatsApp; os casos estão em
 * `topics.test.ts` e em `scenarios.ts`.
 */

/** Palavras de quem quer algo além de um site: sistema, aplicativo, loja online, painel, agendamento online. */
const SYSTEM_WORDS = new RegExp(
  [
    String.raw`\b(sistema|sistemas|aplicativo|app|plataforma|e-?commerce|loja virtual|loja online|agendamento online|painel administrativo|area do cliente|controle de estoque|crm|erp)\b`,
    // a dor de quem precisa de um sistema sem saber o nome: organizar o atendimento, a agenda, os clientes; controlar e gerenciar; prontuário
    // e cadastro; lembrete de consulta. "Gestão das redes sociais" e "mais agendamentos" (objetivo de um site) NÃO entram.
    String.raw`\b(organiz\w+ (?:melhor )?(?:o |a |os |as )?(?:atendimento|agenda|agendamentos|clientes|pacientes|empresa|negocio|clinica|consultorio|equipe|financeiro|rotina)|desorganiz\w+|gest[aã]o(?! d[aeo]s? (?:redes|trafego|instagram|midias?|perfil|marketing))|gerenciar|gerenciamento|controle (?:d[eao]s? )?(?:clientes|pacientes|agenda|financeiro|caixa|consultas|pedidos)|prontuario|cadastro d[eao]s? (?:clientes|pacientes)|lembretes? d[eao]s? consultas?|confirmacao d[eao]s? consultas?)`,
  ].join("|"),
);
/** Quem quer um robô, atendimento automático ou algo que "se faça sozinho": valor sob medida, como o sistema. */
const AUTOMATION_WORDS =
  /\b(automacao|automacoes|automatizar|automatizado|automatizada|automatico|automatica|robo|robos|bot|bots|chatbot|chat bot|assistente virtual|atendente virtual|atendimento automatico|agente de ia|inteligencia artificial|chatgpt)\b/;
/** Sistema e automação juntos: o que o dono orça sob medida. */
const CUSTOM_WORDS = new RegExp(`${SYSTEM_WORDS.source}|${AUTOMATION_WORDS.source}`);
const SITE_WORDS = /\b(site|sites|landing|pagina|paginas|institucional)\b/;
const OWNS_ALREADY = /\bja (tenho|temos)\b/;

/**
 * O que o lead quer comprar, só pelo texto dele. "Sistema" vence se ele falou de mais de uma coisa, depois "automação". Quem diz que "já tem" algo
 * não conta: está falando do que tem, não do que quer.
 */
export function detectProduct(text: string | null | undefined): Product | null {
  const n = norm(text ?? "");
  if (!n || OWNS_ALREADY.test(n)) return null;
  if (SYSTEM_WORDS.test(n)) return "sistema";
  if (AUTOMATION_WORDS.test(n)) return "automacao";
  // quem diz "não preciso de site" está dizendo o que NÃO quer: não é um pedido de site
  if (SOFT_SITE_OBJECTION.test(n)) return null;
  if (SITE_WORDS.test(n)) return "site";
  return null;
}

const RULES: [Topic, RegExp][] = [
  [
    "abusive",
    /\b(porra|caralho|merda|idiota|otario|lixo|golpe|golpista|fraude|picaret\w+|procon|policia|delegacia|advogado|processar)\b/,
  ],
  [
    "source_of_contact",
    /\b(onde|como|quem)\b.{0,28}\b(conseguiu|conseguiram|pegou|pegaram|achou|acharam|passou|deu|tem)\b.{0,16}\b(numero|contato|telefone|whats\w*)\b/,
  ],
  [
    "who",
    /\b(quem (e|eh|esta|ta|fala|falando|ai|sao voces|sao vcs|e voce|e vc)|com quem (falo|eu falo|estou falando)|de onde (voce|vc|e|eh|fala|falam|voces)|qual (e )?(a )?(sua )?empresa|que empresa)\b/,
  ],
  // depois do Pix: "já paguei", "pix feito", "segue o comprovante". Vem antes de "payment", que também casa com "pix".
  [
    "paid",
    /\b(ja (paguei|transferi|depositei)|paguei|depositei|transferi|acabei de (pagar|transferir)|acabei de (fazer|enviar|mandar) (o |a |um |uma )?(pix|sinal|pagamento|transferencia|deposito|comprovante)|(ja )?(fiz|realizei|efetuei|mandei|enviei) (o |a |um |uma )?(pix|sinal|pagamento|transferencia|deposito|comprovante)|pix (feito|enviado|realizado|efetuado|pago|na conta)|pagamento (feito|realizado|efetuado|enviado)|transferencia (feita|realizada|enviada)|segue o comprovante|comprovante)\b/,
  ],
  // cobrança de andamento: "cadê o site?", "vai resolver meu pedido ou não?", "alguma novidade?". Específico de propósito:
  // "cadê o meet" é conversa solta, "como faço o pedido" é dúvida de quem ainda vai comprar.
  [
    "status_check",
    /\b(cade (o|a|meu|minha) (site|pedido|proposta|resposta|retorno|previa|chave|pix|link do (site|pix)|projeto)|alguma (novidade|noticia|posicao|resposta|atualizacao)|novidades?\??$|vai (me )?(resolver|responder|fazer|entregar)\b.{0,30}\b(pedido|site|isso|ou nao)|como (esta|ta|anda) (o |a )?(meu |minha )?(pedido|site|projeto|andamento)|(meu|o) (pedido|site|projeto) (ja )?(ficou|saiu|foi feito)|ja (esta|ta|ficou) (pronto|feito)|(esta|ta) demorando|(estou|to|tou) (esperando|aguardando)( (ha|faz) [^.?!]{0,20})?[?.!\s]*$|(esperando|aguardando) (a |o |sua |seu |um |uma )?(resposta|retorno|chave|pix|proposta|previa|site|pedido)|ainda (nao|n) (recebi|chegou|veio|tive)|e ai\b.{0,20}\b(novidade|noticia|vai|sai|resolv\w+))/,
  ],
  ["price", /\b(quanto(?! tempo)|valor|valores|preco|precos|orcamento|custa|custo|cobra|cobram|investimento|tabela)\b|r\$/],
  [
    "too_expensive",
    /\b(caro|muito caro|salgado|nao tenho (dinheiro|grana|condicoes)|sem dinheiro|fora do (meu )?orcamento|apertad[oa]|nao cabe no (meu )?bolso)\b/,
  ],
  [
    "guarantee",
    /\b(garantia|garante|garantido|e se eu nao gostar|nao gostar|reembolso|devolu\w+|contrato|nota fiscal|cnpj|nfe?)\b/,
  ],
  [
    "domain_hosting",
    /\b(dominio|hospedagem|hosting|servidor|manutencao|mensalidade|renovac\w+|anual|todo mes)\b/,
  ],
  ["payment", /\b(pix|parcel\w+|cartao|boleto|forma de pagamento|formas de pagamento|como (eu )?pago|pagamento|sinal|entrada|a vista)\b/],
  ["timeline", /\b(prazo|quanto tempo|demora|demorado|leva quanto|em quantos dias|quando fica pronto|fica pronto|pra quando|para quando)\b/],
  [
    "how_works",
    /\b(como (funciona|e|eh|seria|fica|vai ser|faz)|o que (e|eh) (isso|isso ai)|o que (voce|vc|voces|vcs) (faz|fazem)|do que se trata|sobre o que|qual (e )?o assunto|o que (voce|vc) quer comigo|me explica|explica (melhor|isso)|pode explicar|qual (o )?servico|que servico|nao entendi|(voce|vc|voces|vcs) (cria|criam|faz|fazem|desenvolve|desenvolvem|monta|montam) (um |uns )?(site|sites|pagina|paginas)|trabalha(m)? com (site|sites))\b/,
  ],
  [
    "send_info",
    // inclui "portifolio" (erro comum), "mostrar um pouco do seu trabalho" e "link do seu trabalho": o lead pede para ver o que você já fez
    /\b(manda(r)? (por )?e-?mail|me manda (mais )?(informac\w+|detalhes|portf\w*|exemplos)|manda (mais )?(informac\w+|detalhes|portf\w*|exemplos)|tem (portf\w*|exemplos?)|portf\w*|exemplos? de (site|sites|trabalho)|ja fez|trabalhos anteriores|(mostr\w+|ver|conhecer|olhar|enviar|envie|manda\w*|passa\w*) [^.?!]{0,45}\b(seus?|teus?) (trabalhos?|projetos?)|link d[oa]s? (seus?|teus?)? ?(trabalhos?|projetos?|site)|trabalhos? (que )?(voce |vc )?(ja )?(fez|fizeram|realizou)|sites? que (voce |vc )?(ja )?(fez|criou))\b/,
  ],
  [
    "has_site",
    /\b(ja (tenho|temos) (um |uma )?(site|pagina|loja virtual)|tenho (um |uma )?site|meu site|nosso site|temos (um |uma )?site|site (ta|esta) (no ar|pronto|funcionando)|www\.[a-z0-9]|(?<![@a-z0-9-])[a-z0-9][a-z0-9-]{2,}\.(com|net|org|app|site|online|med|adv|dev)(\.br)?\b)/,
  ],
  [
    "has_provider",
    /\b(ja tenho (um |uma )?(empresa|pessoa|programador|designer|agencia|freelancer|responsavel)|tenho (um |uma )?(programador|designer|agencia|sobrinho|primo|amigo|conhecido)|quem (faz|cuida) (do |dos )?(meu|nosso|nossa)|ja tem (quem|alguem) (faz|cuida))\b/,
  ],
  [
    "gatekeeper",
    // sem "eu sou o responsável pelo marketing": quem diz isso é quem decide, não a recepção. Cobre também "Sou a Ju, recepcionista…",
    // "Me chamo Letícia, consultora…" e "a Dra. Joyce fica responsável pela divulgação".
    /^(?!.*(?<!nao )\b(?:eu )?sou (?:a |o )?(?:dono|dona|responsavel|proprietari[oa])\b).*\b(sou (a |o )?(atendente|recepcionista|secretaria|funcionari[oa]|auxiliar|assistente)|(?:sou|me chamo|meu nome e) (?:a |o )?[a-z]{2,}\W{0,3}(?:a |o |uma |um )?(?:recepcionista|secretaria|atendente|auxiliar|assistente|consultora?)|(a|o) (dona|dono|responsavel|gerente|proprietari[oa]|doutora?) (nao esta|nao ta|esta (em|numa|no|viajando|atendendo)|ta (em|numa|no)|so volta)|vou (repassar|passar|encaminhar)|falar com (a|o) (dona|dono|responsavel|gerente|proprietari[oa]|dra?|doutora?|doutor)|quem decide|nao sou (a |o )?(dona|dono|responsavel|proprietari[oa])|(?:fica|ficar|ficam|e|eh|sao) responsave\w+ (?:pel[oa]s? |por )?(?:divulgacao|marketing|redes sociais|instagram|site|publicidade|propaganda)|(?:quem cuida|cuida|cuidam) d[aoe]s? (?:divulgacao|marketing|redes sociais|instagram|site|publicidade|propaganda) (?:e|eh|sao) |(?:divulgacao|marketing|redes sociais|instagram|publicidade|propaganda)\W{0,3}(?:quem )?(?:cuida|decide|resolve) (?:e|eh) )/,
  ],
  // sistema: tem back-end, cadastro, painel ou pagamento; o valor depende do que ele precisa fazer, então é do dono
  ["system_request", CUSTOM_WORDS],
  ["wants_preview", /\b(previa|previas|prototipo|demonstracao|amostra|mockup|como ficaria|como ficar|ver como fica|ver antes|me mostra como|me mostre como)\b/],
  // "não preciso de site", "já tenho Instagram": antes de "wants_site", que casaria com o "preciso ... site" da própria negação
  ["no_need_site", SOFT_SITE_OBJECTION],
  [
    "wants_site",
    /\b(quero|preciso|queria|gostaria|tenho interesse|me interessa|pretendo)\b.{0,30}\b(site|landing|pagina)\b|\b(criar|montar|ter|fazer) (um|uma|o|meu|nosso) (site|landing|pagina)\b/,
  ],
  ["change_request", /\b(mudar|trocar|alterar|ajustar|a cor|as cores|o logo|a logo|a foto|as fotos|o texto|o titulo|melhorar isso)\b/],
  [
    "compliment",
    /\b(gostei|ficou (muito )?(bom|bonito|lindo|legal|top|show|otimo|perfeito)|achei (muito )?(bom|bonito|lindo|legal|top|otimo)|adorei|amei|curti|muito bom|parabens|esta (otimo|lindo|bonito))\b/,
  ],
  // "agora não" vem antes de "sem tempo": quem adia não quer ouvir que a prévia sai sem esforço
  [
    "not_now",
    /\b(agora nao|no momento nao|talvez depois|mais pra frente|mais para frente|depois (eu )?(vejo|te falo|falo|chamo|te chamo|entro em contato)|outra hora|semana que vem|mes que vem|mais tarde)\b/,
  ],
  ["busy", /\b(sem tempo|(estou|to|ta) (muito )?corrid[oa]|correria|ocupad[oa]|em atendimento|atendendo agora)\b/],
  [
    "think",
    /\b(vou pensar|vou ver|deixa eu (ver|pensar|analisar)|preciso pensar|vou analisar|vou conversar|conversar com (meu|minha)|falar com (meu|minha) (socio|socia|marido|esposa|mulher|parceiro|parceira)|ver com (meu|minha))\b/,
  ],
];

/**
 * Só cumprimento: "oi", "bom dia", "oi bom dia", "olá, bom dia, tudo bem?", "bom dia Jonathan". Aceita uma palavra de fora (o nome de
 * quem escreve ou de quem lê) e nada além disso. "oi bom dia" não casava com o modelo antigo, caía em "outro assunto" e a IA
 * escrevia uma apresentação solta, por cima da que as regras mandam.
 */
const SALUTE = /\b(oi+|ola|opa|eae|e ai|salve|fala|bom dia|boa tarde|boa noite|tudo bem|td bem|tudo bom|como vai)\b/;
const SALUTE_WORDS = new Set(["oi", "ola", "opa", "eae", "ai", "e", "salve", "fala", "bom", "boa", "dia", "tarde", "noite", "tudo", "td", "bem", "com", "voce", "vc", "contigo"]);
function isSalutation(p: string): boolean {
  if (!SALUTE.test(p)) return false;
  const tokens = p.replace(/\bcomo vai\b/g, "oi").split(" ").filter(Boolean);
  if (tokens.length > 7) return false;
  const outside = tokens.filter((t) => !SALUTE_WORDS.has(t) && !/^oi+$/.test(t));
  return outside.length <= 1;
}
/**
 * Quem atende a abertura curta ("Bom dia, Dra. X! Aqui é o Jonathan. Posso te fazer uma pergunta rápida?"): "pois não?", "pode falar",
 * "sim, sou eu", "em que posso ajudar?", "diga". A pessoa está ouvindo e ainda não disse nada do assunto: vale como um cumprimento
 * (e o agente responde se apresentando).
 */
const READY =
  /^((sim|oi+|ola|opa|bom dia|boa tarde|boa noite) )*(pois nao|pode (me )?(falar|perguntar|dizer)|diga|fala|sou eu|sou eu mesm[oa]|eu mesm[oa]|ela mesma|ele mesmo|(em que|como) (eu )?posso (te |lhe )?(ajudar|ser util)|o que (voce )?(deseja|precisa|gostaria)|pode mandar a pergunta|manda a pergunta)( (sim|por favor|pfv))?$/;
const THANKS = /^(ok|okay|blz|beleza|certo|ta bom|ta|tudo certo|entendi|obrigad[oa]|valeu|show|top|massa|joia|perfeito)( obrigad[oa])?$/;
/**
 * "Me passe, por gentileza", "pode mandar", "manda aí": o pedido sem objeto, que só faz sentido como resposta ao "Posso te passar o
 * Pix?". Vale como um "sim". Com objeto ("me manda o portfólio") não casa e segue pelas regras de sempre.
 */
const BARE_GIVE =
  /^(ok |sim |certo |entao |claro |pode )?(me )?(pass(a|e|ar)|mand(a|e|ar)|envi(a|e|ar)|encaminh(a|e|ar))( (isso|ai|aqui|pra mim|para mim))?( (por favor|por gentileza|pfv|pf|por obsequio))?$/;
/** Só emoji de "ok" ou de agradecimento: vale como um "ok". Qualquer outro emoji sozinho é conversa solta. */
const POSITIVE_EMOJI = /^[\s👍👌🙏👏😊🙂😀😁😄😃🤝✅❤️💙💚💪🔥👋]+$/u;
/** Risada: sozinha ou com um "boa" é conversa solta, mas "kkk pode sim" continua sendo um sim. */
const LAUGHTER = /\b(k{3,}|(ha|he|hi|rs){2,}h?)\b/;
/**
 * Reunião e "estou chegando": o agente não decide horário nem link, e prometer "vou confirmar o link" foi o que a IA inventou
 * numa conversa real. Quem responde é o dono, mesmo que a frase também pareça um "sim" ("me manda o link da reunião").
 */
const MEETING = /\b(meet|zoom|reuniao|videochamada|chamada de video|link da (call|chamada)|(tou|to|estou) (la|chegando|indo|online|aqui)|ja (cheguei|estou indo|to indo)|cheguei)\b/;
/**
 * Links de rede social, mensagem e mapa não são "o site deles": o Instagram do negócio aparece em toda saudação automática
 * e em toda bio. Sem isto, "instagram.com/clinica" caía em "já tenho site" e o agente pedia o endereço de um site que não existe.
 */
const SOCIAL_LINK =
  /(?<![a-z0-9-])(https?:\/\/)?([a-z0-9-]+\.)*(instagram|facebook|fb|whatsapp|wa|linktr|linktree|youtube|youtu|tiktok|twitter|google|goo|maps|bit|beacons)\.(com|me|ee|be|gl|ly)(\.br)?(\/[^\s]*)?/g;

/** Texto limpo para comparar frase inteira ("ok", "bom dia"). */
function plain(text: string): string {
  return norm(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * No fluxo antigo (com prévia) os três assuntos novos não existem: "quero ver a prévia" e "quero um site" são o mesmo
 * "pode" de sempre, e "sistema" é assunto fora do roteiro. Assim o fluxo antigo continua exatamente como era.
 */
const LEGACY: Partial<Record<Topic, Topic>> = { wants_preview: "yes", wants_site: "yes", system_request: "other", no_need_site: "not_interested" };

/** Todos os assuntos da mensagem, do mais importante para o menos. Nunca volta vazio. */
export function detectTopics(text: string | null | undefined, media: InboundMedia | null = null, flow: AgentFlow = "previa"): Topic[] {
  const found = detectRaw(text, media);
  if (flow === "qualificar") return found;
  const mapped = found.map((t) => LEGACY[t] ?? t);
  const unique = [...new Set(mapped)];
  // "other" só vale sozinho: se a mensagem tem outro assunto, ele conta
  return unique.length > 1 ? unique.filter((t) => t !== "other") : unique;
}

function detectRaw(text: string | null | undefined, media: InboundMedia | null): Topic[] {
  const c = classifyReply(text, media);
  if (c.optout) return ["optout"];
  if (media === "audio") return ["audio"];

  // sem e-mail ("contato@clinica.com" não é o site) nem link de rede social
  const n = norm(text ?? "").replace(/\S+@\S+/g, " ").replace(SOCIAL_LINK, " ");
  const p = plain(text ?? "");
  if (!p) {
    if (media) return ["media"];
    // só emoji: "👍" é um ok; o resto (😂, 😡) o agente não interpreta, é do dono
    return /\p{Extended_Pictographic}/u.test(text ?? "") ? [POSITIVE_EMOJI.test(text ?? "") ? "thanks" : "casual"] : ["other"];
  }

  const found: Topic[] = [];
  for (const [topic, re] of RULES) if (re.test(n)) found.push(topic);
  // quem nega o site não está pedindo um ("não preciso de site" também casa com "preciso ... site")
  if (found.includes("no_need_site")) {
    const wants = found.indexOf("wants_site");
    if (wants >= 0) found.splice(wants, 1);
  }

  if (c.intent === "not_interested") {
    // "não quero, já tenho site" é recusa; "não quero pagar caro" é objeção de preço e segue como preço
    const objection = found.some((t) => ["price", "too_expensive", "how_works", "timeline", "payment", "guarantee"].includes(t));
    if (objection) found.push("not_interested");
    else found.splice(found[0] === "abusive" ? 1 : 0, 0, "not_interested");
  } else if (c.intent === "interested") found.push("yes");

  // reunião e "tô chegando" são do dono, mesmo quando a frase também soa como um "sim" (nunca quando fala de preço, prazo...)
  if (MEETING.test(n) && found.every((t) => t === "yes")) return ["casual"];
  if (found.length === 0) {
    if (isSalutation(p) || READY.test(p)) return ["greeting"];
    if (THANKS.test(p)) return ["thanks"];
    if (BARE_GIVE.test(p)) return ["yes"];
    if (LAUGHTER.test(n)) return ["casual"];
  }
  return found.length > 0 ? found : ["other"];
}

/** Assuntos que o agente nunca entrega à IA: a resposta certa é fixa e conferida. */
export const DETERMINISTIC_TOPICS: readonly Topic[] = ["optout", "abusive", "audio", "media", "thanks", "greeting", "not_interested", "no_need_site", "gatekeeper", "casual", "paid"];

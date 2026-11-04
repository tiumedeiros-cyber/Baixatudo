import type { SimulationInput } from "./context";
import type { DiscoveryId, NextActionKind, Topic } from "./types";

/**
 * O gabarito do agente: respostas reais de donos de negócio no WhatsApp e o que um bom vendedor faz com
 * cada uma. Serve a três coisas:
 * 1. teste automático (`agent.test.ts`): toda mudança nas regras precisa continuar acertando estes casos;
 * 2. vitrine na tela "Agente": mostra o que ele sabe responder, ao vivo, com o texto que ele escreveria;
 * 3. avaliação da IA (`eval.live.test.ts`): a mesma lista roda contra o modelo para medir quantas respostas
 *    passam na trava e quanto elas se afastam das regras.
 * Para treinar o agente em algo novo, acrescente um caso aqui.
 */

export interface Scenario {
  id: string;
  /** O que o lead escreveu. */
  text: string | null;
  media?: SimulationInput["media"];
  setup?: Omit<SimulationInput, "text" | "media">;
  expect: {
    topic: Topic;
    /** Sem rascunho: o dono escreve. */
    silent?: boolean;
    handoff?: boolean;
    include?: RegExp[];
    exclude?: RegExp[];
    /** Tamanho máximo da resposta (260 por padrão). A solução do site é a única que passa disso, sempre abaixo do limite duro de 360. */
    maxChars?: number;
    /** O que o aviso ao dono (handoff.reason) precisa conter. */
    reason?: RegExp[];
    asked?: DiscoveryId;
    action?: NextActionKind;
  };
}

const DEMO = "https://painel.exemplo.com.br/p/abcdefghij0123456789";
const OBJETIVO_ASKED = [
  { from: "us" as const, text: "Oi! Aqui é o Jonathan, da Kelvin Studio." },
  { from: "lead" as const, text: "pode sim" },
  { from: "us" as const, text: "Perfeito! Vou montar a prévia.", variant: "agente:q-objetivo" },
];
const AFTER_DEMO = [
  { from: "us" as const, text: "Oi! Aqui é o Jonathan, da Kelvin Studio." },
  { from: "lead" as const, text: "pode sim" },
  { from: "us" as const, text: `Pronto! Montei uma prévia do site: ${DEMO}` },
];

export const SCENARIOS: Scenario[] = [
  // primeiros contatos
  { id: "oi", text: "Oi", expect: { topic: "greeting", include: [/prévia/] } },
  { id: "bom-dia", text: "Bom dia, tudo bem?", expect: { topic: "greeting", include: [/prévia/] } },
  { id: "quem-e", text: "Quem é você?", expect: { topic: "who", include: [/Kelvin Studio/, /prévia/] } },
  { id: "de-onde", text: "De onde você fala?", expect: { topic: "who", include: [/Kelvin Studio/] } },
  {
    id: "quem-e-site-fraco",
    text: "quem fala?",
    setup: { websiteKind: "weak" },
    expect: { topic: "who", include: [/vi o site/i], exclude: [/não achei um site/] },
  },
  {
    id: "onde-pegou-numero",
    text: "Onde você conseguiu meu número?",
    expect: { topic: "source_of_contact", include: [/Google/, /PARE/] },
  },

  // interesse
  {
    id: "pode-sim",
    text: "Pode sim",
    expect: { topic: "yes", asked: "objetivo", action: "gerar_previa", include: [/prévia/, /\?/] },
  },
  { id: "quero-ver", text: "Quero ver", expect: { topic: "yes", asked: "objetivo", action: "gerar_previa" } },
  {
    id: "pode-mandar-com-link",
    text: "pode mandar",
    setup: { demoUrl: DEMO },
    expect: { topic: "yes", include: [new RegExp(DEMO.replace(/[.]/g, "\\."))] },
  },
  {
    id: "sim-depois-da-pergunta",
    text: "sim",
    setup: { history: OBJETIVO_ASKED },
    expect: { topic: "yes", exclude: [/\?/], action: "gerar_previa" },
  },
  {
    id: "resposta-do-objetivo",
    text: "Quero mostrar meus serviços e atrair mais clientes do Google",
    setup: { history: OBJETIVO_ASKED },
    expect: { topic: "answer", include: [/Anotado/], action: "gerar_previa" },
  },

  // perguntas de venda
  {
    id: "preco",
    text: "Quanto custa?",
    expect: { topic: "price", handoff: true, include: [/R\$\s?800/, /prévia/], exclude: [/garant/i] },
  },
  { id: "valor", text: "qual o valor do site", expect: { topic: "price", include: [/R\$\s?800/] } },
  {
    id: "preco-e-prazo",
    text: "Quanto custa e quanto tempo demora?",
    expect: { topic: "price", include: [/R\$\s?800/, /7 dias/] },
  },
  { id: "prazo", text: "Quanto tempo demora?", expect: { topic: "timeline", include: [/7 dias/] } },
  { id: "como-funciona", text: "Como funciona?", expect: { topic: "how_works", include: [/prévia/, /sem custo/] } },
  { id: "o-que-faz", text: "o que vocês fazem?", expect: { topic: "how_works", include: [/prévia/] } },
  {
    id: "achou-caro",
    text: "Achei caro",
    expect: { topic: "too_expensive", handoff: true, include: [/não tem custo/], exclude: [/desconto/i] },
  },
  {
    id: "nao-quero-pagar-caro",
    text: "não quero pagar caro",
    expect: { topic: "too_expensive", exclude: [/Tudo bem, obrigado/] },
  },
  { id: "como-pago", text: "Como eu pago?", expect: { topic: "payment", include: [/Pix/, /50%/] } },
  {
    id: "parcelar",
    text: "Dá pra parcelar no cartão?",
    expect: { topic: "payment", handoff: true, exclude: [/R\$/] },
  },
  { id: "garantia", text: "Tem garantia?", expect: { topic: "guarantee", handoff: true, exclude: [/garanti/i] } },
  {
    id: "dominio",
    text: "Precisa pagar domínio e hospedagem?",
    expect: { topic: "domain_hosting", handoff: true, exclude: [/R\$/, /grátis|gratuito/i] },
  },
  { id: "mensalidade", text: "Tem mensalidade?", expect: { topic: "domain_hosting", handoff: true } },
  {
    id: "exemplos",
    text: "Tem exemplos de sites que você fez?",
    expect: { topic: "send_info", handoff: true, action: "enviar_exemplos" },
  },
  { id: "email", text: "Manda por email", expect: { topic: "send_info", handoff: true } },

  // objeções e adiamentos
  {
    id: "ja-tenho-site-nao-achamos",
    text: "Já tenho site",
    expect: { topic: "has_site", handoff: true, include: [/endereço/] },
  },
  {
    id: "ja-tenho-site-fraco",
    text: "já tenho site sim",
    setup: { websiteKind: "weak" },
    expect: { topic: "has_site", include: [/vi o site/i, /prévia/] },
  },
  {
    id: "ja-tenho-programador",
    text: "Já tenho um programador que cuida disso",
    expect: { topic: "has_provider", exclude: [/\?/, /prévia/] },
  },
  { id: "vou-pensar", text: "Vou pensar", expect: { topic: "think", include: [/sem pressa/, /prévia/] } },
  { id: "falar-com-marido", text: "Vou falar com meu marido", expect: { topic: "think" } },
  { id: "agora-nao", text: "Agora não", expect: { topic: "not_now", exclude: [/\?/] } },
  { id: "talvez-depois", text: "Talvez depois", expect: { topic: "not_now" } },
  { id: "agora-nao-corrida", text: "Agora não, estou muito corrida", expect: { topic: "not_now" } },
  { id: "sem-tempo", text: "Estou sem tempo", expect: { topic: "busy", include: [/sozinho/] } },
  {
    id: "recepcionista",
    text: "Sou a recepcionista, a doutora não está",
    expect: { topic: "gatekeeper", include: [/Quem cuida da divulgação/] },
  },
  { id: "sem-interesse", text: "Não tenho interesse", expect: { topic: "not_interested", exclude: [/\?/] } },
  { id: "recusa-com-motivo", text: "não quero, já tenho site", expect: { topic: "not_interested" } },

  // depois da prévia
  {
    id: "gostei",
    text: "Gostei muito!",
    setup: { history: AFTER_DEMO, demoSent: true },
    expect: {
      topic: "compliment",
      handoff: true,
      action: "criar_proposta",
      include: [/R\$\s?800/, /7 dias/, /50%/, /Pix/],
    },
  },
  {
    id: "pode-fechar",
    text: "Pode fechar",
    setup: { history: AFTER_DEMO, demoSent: true },
    expect: { topic: "yes", action: "criar_proposta", include: [/R\$\s?800/] },
  },
  {
    id: "mudar-a-cor",
    text: "Dá pra mudar a cor?",
    setup: { history: AFTER_DEMO, demoSent: true },
    expect: { topic: "change_request", handoff: true, action: "ajustar_previa", include: [/Anotado/] },
  },
  {
    id: "ok-depois-da-previa",
    text: "ok",
    setup: { history: AFTER_DEMO, demoSent: true },
    expect: { topic: "thanks", include: [/prévia/] },
  },
  { id: "ok-solto", text: "ok", expect: { topic: "thanks", silent: true } },
  {
    id: "gostei-sem-previa",
    text: "Gostei",
    expect: { topic: "compliment", include: [/prévia/], exclude: [/R\$/] },
  },
  {
    id: "preco-com-proposta",
    text: "Quanto era mesmo?",
    setup: {
      history: AFTER_DEMO,
      demoSent: true,
      proposal: { status: "sent", title: "Site de 1 página", amountCents: 120_000, entryPct: 40, deliveryDays: 10 },
    },
    expect: { topic: "price", include: [/R\$\s?1\.200/, /R\$\s?480/, /R\$\s?720/], exclude: [/R\$\s?800/] },
  },
  {
    id: "fechou-com-pix",
    text: "Fechado, pode passar o pix",
    setup: {
      history: AFTER_DEMO,
      demoSent: true,
      proposal: { status: "sent", title: "Site de 1 página", amountCents: 80_000, entryPct: 50, deliveryDays: 7 },
      facts: { pixKey: "financeiro@kelvin.example", pixHolder: "Jonathan Kelvin" },
    },
    expect: { topic: "payment", include: [/R\$\s?400/, /financeiro@kelvin\.example/], action: "marcar_sinal" },
  },

  // o que o agente não responde sozinho
  { id: "audio", text: null, media: "audio", expect: { topic: "audio", silent: true, handoff: true, action: "ouvir_audio" } },
  { id: "imagem", text: null, media: "image", expect: { topic: "media", handoff: true, include: [/por escrito/] } },
  { id: "figurinha", text: null, media: "sticker", expect: { topic: "media", silent: true } },
  { id: "voce-cria-sites", text: "oi você cria sites?", expect: { topic: "how_works", include: [/prévia/] } },
  { id: "parar", text: "PARE", expect: { topic: "optout", silent: true } },
  { id: "numero-errado", text: "número errado", expect: { topic: "optout", silent: true } },
  { id: "golpe", text: "Isso é golpe?", expect: { topic: "abusive", silent: true, handoff: true } },
  { id: "fora-do-roteiro", text: "Vocês fazem loja virtual?", expect: { topic: "other", silent: true, handoff: true } },
];

// ───────────────────────── fluxo "qualificar" (sem prévia automática) ─────────────────────────

const qualify = (setup: Omit<SimulationInput, "text" | "media"> = {}): Omit<SimulationInput, "text" | "media"> => ({
  ...setup,
  facts: { ...(setup.facts ?? {}), flow: "qualificar" },
});

const Q_OPENING = { from: "us" as const, text: "Oi! Aqui é o Jonathan, da Kelvin Studio. Vocês já pensaram em ter um site?" };
const TIPO_ASKED = [
  Q_OPENING,
  { from: "lead" as const, text: "pode sim" },
  { from: "us" as const, text: "Perfeito! Hoje você pensa em uma landing page, um site completo ou um sistema?", variant: "agente+auto:q-tipo" },
];
const Q_OBJETIVO_ASKED = [
  Q_OPENING,
  { from: "lead" as const, text: "quero um site para a clínica" },
  { from: "us" as const, text: "Ótimo! O que você mais quer que o site faça?", variant: "agente+auto:q-objetivo" },
];
const OFFER_MADE = [
  ...Q_OBJETIVO_ASKED,
  { from: "lead" as const, text: "quero receber mais contatos" },
  {
    from: "us" as const,
    text: "Anotado, obrigado! Fica assim: o seu site sai por R$ 800, com entrega em até 7 dias. O sinal é de 50% e o restante na entrega. Posso te passar o Pix?",
    variant: "agente+auto:answer",
  },
];
const PREVIEW_ASKED = [
  Q_OPENING,
  { from: "lead" as const, text: "quero ver uma prévia" },
  { from: "us" as const, text: "Claro! Vou montar a prévia da Clínica Valéria Sousa com cuidado e te mando por aqui.", variant: "agente+auto:wants_preview" },
];
const PREVIEW_SENT = [
  ...PREVIEW_ASKED,
  { from: "us" as const, text: "Segue a prévia: https://previa.exemplo.com.br/clinica", variant: "previa-enviada" },
];
const SYSTEM_SCOPE_ASKED = [
  Q_OPENING,
  { from: "lead" as const, text: "quero um sistema" },
  { from: "us" as const, text: "Entendi! Sistema depende do que ele precisa fazer. Me conta em uma frase o que ele precisa fazer?", variant: "agente+auto:q-escopo" },
];
/** O roteiro de sistema, uma pergunta de cada vez: cada história termina com a pergunta que o lead vai responder. */
const SYSTEM_DOR_ASKED = [
  ...SYSTEM_SCOPE_ASKED,
  { from: "lead" as const, text: "cadastrar clientes e agendar consultas" },
  { from: "us" as const, text: "Entendi! Como vocês fazem isso hoje e o que mais dá trabalho?", variant: "agente+auto:q-dor" },
];
const SYSTEM_USUARIOS_ASKED = [
  ...SYSTEM_DOR_ASKED,
  { from: "lead" as const, text: "hoje é tudo no caderno e no WhatsApp" },
  { from: "us" as const, text: "Certo! Quem vai usar: só você, a sua equipe ou os seus clientes também?", variant: "agente+auto:q-usuarios" },
];
const SYSTEM_INTEGRACOES_ASKED = [
  ...SYSTEM_USUARIOS_ASKED,
  { from: "lead" as const, text: "a recepção e os clientes" },
  { from: "us" as const, text: "Anotado! Ele precisa se ligar a algo que vocês já usam, como WhatsApp, planilha, agenda ou pagamento?", variant: "agente+auto:q-integracoes" },
];
const SYSTEM_PRAZO_ASKED = [
  ...SYSTEM_INTEGRACOES_ASKED,
  { from: "lead" as const, text: "sim, com o WhatsApp" },
  { from: "us" as const, text: "Entendi! Para quando você precisa dele funcionando?", variant: "agente+auto:q-prazo" },
];
/** O site: objetivo, depois o material, e só então a oferta. */
const SITE_MATERIAL_ASKED = [
  ...Q_OBJETIVO_ASKED,
  { from: "lead" as const, text: "quero mais contatos" },
  { from: "us" as const, text: "Anotado! Você já tem logo, fotos e textos do negócio, ou precisa que eu monte tudo?", variant: "agente+auto:q-material" },
];
const SITE_ROTEIRO_COMPLETO = [...SITE_MATERIAL_ASKED, { from: "lead" as const, text: "tenho logo e fotos" }];

/** O fechamento do site: o lead aceitou a oferta, a proposta existe e o Pix já foi passado. */
const PROPOSAL_SENT = { status: "sent", title: "Site de 1 página", amountCents: 80_000, entryPct: 50, deliveryDays: 7 } as const;
const PIX_SENT = [
  ...OFFER_MADE,
  { from: "lead" as const, text: "pode" },
  { from: "us" as const, text: "Ótimo! O sinal é de R$ 400,00, por Pix, chave dono@exemplo.com. Assim que cair, eu começo o seu site.", variant: "agente+auto:yes" },
];
const WITH_PIX = { facts: { pixKey: "dono@exemplo.com" } };

/**
 * A abertura curta ("Bom dia! Aqui é o Jonathan. Vi o perfil de X no Google. Posso te fazer uma pergunta rápida?") não falou de site:
 * quando a pessoa responde, o agente se apresenta, fala do que viu e do que falta (UMA vez), e só depois explica o site.
 */
const SHORT_OPENING = {
  from: "us" as const,
  text: "Bom dia! Aqui é o Jonathan. Vi o perfil de Clínica Valéria Sousa no Google. Posso te fazer uma pergunta rápida?",
  variant: "abertura-none-c-google~g0i0q0",
};
const SHORT_INTRODUCED = [
  SHORT_OPENING,
  { from: "lead" as const, text: "Oi, pois não?" },
  {
    from: "us" as const,
    text: "Sou o Jonathan Kelvin, desenvolvedor de sites.\n\nA Clínica Valéria Sousa tem nota 4,9 no Google, mas sem uma página própria quem pesquisa não vê os tratamentos nem consegue agendar. Posso te mostrar como resolvo isso?",
    variant: "agente+auto:q-apresentacao",
  },
];
const SHORT_EXPLAINED = [
  ...SHORT_INTRODUCED,
  { from: "lead" as const, text: "pode sim" },
  {
    from: "us" as const,
    text: "Perfeito! Em até 7 dias eu monto uma página só da Clínica Valéria Sousa, no estilo Linktree: cada tratamento com um botão que abre o WhatsApp já com o que o paciente quer, mais avaliações do Google e mapa. Ela fica no ar para o Google encontrar.\n\nO que você mais quer que a página faça: mostrar os serviços, receber contatos ou passar confiança?",
    variant: "agente+auto:q-objetivo",
  },
];

/**
 * O gabarito do fluxo "qualificar": o agente nunca oferece prévia, descobre se o lead quer um site ou um sistema,
 * fecha o valor do site e entrega ao dono a prévia pedida e o orçamento do sistema.
 */
export const QUALIFY_SCENARIOS: Scenario[] = [
  // depois da abertura curta: apresentação (uma vez), explicação e só então o roteiro de sempre
  { id: "qc-bom-dia", text: "Bom dia", setup: qualify({ history: [SHORT_OPENING] }), expect: { topic: "greeting", asked: "apresentacao", handoff: false, include: [/^Sou o Jonathan Kelvin, desenvolvedor de sites\.\n\n/, /Clínica Valéria Sousa tem nota 4,9/, /sem uma página própria quem pesquisa não vê os tratamentos nem consegue agendar/, /Posso te mostrar como resolvo isso\?$|Quer ver como eu resolvo isso\?$|Posso te explicar como eu resolvo\?$|Faz sentido eu te mostrar como resolvo\?$/], exclude: [/prévia/, /Kelvin Studio/, /Vi o perfil/] } },
  { id: "qc-pois-nao", text: "Pois não?", setup: qualify({ history: [SHORT_OPENING] }), expect: { topic: "greeting", asked: "apresentacao", include: [/Sou o Jonathan Kelvin/] } },
  { id: "qc-oi-pode-falar", text: "Oi, pode falar", setup: qualify({ history: [SHORT_OPENING] }), expect: { topic: "greeting", asked: "apresentacao", include: [/Sou o Jonathan Kelvin/] } },
  { id: "qc-sou-eu", text: "Sim, sou eu", setup: qualify({ history: [SHORT_OPENING] }), expect: { topic: "yes", asked: "apresentacao", include: [/Sou o Jonathan Kelvin/] } },
  { id: "qc-em-que-posso-ajudar", text: "Oi, em que posso ajudar?", setup: qualify({ history: [SHORT_OPENING] }), expect: { topic: "greeting", asked: "apresentacao", include: [/Sou o Jonathan Kelvin/] } },
  { id: "qc-quem-e", text: "Quem é?", setup: qualify({ history: [SHORT_OPENING] }), expect: { topic: "who", asked: "apresentacao", include: [/^Sou o Jonathan Kelvin/], exclude: [/Kelvin Studio/] } },
  { id: "qc-do-que-se-trata", text: "Do que se trata?", setup: qualify({ history: [SHORT_OPENING] }), expect: { topic: "how_works", asked: "apresentacao", include: [/Sou o Jonathan Kelvin/, /sem uma página própria quem pesquisa/] } },
  { id: "qc-qual-o-assunto", text: "qual o assunto?", setup: qualify({ history: [SHORT_OPENING] }), expect: { topic: "how_works", asked: "apresentacao", include: [/Sou o Jonathan Kelvin/] } },
  { id: "qc-so-instagram", text: "Bom dia", setup: qualify({ websiteKind: "social", history: [SHORT_OPENING] }), expect: { topic: "greeting", asked: "apresentacao", include: [/só acha o Instagram/, /não vê os tratamentos nem consegue agendar/] } },
  { id: "qc-site-fraco", text: "Bom dia", setup: qualify({ websiteKind: "weak", history: [SHORT_OPENING] }), expect: { topic: "greeting", asked: "apresentacao", include: [/Vi o site de vocês/, /mostrar melhor os tratamentos/], exclude: [/sem site/] } },
  { id: "qc-com-titulo", text: "Bom dia", setup: qualify({ name: "Dra. Liane Sobral - Periodontista", history: [SHORT_OPENING] }), expect: { topic: "greeting", asked: "apresentacao", include: [/^Dra\. Liane, sou o Jonathan Kelvin/, /Você tem nota 4,9 no Google/, /não vê seus tratamentos/], exclude: [/Clínica/] } },
  { id: "qc-advocacia", text: "Bom dia", setup: qualify({ name: "Rafael Neves - ADVOCACIA", history: [SHORT_OPENING] }), expect: { topic: "greeting", asked: "apresentacao", include: [/^Rafael, sou o Jonathan Kelvin/], exclude: [/Oi/, /!/] } },
  { id: "qc-pode-explicar", text: "pode explicar", setup: qualify({ history: SHORT_INTRODUCED }), expect: { topic: "how_works", asked: "objetivo", include: [/Em até 7 dias eu monto uma página só da Clínica Valéria Sousa, no estilo Linktree/, /cada tratamento com um botão que abre o WhatsApp já com o que o paciente quer/, /mais avaliações do Google e mapa/, /fica no ar para o Google encontrar/, /O que você mais quer que a página faça/], exclude: [/prévia/, /Sou o Jonathan/], maxChars: 360 } },
  { id: "qc-pode", text: "pode", setup: qualify({ history: SHORT_INTRODUCED }), expect: { topic: "yes", asked: "objetivo", include: [/^Perfeito! Em até 7 dias eu monto uma página só da/, /botão que abre o WhatsApp/], maxChars: 360 } },
  { id: "qc-claro-pode-falar", text: "pode falar", setup: qualify({ history: SHORT_INTRODUCED }), expect: { topic: "greeting", asked: "objetivo", include: [/avaliações do Google/], maxChars: 360 } },
  { id: "qc-objetivo-respondido", text: "quero receber mais contatos pelo WhatsApp", setup: qualify({ history: SHORT_EXPLAINED }), expect: { topic: "answer", asked: "material", include: [/logo, fotos e textos/], exclude: [/R\$/, /prévia/, /landing page/] } },
  { id: "qc-pergunta-o-preco-logo", text: "Quanto custa?", setup: qualify({ history: [SHORT_OPENING] }), expect: { topic: "price", asked: "tipo", handoff: true, include: [/R\$\s?800/], exclude: [/prévia/] } },
  { id: "qc-nao-tenho-interesse", text: "não tenho interesse", setup: qualify({ history: SHORT_INTRODUCED }), expect: { topic: "not_interested", silent: false, include: [/Tudo bem/] } },

  // quem acha que "site" é uma coisa grande: uma vez, a página simples no estilo Linktree; na segunda, agradece e encerra
  { id: "qc-nao-preciso-de-site", text: "Não preciso de site", setup: qualify({ history: SHORT_INTRODUCED }), expect: { topic: "no_need_site", asked: undefined, include: [/^Entendo! Não precisa ser um site grande/, /página só da Clínica Valéria Sousa, no estilo Linktree/, /cada tratamento e um botão que abre o WhatsApp/, /Faz sentido eu te explicar\?$/], exclude: [/prévia/, /R\$/] } },
  { id: "qc-ja-tenho-instagram", text: "já tenho instagram", setup: qualify({ history: SHORT_INTRODUCED }), expect: { topic: "no_need_site", include: [/estilo Linktree/] } },
  { id: "qc-so-uso-o-instagram", text: "A gente só usa o Instagram mesmo", setup: qualify({ history: SHORT_INTRODUCED }), expect: { topic: "no_need_site", include: [/estilo Linktree/] } },
  { id: "qc-instagram-ja-resolve", text: "meu instagram já resolve", setup: qualify({ history: SHORT_INTRODUCED }), expect: { topic: "no_need_site", include: [/estilo Linktree/] } },
  // 1ª vez: a página simples. 2ª: volta à dor do dia a dia (o dono também faz sistema sob medida). 3ª: agradece e encerra
  {
    id: "qc-nao-preciso-de-site-de-novo",
    text: "não preciso de site mesmo",
    setup: qualify({ history: [...SHORT_INTRODUCED, { from: "lead" as const, text: "Não preciso de site" }, { from: "us" as const, text: "Entendo! Não precisa ser um site grande: é uma página só da Clínica Valéria Sousa, no estilo Linktree. Faz sentido eu te explicar?", variant: "agente+auto:no_need_site" }] }),
    expect: { topic: "no_need_site", asked: "escopo", include: [/^Sem problema! Além de página e site, eu desenvolvo sistemas sob medida\./, /Hoje o que mais dá trabalho no dia a dia: agendar consultas, atender no WhatsApp ou organizar os pacientes\?$/], exclude: [/prévia/, /R\$/, /Linktree/] },
  },
  {
    id: "qc-nao-preciso-de-site-3a-vez",
    text: "não preciso de site, de verdade",
    setup: qualify({
      history: [
        ...SHORT_INTRODUCED,
        { from: "lead" as const, text: "Não preciso de site" },
        { from: "us" as const, text: "Entendo! Não precisa ser um site grande: é uma página só da Clínica Valéria Sousa, no estilo Linktree. Faz sentido eu te explicar?", variant: "agente+auto:no_need_site" },
        { from: "lead" as const, text: "não preciso de site mesmo" },
        { from: "us" as const, text: "Sem problema! Além de página e site, eu desenvolvo sistemas sob medida. Hoje o que mais dá trabalho no dia a dia: agendar consultas, atender no WhatsApp ou organizar os pacientes?", variant: "agente+auto:q-escopo" },
      ],
    }),
    expect: { topic: "not_interested", include: [/^Tudo bem, obrigado pelo retorno/], exclude: [/Linktree/, /sistemas/, /\?/] },
  },
  {
    id: "qc-resposta-a-dor-do-dia-a-dia",
    text: "agendar e confirmar as consultas, hoje é tudo no caderno",
    setup: qualify({
      history: [
        ...SHORT_INTRODUCED,
        { from: "lead" as const, text: "Não preciso de site" },
        { from: "us" as const, text: "Entendo! Não precisa ser um site grande: é uma página só da Clínica Valéria Sousa, no estilo Linktree. Faz sentido eu te explicar?", variant: "agente+auto:no_need_site" },
        { from: "lead" as const, text: "não preciso de site mesmo" },
        { from: "us" as const, text: "Sem problema! Além de página e site, eu desenvolvo sistemas sob medida. Hoje o que mais dá trabalho no dia a dia: agendar consultas, atender no WhatsApp ou organizar os pacientes?", variant: "agente+auto:q-escopo" },
      ],
    }),
    // o assunto virou sistema: a resposta é o "o que precisa fazer" e o roteiro segue com a dor
    expect: { topic: "answer", asked: "dor", handoff: false, include: [/Como vocês fazem isso hoje/], exclude: [/R\$/, /prévia/, /Linktree/] },
  },
  { id: "qc-nao-preciso-de-site-mas-de-sistema", text: "não preciso de site, preciso de um sistema de agendamento online para a clínica", setup: qualify({ history: SHORT_INTRODUCED }), expect: { topic: "system_request", asked: "dor", handoff: false, action: "orcar_sistema", include: [/Sistema depende/], exclude: [/Linktree/, /R\$/] } },
  // quem descreve a dor sem dizer "sistema": organizar o atendimento, a agenda, os clientes
  { id: "qc-organizar-o-atendimento", text: "queria organizar melhor o atendimento e a agenda da clínica", setup: qualify({ history: SHORT_INTRODUCED }), expect: { topic: "system_request", asked: "dor", handoff: false, action: "orcar_sistema", include: [/Sistema depende/, /Como vocês fazem isso hoje/], exclude: [/R\$/, /prévia/, /landing page/] } },
  { id: "qc-controle-dos-pacientes", text: "preciso de um controle dos pacientes e lembrete de consulta", setup: qualify({ history: SHORT_INTRODUCED }), expect: { topic: "system_request", asked: "dor", handoff: false, include: [/Sistema depende/], exclude: [/R\$/] } },
  { id: "qc-sem-interesse-em-site", text: "Não temos interesse em site, obrigada", setup: qualify({ history: SHORT_INTRODUCED }), expect: { topic: "not_interested", include: [/^Tudo bem/], exclude: [/Linktree/] } },
  {
    id: "qc-depois-do-linktree-pode",
    text: "pode explicar",
    setup: qualify({ history: [SHORT_OPENING, { from: "lead" as const, text: "Já tenho instagram" }, { from: "us" as const, text: "Entendo! Não precisa ser um site grande: é uma página só da Clínica Valéria Sousa, no estilo Linktree. Faz sentido eu te explicar?", variant: "agente+auto:no_need_site" }] }),
    expect: { topic: "how_works", asked: "objetivo", include: [/^Em até 7 dias eu monto uma página só da/, /O que você mais quer que a página faça/], exclude: [/Sou o Jonathan/], maxChars: 360 },
  },

  // abertura e perguntas de venda
  // abertura e perguntas de venda
  { id: "q-oi", text: "Oi", setup: qualify(), expect: { topic: "greeting", asked: "tipo", include: [/landing page/], exclude: [/prévia/] } },
  { id: "q-bom-dia-ja-perguntei", text: "Bom dia", setup: qualify({ history: TIPO_ASKED }), expect: { topic: "greeting", include: [/o que você precisa/], exclude: [/prévia/, /\?/] } },
  { id: "q-quem-e", text: "Quem é você?", setup: qualify(), expect: { topic: "who", asked: "tipo", include: [/Kelvin Studio/, /landing page/], exclude: [/prévia/] } },
  { id: "q-como-funciona", text: "Como funciona?", setup: qualify(), expect: { topic: "how_works", asked: "tipo", include: [/sinal de 50%/], exclude: [/prévia/] } },
  { id: "q-preco", text: "Quanto custa?", setup: qualify(), expect: { topic: "price", asked: "tipo", handoff: true, include: [/R\$\s?800/, /Sistema depende/], exclude: [/prévia/] } },
  { id: "q-preco-e-prazo", text: "Quanto custa e quanto tempo demora?", setup: qualify(), expect: { topic: "price", asked: "tipo", handoff: true, include: [/R\$\s?800/, /7 dias/] } },
  { id: "q-prazo", text: "Quanto tempo demora?", setup: qualify(), expect: { topic: "timeline", asked: "tipo", include: [/7 dias/], exclude: [/prévia/] } },
  { id: "q-como-pago", text: "Como eu pago?", setup: qualify(), expect: { topic: "payment", asked: "tipo", include: [/Pix/, /50%/], exclude: [/prévia/] } },

  // qualificação: o que ele quer comprar
  { id: "q-pode-sim", text: "Pode sim", setup: qualify(), expect: { topic: "yes", asked: "tipo", include: [/landing page/], exclude: [/prévia/] } },
  { id: "q-pode-sim-de-novo", text: "pode sim", setup: qualify({ history: TIPO_ASKED }), expect: { topic: "yes", asked: "tipo", include: [/Seria uma landing page/] } },
  { id: "q-quero-um-site", text: "quero um site para a minha clínica", setup: qualify(), expect: { topic: "wants_site", asked: "objetivo", include: [/O que você mais quer que o site faça/], exclude: [/prévia/] } },
  { id: "q-landing-page", text: "uma landing page para a clínica", setup: qualify({ history: TIPO_ASKED }), expect: { topic: "answer", asked: "objetivo", include: [/O que você mais quer que o site faça/] } },
  { id: "q-resposta-do-objetivo", text: "quero receber mais contatos pelo WhatsApp", setup: qualify({ history: Q_OBJETIVO_ASKED }), expect: { topic: "answer", asked: "material", include: [/logo, fotos e textos/], exclude: [/R\$/, /prévia/] } },
  { id: "q-resposta-do-material", text: "tenho logo mas faltam as fotos", setup: qualify({ history: SITE_MATERIAL_ASKED }), expect: { topic: "answer", handoff: true, action: "criar_proposta", include: [/R\$\s?800/, /7 dias/, /50%/, /Pix/], exclude: [/prévia/] } },
  { id: "q-aceitou-a-oferta", text: "pode", setup: qualify({ history: OFFER_MADE }), expect: { topic: "yes", handoff: true, action: "criar_proposta", include: [/chave Pix/] } },
  { id: "q-preco-no-meio-do-roteiro", text: "quanto fica?", setup: qualify({ history: [...Q_OBJETIVO_ASKED, { from: "lead" as const, text: "quero mais contatos" }] }), expect: { topic: "price", asked: "material", handoff: true, include: [/R\$\s?800/, /logo, fotos e textos/], exclude: [/Pix/] } },
  { id: "q-preco-roteiro-completo", text: "quanto fica?", setup: qualify({ history: SITE_ROTEIRO_COMPLETO }), expect: { topic: "price", handoff: true, action: "criar_proposta", include: [/R\$\s?800/, /Pix/] } },

  // sistema e automação: o valor é do dono; o agente conduz o roteiro de perguntas e entrega o resumo no fim
  { id: "q-sistema-escopo", text: "um sistema de agendamento", setup: qualify({ history: TIPO_ASKED }), expect: { topic: "answer", asked: "escopo", handoff: false, action: "orcar_sistema", include: [/Sistema depende/, /o que ele precisa fazer/], exclude: [/R\$/, /prévia/] } },
  { id: "q-sistema-detalhado", text: "preciso de um sistema de agendamento online para a minha clínica de estética", setup: qualify(), expect: { topic: "system_request", asked: "dor", handoff: false, action: "orcar_sistema", include: [/Sistema depende/, /Como vocês fazem isso hoje/], exclude: [/R\$/, /prévia/] } },
  { id: "q-sistema-preco", text: "quanto custa um sistema?", setup: qualify(), expect: { topic: "price", asked: "escopo", handoff: false, action: "orcar_sistema", exclude: [/R\$/, /prévia/] } },
  { id: "q-loja-virtual", text: "Vocês fazem loja virtual?", setup: qualify(), expect: { topic: "system_request", asked: "escopo", handoff: false, action: "orcar_sistema" } },
  { id: "q-sistema-descreveu", text: "cadastrar clientes e mandar lembrete de consulta", setup: qualify({ history: SYSTEM_SCOPE_ASKED }), expect: { topic: "answer", asked: "dor", handoff: false, include: [/Como vocês fazem isso hoje/], exclude: [/R\$/] } },
  { id: "q-sistema-dor", text: "hoje é tudo no caderno e a recepção perde muita coisa", setup: qualify({ history: SYSTEM_DOR_ASKED }), expect: { topic: "answer", asked: "usuarios", handoff: false, include: [/Quem vai usar/] } },
  { id: "q-sistema-usuarios", text: "só a recepção", setup: qualify({ history: SYSTEM_USUARIOS_ASKED }), expect: { topic: "answer", asked: "integracoes", handoff: false, include: [/se ligar a algo/] } },
  { id: "q-sistema-nao-solto", text: "não", setup: qualify({ history: SYSTEM_INTEGRACOES_ASKED }), expect: { topic: "answer", asked: "prazo", handoff: false, include: [/Para quando/] } },
  { id: "q-sistema-sim-solto", text: "sim", setup: qualify({ history: SYSTEM_INTEGRACOES_ASKED }), expect: { topic: "answer", asked: "prazo", handoff: false, include: [/Para quando/] } },
  { id: "q-sistema-pode-sim", text: "pode sim", setup: qualify({ history: SYSTEM_SCOPE_ASKED }), expect: { topic: "yes", asked: "escopo", handoff: false, include: [/o que ele precisa fazer/] } },
  { id: "q-sistema-duvida-no-meio", text: "quanto tempo demora?", setup: qualify({ history: SYSTEM_USUARIOS_ASKED }), expect: { topic: "timeline", asked: "usuarios", handoff: false, include: [/O prazo depende/, /Quem vai usar/], exclude: [/\d+ dias/] } },
  {
    id: "q-sistema-fim-do-roteiro",
    text: "uns 30 dias",
    setup: qualify({ history: SYSTEM_PRAZO_ASKED }),
    expect: {
      topic: "answer",
      handoff: true,
      action: "orcar_sistema",
      include: [/analisar com calma/],
      reason: [/Qualificação completa/, /O que precisa fazer: “cadastrar clientes/, /Para quando quer: “uns 30 dias”/, /O que precisa ligar: “sim, com o WhatsApp”/],
      exclude: [/R\$/],
    },
  },
  {
    id: "q-sistema-depois-do-aviso",
    text: "e pra quando fica pronto?",
    setup: qualify({ history: [...SYSTEM_PRAZO_ASKED, { from: "lead" as const, text: "uns 30 dias" }, { from: "us" as const, text: "Perfeito, obrigado! Com isso eu consigo analisar com calma e já volto com o valor.", variant: "agente+auto:answer" }] }),
    expect: { topic: "timeline", silent: true, handoff: true, action: "orcar_sistema" },
  },
  // automação: o mesmo roteiro, com as perguntas de processo e canal
  { id: "q-automacao-detalhada", text: "quero automatizar o atendimento do WhatsApp da clínica", setup: qualify(), expect: { topic: "system_request", asked: "dor", handoff: false, action: "orcar_sistema", include: [/Automação depende/, /Como isso é feito hoje/], exclude: [/R\$/, /prévia/] } },
  { id: "q-automacao-curta", text: "preciso de um robô", setup: qualify(), expect: { topic: "system_request", asked: "escopo", handoff: false, include: [/Automação depende/, /O que você quer automatizar/] } },

  // prévia: é feita pelo dono
  { id: "q-quero-previa", text: "quero ver uma prévia", setup: qualify(), expect: { topic: "wants_preview", handoff: true, action: "fazer_previa", include: [/Vou montar a prévia/] } },
  { id: "q-como-ficaria", text: "tem como mostrar como ficaria?", setup: qualify(), expect: { topic: "wants_preview", handoff: true, action: "fazer_previa" } },
  {
    id: "q-previa-depois-da-abertura-antiga",
    text: "pode",
    setup: qualify({ history: [{ from: "us", text: "Oi! Aqui é o Jonathan, da Kelvin Studio. Vi a clínica no Google e não achei um site de vocês.\n\nPosso te mostrar uma prévia de como ficaria?" }] }),
    expect: { topic: "wants_preview", handoff: true, action: "fazer_previa", include: [/Vou montar a prévia/] },
  },
  { id: "q-esperando-a-previa", text: "e quanto custa?", setup: qualify({ history: PREVIEW_ASKED }), expect: { topic: "price", silent: true, handoff: true, action: "fazer_previa" } },
  { id: "q-gostou-da-previa", text: "Gostei muito!", setup: qualify({ history: PREVIEW_SENT }), expect: { topic: "compliment", handoff: true, action: "criar_proposta", include: [/R\$\s?800/, /7 dias/, /50%/, /Pix/] } },
  { id: "q-ok-depois-da-previa", text: "ok", setup: qualify({ history: PREVIEW_SENT }), expect: { topic: "thanks", include: [/prévia/] } },
  { id: "q-mudar-a-cor", text: "Dá pra mudar a cor?", setup: qualify({ history: PREVIEW_SENT }), expect: { topic: "change_request", handoff: true, action: "ajustar_previa", include: [/Anotado/] } },

  // o que continua com o dono
  { id: "q-achou-caro", text: "Achei caro", setup: qualify(), expect: { topic: "too_expensive", handoff: true, include: [/prioridade/], exclude: [/prévia/, /desconto/i] } },
  { id: "q-garantia", text: "Tem garantia?", setup: qualify(), expect: { topic: "guarantee", handoff: true, exclude: [/garanti/i, /prévia/] } },
  { id: "q-dominio", text: "Precisa pagar domínio e hospedagem?", setup: qualify(), expect: { topic: "domain_hosting", handoff: true, exclude: [/R\$/, /prévia/] } },
  { id: "q-exemplos", text: "Tem exemplos de sites que você fez?", setup: qualify(), expect: { topic: "send_info", handoff: true, action: "enviar_exemplos", include: [/alguns trabalhos/], exclude: [/prévia/] } },
  { id: "q-parcelar", text: "Dá pra parcelar no cartão?", setup: qualify(), expect: { topic: "payment", handoff: true, exclude: [/R\$/, /prévia/] } },
  { id: "q-ja-tenho-site", text: "Já tenho site", setup: qualify(), expect: { topic: "has_site", handoff: true, include: [/endereço/] } },
  { id: "q-ja-tenho-site-fraco", text: "já tenho site sim", setup: qualify({ websiteKind: "weak" }), expect: { topic: "has_site", asked: "tipo", include: [/vi o site/i], exclude: [/prévia/] } },

  // objeções e adiamentos
  { id: "q-vou-pensar", text: "Vou pensar", setup: qualify(), expect: { topic: "think", include: [/sem pressa/, /ideia de valor/], exclude: [/prévia/] } },
  { id: "q-agora-nao", text: "Agora não", setup: qualify(), expect: { topic: "not_now", exclude: [/\?/, /prévia/] } },
  { id: "q-sem-tempo", text: "Estou sem tempo", setup: qualify(), expect: { topic: "busy", exclude: [/prévia/] } },
  { id: "q-sem-interesse", text: "Não tenho interesse", setup: qualify(), expect: { topic: "not_interested", exclude: [/\?/] } },
  { id: "q-ja-tenho-programador", text: "Já tenho um programador que cuida disso", setup: qualify(), expect: { topic: "has_provider", exclude: [/\?/, /prévia/] } },

  // mídia, parar e fora do roteiro
  { id: "q-audio", text: null, media: "audio", setup: qualify(), expect: { topic: "audio", silent: true, handoff: true, action: "ouvir_audio" } },
  { id: "q-imagem", text: null, media: "image", setup: qualify(), expect: { topic: "media", handoff: true, include: [/por escrito/] } },
  { id: "q-parar", text: "PARE", setup: qualify(), expect: { topic: "optout", silent: true } },
  { id: "q-golpe", text: "Isso é golpe?", setup: qualify(), expect: { topic: "abusive", silent: true, handoff: true } },
  { id: "q-fora-do-roteiro", text: "Vocês trabalham aos sábados?", setup: qualify(), expect: { topic: "other", silent: true, handoff: true } },
  {
    id: "q-preco-com-proposta",
    text: "Quanto era mesmo?",
    setup: qualify({ history: OFFER_MADE, proposal: { status: "sent", title: "Site de 1 página", amountCents: 120_000, entryPct: 40, deliveryDays: 10 } }),
    expect: { topic: "price", include: [/R\$\s?1\.200/, /R\$\s?480/, /R\$\s?720/], exclude: [/R\$\s?800/] },
  },

  // aprendizados das conversas reais (24 e 25/10): a oferta fala do "seu site", o Pix tem resposta e a conversa solta fica com o dono
  {
    id: "q-oferta-sem-nome-do-google",
    text: "quanto fica?",
    setup: qualify({ history: SITE_ROTEIRO_COMPLETO, name: "Estética Teste Fabricio" }),
    expect: { topic: "price", handoff: true, action: "criar_proposta", include: [/seu site/, /R\$\s?800/], exclude: [/Fabricio/] },
  },
  {
    id: "q-me-passe-por-gentileza",
    text: "me passe por gentileza",
    setup: qualify({ history: OFFER_MADE }),
    expect: { topic: "yes", handoff: true, action: "criar_proposta", include: [/chave Pix/], exclude: [/prévia/] },
  },
  {
    id: "q-impaciente-depois-do-pix",
    text: "vai resolver meu pedido ou nao?",
    setup: qualify({ history: PIX_SENT, proposal: PROPOSAL_SENT, ...WITH_PIX }),
    expect: { topic: "status_check", handoff: true, action: "marcar_sinal", include: [/R\$\s?400/, /dono@exemplo\.com/, /seu site/], exclude: [/prévia/, /Vou confirmar/] },
  },
  {
    id: "q-cade-o-site",
    text: "cadê o site?",
    setup: qualify({ history: PIX_SENT, proposal: PROPOSAL_SENT, ...WITH_PIX }),
    expect: { topic: "status_check", handoff: true, action: "marcar_sinal", include: [/Pix/] },
  },
  {
    id: "q-cobrou-sem-chave-cadastrada",
    text: "alguma novidade?",
    setup: qualify({ history: PIX_SENT, proposal: PROPOSAL_SENT }),
    expect: { topic: "status_check", handoff: true, action: "marcar_sinal", include: [/Pix/], reason: [/chave Pix/] },
  },
  {
    id: "q-cobrou-depois-da-oferta",
    text: "e aí, vai sair?",
    setup: qualify({ history: OFFER_MADE, ...WITH_PIX }),
    expect: { topic: "status_check", handoff: true, action: "criar_proposta", include: [/chave Pix/], exclude: [/prévia/, /\?/] },
  },
  {
    id: "q-cobrou-andamento-ja-pago",
    text: "alguma novidade do meu site?",
    setup: qualify({ history: PIX_SENT, proposal: { ...PROPOSAL_SENT, status: "entry_paid" }, ...WITH_PIX }),
    expect: { topic: "status_check", handoff: true, action: "responder", include: [/andamento/], reason: [/pagou o sinal/] },
  },
  {
    id: "q-cobrou-sem-nada-combinado",
    text: "tô esperando",
    setup: qualify({ history: TIPO_ASKED }),
    expect: { topic: "status_check", silent: true, handoff: true, action: "responder" },
  },
  {
    id: "q-ja-paguei",
    text: "já fiz o pix",
    setup: qualify({ history: PIX_SENT, proposal: PROPOSAL_SENT, ...WITH_PIX }),
    expect: { topic: "paid", handoff: true, action: "marcar_sinal", include: [/conferir o Pix/], exclude: [/prévia/], reason: [/Financeiro/] },
  },
  {
    id: "q-comprovante-por-imagem",
    text: null,
    media: "image",
    setup: qualify({ history: PIX_SENT, proposal: PROPOSAL_SENT, ...WITH_PIX }),
    expect: { topic: "paid", handoff: true, action: "marcar_sinal", include: [/Recebi/, /conferir o Pix/], exclude: [/não consigo abrir/] },
  },
  {
    id: "q-paguei-sem-pix-combinado",
    text: "paguei",
    setup: qualify({ history: TIPO_ASKED }),
    expect: { topic: "paid", silent: true, handoff: true, action: "responder" },
  },
  { id: "q-risada", text: "kkkkkk", setup: qualify({ history: TIPO_ASKED }), expect: { topic: "casual", silent: true, handoff: true, action: "responder" } },
  { id: "q-cade-o-meet", text: "kkk cadê o meet", setup: qualify({ history: OFFER_MADE }), expect: { topic: "casual", silent: true, handoff: true, action: "responder" } },
  { id: "q-emoji-de-ok", text: "👍", setup: qualify({ history: OFFER_MADE }), expect: { topic: "thanks", silent: true } },
  { id: "q-link-do-instagram-nao-e-site", text: "meu instagram é instagram.com/clinicavitoria", setup: qualify(), expect: { topic: "other", silent: true, handoff: true } },
];

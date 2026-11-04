import { describe, expect, it } from "vitest";
import { AUTO_REPLY_VARIANT, arrivedFast, detectAutoReply, isAutoReplyMessage } from "./autoreply";

/** Os textos de verdade que chegaram na primeira abordagem (prints do dono em 24/10/2026). */
const ESCRITORIO_1 = "17:00 em dias úteis.\n\nAtendimento no escritório com agendamento.\n\n\n*mensagem automática*.";
const ESCRITORIO_2 = "Agradecemos sua mensagem. Não estamos disponíveis no momento, mas responderemos assim que possível.\n\n*mensagem automática*.";
const SAUDACAO_ESTETICA =
  "Olá, tudo bem? 💗 Seja muito bem-vinda(o)! Me chamo _Larissa_, sou esteticista e será um prazer cuidar de você. ✨ *Já nos segue no Instagram?* 📲 Lá você pode ver resultados, tratamentos e novidades: https://www.instagram.com/lmesteticaebeleza?igsh=MThzeno4czU5YW5yaw== 📍 _*R. Dr. Rodrigo Codes Sandoval – Mondubim, Fortaleza – CE*_ 🗓️ *Horário de atendimento:* Terça a sexta: 11h às 18h Sábado: 11h às 16h 🕙 *Somente com hora marcada.* Para eu te ajudar melhor, me conta: 💬 *Qual procedimento você tem interesse em realizar?*";
const MENU =
  "É um prazer ter você por aqui. ✨ Somos um espaço especializado em realçar a sua beleza com naturalidade, segurança e protocolos exclusivos, pensados de forma personalizada para cada paciente. 💎 Me conta como posso te direcionar: 1️⃣ Agendar meu momento de autocuidado 2️⃣ Acessar o catálogo de serviços 3️⃣ Cursos / Mentoria 4️⃣ Outros Conheça mais sobre nosso trabalho: https://www.instagram.com/dra.heloisalima";
const CLINICA_LONGA =
  "acne • Rejuvenescimento facial • Clareamento da pele • Hidratação profunda e revitalização ✨ Antes de iniciar qualquer tratamento, realizo uma avaliação para entender as necessidades da sua pele e indicar o protocolo mais adequado para alcançar os melhores resultados. Será um prazer cuidar de você! 💗 Me conta: qual é a sua principal queixa ou o que você gostaria de melhorar na sua pele?";

/** Saudações curtas de modelo pronto que passaram em 26/10/2026 e fizeram o agente perguntar "landing page, site ou sistema?" a um robô. */
const DALIDA_SAUDACAO = "‎Dalida Massoterapeuta agradece seu contato em que posso lhe ajudar hoje?💆‍♀️🧘‍♀️👐🪷";
const DALIDA_AUSENTE = "Olá,agradeço sua mensagem🥰. Não estou disponível no momento, mas responderei o mais breve  possível ❤️";
const PAMELA = "✨ Olá, seja muito bem-vindo(a)! É um prazer receber você por aqui! Como posso ajudar?";
const TUTTI = "Tutti Belle Esmalteria e Estética agradece seu contato. Como podemos ajudar?";
const MARTINS = "Martins Detailer agradece seu contato. Como podemos ajudar?";

describe("detectAutoReply: saudações curtas de modelo pronto (26/10)", () => {
  it.each([DALIDA_SAUDACAO, PAMELA, TUTTI, MARTINS, DALIDA_AUSENTE])("%j é robô", (text) => {
    expect(detectAutoReply(text)).toMatchObject({ auto: true });
  });

  it("é saudação automática, com o motivo registrado", () => {
    const r = detectAutoReply(MARTINS);
    expect(r.kind).toBe("greeting");
    expect(r.reasons).toContain("frase de modelo pronto");
    expect(detectAutoReply(PAMELA).kind).toBe("greeting");
  });

  it.each([
    "Bom dia. Já estamos trabalhando nisso. Obrigado",
    "Obrigada!  Estou em uma viagem e assim que retornar eu falo com você!",
    "Oi! Em que posso te ajudar?",
    "Olá, tudo bem? Como posso ajudar?",
    "Olá! Seja bem-vindo, pode falar",
    "Agradecemos o contato, vou olhar com calma e te retorno",
    "Obrigado pelo contato, quanto custa o site?",
    "A Martins Detailer é minha, pode me chamar aqui",
    "Me chamo Daniel, sou o dono. Qual o valor?",
    // pode ser pessoa ou robô: na dúvida o agente responde (um "vou aguardar" é inofensivo)
    "Recebemos sua proposta sobre criação de site. Já encaminhei para nossa equipe e alguém responderá aqui neste canal.",
  ])("gente continua sendo gente: %j", (text) => {
    expect(detectAutoReply(text).auto).toBe(false);
  });

  it("frase de modelo em texto curtíssimo continua sem valer (precisa de contexto)", () => {
    expect(detectAutoReply("Bem-vindo(a)!").auto).toBe(false);
  });
});

describe("detectAutoReply: o que é resposta automática do negócio", () => {
  it("as duas mensagens do robô do escritório (a própria mensagem diz que é automática)", () => {
    expect(detectAutoReply(ESCRITORIO_1)).toMatchObject({ auto: true });
    expect(detectAutoReply(ESCRITORIO_2)).toMatchObject({ auto: true, kind: "away" });
  });

  it("saudação de clínica com horário, endereço, link e negrito", () => {
    const r = detectAutoReply(SAUDACAO_ESTETICA);
    expect(r.auto).toBe(true);
    expect(r.kind).toBe("away"); // tem aviso de horário de atendimento
  });

  it("menu numerado com emojis (1️⃣ 2️⃣ 3️⃣ 4️⃣)", () => {
    expect(detectAutoReply(MENU)).toMatchObject({ auto: true, kind: "menu" });
  });

  it("saudação longa de clínica, sem menu nem horário", () => {
    expect(detectAutoReply(CLINICA_LONGA).auto).toBe(true);
  });

  it("menus escritos em texto também valem", () => {
    expect(detectAutoReply("Olá! Digite o número da opção desejada:\n1 - Orçamento\n2 - Suporte\n3 - Financeiro").kind).toBe("menu");
    expect(detectAutoReply("Para falar com vendas digite 1, para suporte digite 2.").auto).toBe(true);
  });

  it("assistente virtual e bot", () => {
    expect(detectAutoReply("Olá! Sou a assistente virtual da Clínica Aurora. Como posso ajudar hoje?").auto).toBe(true);
    expect(detectAutoReply("Este é um atendimento automático. Aguarde.").auto).toBe(true);
  });

  it("devolve o motivo e a pontuação", () => {
    const r = detectAutoReply(ESCRITORIO_2);
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(r.reasons).toContain("diz que é automática");
  });
});

describe("detectAutoReply: pessoa de verdade nunca é tratada como robô", () => {
  it.each([
    "Oi, tudo bem? Pode falar",
    "Bom dia! Tenho interesse sim, pode me mandar mais detalhes",
    "Sim, pode",
    "Não tenho interesse, obrigado",
    "Obrigado pelo contato, vou olhar com calma",
    "Agora não estou disponível, me chama mais tarde",
    "Quanto custa um site?",
    "Preciso de um sistema de agendamento para a minha clínica",
    "Quero automatizar o atendimento do WhatsApp",
    "Já uso uma resposta automática do WhatsApp Business, mas quero um site",
    "nosso horário de atendimento é das 8 às 18, pode me chamar amanhã",
    "Ok",
    "",
  ])("%j", (text) => {
    expect(detectAutoReply(text).auto).toBe(false);
  });

  it("texto nulo ou só espaços", () => {
    expect(detectAutoReply(null).auto).toBe(false);
    expect(detectAutoReply("   ").auto).toBe(false);
  });

  it("texto curto só vale se disser que é automático", () => {
    expect(detectAutoReply("Olá! Digite 1.").auto).toBe(false);
    expect(detectAutoReply("*mensagem automática*").auto).toBe(true);
  });
});

describe("isAutoReplyMessage", () => {
  it("só vale para mensagem RECEBIDA e marcada", () => {
    expect(isAutoReplyMessage({ direction: "in", variant: AUTO_REPLY_VARIANT })).toBe(true);
    expect(isAutoReplyMessage({ direction: "out", variant: AUTO_REPLY_VARIANT })).toBe(false);
    expect(isAutoReplyMessage({ direction: "in", variant: null })).toBe(false);
  });
});

/**
 * O que o agente deixou passar em 26/10/2026 (textos reais, com nomes e endereços trocados). Cinco "respostas" que pareciam gente e
 * eram atendimento automático: o agente respondeu a duas como se fossem a dona e deixou outra "esperando você".
 */
const RECEPCAO_CPF = "Olá! Para agilizar seu atendimento. Diga seu serviço e  horário. Se ainda não tem cadastro aqui, passe seu E-mail e CPF por gentileza. Obrigado! 💈👍";
const RECEPCAO_SE_PRECISAR = "Olá, seja bem-vindo a Clínica Aurora 💙\n\nSe precisar de agendamento, informações sobre tratamentos ou tiver alguma dúvida, estamos aqui para ajudar!\n\n📍Rua das Flores 100 - Shopping Central";
const RECEPCAO_FORMULARIO =
  "Olá,tudo bem? \n\n🦋 Clínica Aurora aradece seu contato!\n\nMe chamo *Jéssica* sou a responsável por te auxiliar por aqui 😊\nPara agilizar seu atendimento, pode me informar: \n\n• Qual procedimento você tem interesse? \n• Já realizou algum tratamento";
const RECEPCAO_TRIAGEM =
  "Olá! Que bom ter você aqui na Clínica Aurora!💛\n*Eu sou Clara*, e estou aqui para te receber e te ajudar neste primeiro momento.\nEm breve, uma de nossas profissionais irá falar com você.\nEnquanto isso, me conta: *como posso te ajudar?*";
const RECEBEMOS_PROPOSTA_1 = "Recebemos sua proposta sobre criação de site. Já encaminhei para nossa equipe e alguém responderá aqui neste chat.";
const RECEBEMOS_PROPOSTA_2 = "Obrigada pelo contato, Jonathan! Recebemos sua proposta sobre criação de site. Nossa equipe avalia parcerias por aqui e dará sequência se houver interesse. Conte conosco!";

describe("detectAutoReply: recepção que pede nome, serviço ou dados (26/10)", () => {
  it.each([RECEPCAO_CPF, RECEPCAO_SE_PRECISAR, RECEPCAO_FORMULARIO, RECEPCAO_TRIAGEM])("%j é atendimento automático, mesmo sem o tempo", (text) => {
    expect(detectAutoReply(text).auto).toBe(true);
  });

  it("quem pede e-mail, CPF e serviço é recepção, e o motivo fica registrado", () => {
    const r = detectAutoReply(RECEPCAO_CPF);
    expect(r.kind).toBe("intake");
    expect(r.reasons.join(" ")).toMatch(/pede nome, serviço ou dados/);
    expect(detectAutoReply(RECEPCAO_FORMULARIO).kind).toBe("intake");
  });

  it("o erro de digitação 'aradece seu contato' também vale como modelo pronto", () => {
    expect(detectAutoReply("Clínica Aurora aradece seu contato! Como podemos ajudar hoje?").auto).toBe(true);
  });

  it("uma pessoa que pergunta ou combina algo continua sendo pessoa", () => {
    expect(detectAutoReply("Oi! Qual serviço você faz? Me manda o seu e-mail para eu te passar o contato do meu sócio").auto).toBe(false);
    expect(detectAutoReply("Boa tarde, estou aqui na clínica, pode falar").auto).toBe(false);
  });
});

describe("detectAutoReply: o tempo ajuda (robô responde em segundos, no primeiro contato)", () => {
  it("o recebimento de proposta só vira robô quando chega em segundos; sem o tempo, na dúvida é gente (como era)", () => {
    expect(detectAutoReply(RECEBEMOS_PROPOSTA_1).auto).toBe(false);
    expect(detectAutoReply(RECEBEMOS_PROPOSTA_2).auto).toBe(false);
    const r1 = detectAutoReply(RECEBEMOS_PROPOSTA_1, { fast: true });
    expect(r1).toMatchObject({ auto: true, kind: "ack" });
    expect(r1.reasons.join(" ")).toMatch(/recebimento automático/);
    expect(detectAutoReply(RECEBEMOS_PROPOSTA_2, { fast: true }).auto).toBe(true);
  });

  it("chegar rápido, sozinho, nunca transforma uma pessoa em robô", () => {
    expect(detectAutoReply("Obrigada pelo contato! Vou ver com meu sócio e retorno.", { fast: true }).auto).toBe(false);
    expect(detectAutoReply("Obrigada pelo contato, Jonathan! Pode me explicar melhor como funciona?", { fast: true }).auto).toBe(false);
    // e o que já era robô continua sendo, com ou sem o tempo
    expect(detectAutoReply(RECEPCAO_CPF, { fast: true }).auto).toBe(true);
  });

  it.each([
    "Bom dia. Já estamos trabalhando nisso. Obrigado",
    "Obrigada!  Estou em uma viagem e assim que retornar eu falo com você!",
    "Oi, pode falar, sou eu mesmo",
    "Obrigado pelo contato, quanto custa o site?",
    "Me chamo Daniel, sou o dono. Qual o valor?",
    "Não tenho interesse, obrigada",
  ])("gente que responde rápido continua sendo gente: %j", (text) => {
    expect(detectAutoReply(text, { fast: true }).auto).toBe(false);
  });
});

describe("arrivedFast", () => {
  const sent = "2026-10-26T20:00:00Z";
  it("até 3 minutos depois (ou um pouco antes, com a abordagem em partes) é rápido", () => {
    expect(arrivedFast("2026-10-26T20:00:40Z", sent)).toBe(true);
    expect(arrivedFast("2026-10-26T20:02:59Z", sent)).toBe(true);
    expect(arrivedFast("2026-10-26T19:59:20Z", sent)).toBe(true);
  });
  it("depois disso, não; e sem mensagem anterior também não", () => {
    expect(arrivedFast("2026-10-26T20:10:00Z", sent)).toBe(false);
    expect(arrivedFast("2026-10-26T23:59:00Z", sent)).toBe(false);
    expect(arrivedFast("2026-10-26T20:00:10Z", null)).toBe(false);
    expect(arrivedFast("2026-10-26T20:00:10Z", undefined)).toBe(false);
  });
});

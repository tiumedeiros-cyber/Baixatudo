"use client";

import { useActionState } from "react";
import { saveSettingsAction, type ActionResult } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { Settings } from "@/lib/leads/types";
import { cn } from "@/lib/utils";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveSettingsAction, null);

  return (
    <form action={action} className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-3 border border-line p-4">
        <Field
          label="Como o agente conduz a conversa"
          htmlFor="agentFlow"
          hint="Vale para as próximas mensagens, abordagens novas e respostas. Quem já recebeu uma abordagem antiga continua sendo atendido."
        >
          <Select id="agentFlow" name="agentFlow" defaultValue={settings.agentFlow}>
            <option value="qualificar">Qualificar e passar para mim (sem prévia automática)</option>
            <option value="previa">Oferecer uma prévia automática do site</option>
          </Select>
        </Field>
        <p className="text-[12px] leading-snug text-muted">
          <span className="text-fg">Qualificar:</span> o agente descobre se o lead quer uma landing page, um site da empresa ou um sistema, fecha o valor e o Pix do
          site e entrega a você, com resumo, quem pediu prévia ou quer um sistema. Quando você manda o link da prévia, ele continua a conversa.{" "}
          <span className="text-fg">Prévia automática:</span> o sistema monta uma prévia com os dados do Google e o agente a oferece.
        </p>
        <Field
          label="Primeira abordagem (no fluxo Qualificar)"
          htmlFor="openingMode"
          hint="Vale para as aberturas escritas daqui para a frente. Para trocar as que já estão na Fila, use Reescrever aberturas com o agente."
        >
          <Select id="openingMode" name="openingMode" defaultValue={settings.openingMode}>
            <option value="curta">Curta: uma mensagem só, para a pessoa responder (recomendada)</option>
            <option value="completa">Completa: três mensagens com a dor e a solução</option>
          </Select>
        </Field>
        <p className="text-[12px] leading-snug text-muted">
          <span className="text-fg">Curta:</span> cumprimento, o seu primeiro nome e uma pergunta fácil, com muita variação de um lead para outro. Quando a pessoa
          responde, o agente se apresenta, fala da nota no Google e da falta do site e continua em mensagens curtas.{" "}
          <span className="text-fg">Completa:</span> quem sou, o elogio com a dor e a solução, em até três mensagens.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="O que você vende" htmlFor="offer" hint="O agente com IA lê este texto para responder. Sem IA ligada, ele não usa.">
          <Textarea id="offer" name="offer" rows={4} defaultValue={settings.offer} placeholder="Ex.: Sites profissionais para clínicas, prontos em 7 dias, por R$ 800." />
        </Field>
        <Field label="Para quem" htmlFor="audience">
          <Textarea id="audience" name="audience" rows={4} defaultValue={settings.audience} placeholder="Ex.: Clínicas de estética de pequeno porte em Fortaleza que só têm Instagram." />
        </Field>
        <Field label="Diferenciais e provas" htmlFor="proof" className="md:col-span-2">
          <Textarea id="proof" name="proof" rows={3} defaultValue={settings.proof} placeholder="Ex.: Portfólio no jk.studio, entrega em 7 dias, 1 revisão incluída." />
        </Field>
      </div>

      <div className="grid gap-5 border-t border-line pt-6 md:grid-cols-2">
        <Field label="Valor do site (R$)" htmlFor="ticketAverage" hint="Preço de uma landing page ou site simples. O agente fala exatamente esse valor ao lead, e ele é o padrão da proposta e do Ganho.">
          <Input id="ticketAverage" name="ticketAverage" type="number" min={0} step={10} defaultValue={settings.ticketAverage} className="num" />
        </Field>
        <Field label="Prazo de entrega (dias)" htmlFor="deliveryDays" hint="O agente só cita este prazo: &quot;até N dias depois de começarmos&quot;. Propostas novas começam com ele.">
          <Input id="deliveryDays" name="deliveryDays" type="number" min={1} max={90} step={1} defaultValue={settings.deliveryDays} className="num" />
        </Field>
        <Field label="Sinal (%)" htmlFor="entryPct" hint="Porcentagem paga para começar; o resto é na entrega. O agente só cita este valor.">
          <Input id="entryPct" name="entryPct" type="number" min={0} max={100} step={1} defaultValue={settings.entryPct} className="num" />
        </Field>
        <Field label="Teto por busca no Apify (US$)" htmlFor="apifyMaxChargeUsd" hint="O Apify encerra a busca se passar disso. 100 lugares custam cerca de US$ 0,41.">
          <Input id="apifyMaxChargeUsd" name="apifyMaxChargeUsd" type="number" min={0.1} max={50} step={0.1} defaultValue={settings.apifyMaxChargeUsd} className="num" />
        </Field>
        <Field
          label="Nichos de ticket alto"
          htmlFor="highTicketTerms"
          hint="Um termo por linha, sem acento. Quem casa ganha +10 na nota. Vale para os próximos leads."
          className="md:col-span-2"
        >
          <Textarea id="highTicketTerms" name="highTicketTerms" rows={5} defaultValue={settings.highTicketTerms.join("\n")} className="num text-[12px]" />
        </Field>
      </div>

      <div className="grid gap-5 border-t border-line pt-6 md:grid-cols-2">
        <Field
          label="Seu WhatsApp de contato"
          htmlFor="contactPhone"
          hint="Aparece como botão &quot;Gostei, quero este site&quot; na prévia que o lead abre. Deixe vazio para não mostrar o botão."
          className="md:col-span-2"
        >
          <Input id="contactPhone" name="contactPhone" inputMode="tel" defaultValue={settings.contactPhone} placeholder="(85) 99999-9999" className="num" />
        </Field>
        <Field label="Sua chave Pix" htmlFor="pixKey" hint="Vai na mensagem da proposta. Sem ela, a mensagem avisa que a chave vai depois. Nunca é inventada.">
          <Input id="pixKey" name="pixKey" defaultValue={settings.pixKey} maxLength={140} autoComplete="off" className="num" />
        </Field>
        <Field label="Nome do titular do Pix" htmlFor="pixHolder" hint="Para o cliente conferir antes de pagar.">
          <Input id="pixHolder" name="pixHolder" defaultValue={settings.pixHolder} maxLength={60} autoComplete="off" />
        </Field>
      </div>

      <div className="flex flex-col gap-4 border-t border-line pt-6">
        <div className="flex flex-col gap-1">
          <p className="label text-[10px] text-accent">Suas respostas para o agente</p>
          <p className="text-[12px] leading-snug text-muted">
            O agente atende sozinho o que você autorizar aqui. Escreva do seu jeito, em primeira pessoa: a resposta sai exatamente assim para o lead. Deixe
            vazio o que você prefere responder pessoalmente (a conversa vai para &quot;Precisa de você&quot;). Números e links que você escrever aqui passam
            a valer como fatos para o agente.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Garantia" htmlFor="policyGuarantee" hint="Quando perguntam de garantia, contrato, nota fiscal ou reembolso.">
            <Textarea id="policyGuarantee" name="policyGuarantee" rows={3} maxLength={300} defaultValue={settings.policyGuarantee} placeholder="Ex.: Você só paga o restante se aprovar o site pronto. Uma rodada de ajustes está incluída." />
          </Field>
          <Field label="Domínio, hospedagem e mensalidade" htmlFor="policyHosting" hint="Quando perguntam se paga domínio, hospedagem ou mensalidade.">
            <Textarea id="policyHosting" name="policyHosting" rows={3} maxLength={300} defaultValue={settings.policyHosting} placeholder="Ex.: Sem mensalidade. O domínio .com.br fica no seu nome e custa cerca de R$ 40 por ano." />
          </Field>
          <Field label="Formas de pagamento" htmlFor="policyPayment" hint="Quando perguntam de parcelamento, cartão ou boleto.">
            <Textarea id="policyPayment" name="policyPayment" rows={3} maxLength={300} defaultValue={settings.policyPayment} placeholder="Ex.: Aceito Pix, com sinal para começar e o restante na entrega. Cartão e boleto não." />
          </Field>
          <Field label="Exemplos e portfólio" htmlFor="policyPortfolio" hint="Quando pedem exemplos, portfólio ou informações por e-mail.">
            <Textarea id="policyPortfolio" name="policyPortfolio" rows={3} maxLength={300} defaultValue={settings.policyPortfolio} placeholder="Ex.: Meu portfólio está em jk.studio. Mas o melhor exemplo é a prévia que monto para a sua empresa." />
          </Field>
          <Field label="Preço e desconto" htmlFor="policyPrice" hint="Quando acham caro ou pedem desconto. Sem texto aqui, o agente não dá desconto e chama você." className="md:col-span-2">
            <Textarea id="policyPrice" name="policyPrice" rows={3} maxLength={300} defaultValue={settings.policyPrice} placeholder="Ex.: Entendo. Por isso a prévia não tem custo: você vê pronto antes de decidir. Se fechar esta semana, faço por R$ 700." />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        {state ? (
          <p
            role={state.ok ? "status" : "alert"}
            className={cn("text-[13px]", state.ok ? "text-accent" : "text-danger")}
          >
            {state.message}
          </p>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar configurações"}
        </Button>
      </div>
    </form>
  );
}

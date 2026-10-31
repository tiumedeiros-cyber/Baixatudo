import { Logo, ButtonLink } from '@/components/ui';

export const metadata = { title: 'Política de Privacidade · Editor Studio' };

export default function PrivacidadePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <Logo />
      <h1 className="mt-8 font-display text-3xl font-bold text-white">Política de Privacidade</h1>
      <div className="mt-6 space-y-5 text-sm leading-relaxed text-slate-300">
        <p>Última atualização: {new Date().toLocaleDateString('pt-BR')}. Em conformidade com a LGPD (Lei 13.709/2018) e o GDPR.</p>
        <h2 className="text-lg font-semibold text-white">Dados que coletamos</h2>
        <p>Nome, e-mail e senha (armazenada com hash pelo provedor de autenticação), arquivos enviados, metadados de projetos, registros de uso e informações de pagamento processadas pelo gateway (não armazenamos números de cartão).</p>
        <h2 className="text-lg font-semibold text-white">Base legal e finalidade</h2>
        <p>Execução do contrato (prestação do serviço), cumprimento de obrigação legal (fiscal) e legítimo interesse (segurança e antifraude).</p>
        <h2 className="text-lg font-semibold text-white">Compartilhamento</h2>
        <p>Utilizamos Supabase (banco, autenticação e armazenamento), Vercel (hospedagem) e gateways de pagamento. Não vendemos dados pessoais.</p>
        <h2 className="text-lg font-semibold text-white">Seus direitos</h2>
        <p>Você pode acessar, corrigir, exportar ou excluir seus dados. A exclusão da conta remove projetos, arquivos e dados pessoais em até 30 dias, exceto registros fiscais obrigatórios.</p>
        <h2 className="text-lg font-semibold text-white">Cookies</h2>
        <p>Usamos apenas cookies essenciais de sessão. Não utilizamos cookies de rastreamento de terceiros sem consentimento.</p>
        <h2 className="text-lg font-semibold text-white">Segurança</h2>
        <p>Criptografia em trânsito (TLS 1.2+), isolamento por usuário no banco (RLS), controle de acesso por papel, limitação de requisições e logs de auditoria.</p>
        <h2 className="text-lg font-semibold text-white">Contato do encarregado</h2>
        <p>privacidade@editorstudio.app</p>
      </div>
      <ButtonLink href="/" variant="secondary" className="mt-8">Voltar ao site</ButtonLink>
    </div>
  );
}

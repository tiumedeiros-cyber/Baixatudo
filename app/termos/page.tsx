import { Logo, ButtonLink } from '@/components/ui';

export const metadata = { title: 'Termos de uso · Editor Studio' };

export default function TermosPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <Logo />
      <h1 className="mt-8 font-display text-3xl font-bold text-white">Termos de uso</h1>
      <div className="mt-6 space-y-5 text-sm leading-relaxed text-slate-300">
        <p>Última atualização: {new Date().toLocaleDateString('pt-BR')}.</p>
        <h2 className="text-lg font-semibold text-white">1. Serviço</h2>
        <p>O Editor Studio é uma plataforma de edição de imagens e vídeos oferecida por assinatura. O uso do serviço exige conta ativa e concordância com estes termos.</p>
        <h2 className="text-lg font-semibold text-white">2. Conta e assinatura</h2>
        <p>Você é responsável pelas credenciais da sua conta. Assinaturas são renovadas automaticamente até o cancelamento, que pode ser solicitado a qualquer momento no painel do cliente e passa a valer no fim do período vigente.</p>
        <h2 className="text-lg font-semibold text-white">3. Uso aceitável</h2>
        <p>É proibido usar a ferramenta de download para obter conteúdo protegido por direitos autorais sem autorização, ou para distribuir material ilegal. O usuário é integralmente responsável pelo conteúdo que importa, armazena e publica.</p>
        <h2 className="text-lg font-semibold text-white">4. Conteúdo do usuário</h2>
        <p>Você mantém a titularidade dos arquivos que envia. Concedemos apenas a licença técnica necessária para armazenar, processar e renderizar o material dentro da plataforma.</p>
        <h2 className="text-lg font-semibold text-white">5. Limites</h2>
        <p>Armazenamento, qualidade de exportação e número de projetos seguem o plano contratado. Podemos ajustar limites com aviso prévio de 30 dias.</p>
        <h2 className="text-lg font-semibold text-white">6. Cancelamento e reembolso</h2>
        <p>Reembolsos seguem o Código de Defesa do Consumidor (art. 49) para contratações online em até 7 dias. Após esse prazo, o cancelamento interrompe apenas a renovação.</p>
        <h2 className="text-lg font-semibold text-white">7. Contato</h2>
        <p>Dúvidas: suporte@editorstudio.app.</p>
      </div>
      <ButtonLink href="/" variant="secondary" className="mt-8">Voltar ao site</ButtonLink>
    </div>
  );
}

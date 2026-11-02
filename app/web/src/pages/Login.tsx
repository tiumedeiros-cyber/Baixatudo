import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Icon, Input, useToast } from '../components/ui';
import { Logo } from '../components/Shell';

type Mode = 'login' | 'register' | 'otp';

const demoAccounts = [
  { email: 'cliente@navalha.app', role: 'Cliente', desc: 'agendamentos, histórico, clube' },
  { email: 'diego@navalha.app', role: 'Barbeiro', desc: 'agenda do dia, check-in, atendimento' },
  { email: 'admin@navalha.app', role: 'Administrador', desc: 'gestão completa, financeiro, relatórios' },
];

export function Login() {
  const { login, register, loginOtp, loginOAuth, user, refresh } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');

  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      const home = user.role === 'ADMIN' ? '/admin' : user.role === 'PROFESSIONAL' ? '/pro' : '/app';
      navigate(next || home, { replace: true });
    }
  }, [user, navigate, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = mode === 'login' ? await login(form.email, form.password) : await register(form);
      push(`Bem-vindo, ${result.name.split(' ')[0]}!`);
      navigate(next || (result.role === 'ADMIN' ? '/admin' : result.role === 'PROFESSIONAL' ? '/pro' : '/app'), { replace: true });
    } catch (error) {
      push((error as { error: string }).error || 'Não foi possível entrar', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp() {
    if (!form.phone) return push('Informe seu telefone', 'error');
    setLoading(true);
    try {
      const data = await api.post<{ debug_code?: string }>('/auth/otp/request', { phone: form.phone });
      setOtpSent(data.debug_code || 'enviado');
      push(data.debug_code ? `Código enviado (demo: ${data.debug_code})` : 'Código enviado por SMS');
    } catch (error) {
      push((error as { error: string }).error || 'Erro ao enviar código', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    try {
      const result = await loginOtp(form.phone, otpCode, form.name);
      push('Login realizado!');
      navigate(next || (result.role === 'ADMIN' ? '/admin' : '/app'), { replace: true });
    } catch (error) {
      push((error as { error: string }).error || 'Código inválido', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function social(provider: 'google' | 'facebook') {
    setLoading(true);
    try {
      const email = `${provider}.demo${Math.floor(Math.random() * 999)}@exemplo.com`;
      const result = await loginOAuth(provider, email, `Visitante ${provider === 'google' ? 'Google' : 'Facebook'}`);
      push(`Conectado com ${provider === 'google' ? 'Google' : 'Facebook'}`);
      navigate(next || '/app', { replace: true });
      void result;
      await refresh();
    } catch (error) {
      push((error as { error: string }).error || 'Erro no login social', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function quick(email: string) {
    setLoading(true);
    try {
      const result = await login(email, '123456');
      navigate(result.role === 'ADMIN' ? '/admin' : result.role === 'PROFESSIONAL' ? '/pro' : '/app', { replace: true });
    } catch {
      push('Conta demo indisponível', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <img src="/img/hero.jpg" alt="" className="h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-ink-950/20" />
        <div className="absolute inset-0 flex flex-col justify-between p-10">
          <Logo />
          <div>
            <h2 className="max-w-md font-display text-4xl leading-tight text-cream-50">
              Sua cadeira, seu horário, suas regras.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream-200/80">
              A Navalha conecta clientes, barbeiros e gestão em um único lugar — do agendamento ao caixa.
            </p>
            <ul className="mt-8 space-y-2 text-sm text-cream-200/70">
              {['Agendamento em 3 passos', 'Check-in por QR code', 'Relatórios de faturamento e ocupação'].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Icon name="check" className="h-4 w-4 text-moss-400" /> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-3xl text-cream-50">{mode === 'register' ? 'Criar conta' : mode === 'otp' ? 'Entrar com telefone' : 'Bem-vindo de volta'}</h1>
          <p className="mt-2 text-sm text-cream-300/70">
            {mode === 'register' ? 'Leva menos de 30 segundos.' : 'Acesse para gerenciar seus horários.'}
          </p>

          <div className="mt-6 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => social('google')}>
              <span className="text-base">G</span> Google
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => social('facebook')}>
              <span className="text-base">f</span> Facebook
            </Button>
          </div>

          <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-widest text-cream-300/40">
            <span className="h-px flex-1 bg-white/10" /> ou <span className="h-px flex-1 bg-white/10" />
          </div>

          {mode === 'otp' ? (
            <div className="space-y-4">
              <Field label="Telefone (WhatsApp)">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(49) 99999-0000" inputMode="tel" />
              </Field>
              {!otpSent ? (
                <Button onClick={requestOtp} loading={loading} className="w-full">Enviar código por SMS</Button>
              ) : (
                <>
                  <Field label="Código recebido" hint={otpSent !== 'enviado' ? `Ambiente demo — código: ${otpSent}` : undefined}>
                    <Input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="000000" inputMode="numeric" maxLength={6} />
                  </Field>
                  <Button onClick={verifyOtp} loading={loading} className="w-full">Entrar</Button>
                </>
              )}
              <button onClick={() => setMode('login')} className="text-sm text-cream-300/60 hover:text-cream-100">← voltar</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {mode === 'register' && (
                <Field label="Nome completo">
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Como podemos te chamar?" />
                </Field>
              )}
              <Field label="E-mail">
                <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="voce@email.com" autoComplete="email" />
              </Field>
              {mode === 'register' && (
                <Field label="WhatsApp">
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(49) 99999-0000" inputMode="tel" />
                </Field>
              )}
              <Field label="Senha">
                <Input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••" autoComplete="current-password" minLength={6} />
              </Field>
              <Button type="submit" loading={loading} className="w-full">
                {mode === 'register' ? 'Criar minha conta' : 'Entrar'}
              </Button>
            </form>
          )}

          <div className="mt-5 flex items-center justify-between text-sm">
            <button onClick={() => setMode(mode === 'register' ? 'login' : 'register')} className="text-brass-300 hover:text-brass-200">
              {mode === 'register' ? 'Já tenho conta' : 'Criar conta'}
            </button>
            <button onClick={() => setMode('otp')} className="text-cream-300/60 hover:text-cream-100">Entrar com telefone</button>
          </div>

          <div className="mt-8 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-cream-300/50">Contas de demonstração</p>
            <div className="mt-3 space-y-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  onClick={() => quick(account.email)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/8 px-3 py-2 text-left transition hover:border-brass-400/40 hover:bg-white/5"
                >
                  <span>
                    <span className="block text-sm text-cream-100">{account.role}</span>
                    <span className="text-[11px] text-cream-300/50">{account.desc}</span>
                  </span>
                  <span className="text-[11px] text-brass-300">entrar →</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-cream-300/40">senha padrão: 123456</p>
          </div>

          <p className="mt-6 text-center text-xs text-cream-300/40">
            <Link to="/" className="hover:text-cream-100">← voltar ao site</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail, Zap } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { loginWithPassword, quickLogin, type LoginState } from "./actions";

const INITIAL: LoginState = { status: "idle" };

const INPUT =
  "h-11 w-full border border-line bg-surface-2 pl-10 text-[14px] text-fg outline-none transition-colors placeholder:text-faint hover:border-line-strong focus:border-accent";

/**
 * Formulário de acesso. O botão de 1 clique só aparece (e só funciona) quando o painel é aberto neste
 * computador. Em qualquer outro endereço, só o e-mail e a senha de verdade.
 */
export function LoginForm({ canQuickLogin, notice }: { canQuickLogin: boolean; notice?: string | null }) {
  const [state, action, pending] = useActionState(loginWithPassword, INITIAL);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {notice ? (
        <div role="alert" className="border border-warn/40 bg-warn/10 p-3 text-[12px] leading-snug text-warn">
          {notice}
        </div>
      ) : null}

      {canQuickLogin ? (
        <form action={quickLogin} className="flex flex-col gap-2">
          <button type="submit" className={buttonClass("primary", "lg", "w-full cursor-pointer uppercase tracking-wide")}>
            <Zap className="size-4" aria-hidden />
            Entrar neste computador
          </button>
          <p className="text-center text-[11.5px] text-faint">1 clique, sem senha. Só funciona abrindo por localhost.</p>
        </form>
      ) : null}

      <form action={action} className="flex flex-col gap-4">
        {canQuickLogin ? (
          <div className="label flex items-center gap-3 text-[10px] text-faint">
            <span className="h-px flex-1 bg-line" />
            ou com e-mail e senha
            <span className="h-px flex-1 bg-line" />
          </div>
        ) : null}

        <Field label="E-mail do proprietário" htmlFor="login-email">
          <div className="relative flex items-center">
            <Mail className="absolute left-3.5 size-4 text-faint" aria-hidden />
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="username"
              defaultValue={state.status === "error" ? state.email : ""}
              className={`${INPUT} pr-4`}
            />
          </div>
        </Field>

        <Field label="Senha" htmlFor="login-password">
          <div className="relative flex items-center">
            <Lock className="absolute left-3.5 size-4 text-faint" aria-hidden />
            <input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              className={`${INPUT} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Esconder a senha" : "Mostrar a senha"}
              className="absolute right-3 grid size-7 place-items-center text-muted transition-colors hover:text-fg"
            >
              {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          </div>
        </Field>

        {state.status === "error" ? (
          <div role="alert" className="border border-danger/40 bg-danger/10 p-3 text-[12px] leading-snug text-danger">
            {state.message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className={buttonClass(canQuickLogin ? "secondary" : "primary", "lg", "w-full cursor-pointer uppercase tracking-wide")}
        >
          {pending ? (
            "Entrando…"
          ) : (
            <>
              Entrar com senha
              <ArrowRight className="size-4" aria-hidden />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

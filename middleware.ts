import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/dashboard', '/admin', '/studio', '/baixa-tudo'];

/**
 * Checagem rápida de sessão no middleware.
 *
 * Antes cada navegação fazia uma chamada de rede ao Supabase aqui dentro
 * (o que somava ~100 ms em toda troca de tela). A sessão agora é verificada
 * só pelo cookie; quem valida de verdade continua sendo o servidor das
 * páginas (`requireUser`), que já usa cache por requisição.
 */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const needsAuth = PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();

  const hasSession = request.cookies
    .getAll()
    .some((cookie) => cookie.value && cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'));

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|zip|mp4|webm)$).*)'],
};

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const DOWNLOAD_ENGINE_URL = (process.env.DOWNLOAD_ENGINE_URL ?? 'https://baixartudo.me').replace(/\/+$/, '');
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
export const APP_SECRET = process.env.APP_SECRET ?? 'editor-studio-dev-secret-change-me';
export const IS_DEMO_PAYMENTS = !process.env.STRIPE_SECRET_KEY && !process.env.MERCADOPAGO_ACCESS_TOKEN;

export const APP_ENV = {
  appSecret: APP_SECRET,
  bootstrapEnabled: process.env.BOOTSTRAP_ENABLED ?? 'false',
};

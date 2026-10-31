'use client';
import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

export const createClient = () =>
  createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
  });

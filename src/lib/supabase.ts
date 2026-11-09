import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY
) as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && publishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, publishableKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function getSupabase() {
  if (!supabase) {
    throw new Error('O Supabase ainda não foi configurado. Confira as variáveis públicas de ambiente.');
  }
  return supabase;
}


/** Confere a senha em um cliente isolado, sem substituir a sessão aberta no aplicativo. */
export async function verifyCurrentPassword(email: string, password: string): Promise<boolean> {
  if (!supabaseUrl || !publishableKey) {
    throw new Error('O Supabase ainda não foi configurado.');
  }

  const verifier = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const { error } = await verifier.auth.signInWithPassword({ email, password });
    return !error;
  } finally {
    // Encerra apenas a sessão temporária de validação, não a sessão principal.
    await verifier.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}

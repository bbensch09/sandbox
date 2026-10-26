import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Gate for routes that change content or spend credits: a signed-in Google
 * account on the settings allow-list. Returns a ready response on failure.
 */
export async function requireAllowedUser(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(list) { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data: settings } = await createServerSupabase()
    .from('settings')
    .select('allowed_emails')
    .eq('id', 'singleton')
    .single();
  if (!settings?.allowed_emails?.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'This account is not on the allowed-emails list' }, { status: 403 });
  }
  return null;
}

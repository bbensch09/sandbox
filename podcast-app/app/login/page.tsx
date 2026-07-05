'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientSupabase } from '@/lib/supabase-client';
import { Headphones } from 'lucide-react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          renderButton: (element: Element, config: object) => void;
          prompt: () => void;
        };
      };
    };
  }
}

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const error = params.get('error');
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const supabase = createClientSupabase();

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      if (!window.google || !buttonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential: string }) => {
          const { error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: response.credential,
          });
          if (!error) router.push('/settings');
        },
      });

      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'filled_black',
        size: 'large',
        text: 'sign_in_with',
        shape: 'pill',
        width: 280,
      });

      window.google.accounts.id.prompt();
    };
    document.head.appendChild(script);
    return () => {
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, [router]);

  const handleOAuthSignIn = async () => {
    const supabase = createClientSupabase();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ backgroundColor: 'rgb(2,6,23)' }}>
      <div className="w-full max-w-sm space-y-8 text-center">
        {/* Logo */}
        <div>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'rgb(15,23,42)', border: '1px solid rgb(51,65,85)' }}
          >
            <Headphones size={28} style={{ color: '#7c3aed' }} />
          </div>
          <h1 className="text-2xl font-bold text-white">ArticleCast</h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>Sign in to access settings</p>
        </div>

        {error && (
          <p
            className="text-sm rounded-xl px-4 py-3"
            style={{ color: '#f87171', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            Authentication failed. Please try again.
          </p>
        )}

        {/* Google One Tap button target */}
        <div className="flex justify-center">
          <div ref={buttonRef} />
        </div>

        {/* Fallback OAuth button */}
        <button
          onClick={handleOAuthSignIn}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: 'rgb(15,23,42)', border: '1px solid rgb(51,65,85)' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" />
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" />
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z" />
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z" />
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

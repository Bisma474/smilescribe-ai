'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/AuthContext';

/**
 * Landing page for the Google OAuth redirect. Supabase's own client
 * library (see src/lib/supabase.ts — created with the default
 * detectSessionInUrl: true) picks the auth code/tokens out of this
 * page's URL and turns them into a session as soon as it initializes;
 * this page just waits for that, then hands off to
 * AuthContext.completeGoogleLogin() to bridge that Supabase session
 * into the same app-level auth state the password-login flow uses,
 * and finally routes into the app.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { completeGoogleLogin } = useAuth();
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    // Guard against double-running in React's dev StrictMode double-effect.
    if (ran.current) return;
    ran.current = true;

    // Supabase surfaces a denied/failed OAuth attempt as query params
    // rather than establishing a session — surface that instead of
    // silently trying (and failing) to complete login.
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error_description') || params.get('error');
    if (oauthError) {
      setError(oauthError);
      return;
    }

    completeGoogleLogin()
      .then(() => router.replace('/dashboard'))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      });
  }, [completeGoogleLogin, router]);

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px',background:'var(--white)'}}>
      <div style={{textAlign:'center',maxWidth:'360px'}}>
        {error ? (
          <>
            <div style={{fontSize:'14px',fontWeight:700,color:'var(--navy)',marginBottom:'8px'}}>Sign-in failed</div>
            <div style={{fontSize:'13px',color:'var(--ink3)',marginBottom:'20px'}}>{error}</div>
            <button className="btn-primary" onClick={() => router.replace('/')}>Back to sign in</button>
          </>
        ) : (
          <>
            <div style={{fontSize:'14px',fontWeight:700,color:'var(--navy)',marginBottom:'8px'}}>Signing you in…</div>
            <div style={{fontSize:'13px',color:'var(--ink3)'}}>Finishing your Google sign-in.</div>
          </>
        )}
      </div>
    </div>
  );
}

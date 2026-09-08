'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)'}}>
        <div style={{textAlign:'center'}}>
          <svg width="48" height="48" viewBox="0 0 100 100" fill="none" style={{animation:'spin 1s linear infinite',margin:'0 auto 16px'}}>
            <path d="M50 10 C32 10 20 24 22 42 C24 57 32 74 40 84 C44 90 47 92 50 92" stroke="#4ABFB0" strokeWidth="6" strokeLinecap="round" fill="none"/>
            <path d="M50 10 C68 10 80 24 78 42 C76 57 68 74 60 84 C56 90 53 92 50 92" stroke="#1B3A6B" strokeWidth="6" strokeLinecap="round" fill="none"/>
          </svg>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          <div style={{fontSize:'13px',color:'var(--ink3)'}}>Loading…</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;
  return <>{children}</>;
}

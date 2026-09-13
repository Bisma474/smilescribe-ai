'use client';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import BottomTab from './BottomTab';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden'}}>
      <TopBar onHamburger={() => setSidebarOpen(o => !o)} isOpen={sidebarOpen} />
      <div style={{display:'flex',flex:1,overflow:'hidden',position:'relative'}}>
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{display:'block',position:'fixed',inset:0,top:'var(--topbar-h)',background:'rgba(0,0,0,0.4)',zIndex:89}}
          />
        )}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="main-content-scroll" style={{flex:1,overflowY:'auto',overflowX:'hidden',minWidth:0,paddingBottom:'70px'}}>
          <div style={{padding:'24px 16px'}}>
            {children}
          </div>
        </main>
      </div>
      <BottomTab />
      <style jsx global>{`
        @media (min-width: 1024px) {
          .main-content-scroll {
            margin-left: var(--sidebar-w);
          }
        }
      `}</style>
    </div>
  );
}

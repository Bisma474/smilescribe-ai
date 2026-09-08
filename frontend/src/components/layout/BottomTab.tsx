'use client';
import { useRouter, usePathname } from 'next/navigation';

const TABS = [
  { href:'/dashboard', label:'Home', icon:<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></> },
  { href:'/dashboard/recording', label:'Record', icon:<><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></> },
  { href:'/dashboard/chart', label:'Chart', icon:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></> },
  { href:'/poc', label:'Cite', icon:<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></> },
  { href:'/dashboard/patients', label:'Patients', icon:<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></> },
  { href:'/dashboard/billing', label:'Billing', icon:<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></> },
];

export default function BottomTab() {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'var(--white)',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'space-around',alignItems:'center',padding:'8px 0',zIndex:80}}>
      <style>{`@media(min-width:1024px){nav{display:none!important}}`}</style>
      {TABS.map(t => (
        <div key={t.href} onClick={() => router.push(t.href)}
          style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',padding:'4px 14px',cursor:'pointer',color:pathname===t.href?'var(--teal-dark)':'var(--ink4)',transition:'color .15s'}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'22px',height:'22px'}}>{t.icon}</svg>
          <span style={{fontSize:'9px',fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>{t.label}</span>
        </div>
      ))}
    </nav>
  );
}

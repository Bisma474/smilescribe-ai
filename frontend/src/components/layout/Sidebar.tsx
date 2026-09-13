'use client';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/store/AuthContext';

interface Props { isOpen: boolean; onClose: () => void }

const NAV = [
  { id:'home', label:'Dashboard', href:'/dashboard', icon:<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>, badge:null },
  { id:'recording', label:'Live Recording', href:'/dashboard/recording', icon:<><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>, badge:'●' },
  { id:'chart', label:'Chart Review', href:'/dashboard/chart', icon:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>, badge:null },
  { id:'review', label:'Transcript Review', href:'/review', icon:<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>, badge:null },
  { id:'patients', label:'Patients', href:'/dashboard/patients', icon:<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>, badge:null },
  { id:'billing', label:'Billing & Revenue', href:'/dashboard/billing', icon:<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>, badge:'2', badgeType:'warn' as const },
  { id:'settings', label:'Settings', href:'/dashboard/settings', icon:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>, badge:null },
];

export default function Sidebar({ isOpen, onClose }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navigate = (href: string) => { router.push(href); onClose(); };
  const handleLogout = async () => { await logout(); router.replace('/'); onClose(); };

  return (
    <aside style={{
      width:'var(--sidebar-w)',background:'var(--navy)',display:'flex',flexDirection:'column',
      position:'fixed',left:0,top:'var(--topbar-h)',height:'calc(100vh - var(--topbar-h))',
      transform:isOpen?'translateX(0)':'translateX(-100%)',transition:'transform .28s cubic-bezier(.4,0,.2,1)',
      zIndex:90,overflowY:'auto',
    }}>
      <style>{`
        @media(min-width:1024px){aside{transform:translateX(0)!important;position:sticky!important}}
        .nav-item{display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;border-radius:10px;margin:2px 8px;transition:background .15s,color .15s;color:rgba(255,255,255,0.65);font-size:13px;font-weight:500;text-decoration:none}
        .nav-item:hover{background:rgba(74,191,176,0.15);color:white}
        .nav-item.active{background:rgba(74,191,176,0.22);color:white}
        .nav-badge{margin-left:auto;background:var(--teal);color:white;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px}
        .nav-badge.warn{background:#E5A020}
        .sidebar-section{padding:20px 16px 8px;font-size:10px;font-weight:600;color:rgba(255,255,255,0.35);letter-spacing:0.12em;text-transform:uppercase}
      `}</style>

      <div className="sidebar-section">Main</div>
      {NAV.slice(0,5).map(n => (
        <div key={n.id} className={`nav-item${pathname===n.href?' active':''}`} onClick={() => navigate(n.href)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'18px',height:'18px',flexShrink:0,opacity:pathname===n.href?1:0.7}}>
            {n.icon}
          </svg>
          {n.label}
          {n.badge && <span className={`nav-badge${n.badgeType==='warn'?' warn':''}`}>{n.badge}</span>}
        </div>
      ))}

      <div className="sidebar-section">Billing</div>
      <div className={`nav-item${pathname==='/dashboard/billing'?' active':''}`} onClick={() => navigate('/dashboard/billing')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'18px',height:'18px',flexShrink:0,opacity:0.7}}>
          <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
        Billing &amp; Revenue
        <span className="nav-badge warn">2</span>
      </div>

      <div className="sidebar-section">System</div>
      <div className={`nav-item${pathname==='/dashboard/settings'?' active':''}`} onClick={() => navigate('/dashboard/settings')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'18px',height:'18px',flexShrink:0,opacity:0.7}}>
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Settings
      </div>

      <div style={{marginTop:'auto',padding:'16px',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
        <div onClick={handleLogout} style={{display:'flex',alignItems:'center',gap:'10px',cursor:'pointer',padding:'8px',borderRadius:'10px',transition:'background .15s'}} title="Sign out">
          <div style={{width:'36px',height:'36px',borderRadius:'10px',background:'rgba(74,191,176,0.25)',color:'var(--teal)',fontSize:'12px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            {user?.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() || 'DK'}
          </div>
          <div>
            <div style={{fontSize:'13px',fontWeight:600,color:'white'}}>{user?.full_name || 'Dr. Alice Kim'}</div>
            <div style={{fontSize:'10px',color:'rgba(255,255,255,0.45)'}}>{user?.practice_name || 'Bright Smile Dental'} · Sign out</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

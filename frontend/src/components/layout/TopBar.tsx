'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/AuthContext';

interface Props { onHamburger: () => void; isOpen: boolean }

interface SearchItem {
  type: 'patient' | 'code' | 'nav';
  title: string;
  sub: string;
  href: string;
  keywords: string[];
}

const SEARCH_DATABASE: SearchItem[] = [
  // Patients
  { type: 'patient', title: 'Marcus Torres', sub: 'DOB: 1981-03-14 · Perio maintenance', href: '/dashboard/chart', keywords: ['marcus', 'torres', 'patient', 'dob', '8472', 'chart', 'review'] },
  { type: 'patient', title: 'Sarah Johnson', sub: 'DOB: 1985-06-12 · Routine check-up', href: '/dashboard/chart', keywords: ['sarah', 'johnson', 'patient', 'routine', '1092', 'chart', 'review'] },
  { type: 'patient', title: 'Julia Lee', sub: 'DOB: 2001-12-18 · High caries risk', href: '/dashboard/chart', keywords: ['julia', 'lee', 'patient', 'caries', 'risk', '3891', 'chart', 'review'] },
  { type: 'patient', title: 'Lisa Nguyen', sub: 'DOB: 1993-09-28 · Composite filling', href: '/dashboard/chart', keywords: ['lisa', 'nguyen', 'patient', 'composite', 'filling'] },
  { type: 'patient', title: 'Robert Park', sub: 'DOB: 1968-11-02 · Crown prep', href: '/dashboard/chart', keywords: ['robert', 'park', 'patient', 'crown', 'prep'] },
  { type: 'patient', title: 'Ana Patel', sub: 'DOB: 1990-02-14 · Last visit Mar 12', href: '/dashboard/chart', keywords: ['ana', 'patel', 'patient'] },
  { type: 'patient', title: 'David Kim', sub: 'DOB: 1978-07-30 · Routine check-up', href: '/dashboard/chart', keywords: ['david', 'kim', 'patient'] },

  // CDT Codes
  { type: 'code', title: 'D4910 — Periodontal Maintenance', sub: 'Billing code · Est. Fee: $148', href: '/dashboard/billing', keywords: ['d4910', 'perio', 'maintenance', 'billing', 'code'] },
  { type: 'code', title: 'D1110 — Prophylaxis (Cleaning)', sub: 'Billing code · Est. Fee: $95', href: '/dashboard/billing', keywords: ['d1110', 'cleaning', 'prophy', 'prophylaxis', 'billing', 'code'] },
  { type: 'code', title: 'D1206 — Fluoride Varnish', sub: 'Billing code · Est. Fee: $48', href: '/dashboard/billing', keywords: ['d1206', 'fluoride', 'varnish', 'billing', 'code'] },
  { type: 'code', title: 'D1330 — Oral Hygiene Instruction', sub: 'Billing code · Est. Fee: $29', href: '/dashboard/billing', keywords: ['d1330', 'ohi', 'hygiene', 'instruction', 'billing', 'code'] },
  { type: 'code', title: 'D4341 — Periodontal Scaling (SRP)', sub: 'Billing code · Est. Fee: $180', href: '/dashboard/billing', keywords: ['d4341', 'srp', 'scaling', 'root', 'planing', 'billing', 'code'] },

  // App Navigation
  { type: 'nav', title: 'Dashboard Home', sub: 'Overview, schedules, and alerts', href: '/dashboard', keywords: ['home', 'dashboard', 'schedule', 'alerts'] },
  { type: 'nav', title: 'Patients Directory', sub: 'Search and manage all patient files', href: '/dashboard/patients', keywords: ['patients', 'directory', 'list', 'search'] },
  { type: 'nav', title: 'Live AI Recording', sub: 'Transcribe and chart active patient visits', href: '/dashboard/recording', keywords: ['live', 'recording', 'transcribe', 'chart', 'scribing'] },
  { type: 'nav', title: 'Periodontal Chart Review', sub: 'Review pocket depths and clinical findings', href: '/dashboard/chart', keywords: ['perio', 'chart', 'review', 'pocket', 'depths'] },
  { type: 'nav', title: 'Billing & Claims Review', sub: 'Review claims and code recommendations', href: '/dashboard/billing', keywords: ['billing', 'claims', 'codes', 'insurance'] },
  { type: 'nav', title: 'Practice Configuration Settings', sub: 'User profiles and audit logs', href: '/dashboard/settings', keywords: ['settings', 'config', 'profile', 'practice', 'security'] },
  { type: 'nav', title: 'HIPAA Audit Logs', sub: 'Access logs and audit details', href: '/dashboard/settings', keywords: ['audit', 'logs', 'hipaa', 'compliance', 'security'] },
];

export default function TopBar({ onHamburger, isOpen }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  
  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'DK';

  // Filter items matching the query
  const filteredItems = searchQuery.trim() === '' ? [] : SEARCH_DATABASE.filter(item => {
    const q = searchQuery.toLowerCase();
    return item.title.toLowerCase().includes(q) ||
           item.sub.toLowerCase().includes(q) ||
           item.keywords.some(kw => kw.includes(q));
  }).slice(0, 8);

  return (
    <header style={{height:'var(--topbar-h)',background:'var(--white)',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 16px',gap:'12px',position:'sticky',top:0,zIndex:100}}>
      <style>{`
        .topbar-hamburger{display:flex;flex-direction:column;gap:5px;cursor:pointer;padding:6px;border-radius:8px;transition:background .15s;flex-shrink:0}
        .topbar-hamburger:hover{background:var(--teal-pale)}
        .topbar-hamburger span{width:20px;height:2px;background:var(--navy);border-radius:2px;display:block;transition:transform .25s,opacity .25s}
        .topbar-hamburger.open span:nth-child(1){transform:translateY(7px) rotate(45deg)}
        .topbar-hamburger.open span:nth-child(2){opacity:0}
        .topbar-hamburger.open span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
        @media(min-width:1024px){.topbar-hamburger{display:none!important}}
        .topbar-search{flex:1;max-width:380px;height:36px;background:var(--surface);border:1px solid var(--border);border-radius:20px;display:flex;align-items:center;padding:0 14px;gap:8px;font-size:13px;color:var(--ink3);margin:0 auto;transition:border-color .15s, box-shadow .15s}
        .topbar-search:focus-within{border-color:var(--teal);box-shadow:0 0 0 3px rgba(74,191,176,0.15)}
        @media(max-width:600px){.topbar-search{display:none!important}}
        .topbar-action-btn{width:36px;height:36px;border-radius:10px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--ink3);transition:background .15s,color .15s;position:relative}
        .topbar-action-btn:hover{background:var(--teal-pale);color:var(--teal)}
        .search-item-hover:hover{background:var(--teal-pale)}
      `}</style>
      <div className={`topbar-hamburger${isOpen?' open':''}`} onClick={onHamburger}>
        <span/><span/><span/>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:'10px',flexShrink:0}}>
        <svg width="34" height="34" viewBox="0 0 100 100" fill="none">
          <path d="M50 10 C32 10 20 24 22 42 C24 57 32 74 40 84 C44 90 47 92 50 92" stroke="#4ABFB0" strokeWidth="6" strokeLinecap="round" fill="none"/>
          <path d="M50 10 C68 10 80 24 78 42 C76 57 68 74 60 84 C56 90 53 92 50 92" stroke="#1B3A6B" strokeWidth="6" strokeLinecap="round" fill="none"/>
          <circle cx="50" cy="35" r="7" fill="#4ABFB0"/>
        </svg>
        <div>
          <div style={{fontFamily:'var(--font-display)',fontSize:'18px',color:'var(--navy)'}}>DentXcribe <span style={{color:'var(--teal)'}}>AI</span></div>
          <div style={{fontSize:'9px',color:'var(--ink3)',letterSpacing:'0.08em',textTransform:'uppercase',marginTop:'-2px'}}>Dental Charting &amp; Scribing</div>
        </div>
      </div>
      
      {/* Interactive Global Search Input */}
      <div className="topbar-search" style={{ position: 'relative' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'14px',height:'14px',flexShrink:0,opacity:0.5}}>
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder="Search patients, codes, visits…"
          style={{
            border: 'none',
            background: 'transparent',
            outline: 'none',
            width: '100%',
            fontSize: '13px',
            color: 'var(--ink)',
            padding: '2px 0'
          }}
        />

        {/* Search Results Dropdown overlay */}
        {isFocused && searchQuery.trim() !== '' && (
          <div style={{
            position: 'absolute',
            top: '40px',
            left: 0,
            right: 0,
            background: 'var(--white)',
            border: '1px solid var(--teal)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 9999,
            maxHeight: '380px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            padding: '6px'
          }}>
            {filteredItems.length === 0 ? (
              <div style={{ padding: '12px', fontSize: '12px', color: 'var(--ink3)', textAlign: 'center' }}>
                No matches found for "{searchQuery}"
              </div>
            ) : (
              filteredItems.map((item, idx) => (
                <div
                  key={`${item.type}-${idx}`}
                  onClick={() => {
                    router.push(item.href);
                    setSearchQuery('');
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background .15s',
                  }}
                  className="search-item-hover"
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy)' }}>{item.title}</span>
                    <span className="badge" style={{
                      fontSize: '9px',
                      padding: '2px 6px',
                      borderRadius: '12px',
                      background: item.type === 'patient' ? 'var(--teal-pale)' : item.type === 'code' ? '#FEF3E2' : 'rgba(27,58,107,0.1)',
                      color: item.type === 'patient' ? 'var(--teal-dark)' : item.type === 'code' ? '#A0560A' : 'var(--navy)',
                    }}>
                      {item.type === 'patient' ? 'Patient' : item.type === 'code' ? 'CDT Code' : 'Section'}
                    </span>
                  </div>
                  <span style={{ fontSize: '10.5px', color: 'var(--ink3)', marginTop: '2px' }}>{item.sub}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div style={{display:'flex',alignItems:'center',gap:'8px',marginLeft:'auto'}}>
        <button className="topbar-action-btn" title="Settings" onClick={() => router.push('/dashboard/settings')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'18px',height:'18px'}}>
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <div
          onClick={() => router.push('/dashboard/settings')}
          title="Account Profile & Settings"
          style={{width:'36px',height:'36px',borderRadius:'10px',background:'linear-gradient(135deg,var(--navy),var(--navy-mid))',color:'white',fontSize:'12px',fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}

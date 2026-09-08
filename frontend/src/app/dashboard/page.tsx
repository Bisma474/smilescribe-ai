'use client';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();

  const handlePatientClick = (name: string) => {
    if (name === 'Marcus Torres') {
      router.push('/dashboard/recording');
    } else {
      router.push('/dashboard/chart');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Good morning, Dr. Kim</div>
        <div className="page-sub">Wednesday, April 22 · 4 visits scheduled today</div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-val">4</div>
          <div className="stat-lbl">Today&apos;s Visits</div>
          <div className="stat-trend trend-up">↑ On schedule</div>
        </div>
        <div className="stat-card">
          <div className="stat-val warn">2</div>
          <div className="stat-lbl">Pending Review</div>
          <div className="stat-trend"><span className="text-muted">Needs attention</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-val teal">$840</div>
          <div className="stat-lbl">Revenue Recovered</div>
          <div className="stat-trend trend-up">↑ This month</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">97<span style={{fontSize:'16px',color:'var(--ink3)'}}>%</span></div>
          <div className="stat-lbl">CDT Accuracy</div>
          <div className="stat-trend trend-up">↑ vs manual</div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:'20px'}}>
        <div>
          <div className="section-label mb-12">Today&apos;s Schedule</div>
          <div style={{display:'grid',gap:'12px',gridTemplateColumns:'1fr'}}>
            {[
              {initials:'SJ',name:'Sarah Johnson',meta:'Routine check-up · Chair #3',badge:'badge-teal',badgeText:'✓ Charted',time:'9:00',ampm:'AM',bg:'#E8F8F7',color:'#35a092'},
              {initials:'MT',name:'Marcus Torres',meta:'Perio maintenance · Chair #1',badge:'badge-warn',badgeText:'⬤ In Progress',time:'10:30',ampm:'AM',bg:'#EBF3FE',color:'#2a4f8a',active:true},
              {initials:'LN',name:'Lisa Nguyen',meta:'Composite filling · Chair #2',badge:'badge-gray',badgeText:'Upcoming',time:'12:00',ampm:'PM',bg:'#FEF3E2',color:'#A0560A'},
              {initials:'RP',name:'Robert Park',meta:'Crown prep · Chair #4',badge:'badge-gray',badgeText:'Upcoming',time:'2:00',ampm:'PM',bg:'#FEEEEE',color:'#A03030'},
            ].map((p) => (
              <div 
                key={p.name} 
                className={`patient-card${p.active?' active-visit':''}`}
                onClick={() => handlePatientClick(p.name)}
                style={{ cursor: 'pointer' }}
              >
                <div className="patient-avatar" style={{background:p.bg,color:p.color}}>{p.initials}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div className="patient-name">{p.name}</div>
                  <div className="patient-meta">{p.meta}</div>
                  <div className="mt-4"><span className={`badge ${p.badge}`}>{p.badgeText}</span></div>
                </div>
                <div className="patient-time">
                  <div className="patient-time-val">{p.time}</div>
                  <div className="mt-4 text-muted" style={{fontSize:'10px'}}>{p.ampm}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="section-label mb-12">Revenue Flags</div>
          <div className="alert-card warn">
            <div className="alert-icon warn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div>
              <div className="alert-title warn">Missed D4910 — Marcus Torres</div>
              <div className="alert-text">Perio maintenance billable but not coded in Feb visit. Est. recovery: $148</div>
              <div className="mt-8">
                <button 
                  className="btn-sm btn-teal"
                  onClick={() => router.push('/dashboard/chart')}
                >
                  Review →
                </button>
              </div>
            </div>
          </div>
          <div className="alert-card">
            <div className="alert-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </div>
            <div>
              <div className="alert-title">D1330 underbilled × 6 visits</div>
              <div className="alert-text">OHI delivered but not coded across 6 visits this month. Est. recovery: $174</div>
              <div className="mt-8">
                <button 
                  className="btn-sm btn-teal"
                  onClick={() => router.push('/dashboard/billing')}
                >
                  Review →
                </button>
              </div>
            </div>
          </div>
          <div className="revenue-flag mt-12">
            <div className="revenue-label">Total Recoverable — April</div>
            <div className="revenue-amount">$840</div>
            <div style={{fontSize:'11px',color:'var(--ink3)',marginTop:'4px'}}>3 flagged procedures · 2 patients</div>
          </div>
        </div>
      </div>
    </div>
  );
}

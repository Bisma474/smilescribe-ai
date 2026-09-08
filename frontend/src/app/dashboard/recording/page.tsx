'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RecordingPage() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(272);

  useEffect(() => {
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = (s: number) =>
    `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  return (
    <div>
      <div className="page-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
        <div>
          <div className="page-title">Live Recording</div>
          <div className="page-sub">Marcus Torres · Perio Maintenance</div>
        </div>
        <div className="live-badge"><div className="live-dot"/> LIVE</div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:'20px'}}>
        <div className="card" style={{textAlign:'center'}}>
          <div className="rec-timer">{fmt(seconds)}</div>
          <div style={{fontSize:'13px',color:'var(--ink3)',marginTop:'6px'}}>Recording in progress</div>
          <div className="rec-btn-wrap">
            <div className="rec-ring"/>
            <div className="rec-ring2"/>
            <div className="rec-btn" onClick={() => router.push('/dashboard/processing')}>
              <div className="rec-stop"/>
            </div>
          </div>
          <div style={{fontSize:'11px',color:'var(--ink3)',marginBottom:'16px'}}>Tap to stop and process</div>
          <div className="waveform">
            {Array.from({length:16}).map((_,i) => <div key={i} className="wave-bar"/>)}
          </div>
          <div style={{display:'flex',justifyContent:'center',gap:'20px',marginTop:'14px',fontSize:'11px',color:'var(--ink3)'}}>
            <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--teal)'}}/> Dentist</div>
            <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--navy)'}}/> Patient</div>
          </div>
          <div className="divider"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',fontSize:'11px',color:'var(--ink3)',textAlign:'center'}}>
            <div><div style={{fontSize:'18px',fontWeight:700,fontFamily:'var(--font-mono)',color:'var(--navy)'}}>14</div>Segments</div>
            <div><div style={{fontSize:'18px',fontWeight:700,fontFamily:'var(--font-mono)',color:'var(--teal-dark)'}}>2</div>Speakers</div>
          </div>
        </div>

        <div style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:'13px',fontWeight:700,color:'var(--navy)'}}>Live Transcript</div>
            <div style={{fontSize:'10px',color:'var(--ink3)'}}>Auto-scrolling</div>
          </div>
          <div style={{maxHeight:'320px',overflowY:'auto',padding:'8px 0'}}>
            {[
              {sp:'DR. KIM',cls:'teal-dark',text:"Marcus, let's get started with the perio charting today. Checking tooth fourteen buccal — three, three, four."},
              {sp:'PATIENT',cls:'navy',text:"Is that better than last time?"},
              {sp:'DR. KIM',cls:'teal-dark',text:"Yes, you were four to five in February. Tooth fourteen mesial is four millimeters now, improved. Distal three."},
              {sp:'PATIENT',cls:'navy',text:"That's good to hear."},
              {sp:'DR. KIM',cls:'teal-dark',text:"There's slight bleeding on probing at fourteen mesial, I'll note that. We'll do the perio maintenance today and remove all deposits."},
            ].map((l,i) => (
              <div key={i} style={{padding:'8px 16px'}}>
                <div style={{fontSize:'10px',fontWeight:700,letterSpacing:'0.08em',color:`var(--${l.cls})`,marginBottom:'2px'}}>{l.sp}</div>
                <div style={{fontSize:'12px',color:'var(--ink)',lineHeight:1.6}}>{l.text}</div>
              </div>
            ))}
            <div style={{background:'var(--teal-xpale)',borderLeft:'2px solid var(--teal)',margin:'4px 12px',padding:'8px 10px',borderRadius:'0 8px 8px 0'}}>
              <div style={{fontSize:'10px',fontWeight:700,color:'var(--teal-dark)',marginBottom:'2px'}}>DR. KIM · Now</div>
              <div style={{fontSize:'12px',color:'var(--ink)',lineHeight:1.6}}>After we finish scaling I&apos;ll apply fluoride varnish on all surfaces and go over the brushing technique again…</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useRouter } from 'next/navigation';

const STEPS = [
  {label:'Transcription complete',sub:'Speech-to-text · speaker diarisation merged',status:'done'},
  {label:'RAG context retrieved',sub:'CDT 2024 descriptors · dental terminology loaded',status:'done'},
  {label:'Extracting chart entries…',sub:'Evidence spans · tooth numbers · surface codes',status:'active'},
  {label:'CDT code matching',sub:'Semantic billing code assignment',status:'wait'},
  {label:'Revenue audit',sub:'Cross-reference historical billing codes',status:'wait'},
];

export default function ProcessingPage() {
  const router = useRouter();
  return (
    <div className="processing-wrap">
      <div style={{width:'72px',height:'72px',borderRadius:'20px',background:'var(--teal-pale)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',fontSize:'32px'}}>🦷</div>
      <div className="page-title" style={{fontSize:'22px'}}>Generating Chart</div>
      <div className="page-sub" style={{marginTop:'6px'}}>AI is analysing your clinical conversation · Marcus Torres</div>
      <div style={{textAlign:'left',marginTop:'32px'}}>
        {STEPS.map(s => (
          <div key={s.label} style={{display:'flex',alignItems:'flex-start',gap:'14px',marginBottom:'16px',opacity:s.status==='wait'?0.45:1}}>
            <div className={`step-dot ${s.status}`} style={{width:'24px',height:'24px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,flexShrink:0,marginTop:'1px'}}>
              {s.status==='done'?'✓':s.status==='active'?'⟳':''}
            </div>
            <div>
              <div style={{fontSize:'13px',fontWeight:600,color:s.status==='active'?'var(--teal-dark)':'var(--ink)'}}>{s.label}</div>
              <div style={{fontSize:'11px',color:'var(--ink3)',marginTop:'1px'}}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="progress-bar"><div className="progress-fill"/></div>
      <div style={{fontSize:'11px',color:'var(--ink3)',textAlign:'center',marginTop:'8px'}}>Usually 15–30 seconds</div>
      <div style={{marginTop:'28px'}}>
        <button className="btn-primary" onClick={() => router.push('/dashboard/chart')}>Preview Chart (Demo)</button>
      </div>
    </div>
  );
}

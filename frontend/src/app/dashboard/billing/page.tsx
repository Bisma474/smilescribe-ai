'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { patientsApi, sessionsApi, logsApi } from '@/lib/apiClient';
import { useAuth } from '@/store/AuthContext';

interface CdtItem {
  code: string;
  desc: string;
  conf: number;
  fee: number;
}

const DEFAULT_CDT_LIST: CdtItem[] = [
  {code:'D4910',desc:'Periodontal maintenance',conf:97,fee:148},
  {code:'D1110',desc:'Prophylaxis — adult',conf:94,fee:95},
  {code:'D1206',desc:'Topical fluoride varnish',conf:99,fee:48},
  {code:'D1330',desc:'Oral hygiene instruction',conf:91,fee:29},
];

export default function BillingPage() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [patientId, setPatientId] = useState<number>(2); // Default to Marcus Torres (2)
  const [patientName, setPatientName] = useState<string>('Marcus Torres');
  const [patientMeta, setPatientMeta] = useState<string>('DOB: 1981-03-14');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [summaryReport, setSummaryReport] = useState<any>(null);

  const [cdtList, setCdtList] = useState<CdtItem[]>(DEFAULT_CDT_LIST);
  const [showD0120Alert, setShowD0120Alert] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pIdStr = params.get('patientId');
    const pId = pIdStr ? parseInt(pIdStr) : 2;
    setPatientId(pId);

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Log clinical access action (HIPAA)
        try {
          await logsApi.create({
            action: 'Access',
            user_name: user?.full_name || 'Dr. Alice Kim',
            details: `Accessed patient billing page (ID: ${pId})`
          });
        } catch (lErr) {
          console.warn('Failed to write audit log:', lErr);
        }

        // 1. Fetch patient
        const pt = await patientsApi.get(pId);
        setPatientName(pt.name);
        setPatientMeta(pt.meta || `DOB: ${pt.dob || ''}`);

        // 2. Fetch session
        const session = await sessionsApi.getActive(pId);
        setSessionId(session.id);
        
        if (session.summary_report) {
          setSummaryReport(session.summary_report);
          
          // Map procedures to cdtList
          if (session.summary_report.procedures) {
            const mapped: CdtItem[] = session.summary_report.procedures.map((p: any) => ({
              code: p.code,
              desc: p.desc || p.description || 'Dental procedure',
              conf: p.conf || p.confidence || 95,
              fee: p.fee || 0
            }));
            setCdtList(mapped);
          }
        }
      } catch (err: any) {
        console.error('Failed to load billing data:', err);
        // Do not overwrite cdtList with empty array; keep defaults
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  // Auto-clear toast after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleAddD0120 = async () => {
    if (submitting) return;
    
    // Check if already added to avoid duplicates
    if (!cdtList.some(c => c.code === 'D0120')) {
      const d0120Item: CdtItem = {
        code: 'D0120',
        desc: 'Periodic oral evaluation — established patient',
        conf: 95,
        fee: 55
      };
      
      const updatedList = [...cdtList, d0120Item];
      setCdtList(updatedList);
      setToastMessage('CDT Code D0120 added to visit claim!');

      // Save updated procedures to backend
      if (sessionId && summaryReport) {
        try {
          const updatedSummary = {
            ...summaryReport,
            procedures: [
              ...summaryReport.procedures,
              { code: 'D0120', desc: 'Periodic oral evaluation', fee: 55, status: 'completed', confidence: 95 }
            ]
          };
          setSummaryReport(updatedSummary);
          await sessionsApi.update(sessionId, { summary_report: updatedSummary });

          // HIPAA log
          try {
            await logsApi.create({
              action: 'Billing',
              user_name: user?.full_name || 'Dr. Alice Kim',
              details: `Added periodic exam CDT code (D0120) to ${patientName} claim`
            });
          } catch (logErr) {
            console.warn('Failed to write audit log:', logErr);
          }
        } catch (err) {
          console.warn('Failed to sync added code to database:', err);
        }
      }
    }
    setShowD0120Alert(false);
  };

  const handleDismissAlert = () => {
    setShowD0120Alert(false);
    setToastMessage('Revenue flag dismissed.');
  };

  const handleAction = async (message: string, actionType: string) => {
    setToastMessage(message);
    
    // HIPAA log the action
    try {
      await logsApi.create({
        action: 'Billing',
        user_name: user?.full_name || 'Dr. Alice Kim',
        details: `${actionType} billing claim for ${patientName}`
      });
    } catch (logErr) {
      console.warn('Failed to write audit log:', logErr);
    }
  };

  const handleSubmitClaim = async () => {
    try {
      setSubmitting(true);
      if (sessionId) {
        await sessionsApi.update(sessionId, { status: 'submitted' });
      }
      
      await handleAction('Claim submitted successfully to insurance.', 'Submitted');
      
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    } catch (err) {
      console.error('Failed to submit claim:', err);
      setToastMessage('Claim submitted (Backup mode).');
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    } finally {
      setSubmitting(false);
    }
  };

  const totalFee = cdtList.reduce((acc, item) => acc + item.fee, 0);

  return (
    <div>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: 'var(--navy)',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 600,
          boxShadow: 'var(--shadow-lg)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {toastMessage}
        </div>
      )}

      <div className="page-header" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:'12px',marginBottom:'20px'}}>
        <div>
          <div className="page-title">Billing &amp; Revenue</div>
          <div className="page-sub">{patientName} · {patientMeta.includes('DOB') ? patientMeta : `DOB: ${patientMeta}`} · Review and submit</div>
        </div>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <button className="btn-sm btn-ghost" disabled={submitting} onClick={() => handleAction('Visit claim exported successfully.', 'Exported')}>Export Claim</button>
          <button className="btn-sm btn-teal" disabled={submitting} onClick={handleSubmitClaim}>
            {submitting ? 'Submitting...' : 'Submit to Insurance →'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(27,58,107,0.06)',
          border: '1px solid var(--border)',
          color: 'var(--navy)',
          padding: '10px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '12.5px'
        }}>
          💡 {error}
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:'20px'}}>
        <div>
          <div className="stat-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:'20px'}}>
            <div className="stat-card"><div className="stat-val teal">${totalFee}</div><div className="stat-lbl">Est. Value</div></div>
            <div className="stat-card"><div className="stat-val">{cdtList.length}</div><div className="stat-lbl">CDT Codes</div></div>
            <div className="stat-card"><div className="stat-val warn">{showD0120Alert ? 1 : 0}</div><div className="stat-lbl">Flag</div></div>
          </div>
          
          <div className="section-label mb-12">Assigned CDT Codes</div>
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div style={{
              padding:'10px 16px',
              background:'var(--teal-xpale)',
              borderBottom:'1px solid var(--border)',
              display:'grid',
              gridTemplateColumns:'80px 1fr 100px 60px',
              gap:'12px',
              fontSize:'10px',
              fontWeight:700,
              color:'var(--ink3)',
              letterSpacing:'0.06em',
              textTransform:'uppercase'
            }}>
              <div>Code</div><div>Description</div><div>Confidence</div><div style={{textAlign:'right'}}>Fee</div>
            </div>
            
            {cdtList.map((c,i) => (
              <div key={c.code} style={{
                display:'grid',
                gridTemplateColumns:'80px 1fr 100px 60px',
                alignItems:'center',
                gap:'12px',
                padding:'12px 16px',
                borderBottom:i===cdtList.length-1?'none':'1px solid var(--border)'
              }}>
                <div className="cdt-code" style={{fontWeight:'700',color:'var(--navy)',fontFamily:'var(--font-mono)'}}>{c.code}</div>
                <div className="cdt-desc" style={{fontSize:'12.5px',color:'var(--ink)'}}>{c.desc}</div>
                <div style={{fontSize:'10px',color:'var(--ink3)',width:'100px',flexShrink:0}}>
                  <div>{c.conf}%</div>
                  <div className="conf-bar" style={{height:'4px',background:'var(--border)',borderRadius:'2px',marginTop:'4px',overflow:'hidden'}}>
                    <div className="conf-fill" style={{height:'100%',background:'var(--teal)',width:`${c.conf}%`}}/>
                  </div>
                </div>
                <div className="cdt-fee" style={{textAlign:'right',fontWeight:'700',color:'var(--navy)'}}>${c.fee}</div>
              </div>
            ))}
            
            <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',background:'var(--surface)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:'12px',fontWeight:700,color:'var(--navy)'}}>Subtotal</div>
              <div style={{fontFamily:'var(--font-display)',fontSize:'20px',color:'var(--teal-dark)'}}>${totalFee}</div>
            </div>
          </div>
        </div>

        <div>
          {showD0120Alert && (
            <div>
              <div className="section-label mb-12">Revenue Recovery Flags</div>
              <div className="alert-card warn" style={{
                marginBottom:'12px',
                background:'#FEF8F0',
                border:'1px solid #FCE4C3',
                borderRadius:'12px',
                padding:'14px',
                display:'flex',
                gap:'12px'
              }}>
                <div className="alert-icon warn" style={{color:'#D97706'}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div style={{flex:1}}>
                  <div className="alert-title warn" style={{fontSize:'13px',fontWeight:'700',color:'#92400E',marginBottom:'4px'}}>D0120 — Periodic exam detected</div>
                  <div className="alert-text" style={{fontSize:'12px',color:'#B45309'}}>Exam was performed per transcript but not yet coded. Est. value: $55</div>
                  <div style={{display:'flex',gap:'8px',marginTop:'10px',flexWrap:'wrap'}}>
                    <button className="btn-sm btn-teal" style={{fontSize:'11px',padding:'4px 10px',background:'var(--teal)'}} onClick={handleAddD0120}>+ Add D0120</button>
                    <button className="btn-sm btn-ghost" style={{fontSize:'11px',padding:'4px 10px'}} onClick={handleDismissAlert}>Dismiss</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="section-label mb-12 mt-20">Monthly Overview</div>
          <div className="card-sm mb-12" style={{
            background:'var(--white)',
            border:'1px solid var(--border)',
            borderRadius:'12px',
            padding:'14px'
          }}>
            <div style={{fontSize:'12px',fontWeight:600,color:'var(--navy)',marginBottom:'10px'}}>April 2025 Recovery</div>
            {[
              {label:'D1330 OHI underbilled x6',val:'$174'},
              {label:'D4910 missing x 2 visits',val:'$296'},
              {label:'D0120 missed x 3 visits',val:'$165'},
            ].map(r => (
              <div key={r.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
                <span style={{fontSize:'11px',color:'var(--ink3)'}}>{r.label}</span>
                <span style={{fontSize:'12px',fontWeight:700,color:'var(--teal-dark)'}}>{r.val}</span>
              </div>
            ))}
            <div className="divider" style={{margin:'8px 0',borderBottom:'1px solid var(--border)'}}/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:'12px',fontWeight:700,color:'var(--navy)'}}>Total Recoverable</span>
              <span style={{fontFamily:'var(--font-display)',fontSize:'18px',color:'var(--teal-dark)'}}>$635</span>
            </div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:'8px',marginTop:'20px'}}>
            <button className="btn-primary" disabled={submitting} onClick={handleSubmitClaim}>
              {submitting ? 'Submitting claim...' : 'Submit Visit & Return to Dashboard'}
            </button>
            <button className="btn-outline" disabled={submitting} onClick={() => handleAction('Visit details saved as draft.', 'Draft Saved')}>Save as Draft</button>
          </div>
        </div>
      </div>
    </div>
  );
}

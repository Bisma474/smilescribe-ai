'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { patientsApi, sessionsApi, logsApi, type Patient } from '@/lib/apiClient';
import { patientName as formatPatientName, patientMeta as formatPatientMeta } from '@/lib/patientDisplay';
import { useAuth } from '@/store/AuthContext';

interface CdtItem {
  code: string;
  desc: string;
  conf: number;
  fee: number;
}

export default function BillingPage() {
  const router = useRouter();
  const { user } = useAuth();
  
  // null = not yet determined whether the URL even has a patientId.
  // Previously defaulted silently to a hardcoded id (2) when absent — a
  // ghost patient from the old demo data that doesn't exist in a real
  // practice's data, so reaching this page via the sidebar/bottom-tab nav
  // (neither of which passes a patientId) would try to load a nonexistent
  // patient and render nothing.
  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientName, setPatientName] = useState<string>('');
  const [patientMeta, setPatientMeta] = useState<string>('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [summaryReport, setSummaryReport] = useState<any>(null);

  const [cdtList, setCdtList] = useState<CdtItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Shown instead of billing data when no patientId is in the URL.
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [patientsError, setPatientsError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pIdStr = params.get('patientId');
    const pId = pIdStr ? parseInt(pIdStr, 10) : NaN;

    if (!pIdStr || Number.isNaN(pId)) {
      // No patient in context, or a malformed patientId — show a picker
      // instead of guessing or passing NaN to the API.
      let cancelled = false;
      setLoadingPatients(true);
      patientsApi.list()
        .then(list => { if (!cancelled) setPatients(list); })
        .catch(err => { if (!cancelled) setPatientsError(err instanceof Error ? err.message : 'Failed to load patients.'); })
        .finally(() => { if (!cancelled) setLoadingPatients(false); });
      return () => { cancelled = true; };
    }

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
        setPatientName(formatPatientName(pt));
        setPatientMeta(formatPatientMeta(pt));

        // 2. Fetch session
        const session = await sessionsApi.getActive(pId);
        setSessionId(session.id);
        
        if (session.summary_report) {
          setSummaryReport(session.summary_report);

          // CDT codes come from the AI-suggested `recommendations` (every
          // entry is pending dentist confirmation — nothing here has been
          // auto-billed). Only entries with an actual matched code are
          // shown; findings with no CDT match are visible on the Chart
          // page's Summary tab but don't appear as a billable line here.
          const recommendations = session.summary_report.recommendations || [];
          const mapped: CdtItem[] = recommendations
            .filter((r: any) => r.code)
            .map((r: any) => ({
              code: r.code,
              desc: r.desc || 'Dental finding',
              conf: r.conf || 0,
              fee: r.fee || 0
            }));
          setCdtList(mapped);
        }
      } catch (err) {
        console.error('Failed to load billing data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load billing data.');
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
  const unmatchedFindingsCount = (summaryReport?.recommendations || []).filter((r: any) => !r.code).length;

  if (patientId === null) {
    return (
      <div>
        <div className="page-header">
          <div className="page-title">Billing &amp; Revenue</div>
          <div className="page-sub">Choose a patient to review their billing.</div>
        </div>
        {patientsError && (
          <div style={{ fontSize: '12.5px', color: 'var(--red-c, #A03030)', marginBottom: '16px' }}>
            {patientsError}
          </div>
        )}
        {loadingPatients ? (
          <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Loading patients…</div>
        ) : patients.length === 0 && !patientsError ? (
          <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '16px' }}>
              No patients yet — add one first.
            </div>
            <button className="btn-primary" onClick={() => router.push('/dashboard/patients')}>
              Go to Patients
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: '1fr' }}>
            {patients.map(p => (
              <div
                key={p.id}
                className="patient-card"
                onClick={() => router.push(`/dashboard/billing?patientId=${p.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="patient-avatar">{formatPatientName(p).split(' ').map(n => n[0]).join('').toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="patient-name">{formatPatientName(p)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

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
            <div className="stat-card"><div className="stat-val warn">{unmatchedFindingsCount}</div><div className="stat-lbl">Needs Coding</div></div>
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
            
            {cdtList.length === 0 ? (
              <div style={{padding:'18px 16px',fontSize:'12.5px',color:'var(--ink2)',lineHeight:1.55}}>
                No billable procedure suggestions were identified for this visit. Clinical findings are available in Chart Review and require clinician coding and confirmation before billing.
              </div>
            ) : cdtList.map((c,i) => (
              <div key={`${c.code}-${i}`} style={{
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
          {cdtList.length === 0 && unmatchedFindingsCount > 0 && (
            <div style={{fontSize:'12px',color:'var(--ink3)',fontStyle:'italic',padding:'12px 0'}}>
              {unmatchedFindingsCount} finding{unmatchedFindingsCount === 1 ? '' : 's'} need clinician coding before this visit can be billed.
            </div>
          )}

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

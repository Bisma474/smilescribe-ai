'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { patientsApi, sessionsApi, logsApi, type Patient, type ClinicalSession } from '@/lib/apiClient';
import { patientName as formatPatientName, patientMeta as formatPatientMeta } from '@/lib/patientDisplay';
import { useAuth } from '@/store/AuthContext';

interface ToothInfo {
  buccal: [number, number, number];
  lingual: [number, number, number];
  bopBuccal: [boolean, boolean, boolean];
  bopLingual: [boolean, boolean, boolean];
  suppuration: boolean;
  finding?: string;
  label?: string;
}

const generateDefaultPerioData = (): Record<number, ToothInfo> => {
  const initialData: Record<number, ToothInfo> = {};
  for (let i = 1; i <= 32; i++) {
    initialData[i] = {
      buccal: [2, 2, 2],
      lingual: [2, 2, 2],
      bopBuccal: [false, false, false],
      bopLingual: [false, false, false],
      suppuration: false
    };
  }
  return initialData;
};

const TABS = ['Perio Chart', 'Clinical Entries', 'Summary', 'AI Visit Note', 'Transcript Evidence'];

interface ClinicalEntry {
  tooth: string;
  label: string;
  detail: string;
  cdt: string | null;
  conf: number;
  fee: number | null;
  color: string;
  segments?: { start: number; end: number; quote: string }[];
}

interface SummaryReport {
  chief_complaint?: string | null;
  clinical_notes?: string;
  procedures?: { code: string | null; desc: string; fee: number | null; status: string }[];
  recommendations?: { code: string | null; desc: string; fee: number | null; status: string; tooth?: string }[];
  est_recovery?: number | null;
}

function ChartContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientName, setPatientName] = useState<string>('');
  const [patientMeta, setPatientMeta] = useState<string>('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [visits, setVisits] = useState<ClinicalSession[]>([]);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [patientsError, setPatientsError] = useState('');

  const [activeTab, setActiveTab] = useState<'perio' | 'entries' | 'summary' | 'note' | 'transcript'>('perio');
  const [selectedTooth, setSelectedTooth] = useState<number>(14);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  const [perioData, setPerioData] = useState<Record<number, ToothInfo>>(() => generateDefaultPerioData());

  const [transcript, setTranscript] = useState<string>('');
  const [clinicalEntries, setClinicalEntries] = useState<ClinicalEntry[]>([]);
  const [summaryReport, setSummaryReport] = useState<SummaryReport | null>(null);
  const [aiNote, setAiNote] = useState<any>({ status: 'draft', sections: {} });
  const [noteSaving, setNoteSaving] = useState(false);
  const [hoveredQuote, setHoveredQuote] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [diarizationStatus, setDiarizationStatus] = useState<ClinicalSession['diarization_status']>('not_run');
  const [speakersSwapped, setSpeakersSwapped] = useState(false);
  const [swapping, setSwapping] = useState(false);

  useEffect(() => {
    const pIdStr = searchParams.get('patientId');
    const pId = pIdStr ? parseInt(pIdStr, 10) : NaN;
    const sessIdStr = searchParams.get('sessionId');
    const sessIdFromUrl = sessIdStr ? parseInt(sessIdStr, 10) : NaN;

    if (!pIdStr || Number.isNaN(pId)) {
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

        try {
          await logsApi.create({
            action: 'Access',
            user_name: user?.full_name || 'Dr. Alice Kim',
            details: `Accessed patient chart review (ID: ${pId})`
          });
        } catch (lErr) {
          console.warn('Failed to write audit log:', lErr);
        }

        const pt = await patientsApi.get(pId);
        setPatientName(formatPatientName(pt));
        setPatientMeta(formatPatientMeta(pt));

        const history = await sessionsApi.history(pId);
        setVisits(history.filter(item => item.status !== 'new'));
        const session = Number.isNaN(sessIdFromUrl)
          ? await sessionsApi.getActive(pId)
          : await sessionsApi.getById(sessIdFromUrl);
        setSessionId(session.id);

        if (session.perio_data) {
          const merged = generateDefaultPerioData();
          Object.assign(merged, session.perio_data);
          setPerioData(merged);
        } else {
          const initial = generateDefaultPerioData();
          setPerioData(initial);
          await sessionsApi.update(session.id, { perio_data: initial });
        }

        setTranscript(session.transcript || '');
        setClinicalEntries((session.clinical_entries as ClinicalEntry[]) || []);
        setSummaryReport((session.summary_report as SummaryReport) || null);
        setAiNote(session.ai_note || { status: 'draft', sections: { chief_complaint: '', findings: '', assessment: '', plan: '', instructions: '' } });
        setDiarizationStatus(session.diarization_status || 'not_run');
        setSpeakersSwapped(!!session.speakers_swapped);

        if (session.status === 'error') {
          setError(session.error_message || 'The last recording failed to process.');
        } else if (session.status === 'processing') {
          setIsProcessing(true);
        }
      } catch (err) {
        console.error('Failed to load chart data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chart data.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [searchParams, user]);

  const saveToBackend = async (data: Record<number, ToothInfo>, toothEdited: number) => {
    if (!sessionId) return;
    try {
      setSaveStatus('saving');
      await sessionsApi.update(sessionId, { perio_data: data });
      try {
        await logsApi.create({
          action: 'Clinical',
          user_name: user?.full_name || 'Dr. Alice Kim',
          details: `Updated pocket depths for Tooth #${toothEdited}`
        });
      } catch (lErr) {
        console.warn('Failed to write audit log:', lErr);
      }
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to auto-save:', err);
      setSaveStatus('error');
    }
  };

  const handleSwapSpeakers = async () => {
    if (!sessionId || swapping) return;
    try {
      setSwapping(true);
      const updated = await sessionsApi.swapSpeakers(sessionId);
      setTranscript(updated.transcript || '');
      setSpeakersSwapped(!!updated.speakers_swapped);
    } catch (err) {
      console.error('Failed to swap speaker labels:', err);
    } finally {
      setSwapping(false);
    }
  };

  const getToothBgColor = (t: number) => {
    const tooth = perioData[t];
    if (!tooth) return 'var(--white)';
    const maxDepth = Math.max(...tooth.buccal, ...tooth.lingual);
    if (t === selectedTooth) return 'var(--teal-pale)';
    if (maxDepth >= 5) return '#FEEEEE';
    if (maxDepth === 4) return '#FFF9E6';
    if (tooth.label?.includes('Calculus')) return '#EBF9F7';
    return 'var(--white)';
  };

  const getToothBorderColor = (t: number) => {
    const tooth = perioData[t];
    if (!tooth) return 'var(--border2)';
    const maxDepth = Math.max(...tooth.buccal, ...tooth.lingual);
    if (t === selectedTooth) return 'var(--teal-dark)';
    if (maxDepth >= 5) return 'var(--red-c)';
    if (maxDepth === 4) return 'var(--orange-c)';
    if (tooth.label?.includes('Calculus')) return 'var(--teal)';
    return 'var(--border2)';
  };

  const updateProbingDepth = (type: 'buccal' | 'lingual', index: number, delta: number) => {
    setPerioData(prev => {
      const tooth = prev[selectedTooth];
      if (!tooth) return prev;
      const newArray = [...tooth[type]] as [number, number, number];
      newArray[index] = Math.max(1, Math.min(10, newArray[index] + delta));
      const updated = {
        ...prev,
        [selectedTooth]: { ...tooth, [type]: newArray }
      };
      saveToBackend(updated, selectedTooth);
      return updated;
    });
  };

  const toggleBop = (type: 'bopBuccal' | 'bopLingual', index: number) => {
    setPerioData(prev => {
      const tooth = prev[selectedTooth];
      if (!tooth) return prev;
      const newArray = [...tooth[type]] as [boolean, boolean, boolean];
      newArray[index] = !newArray[index];
      const updated = {
        ...prev,
        [selectedTooth]: { ...tooth, [type]: newArray }
      };
      saveToBackend(updated, selectedTooth);
      return updated;
    });
  };

  const upperTeeth = Array.from({ length: 16 }, (_, i) => i + 1);
  const lowerTeeth = Array.from({ length: 16 }, (_, i) => 32 - i);

  if (patientId === null) {
    return (
      <div>
        <div className="page-header">
          <div className="page-title">Chart Review</div>
          <div className="page-sub">Choose a patient to review their chart.</div>
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
                onClick={() => {
                  setPatientId(p.id);
                  router.push(`/dashboard/chart?patientId=${p.id}`);
                }}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '10px' }}
              >
                <div className="patient-avatar" style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'var(--teal-pale, #E8F7F5)', color: 'var(--teal-dark, #007A78)', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {formatPatientName(p).split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="patient-name" style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--navy)' }}>{formatPatientName(p)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>{formatPatientMeta(p)}</div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--teal-dark)', fontWeight: 600 }}>
                  Open Chart &rarr;
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
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:'12px',marginBottom:'16px',paddingBottom:'16px',borderBottom:'1px solid var(--border)'}}>
        <div>
          <div className="page-title" style={{display:'flex',alignItems:'center',gap:'8px'}}>
            Chart Review
            {saveStatus === 'saving' && (
              <span className="badge badge-warn" style={{fontSize:'10px',padding:'2px 8px'}}>Saving changes...</span>
            )}
            {saveStatus === 'saved' && (
              <span className="badge badge-teal" style={{fontSize:'10px',padding:'2px 8px'}}>✓ Saved to Database</span>
            )}
            {saveStatus === 'error' && (
              <span className="badge badge-gray" style={{fontSize:'10px',padding:'2px 8px'}}>⚠ State Saved Locally</span>
            )}
          </div>
          <div className="page-sub">
            {patientName} · {patientMeta} · Evidence-grounded clinical NLP
          </div>
          {visits.length > 0 && (
            <select aria-label="Select visit" value={sessionId ?? ''} onChange={e => router.push('/dashboard/chart?patientId=' + patientId + '&sessionId=' + e.target.value)} className="form-select" style={{marginTop:'8px',maxWidth:'280px'}}>
              {visits.map(visit => <option key={visit.id} value={visit.id}>{new Date(visit.created_at).toLocaleString()} · {visit.status}</option>)}
            </select>
          )}
        </div>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
          <div className="xai-hint-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Interactive Chart: Click teeth to inspect and edit depths
          </div>
          <button className="btn-sm btn-ghost" onClick={() => setActiveTab('perio')}>✎ Perio Edit</button>
          <button className="btn-sm btn-teal" onClick={() => router.push(`/dashboard/billing?patientId=${patientId}${sessionId ? `&sessionId=${sessionId}` : ''}`)}>Proceed to Billing →</button>
        </div>
      </div>

      {isProcessing && (
        <div style={{
          background: '#FFF9E6',
          border: '1px solid var(--orange-c)',
          color: 'var(--orange-c)',
          padding: '10px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '12.5px',
          fontWeight: 600
        }}>
          ⟳ A new recording is still processing — the data below is from the previous visit. Refresh in a moment to see the updated chart.
        </div>
      )}

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
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{display:'flex',gap:'4px',borderBottom:'1px solid var(--border)',marginBottom:'16px'}}>
        {TABS.map((t, idx) => {
          const tabKey = idx === 0 ? 'perio' : idx === 1 ? 'entries' : idx === 2 ? 'summary' : idx === 3 ? 'note' : 'transcript';
          const active = activeTab === tabKey;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(tabKey as any)}
              style={{
                padding:'8px 16px',
                fontSize:'13px',
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--teal-dark)' : 'var(--ink3)',
                borderBottom: active ? '2px solid var(--teal)' : '2px solid transparent',
                background:'none',
                borderTop:'none',
                borderLeft:'none',
                borderRight:'none',
                cursor:'pointer'
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Main Grid: Left Tab Content vs Right Transcript */}
      <div style={{display:'grid',gridTemplateColumns:activeTab === 'transcript' ? '1fr' : '1fr 400px',gap:'20px',alignItems:'start'}}>
        <div>
          {/* TAB 1: PERIO CHART */}
          {activeTab === 'perio' && (
            <div style={{padding:'16px'}}>
              {/* Tooth Arches Display */}
              <div style={{marginBottom:'20px'}}>
                {/* Upper Arch */}
                <div style={{fontSize:'11px',fontWeight:'bold',color:'var(--navy)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'8px'}}>Maxillary Arch (Upper Teeth 1-16)</div>
                <div style={{
                  display:'grid',
                  gridTemplateColumns:'repeat(16, minmax(0, 1fr))',
                  gap:'4px',
                  overflowX:'auto',
                  paddingBottom:'8px',
                  marginBottom:'16px'
                }}>
                  {upperTeeth.map(t => {
                    const tooth = perioData[t] || { buccal: [2,2,3], lingual: [2,2,2] };
                    const maxDepth = Math.max(...tooth.buccal, ...tooth.lingual);
                    return (
                      <div
                        key={t}
                        onClick={() => setSelectedTooth(t)}
                        style={{
                          display:'flex',
                          flexDirection:'column',
                          alignItems:'center',
                          padding:'8px 2px',
                          borderRadius:'8px',
                          border:`1.5px solid ${getToothBorderColor(t)}`,
                          background: getToothBgColor(t),
                          cursor:'pointer',
                          transition:'all 0.15s ease',
                          minWidth:'32px',
                          boxShadow: selectedTooth === t ? '0 0 0 2px var(--teal)' : 'none'
                        }}
                      >
                        <div style={{fontSize:'11px',fontWeight:'800',color:'var(--navy)',marginBottom:'6px'}}>{t}</div>
                        <div style={{
                          width:'18px',
                          height:'24px',
                          borderRadius:'5px 5px 8px 8px',
                          border:`1.5px solid ${maxDepth >= 5 ? 'var(--red-c)' : maxDepth === 4 ? 'var(--orange-c)' : 'var(--border2)'}`,
                          background: maxDepth >= 5 ? 'rgba(229,62,62,0.1)' : maxDepth === 4 ? 'rgba(192,112,16,0.1)' : 'var(--surface)',
                          display:'flex',
                          flexDirection:'column',
                          alignItems:'center',
                          justifyContent:'center',
                          fontSize:'9px',
                          fontWeight:'800',
                          color: maxDepth >= 5 ? 'var(--red-c)' : maxDepth === 4 ? 'var(--orange-c)' : 'var(--ink3)'
                        }}>
                          {maxDepth}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Lower Arch */}
                <div style={{fontSize:'11px',fontWeight:'bold',color:'var(--navy)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'8px'}}>Mandibular Arch (Lower Teeth 17-32)</div>
                <div style={{
                  display:'grid',
                  gridTemplateColumns:'repeat(16, minmax(0, 1fr))',
                  gap:'4px',
                  overflowX:'auto',
                  paddingBottom:'8px'
                }}>
                  {lowerTeeth.map(t => {
                    const tooth = perioData[t] || { buccal: [2,2,3], lingual: [2,2,2] };
                    const maxDepth = Math.max(...tooth.buccal, ...tooth.lingual);
                    return (
                      <div
                        key={t}
                        onClick={() => setSelectedTooth(t)}
                        style={{
                          display:'flex',
                          flexDirection:'column',
                          alignItems:'center',
                          padding:'8px 2px',
                          borderRadius:'8px',
                          border:`1.5px solid ${getToothBorderColor(t)}`,
                          background: getToothBgColor(t),
                          cursor:'pointer',
                          transition:'all 0.15s ease',
                          minWidth:'32px',
                          boxShadow: selectedTooth === t ? '0 0 0 2px var(--teal)' : 'none'
                        }}
                      >
                        <div style={{fontSize:'11px',fontWeight:'800',color:'var(--navy)',marginBottom:'6px'}}>{t}</div>
                        <div style={{
                          width:'18px',
                          height:'24px',
                          borderRadius:'8px 8px 5px 5px',
                          border:`1.5px solid ${maxDepth >= 5 ? 'var(--red-c)' : maxDepth === 4 ? 'var(--orange-c)' : 'var(--border2)'}`,
                          background: maxDepth >= 5 ? 'rgba(229,62,62,0.1)' : maxDepth === 4 ? 'rgba(192,112,16,0.1)' : 'var(--surface)',
                          display:'flex',
                          flexDirection:'column',
                          alignItems:'center',
                          justifyContent:'center',
                          fontSize:'9px',
                          fontWeight:'800',
                          color: maxDepth >= 5 ? 'var(--red-c)' : maxDepth === 4 ? 'var(--orange-c)' : 'var(--ink3)'
                        }}>
                          {maxDepth}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Inspector Panel */}
              <div style={{
                display:'grid',
                gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))',
                gap:'20px',
                background:'var(--surface)',
                border:'1px solid var(--border)',
                borderRadius:'12px',
                padding:'16px'
              }}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
                    <div style={{width:'32px',height:'32px',borderRadius:'8px',background:'var(--navy)',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'800',fontFamily:'var(--font-mono)'}}>
                      #{selectedTooth}
                    </div>
                    <div>
                      <div style={{fontSize:'14px',fontWeight:'700',color:'var(--navy)'}}>Tooth #{selectedTooth} Details</div>
                      <div style={{fontSize:'11px',color:'var(--ink3)'}}>
                        {selectedTooth <= 16 ? 'Maxillary Upper Arch' : 'Mandibular Lower Arch'} · {perioData[selectedTooth]?.finding ? 'Findings on record' : 'Normal parameters'}
                      </div>
                    </div>
                  </div>

                  {perioData[selectedTooth]?.finding ? (
                    <div style={{
                      background:'rgba(74,191,176,0.06)',
                      border:'1px solid rgba(74,191,176,0.2)',
                      borderRadius:'8px',
                      padding:'10px 12px',
                      fontSize:'12px',
                      color:'var(--ink2)',
                      lineHeight:'1.4',
                      marginBottom:'12px'
                    }}>
                      <div style={{fontWeight:'700',color:'var(--teal-dark)',marginBottom:'4px'}}>AI Clinical Findings:</div>
                      {perioData[selectedTooth].finding}
                    </div>
                  ) : (
                    <div style={{fontSize:'12px',color:'var(--ink3)',fontStyle:'italic',marginBottom:'12px'}}>
                      No abnormal clinical conditions detected for this tooth. Probing values set to defaults.
                    </div>
                  )}

                  <div style={{display:'flex',gap:'8px',flexDirection:'column'}}>
                    <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'12px',color:'var(--ink2)',cursor:'pointer'}}>
                      <input
                        type="checkbox"
                        checked={perioData[selectedTooth]?.suppuration || false}
                        onChange={(e) => {
                          const updatedVal = e.target.checked;
                          setPerioData(prev => {
                            const updated = {
                              ...prev,
                              [selectedTooth]: { ...prev[selectedTooth], suppuration: updatedVal }
                            };
                            saveToBackend(updated, selectedTooth);
                            return updated;
                          });
                        }}
                        style={{cursor:'pointer'}}
                      />
                      <span>Active suppuration (pus) noted</span>
                    </label>
                  </div>
                </div>

                {/* Measurements controller */}
                <div>
                  <div style={{fontSize:'12px',fontWeight:'bold',color:'var(--navy)',marginBottom:'10px'}}>Buccal Probing Depths &amp; BOP</div>
                  <div style={{display:'flex',gap:'12px',marginBottom:'16px'}}>
                    {(perioData[selectedTooth]?.buccal || [2,2,3]).map((val, idx) => (
                      <div key={`buccal-${idx}`} style={{flex:1,textAlign:'center'}}>
                        <div style={{fontSize:'10px',color:'var(--ink3)',marginBottom:'4px'}}>
                          {idx === 0 ? 'Mesial' : idx === 1 ? 'Straight' : 'Distal'}
                        </div>
                        <div style={{
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'center',
                          gap:'4px',
                          background:'var(--white)',
                          border:'1px solid var(--border)',
                          borderRadius:'8px',
                          padding:'6px'
                        }}>
                          <button
                            onClick={() => updateProbingDepth('buccal', idx, -1)}
                            style={{border:'none',background:'none',cursor:'pointer',fontWeight:'bold',color:'var(--ink3)',padding:'0 4px'}}
                          >-</button>
                          <span style={{
                            fontSize:'14px',
                            fontWeight:'bold',
                            fontFamily:'var(--font-mono)',
                            color: val >= 5 ? 'var(--red-c)' : val === 4 ? 'var(--orange-c)' : 'var(--ink)'
                          }}>{val}</span>
                          <button
                            onClick={() => updateProbingDepth('buccal', idx, 1)}
                            style={{border:'none',background:'none',cursor:'pointer',fontWeight:'bold',color:'var(--ink3)',padding:'0 4px'}}
                          >+</button>
                        </div>
                        <button
                          onClick={() => toggleBop('bopBuccal', idx)}
                          style={{
                            marginTop:'6px',
                            fontSize:'10px',
                            cursor:'pointer',
                            borderRadius:'4px',
                            padding:'2px 6px',
                            background: perioData[selectedTooth]?.bopBuccal[idx] ? '#FEEEEE' : 'transparent',
                            color: perioData[selectedTooth]?.bopBuccal[idx] ? 'var(--red-c)' : 'var(--ink3)',
                            border: `1px solid ${perioData[selectedTooth]?.bopBuccal[idx] ? 'var(--red-c)' : 'var(--border)'}`,
                            fontWeight: perioData[selectedTooth]?.bopBuccal[idx] ? 'bold' : 'normal'
                          }}
                        >
                          BOP
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{fontSize:'12px',fontWeight:'bold',color:'var(--navy)',marginBottom:'10px'}}>Lingual Probing Depths &amp; BOP</div>
                  <div style={{display:'flex',gap:'12px'}}>
                    {(perioData[selectedTooth]?.lingual || [2,2,2]).map((val, idx) => (
                      <div key={`lingual-${idx}`} style={{flex:1,textAlign:'center'}}>
                        <div style={{fontSize:'10px',color:'var(--ink3)',marginBottom:'4px'}}>
                          {idx === 0 ? 'Mesial' : idx === 1 ? 'Straight' : 'Distal'}
                        </div>
                        <div style={{
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'center',
                          gap:'4px',
                          background:'var(--white)',
                          border:'1px solid var(--border)',
                          borderRadius:'8px',
                          padding:'6px'
                        }}>
                          <button
                            onClick={() => updateProbingDepth('lingual', idx, -1)}
                            style={{border:'none',background:'none',cursor:'pointer',fontWeight:'bold',color:'var(--ink3)',padding:'0 4px'}}
                          >-</button>
                          <span style={{
                            fontSize:'14px',
                            fontWeight:'bold',
                            fontFamily:'var(--font-mono)',
                            color: val >= 5 ? 'var(--red-c)' : val === 4 ? 'var(--orange-c)' : 'var(--ink)'
                          }}>{val}</span>
                          <button
                            onClick={() => updateProbingDepth('lingual', idx, 1)}
                            style={{border:'none',background:'none',cursor:'pointer',fontWeight:'bold',color:'var(--ink3)',padding:'0 4px'}}
                          >+</button>
                        </div>
                        <button
                          onClick={() => toggleBop('bopLingual', idx)}
                          style={{
                            marginTop:'6px',
                            fontSize:'10px',
                            cursor:'pointer',
                            borderRadius:'4px',
                            padding:'2px 6px',
                            background: perioData[selectedTooth]?.bopLingual[idx] ? '#FEEEEE' : 'transparent',
                            color: perioData[selectedTooth]?.bopLingual[idx] ? 'var(--red-c)' : 'var(--ink3)',
                            border: `1px solid ${perioData[selectedTooth]?.bopLingual[idx] ? 'var(--red-c)' : 'var(--border)'}`,
                            fontWeight: perioData[selectedTooth]?.bopLingual[idx] ? 'bold' : 'normal'
                          }}
                        >
                          BOP
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CLINICAL ENTRIES LIST */}
          {activeTab === 'entries' && (
            <div style={{padding:'16px'}}>
              {clinicalEntries.length === 0 ? (
                <div style={{fontSize:'12px',color:'var(--ink3)',fontStyle:'italic',padding:'12px 0'}}>
                  No clinical findings yet — record a visit to generate AI-extracted chart entries here.
                </div>
              ) : (
                <>
                  <div style={{fontSize:'11px',color:'var(--ink3)',marginBottom:'12px'}}>AI-extracted chart entries from transcript — hover an entry to highlight its supporting sentence in the transcript panel</div>
                  {clinicalEntries.map((e, i) => {
                    const quote = e.segments?.[0]?.quote;
                    const highlighted = !!quote && hoveredQuote === quote;
                    return (
                      <div
                        key={i}
                        onMouseEnter={() => quote && setHoveredQuote(quote)}
                        onMouseLeave={() => setHoveredQuote(null)}
                        style={{
                          display:'flex',
                          alignItems:'flex-start',
                          gap:'12px',
                          padding:'14px',
                          borderBottom:'1px solid var(--border)',
                          cursor: quote ? 'pointer' : 'default',
                          transition:'all 0.18s ease',
                          borderLeft:`4px solid ${highlighted ? 'var(--teal)' : 'transparent'}`,
                          background: highlighted ? 'var(--teal-xpale)' : 'transparent',
                          borderRadius:'6px'
                        }}
                      >
                        <div style={{width:'40px',height:'40px',borderRadius:'10px',background:'var(--surface)',border:'1px solid var(--border2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:800,color:'var(--navy)',fontFamily:'var(--font-mono)',flexShrink:0}}>
                          {e.tooth}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:'13px',fontWeight:700,color:'var(--ink)',display:'flex',alignItems:'center',gap:'8px'}}>
                            {e.label}
                            {highlighted && (
                              <span style={{fontSize:'9px',color:'var(--teal-dark)',background:'var(--teal-pale)',padding:'1px 6px',borderRadius:'8px',fontWeight:'600'}}>Synced</span>
                            )}
                          </div>
                          <div style={{fontSize:'11px',color:'var(--ink3)',marginTop:'2px',lineHeight:1.5}}>{e.detail}</div>
                          <div style={{fontSize:'10px',fontFamily:'var(--font-mono)',color:'var(--teal-dark)',fontWeight:600,marginTop:'4px'}}>
                            {e.cdt || 'No CDT code assigned'} · {e.conf}% confidence{e.fee != null ? ` · Est. $${e.fee}` : ''}
                          </div>
                        </div>
                        <div style={{width:'8px',height:'8px',borderRadius:'50%',background:e.color,flexShrink:0,marginTop:'6px'}}/>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {activeTab === 'note' && (
            <div style={{padding:'20px'}}>
              <div className="card" style={{padding:'18px'}}>
                <div style={{fontSize:'15px',fontWeight:700,color:'var(--navy)',marginBottom:'6px'}}>AI Visit Note</div>
                <div style={{fontSize:'12px',color:'var(--ink3)',marginBottom:'14px'}}>Editable draft for this selected visit. Review before approval.</div>
                {['chief_complaint','findings','assessment','plan','instructions'].map(section => (
                  <label key={section} style={{display:'block',fontSize:'11px',fontWeight:700,textTransform:'capitalize',color:'var(--ink3)',marginTop:'10px'}}>
                    {section.replace('_',' ')}
                    <textarea className="form-input" value={aiNote.sections?.[section] || ''} onChange={e => setAiNote({...aiNote, status:'draft', sections:{...aiNote.sections,[section]:e.target.value}})} style={{width:'100%',minHeight:'70px',marginTop:'4px'}} />
                  </label>
                ))}
                <div style={{display:'flex',gap:'8px',marginTop:'14px'}}>
                  <button className="btn-sm btn-ghost" disabled={noteSaving} onClick={async () => { if (!sessionId) return; setNoteSaving(true); try { const updated = await sessionsApi.generateAiNote(sessionId); setAiNote(updated.ai_note || aiNote); } finally { setNoteSaving(false); } }}>{noteSaving ? 'Generating...' : 'Generate AI Note'}</button>
                  <button className="btn-sm btn-ghost" disabled={noteSaving} onClick={async () => { if (!sessionId) return; setNoteSaving(true); try { await sessionsApi.update(sessionId, { ai_note: {...aiNote, status:'draft'} }); } finally { setNoteSaving(false); } }}>Save Draft</button>
                  <button className="btn-sm btn-teal" disabled={noteSaving} onClick={async () => { if (!sessionId) return; setNoteSaving(true); try { const note={...aiNote,status: aiNote.status === 'approved' ? 'draft' : 'approved'}; await sessionsApi.update(sessionId,{ai_note:note}); setAiNote(note); } finally { setNoteSaving(false); } }}>{aiNote.status === 'approved' ? 'Reopen Draft' : 'Approve Note'}</button>
                </div>
              </div>
            </div>
          )}
          {/* TAB 3: SUMMARY REPORT */}
          {activeTab === 'summary' && (
            <div style={{padding:'20px'}}>
              <div style={{
                background:'var(--white)',
                border:'1px solid var(--border)',
                borderRadius:'12px',
                padding:'18px',
                boxShadow:'var(--shadow-sm)',
                marginBottom:'20px'
              }}>
                <div style={{fontSize:'15px',fontWeight:'bold',color:'var(--navy)',marginBottom:'12px',borderBottom:'1.5px solid var(--border)',paddingBottom:'6px'}}>
                  Patient Clinical Summary Report
                </div>

                {!summaryReport ? (
                  <div style={{fontSize:'12px',color:'var(--ink3)',fontStyle:'italic'}}>
                    No summary yet — record a visit to generate one.
                  </div>
                ) : (
                  <>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
                      <div>
                        <div style={{fontSize:'10px',fontWeight:'700',color:'var(--ink3)',textTransform:'uppercase',marginBottom:'4px'}}>Chief Complaint</div>
                        <div style={{fontSize:'12px',color:'var(--ink)'}}>{summaryReport.chief_complaint || 'Not recorded'}</div>
                      </div>
                      <div>
                        <div style={{fontSize:'10px',fontWeight:'700',color:'var(--ink3)',textTransform:'uppercase',marginBottom:'4px'}}>Clinical Notes</div>
                        <div style={{fontSize:'12px',color:'var(--ink)',lineHeight:'1.4'}}>{summaryReport.clinical_notes || 'No notes recorded'}</div>
                      </div>
                    </div>

                    {!!summaryReport.recommendations?.length && (
                      <div>
                        <div style={{fontSize:'10px',fontWeight:'700',color:'var(--ink3)',textTransform:'uppercase',marginBottom:'6px'}}>Findings Needing Follow-up</div>
                        <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                          {summaryReport.recommendations.map((r, i) => (
                            <div key={i} style={{border:'1.5px dashed var(--teal)',borderRadius:'8px',padding:'10px 12px',background:'rgba(74,191,176,0.04)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                              <div>
                                <div style={{fontSize:'13px',fontWeight:'bold',color:'var(--navy)'}}>{r.desc}{r.tooth ? ` — Tooth ${r.tooth}` : ''}</div>
                              </div>
                              {r.fee != null && (
                                <div style={{textAlign:'right'}}>
                                  <div style={{fontSize:'15px',fontWeight:'bold',color:'var(--teal-dark)'}}>${r.fee}</div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {summaryReport && (
                <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',background:'var(--navy)',borderRadius:'12px',padding:'14px 20px',color:'white'}}>
                  <button className="btn-sm btn-teal" onClick={() => router.push(`/dashboard/billing?patientId=${patientId}${sessionId ? `&sessionId=${sessionId}` : ''}`)}>Go to Billing Details →</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transcript Panel with Bidirectional Highlight */}
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid var(--border)',background:'var(--white)'}}>
            <div style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'12px',fontWeight:700,color:'var(--navy)'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Transcript · Evidence View
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              {(diarizationStatus === 'success' || diarizationStatus === 'ai_assigned') && (
                <button
                  onClick={handleSwapSpeakers}
                  disabled={swapping}
                  title="Flip the Dentist/Patient labels if speaker detection guessed wrong"
                  style={{fontSize:'10px',fontWeight:700,color:'var(--navy)',background:'var(--white)',border:'1px solid var(--border)',borderRadius:'20px',padding:'3px 10px',cursor:swapping?'default':'pointer',opacity:swapping?0.6:1}}
                >
                  ⇄ {swapping ? 'Swapping…' : 'Swap speakers'}
                </button>
              )}
              <div style={{fontSize:'10px',fontWeight:700,color:'var(--teal-dark)',background:'var(--teal-pale)',borderRadius:'20px',padding:'3px 10px'}}>↔ Bidirectional</div>
            </div>
          </div>
          {activeTab === 'transcript' && (
            <div style={{padding:'12px',borderBottom:'1px solid var(--border)',background:'var(--white)',display:'flex',gap:'8px',flexWrap:'wrap'}}>
              {clinicalEntries.map((entry, index) => {
                const quote = entry.segments?.[0]?.quote || '';
                const active = hoveredQuote === quote;
                return <button key={index} onMouseEnter={() => quote && setHoveredQuote(quote)} onMouseLeave={() => setHoveredQuote(null)} style={{border:active ? '1px solid var(--teal)' : '1px solid var(--border)',background:active ? 'var(--teal-pale)' : 'var(--surface)',borderRadius:'8px',padding:'7px 10px',cursor:'pointer',fontSize:'11px',color:'var(--navy)',textAlign:'left'}}>{entry.tooth} · {entry.label}</button>;
              })}
            </div>
          )}
          <div style={{padding:'7px 12px',fontSize:'10px',color:'var(--ink3)',background:'var(--teal-xpale)',borderBottom:'1px solid var(--border)',lineHeight:1.4}}>
            Hover a clinical entry to highlight supporting sentences below · Hover supporting sentences to highlight clinical entries
          </div>
          {diarizationStatus && diarizationStatus !== 'not_run' && (
            <div style={{
              padding:'6px 12px',fontSize:'10px',lineHeight:1.4,borderBottom:'1px solid var(--border)',
              color: diarizationStatus === 'success' ? 'var(--teal-dark)' : diarizationStatus === 'failed' ? 'var(--red-c)' : 'var(--ink3)',
              background: diarizationStatus === 'success' ? 'var(--teal-xpale)' : 'var(--white)',
            }}>
              {diarizationStatus === 'success' && (
                <>Speaker labels auto-detected — verify Dentist/Patient are correct{speakersSwapped ? ' (swapped by you)' : ''}, and use "Swap speakers" to fix if reversed.</>
              )}
              {diarizationStatus === 'ai_assigned' && (
                <>Speaker labels were inferred from the transcript text. Review them before relying on speaker identity.</>
              )}
              {diarizationStatus === 'unavailable' && (
                <>Speaker labels unavailable for this recording (single speaker detected, or diarization isn't configured) — showing the plain transcript.</>
              )}
              {diarizationStatus === 'failed' && (
                <>Speaker detection failed for this recording — showing the plain transcript without speaker labels.</>
              )}
            </div>
          )}
          <div style={{flex:1,overflowY:'auto',padding:'8px 0',maxHeight:activeTab === 'transcript' ? 'calc(100vh - 290px)' : '400px'}}>
            <div style={{padding:'8px 16px',fontSize:'12.5px',color:'var(--ink)',lineHeight:1.7}}>
              {splitTranscriptTurns(transcript).map((turn, index, turns) => (
                <div key={turn.speaker + '-' + index} onMouseEnter={() => { const entry = clinicalEntries.find(item => item.segments?.[0]?.quote && turn.text.includes(item.segments[0].quote)); if (entry?.segments?.[0]?.quote) setHoveredQuote(entry.segments[0].quote); }} onMouseLeave={() => setHoveredQuote(null)} style={{padding:'8px 0',borderBottom:index === turns.length - 1 ? 'none' : '1px solid rgba(27,58,107,0.08)',cursor:'default'}}>
                  {turn.speaker && (
                    <span style={{display:'inline-block',minWidth:'62px',marginRight:'8px',fontSize:'10px',fontWeight:800,letterSpacing:'0.06em',color:turn.speaker === 'Dentist' ? 'var(--teal-dark)' : 'var(--navy-mid)'}}>
                      {turn.speaker.toUpperCase()}
                    </span>
                  )}
                  <span>{renderTranscriptWithHighlight(turn.text, hoveredQuote)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChartPage() {
  return (
    <Suspense fallback={<div style={{ padding: '20px', color: 'var(--ink3)', fontSize: '13px' }}>Loading chart review...</div>}>
      <ChartContent />
    </Suspense>
  );
}

type TranscriptTurn = { speaker: 'Dentist' | 'Patient' | null; text: string };

function splitTranscriptTurns(transcript: string): TranscriptTurn[] {
  const label = /(?:^|\n|\s)(Dentist|Patient):\s*/gi;
  const matches = Array.from(transcript.matchAll(label));
  if (matches.length === 0) return [{ speaker: null, text: transcript.trim() }].filter(turn => turn.text);

  const turns: TranscriptTurn[] = [];
  const prefix = transcript.slice(0, matches[0].index).trim();
  if (prefix) turns.push({ speaker: null, text: prefix });

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index || transcript.length) : transcript.length;
    const text = transcript.slice(start, end).trim();
    if (text) turns.push({ speaker: match[1].toLowerCase() === 'dentist' ? 'Dentist' : 'Patient', text });
  }
  return turns;
}

function renderTranscriptWithHighlight(transcript: string, hoveredQuote: string | null) {
  if (!hoveredQuote) return transcript;
  const idx = transcript.indexOf(hoveredQuote);
  if (idx === -1) return transcript;
  const before = transcript.slice(0, idx);
  const match = transcript.slice(idx, idx + hoveredQuote.length);
  const after = transcript.slice(idx + hoveredQuote.length);
  return (
    <>
      {before}
      <mark style={{background:'rgba(255, 243, 192, 0.9)',color:'var(--navy)',fontWeight:500,borderRadius:'2px'}}>{match}</mark>
      {after}
    </>
  );
}

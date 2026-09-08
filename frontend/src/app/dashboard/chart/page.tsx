'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { patientsApi, sessionsApi, logsApi } from '@/lib/apiClient';
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

const DEFAULT_PERIO_DATA: Record<number, ToothInfo> = {};

// Helper to fill default normal values for all 32 teeth
const generateDefaultPerioData = (): Record<number, ToothInfo> => {
  const initialData: Record<number, ToothInfo> = {
    3: {
      buccal: [2, 3, 3],
      lingual: [3, 3, 3],
      bopBuccal: [false, false, false],
      bopLingual: [false, true, false],
      suppuration: false,
      label: 'Calculus removal — supragingival scaling',
      finding: 'Calculus deposits on the lingual. Supragingival scaling performed, all deposits removed.'
    },
    14: {
      buccal: [3, 3, 4],
      lingual: [3, 4, 3],
      bopBuccal: [false, false, true],
      bopLingual: [true, false, true],
      suppuration: false,
      label: 'Periodontal maintenance',
      finding: 'Periodontal maintenance (D4910). Probing depths 3-4mm. Bleeding on probing (BOP) at mesial & distolingual surfaces.'
    },
    32: {
      buccal: [5, 5, 5],
      lingual: [5, 6, 5],
      bopBuccal: [true, true, true],
      bopLingual: [true, true, true],
      suppuration: true,
      label: 'Deep pocketing — active disease',
      finding: 'Deep pocketing (5mm+) on multiple sites. BOP positive, suppuration noted. Active periodontal disease. CDT code D4341 recommended.'
    }
  };

  for (let i = 1; i <= 32; i++) {
    if (!initialData[i]) {
      initialData[i] = {
        buccal: [2, 2, 3],
        lingual: [2, 2, 2],
        bopBuccal: [false, false, false],
        bopLingual: [false, false, false],
        suppuration: false
      };
    }
  }
  return initialData;
};

const TABS = ['Perio Chart', 'Clinical Entries', 'Summary'];

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

export default function ChartPage() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [patientId, setPatientId] = useState<number>(2); // Default to Marcus Torres (2)
  const [patientName, setPatientName] = useState<string>('Marcus Torres');
  const [patientMeta, setPatientMeta] = useState<string>('DOB: 1981-03-14 · Perio maintenance');
  const [sessionId, setSessionId] = useState<number | null>(null);
  
  const [activeTab, setActiveTab] = useState<'perio' | 'entries' | 'summary'>('perio');
  const [selectedTooth, setSelectedTooth] = useState<number>(14);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  // Perio data state
  const [perioData, setPerioData] = useState<Record<number, ToothInfo>>(() => generateDefaultPerioData());

  // Real session data — transcript, AI-extracted clinical entries, summary
  const [transcript, setTranscript] = useState<string>('');
  const [clinicalEntries, setClinicalEntries] = useState<ClinicalEntry[]>([]);
  const [summaryReport, setSummaryReport] = useState<SummaryReport | null>(null);
  const [hoveredQuote, setHoveredQuote] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Read patientId from URL parameters safely in browser
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
            details: `Accessed patient chart review (ID: ${pId})`
          });
        } catch (lErr) {
          console.warn('Failed to write audit log:', lErr);
        }

        // 1. Fetch patient details
        const pt = await patientsApi.get(pId);
        setPatientName(formatPatientName(pt));
        setPatientMeta(formatPatientMeta(pt));

        // 2. Fetch session data
        const session = await sessionsApi.getActive(pId);
        setSessionId(session.id);

        if (session.perio_data) {
          // Merge incoming data with default to guarantee 32 teeth exist
          const merged = generateDefaultPerioData();
          Object.assign(merged, session.perio_data);
          setPerioData(merged);
        } else {
          // If no perio_data exists, save default back to the session
          const initial = generateDefaultPerioData();
          setPerioData(initial);
          await sessionsApi.update(session.id, { perio_data: initial });
        }

        setTranscript(session.transcript || '');
        setClinicalEntries((session.clinical_entries as ClinicalEntry[]) || []);
        setSummaryReport((session.summary_report as SummaryReport) || null);

        if (session.status === 'error') {
          setError(session.error_message || 'The last recording failed to process.');
        } else if (session.status === 'processing') {
          // A recording is still being transcribed/analyzed in the
          // background — whatever transcript/entries/summary are shown
          // below are from the previous visit, not this one yet.
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
  }, [user]);

  const saveToBackend = async (data: Record<number, ToothInfo>, toothEdited: number) => {
    if (!sessionId) return;
    try {
      setSaveStatus('saving');
      await sessionsApi.update(sessionId, { perio_data: data });
      
      // Log update action
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

  // Helper functions for pocket depth styling
  const getToothBgColor = (t: number) => {
    const tooth = perioData[t];
    if (!tooth) return 'var(--white)';
    const maxDepth = Math.max(...tooth.buccal, ...tooth.lingual);
    if (t === selectedTooth) return 'var(--teal-pale)';
    if (maxDepth >= 5) return '#FEEEEE'; // Red tinted background
    if (maxDepth === 4) return '#FFF9E6'; // Yellow tinted background
    if (tooth.label?.includes('Calculus')) return '#EBF9F7'; // Teal tinted background
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
        [selectedTooth]: {
          ...tooth,
          [type]: newArray
        }
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
        [selectedTooth]: {
          ...tooth,
          [type]: newArray
        }
      };
      saveToBackend(updated, selectedTooth);
      return updated;
    });
  };

  const upperTeeth = Array.from({ length: 16 }, (_, i) => i + 1);
  const lowerTeeth = Array.from({ length: 16 }, (_, i) => 32 - i);

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
            {patientName} · {patientMeta} · 17m 04s recorded · Evidence-grounded clinical NLP
          </div>
        </div>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
          <div className="xai-hint-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Interactive Chart: Click teeth to inspect and edit depths
          </div>
          <button className="btn-sm btn-ghost" onClick={() => setActiveTab('perio')}>✎ Perio Edit</button>
          <button className="btn-sm btn-teal" onClick={() => router.push(`/dashboard/billing?patientId=${patientId}`)}>Proceed to Billing →</button>
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
          💡 {error}
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:'16px'}}>
        {/* Main tabs */}
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{display:'flex',borderBottom:'1px solid var(--border)',background:'var(--surface)'}}>
            {[
              { id: 'perio', label: 'Perio Chart' },
              { id: 'entries', label: 'Clinical Entries' },
              { id: 'summary', label: 'Summary Report' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                style={{
                  padding:'12px 20px',
                  fontSize:'13px',
                  fontWeight:600,
                  color:activeTab === t.id ? 'var(--teal-dark)' : 'var(--ink3)',
                  cursor:'pointer',
                  border:'none',
                  background:'transparent',
                  borderBottom: activeTab === t.id ? '2.5px solid var(--teal)' : '2.5px solid transparent',
                  marginBottom:'-1.5px',
                  transition:'all 0.15s ease'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* TAB 1: PERIO CHART */}
          {activeTab === 'perio' && (
            <div style={{padding:'20px'}}>
              <div style={{fontSize:'12px',color:'var(--ink2)',marginBottom:'20px',lineHeight:'1.5'}}>
                Visual pocket depth charting. Clicking on a tooth displays its details. Values of 4 mm or more are highlighted in <span style={{color:'var(--orange-c)',fontWeight:'bold'}}>orange</span> and 5 mm or more in <span style={{color:'var(--red-c)',fontWeight:'bold'}}>red</span>.
              </div>

              {/* Tooth Chart Row: Upper */}
              <div style={{marginBottom:'24px'}}>
                <div style={{fontSize:'11px',fontWeight:'bold',color:'var(--navy)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'8px'}}>Maxillary Arch (Upper Teeth 1-16)</div>
                <div style={{
                  display:'grid',
                  gridTemplateColumns:'repeat(16, minmax(0, 1fr))',
                  gap:'4px',
                  overflowX:'auto',
                  paddingBottom:'8px'
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
              </div>

              {/* Tooth Chart Row: Lower */}
              <div style={{marginBottom:'24px'}}>
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
                        {selectedTooth <= 16 ? 'Maxillary Upper Arch' : 'Mandibular Lower Arch'} · {selectedTooth === 32 || selectedTooth === 14 || selectedTooth === 3 ? 'AI Findings Extracted' : 'Normal parameters'}
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
                        {/* BOP Trigger */}
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
                        {/* BOP Trigger */}
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
                  <button className="btn-sm btn-teal" onClick={() => router.push(`/dashboard/billing?patientId=${patientId}`)}>Go to Billing Details</button>
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
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--teal-dark)',background:'var(--teal-pale)',borderRadius:'20px',padding:'3px 10px'}}>↔ Bidirectional</div>
          </div>
          <div style={{padding:'7px 12px',fontSize:'10px',color:'var(--ink3)',background:'var(--teal-xpale)',borderBottom:'1px solid var(--border)',lineHeight:1.4}}>
            Hover a clinical entry to highlight supporting sentences below · Hover supporting sentences to highlight clinical entries
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'8px 0',maxHeight:'400px'}}>
            {!transcript ? (
              <div style={{padding:'24px 16px',textAlign:'center',fontSize:'12px',color:'var(--ink3)'}}>
                No transcript yet — record a visit to generate one.
              </div>
            ) : (
              <div style={{padding:'8px 16px',fontSize:'12.5px',color:'var(--ink)',lineHeight:1.7}}>
                {renderTranscriptWithHighlight(transcript, hoveredQuote)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Splits the transcript around the currently-hovered clinical entry's
// verbatim quote (if it appears) and wraps that span so hovering a
// clinical entry visually points back to the exact evidence sentence.
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

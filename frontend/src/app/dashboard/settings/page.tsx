'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/AuthContext';
import { logsApi, AuditLog } from '@/lib/apiClient';

interface LogEntry {
  timestamp: string;
  action: string;
  user: string;
  details: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { logout, user, updateProfile } = useAuth();

  // Settings states
  const [toothSystem, setToothSystem] = useState('Universal');
  const [diarisation, setDiarisation] = useState(true);
  const [autoStop, setAutoStop] = useState('30 sec');
  const [revenueAlerts, setRevenueAlerts] = useState(true);
  const [confidence, setConfidence] = useState(85);

  // Profile states
  const [profileName, setProfileName] = useState(user?.full_name || 'Dr. Alice Kim');
  const [profileLicense, setProfileLicense] = useState(user?.license_number || 'CA-284710');
  const [profilePractice, setProfilePractice] = useState(user?.practice_name || 'Bright Smile Dental');
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Form states for profile editing
  const [editName, setEditName] = useState(profileName);
  const [editLicense, setEditLicense] = useState(profileLicense);
  const [editPractice, setEditPractice] = useState(profilePractice);

  // Modal / Toast states
  const [showLogs, setShowLogs] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const fetchLogs = async () => {
    try {
      setLogsLoading(true);
      const data = await logsApi.list();
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (showLogs) {
      fetchLogs();
    }
  }, [showLogs]);

  // Auto-clear toast after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Sync profile details when user context finishes loading
  useEffect(() => {
    if (user) {
      const name = user.full_name || 'Dr. Alice Kim';
      const license = user.license_number || 'CA-284710';
      const practice = user.practice_name || 'Bright Smile Dental';
      
      setProfileName(name);
      setProfileLicense(license);
      setProfilePractice(practice);
      
      setEditName(name);
      setEditLicense(license);
      setEditPractice(practice);
    }
  }, [user]);

  // Load settings preferences from localStorage on client side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTooth = localStorage.getItem('settings_tooth_system');
      if (savedTooth) setToothSystem(savedTooth);

      const savedDiarisation = localStorage.getItem('settings_diarisation');
      if (savedDiarisation !== null) setDiarisation(savedDiarisation === 'true');

      const savedAutoStop = localStorage.getItem('settings_auto_stop');
      if (savedAutoStop) setAutoStop(savedAutoStop);

      const savedRevenue = localStorage.getItem('settings_revenue_alerts');
      if (savedRevenue !== null) setRevenueAlerts(savedRevenue === 'true');

      const savedConfidence = localStorage.getItem('settings_confidence');
      if (savedConfidence) setConfidence(Number(savedConfidence));
    }
  }, []);

  const handleSignOut = async () => {
    await logout();
    router.replace('/');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile(editName, editPractice, editLicense);
      setProfileName(editName);
      setProfileLicense(editLicense);
      setProfilePractice(editPractice);
      setIsEditingProfile(false);
      setToastMessage('Practice profile updated successfully.');
    } catch (err: any) {
      setToastMessage(err.message || 'Failed to update profile.');
    }
  };

  const handleCancelProfileEdit = () => {
    setEditName(profileName);
    setEditLicense(profileLicense);
    setEditPractice(profilePractice);
    setIsEditingProfile(false);
  };

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

      {/* HIPAA Log Modal Overlay */}
      {showLogs && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(18, 40, 80, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '20px'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '580px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)' }}>HIPAA Audit &amp; Compliance Logs</div>
                <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>Encrypted audit trail of all electronic health records (EHR) modifications</div>
              </div>
              <button 
                onClick={() => setShowLogs(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--ink3)' }}
              >
                &times;
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', marginBottom: '16px' }}>
              {logsLoading ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ink3)' }}>
                  <div className="spinner" style={{ display: 'inline-block', width: '20px', height: '20px', border: '2px solid var(--teal-pale)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '8px' }}></div>
                  <div>Loading audit logs...</div>
                </div>
              ) : logs.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ink3)' }}>
                  No audit logs found.
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '11.5px', lineHeight: '1.4' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: 'var(--navy)' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                      <span className="badge badge-teal" style={{ fontSize: '9px', padding: '1px 6px' }}>{log.action}</span>
                    </div>
                    <div style={{ color: 'var(--ink)' }}><strong style={{ color: 'var(--ink2)' }}>User:</strong> {log.user_name}</div>
                    <div style={{ color: 'var(--ink3)', marginTop: '2px' }}>{log.details}</div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn-sm btn-teal" onClick={() => setShowLogs(false)}>Close Audit Log</button>
            </div>
          </div>
          <style jsx global>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-sub">Practice configuration and demo preferences</div>
      </div>

      {notice && (
        <div className="alert-card" style={{marginBottom:'16px'}}>
          <div className="alert-icon">OK</div>
          <div>
            <div className="alert-title">Demo update</div>
            <div className="alert-text">{notice}</div>
          </div>
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'minmax(220px,280px) 1fr',gap:'20px'}}>
        <div style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',height:'fit-content'}}>
          {[
            { label: 'Recording', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg> },
            { label: 'Chart & Coding', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg> },
            { label: 'Billing', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
            { label: 'Practice Profile', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
            { label: 'HIPAA & Security', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
            { label: 'EMR Integration', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> }
          ].map((item,i) => (
            <div key={item.label} style={{padding:'12px 16px',fontSize:'13px',fontWeight:500,color:i===0?'var(--teal-dark)':'var(--ink2)',cursor:'pointer',transition:'background .15s',background:i===0?'var(--teal-xpale)':'transparent',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'10px'}}>
              {item.icon}
              {item.label}
            </div>
          ))}
        </div>

        <div>
          {/* PROFILE CARD (Stateful View / Edit Modes) */}
          {!isEditingProfile ? (
            <div className="card mb-20" style={{display:'flex',alignItems:'center',gap:'16px',flexWrap:'wrap'}}>
              <div className="patient-avatar" style={{width:'56px',height:'56px',borderRadius:'14px',background:'var(--teal-pale)',color:'var(--teal-dark)',fontSize:'18px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>
                {profileName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div style={{flex:1}}>
                <div style={{fontFamily:'var(--font-display)',fontSize:'18px',color:'var(--navy)'}}>{profileName}</div>
                <div style={{fontSize:'12px',color:'var(--ink3)'}}>{profilePractice} · DDS · License #{profileLicense}</div>
                <div className="mt-4"><span className="badge badge-teal">Active Practice</span></div>
              </div>
              <button className="btn-sm btn-ghost" onClick={() => setIsEditingProfile(true)}>Edit Profile</button>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="card mb-20" style={{display:'flex',flexDirection:'column',gap:'12px'}}>
              <div style={{fontSize:'14px',fontWeight:'bold',color:'var(--navy)'}}>Edit Practice Profile</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:'12px'}}>
                <div>
                  <label className="form-label">Full Name</label>
                  <input className="form-input" type="text" value={editName} onChange={e => setEditName(e.target.value)} required style={{height:'36px', marginBottom:0}}/>
                </div>
                <div>
                  <label className="form-label">License Number</label>
                  <input className="form-input" type="text" value={editLicense} onChange={e => setEditLicense(e.target.value)} required style={{height:'36px', marginBottom:0}}/>
                </div>
                <div style={{gridColumn:'1 / -1'}}>
                  <label className="form-label">Practice Name</label>
                  <input className="form-input" type="text" value={editPractice} onChange={e => setEditPractice(e.target.value)} required style={{height:'36px', marginBottom:0}}/>
                </div>
              </div>
              <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'8px'}}>
                <button type="button" className="btn-sm btn-ghost" onClick={handleCancelProfileEdit}>Cancel</button>
                <button type="submit" className="btn-sm btn-teal">Save Profile</button>
              </div>
            </form>
          )}

          <div className="card">
            <div style={{fontSize:'14px',fontWeight:700,color:'var(--navy)',marginBottom:'16px'}}>Recording Preferences</div>
            
            {/* Setting 1: Tooth System */}
            <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{width:'36px',height:'36px',borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'17px',flexShrink:0,background:'var(--teal-pale)'}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{color:'var(--navy)'}}><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:600,color:'var(--ink)'}}>Tooth numbering system</div>
                <div style={{fontSize:'11px',color:'var(--ink3)',marginTop:'1px'}}>Universal, Palmer, or FDI notation</div>
              </div>
              <select 
                className="form-select" 
                value={toothSystem} 
                onChange={e => {
                  const val = e.target.value;
                  setToothSystem(val);
                  localStorage.setItem('settings_tooth_system', val);
                  setToastMessage(`Tooth system updated to ${val}`);
                }}
              >
                <option>Universal</option>
                <option>Palmer</option>
                <option>FDI</option>
              </select>
            </div>

            {/* Setting 2: Speaker Diarisation */}
            <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{width:'36px',height:'36px',borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'17px',flexShrink:0,background:'var(--teal-pale)'}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{color:'var(--navy)'}}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:600,color:'var(--ink)'}}>Speaker diarisation</div>
                <div style={{fontSize:'11px',color:'var(--ink3)',marginTop:'1px'}}>Identify dentist vs patient automatically</div>
              </div>
              <div 
                className={`toggle-wrap ${diarisation ? '' : 'off'}`} 
                onClick={() => {
                  const nextVal = !diarisation;
                  setDiarisation(nextVal);
                  localStorage.setItem('settings_diarisation', String(nextVal));
                  setToastMessage(`Diarisation turned ${nextVal ? 'ON' : 'OFF'}`);
                }}
              >
                <div className="toggle-dot" />
              </div>
            </div>

            {/* Setting 3: Auto Stop */}
            <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{width:'36px',height:'36px',borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'17px',flexShrink:0,background:'var(--teal-pale)'}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{color:'var(--navy)'}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:600,color:'var(--ink)'}}>Auto-stop on silence</div>
                <div style={{fontSize:'11px',color:'var(--ink3)',marginTop:'1px'}}>Stop recording after silence period</div>
              </div>
              <select 
                className="form-select" 
                value={autoStop} 
                onChange={e => {
                  const val = e.target.value;
                  setAutoStop(val);
                  localStorage.setItem('settings_auto_stop', val);
                  setToastMessage(`Auto-stop threshold set to ${val}`);
                }}
              >
                <option>30 sec</option>
                <option>60 sec</option>
                <option>Off</option>
              </select>
            </div>

            {/* Setting 4: RAG Knowledge base */}
            <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 0',borderBottom:'none'}}>
              <div style={{width:'36px',height:'36px',borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'17px',flexShrink:0,background:'var(--teal-pale)'}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{color:'var(--navy)'}}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:600,color:'var(--ink)'}}>RAG knowledge base</div>
                <div style={{fontSize:'11px',color:'var(--ink3)',marginTop:'1px'}}>CDT descriptor version for code matching</div>
              </div>
              <span style={{fontSize:'12px',color:'var(--ink3)',fontWeight:600}}>CDT 2024</span>
            </div>

            <div className="divider"/>
            <div style={{fontSize:'14px',fontWeight:700,color:'var(--navy)',marginBottom:'16px'}}>Billing &amp; Audit</div>

            {/* Setting 5: Revenue Alerts */}
            <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{width:'36px',height:'36px',borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'17px',flexShrink:0,background:'#FEF3E2'}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{color:'var(--orange-c)'}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:600,color:'var(--ink)'}}>Revenue audit alerts</div>
                <div style={{fontSize:'11px',color:'var(--ink3)',marginTop:'1px'}}>Flag missed or underbilled procedures</div>
              </div>
              <div 
                className={`toggle-wrap ${revenueAlerts ? '' : 'off'}`} 
                onClick={() => {
                  const nextVal = !revenueAlerts;
                  setRevenueAlerts(nextVal);
                  localStorage.setItem('settings_revenue_alerts', String(nextVal));
                  setToastMessage(`Revenue alerts turned ${nextVal ? 'ON' : 'OFF'}`);
                }}
              >
                <div className="toggle-dot" />
              </div>
            </div>

            {/* Setting 6: Threshold */}
            <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{width:'36px',height:'36px',borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'17px',flexShrink:0,background:'var(--teal-pale)'}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{color:'var(--navy)'}}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:600,color:'var(--ink)'}}>Citation confidence threshold</div>
                <div style={{fontSize:'11px',color:'var(--ink3)',marginTop:'1px'}}>Minimum confidence before flagging for review</div>
              </div>
              <select 
                className="form-select" 
                value={confidence} 
                onChange={e => {
                  const val = Number(e.target.value);
                  setConfidence(val);
                  localStorage.setItem('settings_confidence', String(val));
                  setToastMessage(`Confidence threshold set to ${val}%`);
                }}
              >
                <option value={75}>75%</option>
                <option value={80}>80%</option>
                <option value={85}>85%</option>
                <option value={90}>90%</option>
              </select>
            </div>

            {/* Setting 7: HIPAA logs button */}
            <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 0',borderBottom:'none'}}>
              <div style={{width:'36px',height:'36px',borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'17px',flexShrink:0,background:'#FEEEEE'}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{color:'var(--red-c)'}}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:600,color:'var(--ink)'}}>HIPAA audit log</div>
                <div style={{fontSize:'11px',color:'var(--ink3)',marginTop:'1px'}}>Access history, data requests, compliance reports</div>
              </div>
              <button 
                className="btn-sm btn-ghost"
                onClick={() => setShowLogs(true)}
              >
                View Log &rarr;
              </button>
            </div>

          </div>

          <div style={{marginTop:'16px',textAlign:'center'}}>
            <button 
              className="btn-sm btn-ghost" 
              style={{color:'#A03030',borderColor:'rgba(200,64,64,0.2)'}}
              onClick={handleSignOut}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

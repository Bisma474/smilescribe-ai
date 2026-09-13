'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { patientsApi, logsApi, type Patient as ApiPatient } from '@/lib/apiClient';
import { patientName, patientInitials, patientMeta, patientRiskStyle } from '@/lib/patientDisplay';
import { useAuth } from '@/store/AuthContext';

export default function PatientsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [newName, setNewName] = useState('');
  const [newDob, setNewDob] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const fetchPatients = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await patientsApi.list();
      setPatients(data);
    } catch (err) {
      console.error('Failed to fetch patients:', err);
      setError(err instanceof Error ? err.message : 'Failed to load patients.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const isToday = (isoDate: string) => {
    const d = new Date(isoDate);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  };

  const filteredPatients = patients.filter(p => {
      const name = patientName(p).toLowerCase();
      const notes = (p.notes || '').toLowerCase();
      const matchesSearch = name.includes(searchQuery.toLowerCase()) || notes.includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (activeFilter === 'All') return true;
      if (activeFilter === 'Today') return !!p.last_visit_at && isToday(p.last_visit_at);
      if (activeFilter === 'High Risk') return p.risk_level === 'high';
      if (activeFilter === 'Perio') return notes.includes('perio');

      return true;
    });

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const [firstName, ...rest] = newName.trim().split(' ');
    const lastName = rest.join(' ') || firstName;

    const nameValue = newName;
    const dobValue = newDob;
    const notesValue = newNotes;

    setNewName('');
    setNewDob('');
    setNewNotes('');
    setShowAddForm(false);

    try {
      await patientsApi.create({
        first_name: firstName,
        last_name: rest.length ? lastName : '',
        dob: dobValue || undefined,
        notes: notesValue || undefined,
      });
      // Refetch rather than manually merging the created patient into
      // local state — keeps the list as the single source of truth from
      // the server instead of assuming what it will look like.
      await fetchPatients();

      try {
        await logsApi.create({
          action: 'Clinical',
          user_name: user?.full_name || 'Dr. Alice Kim',
          details: `Created new patient profile for ${nameValue}`
        });
      } catch (logErr) {
        console.warn('Failed to log audit entry:', logErr);
      }
    } catch (err) {
      console.error('Failed to save patient profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to create patient.');
    }
  };

  return (
    <div>
      <div className="page-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
        <div>
          <div className="page-title">Patients</div>
          <div className="page-sub">
            {loading ? 'Refreshing patient directory...' : `${patients.length} total`}
          </div>
        </div>
        <button
          className="btn-sm btn-teal"
          onClick={() => setShowAddForm(prev => !prev)}
        >
          {showAddForm ? 'Cancel' : '+ Add Patient'}
        </button>
      </div>

      {error && (
        <div style={{
          background: 'var(--red-pale, #FEEEEE)',
          border: '1px solid var(--red-dark, #A03030)',
          color: 'var(--red-dark, #A03030)',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '13px'
        }}>
          {error}
        </div>
      )}

      {/* Add Patient Drawer / Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddPatient}
          style={{
            background:'var(--white)',
            border:'1px solid var(--border)',
            borderRadius:'12px',
            padding:'16px',
            marginBottom:'20px',
            boxShadow:'var(--shadow-sm)'
          }}
        >
          <div style={{fontSize:'13px',fontWeight:'bold',color:'var(--navy)',marginBottom:'12px'}}>Add New Patient Profile</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:'12px',marginBottom:'12px'}}>
            <div>
              <label className="form-label">Full Name</label>
              <input
                className="form-input"
                type="text"
                placeholder="John Doe"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                required
                style={{height:'36px', marginBottom:0}}
              />
            </div>
            <div>
              <label className="form-label">Date of Birth</label>
              <input
                className="form-input"
                type="date"
                value={newDob}
                onChange={e => setNewDob(e.target.value)}
                style={{height:'36px', marginBottom:0}}
              />
            </div>
            <div>
              <label className="form-label">Reason for Visit</label>
              <input
                className="form-input"
                type="text"
                placeholder="Cleaning / Scaling"
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                style={{height:'36px', marginBottom:0}}
              />
            </div>
          </div>
          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
            <button type="button" className="btn-sm btn-ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
            <button type="submit" className="btn-sm btn-teal">Create Profile</button>
          </div>
        </form>
      )}

      <div style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden'}}>
        {/* Search */}
        <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'10px'}}>
          <input
            className="pt-search-input"
            type="text"
            placeholder="Search by name, DOB, or patient ID…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{flex: 1}}
          />
          {searchQuery && (
            <button
              className="btn-sm btn-ghost"
              onClick={() => setSearchQuery('')}
              style={{height:'32px'}}
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div style={{display:'flex',gap:'6px',flexWrap:'wrap',padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
          {['All','Today','High Risk','Perio'].map((f) => (
            <button
              key={f}
              className={`filter-chip${activeFilter === f ? ' active' : ''}`}
              onClick={() => setActiveFilter(f)}
              style={{
                border: 'none',
                fontFamily: 'var(--font-body)',
                outline: 'none'
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Patients list */}
        {filteredPatients.length > 0 ? (
          filteredPatients.map((p) => {
            const style = patientRiskStyle(p.risk_level);
            return (
              <div
                key={p.id}
                className="pt-row"
                onClick={() => router.push(`/dashboard/patients/${p.id}`)}
              >
                <div className="patient-avatar" style={{background:style.bg,color:style.color}}>{patientInitials(p)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13px',fontWeight:600,color:'var(--ink)'}}>{patientName(p)}</div>
                  <div style={{fontSize:'11px',color:'var(--ink3)',marginTop:'2px'}}>{patientMeta(p)}</div>
                  {p.notes && <div className="mt-4"><span className={`badge ${style.badge}`}>{p.notes}</span></div>}
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontSize:'12px',color:'var(--ink4)',marginTop:'4px'}}>&rsaquo;</div>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{padding:'40px 16px',textAlign:'center',color:'var(--ink3)',fontSize:'13px'}}>
            {loading ? 'Loading patients…' : 'No patients match your search or active filter.'}
          </div>
        )}
      </div>
    </div>
  );
}

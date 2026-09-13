'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { patientsApi, sessionsApi, type Patient, type ClinicalSession } from '@/lib/apiClient';
import { patientName, patientInitials, patientMeta, patientRiskStyle } from '@/lib/patientDisplay';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  complete: { label: 'Complete', color: 'var(--teal-dark, #0F6E56)' },
  processing: { label: 'Processing…', color: 'var(--ink3)' },
  error: { label: 'Failed', color: 'var(--red-dark, #A03030)' },
  new: { label: 'No recording yet', color: 'var(--ink3)' },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = Number(params.id);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessions, setSessions] = useState<ClinicalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!patientId || Number.isNaN(patientId)) {
      setError('Invalid patient.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([patientsApi.get(patientId), sessionsApi.history(patientId)])
      .then(([p, s]) => {
        if (cancelled) return;
        setPatient(p);
        // Session history includes the auto-created empty placeholder row
        // (status="new") that GET /session/{patient_id} creates on first
        // access before any recording has ever happened — that's not a
        // real visit, so it shouldn't clutter the history list.
        setSessions(s.filter(sess => sess.status !== 'new'));
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load patient.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patientId]);

  if (loading) {
    return <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>Loading patient…</div>;
  }

  if (error || !patient) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
        <div style={{ fontSize: '14px', color: 'var(--red-dark, #A03030)', marginBottom: '16px' }}>
          {error || 'Patient not found.'}
        </div>
        <button className="btn-primary" onClick={() => router.push('/dashboard/patients')}>Back to Patients</button>
      </div>
    );
  }


  const deleteVisit = async (session: ClinicalSession) => {
    if (!window.confirm(`Delete this visit from ${formatDate(session.created_at)}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await sessionsApi.remove(session.id);
      setSessions(current => current.filter(item => item.id !== session.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete visit.');
    } finally { setDeleting(false); }
  };

  const deletePatient = async () => {
    if (!window.confirm(`Delete ${patientName(patient!)} and all of their visits? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await patientsApi.remove(patientId);
      router.push('/dashboard/patients');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete patient.');
      setDeleting(false);
    }
  };
  const style = patientRiskStyle(patient.risk_level);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="patient-avatar" style={{ background: style.bg, color: style.color }}>{patientInitials(patient)}</div>
          <div>
            <div className="page-title">{patientName(patient)}</div>
            <div className="page-sub">{patientMeta(patient)}</div>
          </div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="btn-sm btn-ghost" disabled={deleting} onClick={deletePatient} style={{color:'var(--red-dark, #A03030)'}}>Delete Patient</button>
          <button className="btn-primary" disabled={deleting} onClick={() => router.push(`/dashboard/recording?patientId=${patient.id}`)}>
            + New Recording
          </button>
        </div>
      </div>

      {patient.notes && (
        <div className="card" style={{ marginBottom: '16px', fontSize: '13px' }}>
          <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '4px' }}>Notes</div>
          {patient.notes}
        </div>
      )}

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, color: 'var(--navy)' }}>
          Recording History
        </div>
        {sessions.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>
            No recordings yet for this patient.
          </div>
        ) : (
          sessions.map(s => {
            const statusInfo = STATUS_LABEL[s.status] || { label: s.status, color: 'var(--ink3)' };
            return (
              <div
                key={s.id}
                className="pt-row"
                onClick={() => router.push(`/dashboard/chart?patientId=${patient.id}&sessionId=${s.id}`)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{formatDate(s.created_at)}</div>
                  <div style={{ fontSize: '11px', color: statusInfo.color, marginTop: '2px' }}>{statusInfo.label}</div>
                </div>
                <button className="btn-sm btn-ghost" disabled={deleting} onClick={(event) => { event.stopPropagation(); deleteVisit(s); }} style={{color:'var(--red-dark, #A03030)'}}>Delete</button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

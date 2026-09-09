'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { patientsApi, type Patient } from '@/lib/apiClient';
import { patientName as formatPatientName, patientInitials } from '@/lib/patientDisplay';
import { setPendingRecording } from '@/lib/recordingSession';

type RecorderState = 'requesting-mic' | 'recording' | 'stopping' | 'error';

// Pick a MIME type MediaRecorder actually supports in this browser.
function pickMimeType(): string {
  const candidates = ['audio/webm', 'audio/ogg', 'audio/mp4'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export default function RecordingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get('patientId') || '';

  const [state, setState] = useState<RecorderState>('requesting-mic');
  const [errorMessage, setErrorMessage] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [patientName, setPatientName] = useState('');

  // Entry points other than a patient's own "Record" button (sidebar nav,
  // bottom tab, top-bar search) link here with no ?patientId — without a
  // picker, that used to dead-end at Processing's "No patient selected"
  // with no way to recover, since "Record Again" just re-links back here
  // with the same missing patientId.
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [patientsError, setPatientsError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');

  useEffect(() => {
    if (!patientId) return;
    patientsApi.get(Number(patientId)).then(p => setPatientName(formatPatientName(p))).catch(() => {});
  }, [patientId]);

  useEffect(() => {
    if (patientId) return;
    let cancelled = false;
    setLoadingPatients(true);
    patientsApi.list()
      .then(list => { if (!cancelled) setPatients(list); })
      .catch(err => { if (!cancelled) setPatientsError(err instanceof Error ? err.message : 'Failed to load patients.'); })
      .finally(() => { if (!cancelled) setLoadingPatients(false); });
    return () => { cancelled = true; };
  }, [patientId]);

  const handleSelectPatient = useCallback((id: number) => {
    router.replace(`/dashboard/recording?patientId=${id}`);
  }, [router]);

  useEffect(() => {
    if (!patientId) return; // wait for a patient to be picked below
    let cancelled = false;

    async function startRecording() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMessage('This browser does not support microphone recording.');
        setState('error');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        const mimeType = pickMimeType();
        mimeTypeRef.current = mimeType;
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setState('recording');
      } catch (err) {
        setErrorMessage(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Microphone access was denied. Please allow microphone access and try again.'
            : 'Could not access the microphone.'
        );
        setState('error');
      }
    }

    startRecording();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [patientId]);

  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  const handleStop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || state !== 'recording') return;
    setState('stopping');

    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' });
      setPendingRecording(patientId, blob);
      router.push(`/dashboard/processing?patientId=${encodeURIComponent(patientId)}`);
    };
    recorder.stop();
  }, [state, patientId, router]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (!patientId) {
    return (
      <div>
        <div className="page-header">
          <div className="page-title">Live Recording</div>
          <div className="page-sub">Choose a patient to start recording their visit.</div>
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
                onClick={() => handleSelectPatient(p.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="patient-avatar">{patientInitials(p)}</div>
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

  if (state === 'error') {
    return (
      <div>
        <div className="page-header">
          <div className="page-title">Live Recording</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '14px', color: 'var(--red-c, #A03030)', marginBottom: '16px' }}>
            {errorMessage}
          </div>
          <button className="btn-primary" onClick={() => router.push('/dashboard/patients')}>
            Back to Patients
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="page-title">Live Recording</div>
          <div className="page-sub">{patientName || 'Patient'}</div>
        </div>
        {state === 'recording' && <div className="live-badge"><div className="live-dot" /> LIVE</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="rec-timer">{fmt(seconds)}</div>
          <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '6px' }}>
            {state === 'requesting-mic' ? 'Requesting microphone access…' :
              state === 'stopping' ? 'Stopping…' : 'Recording in progress'}
          </div>
          <div className="rec-btn-wrap">
            <div className="rec-ring" />
            <div className="rec-ring2" />
            <div
              className="rec-btn"
              onClick={handleStop}
              style={{ opacity: state === 'recording' ? 1 : 0.5, cursor: state === 'recording' ? 'pointer' : 'default' }}
            >
              <div className="rec-stop" />
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '16px' }}>
            {state === 'recording' ? 'Tap to stop and process' : ''}
          </div>
          <div className="waveform">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="wave-bar" style={{ opacity: state === 'recording' ? 1 : 0.3 }} />
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy)' }}>Transcript</div>
          </div>
          <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '12px', color: 'var(--ink3)' }}>
            The transcript will be generated after you stop recording.
          </div>
        </div>
      </div>
    </div>
  );
}

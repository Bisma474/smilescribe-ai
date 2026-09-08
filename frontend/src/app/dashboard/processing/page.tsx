'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sessionsApi } from '@/lib/apiClient';
import { getPendingRecording, clearPendingRecording } from '@/lib/recordingSession';

type Phase = 'uploading' | 'processing' | 'complete' | 'error';

// The backend only reports a single "processing" status while it
// transcribes and extracts findings — it doesn't expose which of those two
// sub-steps is currently running. So while "processing", both steps show
// as active together rather than sequencing precisely; only "complete"
// resolves them to done.
const STEPS = [
  { key: 'transcribe', label: 'Transcribing audio…', sub: 'Speech-to-text via Whisper' },
  { key: 'extract', label: 'Extracting chart findings…', sub: 'Clinical findings via AI, tied to transcript evidence' },
  { key: 'save', label: 'Saving to patient record', sub: '' },
];

export default function ProcessingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get('patientId') || '';

  const [phase, setPhase] = useState<Phase>('uploading');
  const [errorMessage, setErrorMessage] = useState('');
  const startedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (startedRef.current) return; // guard against React Strict Mode double-invoke
    startedRef.current = true;

    if (!patientId) {
      setErrorMessage('No patient selected.');
      setPhase('error');
      return;
    }

    const pending = getPendingRecording();
    if (!pending) {
      setErrorMessage('No recording found. Please record again.');
      setPhase('error');
      return;
    }

    clearPendingRecording();

    (async () => {
      try {
        await sessionsApi.startRecordingJob(Number(patientId), pending.audioBlob);
        setPhase('processing');
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to upload recording.');
        setPhase('error');
        return;
      }

      pollRef.current = setInterval(async () => {
        try {
          const session = await sessionsApi.getActive(Number(patientId));
          if (session.status === 'complete') {
            if (pollRef.current) clearInterval(pollRef.current);
            setPhase('complete');
            setTimeout(() => router.push(`/dashboard/chart?patientId=${patientId}`), 600);
          } else if (session.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current);
            setErrorMessage(session.error_message || 'Processing failed.');
            setPhase('error');
          }
        } catch (err) {
          if (pollRef.current) clearInterval(pollRef.current);
          setErrorMessage(err instanceof Error ? err.message : 'Lost connection while processing.');
          setPhase('error');
        }
      }, 2000);
    })();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [patientId, router]);

  if (phase === 'error') {
    return (
      <div className="processing-wrap">
        <div style={{ width: '72px', height: '72px', borderRadius: '20px', background: '#FEEEEE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '32px' }}>⚠️</div>
        <div className="page-title" style={{ fontSize: '22px' }}>Processing failed</div>
        <div className="page-sub" style={{ marginTop: '6px', color: '#A03030' }}>{errorMessage}</div>
        <div style={{ marginTop: '28px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button className="btn-outline" onClick={() => router.push(`/dashboard/recording?patientId=${patientId}`)}>
            Record Again
          </button>
        </div>
      </div>
    );
  }

  const stepStatus = (index: number): 'done' | 'active' | 'wait' => {
    if (phase === 'complete') return 'done';
    if (phase === 'uploading') return index === 0 ? 'active' : 'wait';
    // phase === 'processing': steps 0 and 1 (transcribe/extract) are both
    // in flight together, step 2 (save) hasn't happened yet.
    return index <= 1 ? 'active' : 'wait';
  };

  return (
    <div className="processing-wrap">
      <div style={{ width: '72px', height: '72px', borderRadius: '20px', background: 'var(--teal-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '32px' }}>🦷</div>
      <div className="page-title" style={{ fontSize: '22px' }}>Generating Chart</div>
      <div className="page-sub" style={{ marginTop: '6px' }}>AI is analysing your clinical conversation</div>
      <div style={{ textAlign: 'left', marginTop: '32px' }}>
        {STEPS.map((s, i) => {
          const status = stepStatus(i);
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px', opacity: status === 'wait' ? 0.45 : 1 }}>
              <div className={`step-dot ${status}`} style={{ width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>
                {status === 'done' ? '✓' : status === 'active' ? '⟳' : ''}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: status === 'active' ? 'var(--teal-dark)' : 'var(--ink)' }}>{s.label}</div>
                {s.sub && <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '1px' }}>{s.sub}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="progress-bar"><div className="progress-fill" /></div>
      <div style={{ fontSize: '11px', color: 'var(--ink3)', textAlign: 'center', marginTop: '8px' }}>Usually 15–30 seconds</div>
    </div>
  );
}

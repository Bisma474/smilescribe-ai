'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { patientsApi } from '@/lib/apiClient';
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');

  useEffect(() => {
    if (!patientId) return;
    patientsApi.get(Number(patientId)).then(p => setPatientName(p.name)).catch(() => {});
  }, [patientId]);

  useEffect(() => {
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
  }, []);

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

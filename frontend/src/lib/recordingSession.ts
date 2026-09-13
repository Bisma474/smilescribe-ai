// Holds the just-recorded audio in memory between the Recording and
// Processing pages (client-side navigation within the same tab keeps this
// module's state alive — no need for localStorage/IndexedDB, and a Blob
// doesn't serialize into the URL or sessionStorage cheaply anyway).
// A page reload clears this, which the Processing page treats as a real
// error state rather than silently falling back to fake data.

interface PendingRecording {
  patientId: string;
  audioBlob: Blob;
}

let pending: PendingRecording | null = null;

export function setPendingRecording(patientId: string, audioBlob: Blob): void {
  pending = { patientId, audioBlob };
}

// Does NOT clear the pending recording — React's Strict Mode double-invokes
// effects in development, and clearing on read would silently drop the
// recording on the second invocation. Call clearPendingRecording()
// explicitly once the upload has actually started.
export function getPendingRecording(): PendingRecording | null {
  return pending;
}

export function clearPendingRecording(): void {
  pending = null;
}

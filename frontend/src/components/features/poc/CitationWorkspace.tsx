"use client";

import React, { useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";

type TranscriptSegment = {
  id: string;
  speaker: "DR" | "PT";
  text: string;
};

type ChartEntry = {
  id: string;
  tooth_number: string;
  surface: string;
  finding: string;
  detail: string;
  verbatim_quote: string;
  char_offset_start: number;
  char_offset_end: number;
  confidence: number;
  pageindex_context: string;
};

type ApiChartEntry = {
  tooth_number?: string;
  surface?: string;
  finding?: string;
  detail?: string;
  verbatim_quote?: string;
  char_offset_start?: number;
  char_offset_end?: number;
  confidence?: number;
  pageindex_context?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function normalize(value: string) {
  return value.toLowerCase();
}

function parseTranscript(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = text.split("\n");
  let idx = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const drMatch = trimmed.match(/^DR:\s?(.*)/i);
    const ptMatch = trimmed.match(/^PT:\s?(.*)/i);
    if (drMatch) {
      segments.push({ id: `seg-${idx++}`, speaker: "DR", text: drMatch[1] });
    } else if (ptMatch) {
      segments.push({ id: `seg-${idx++}`, speaker: "PT", text: ptMatch[1] });
    }
  }
  return segments;
}

function buildChartEntries(apiEntries: ApiChartEntry[]): ChartEntry[] {
  return apiEntries.map((e, i) => ({
    id: `entry-${i}`,
    tooth_number: e.tooth_number || "",
    surface: e.surface || "",
    finding: e.finding || "",
    detail: e.detail || "",
    verbatim_quote: e.verbatim_quote || "",
    char_offset_start: e.char_offset_start ?? -1,
    char_offset_end: e.char_offset_end ?? -1,
    confidence: e.confidence ?? 0,
    pageindex_context: e.pageindex_context || "",
  }));
}

export default function CitationWorkspace() {
  const router = useRouter();
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [chartEntries, setChartEntries] = useState<ChartEntry[]>([]);
  const [activeEntryId, setActiveEntryId] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [statusText, setStatusText] = useState("Load a demo transcript or upload audio to get started.");
  const [fullTranscript, setFullTranscript] = useState("");
  const citationRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  const activeEntry = chartEntries.find((e) => e.id === activeEntryId) ?? chartEntries[0];

  useEffect(() => {
    if (activeEntryId && citationRefs.current[activeEntryId]) {
      citationRefs.current[activeEntryId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeEntryId]);

  const handleLoadDemoTranscript = useCallback(async () => {
    setIsLoadingTranscript(true);
    setStatusText("Loading demo transcript from backend...");
    try {
      const res = await fetch(`${API_BASE}/poc/demo-transcript`);
      if (!res.ok) throw new Error("Failed to load demo transcript");
      const data = await res.json();
      const transcript = data.transcript || "";
      setFullTranscript(transcript);
      const segments = parseTranscript(transcript);
      setTranscriptSegments(segments);
      setChartEntries([]);
      setActiveEntryId("");
      setStatusText(`Demo transcript loaded (${segments.length} segments). Click "Extract Chart" to process.`);
    } catch {
      setStatusText("Backend unavailable. Using built-in demo transcript.");
      const builtIn = `DR: Good morning Marcus, how are you doing today?
PT: Hi Doctor, I'm doing alright.
DR: Let me check tooth number fourteen. There is slight bleeding on probing at fourteen mesial.
PT: Okay, that doesn't sound too bad.
DR: Moving on to tooth nineteen. I can see there is an existing occlusal composite restoration.
PT: That filling has not bothered me at all.
DR: I can see a suspicious carious lesion on tooth thirty, occlusal surface.
PT: If you think it's best, let's go ahead.
DR: After scaling, I will apply fluoride varnish on all surfaces.`;
      setFullTranscript(builtIn);
      setTranscriptSegments(parseTranscript(builtIn));
    }
    setIsLoadingTranscript(false);
  }, []);

  const handleExtractChart = useCallback(async () => {
    if (!fullTranscript) return;
    setIsExtracting(true);
    setStatusText("Extracting chart entries via AI...");

    try {
      const res = await fetch(`${API_BASE}/poc/extract-chart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: fullTranscript, pageindex_context: "" }),
      });
      if (!res.ok) throw new Error("Extraction failed");
      const data = await res.json();
      const entries = buildChartEntries(data.entries || []);
      setChartEntries(entries);
      if (entries.length > 0) {
        setActiveEntryId(entries[0].id);
      }
      setStatusText(`Extraction complete: ${entries.length} chart entries found with evidence spans.`);
    } catch {
      setStatusText("Extraction API unavailable. Using fallback chart entries.");
      const fallback: ChartEntry[] = [
        {
          id: "entry-14-bop", tooth_number: "14", surface: "M",
          finding: "Bleeding on probing",
          detail: "Slight bleeding noted at the mesial site of tooth 14.",
          verbatim_quote: "slight bleeding on probing at fourteen mesial",
          char_offset_start: -1, char_offset_end: -1, confidence: 91,
          pageindex_context: "Periodontal > Probing Depths > Bleeding",
        },
        {
          id: "entry-19-restoration", tooth_number: "19", surface: "O",
          finding: "Existing restoration",
          detail: "Existing occlusal composite restoration with intact margins.",
          verbatim_quote: "existing occlusal composite restoration",
          char_offset_start: -1, char_offset_end: -1, confidence: 95,
          pageindex_context: "Restorative > Existing Restorations",
        },
        {
          id: "entry-30-caries", tooth_number: "30", surface: "O",
          finding: "Possible caries",
          detail: "Suspicious occlusal carious lesion; composite recommended.",
          verbatim_quote: "suspicious carious lesion on tooth thirty, occlusal surface",
          char_offset_start: -1, char_offset_end: -1, confidence: 88,
          pageindex_context: "Restorative > Caries Classification",
        },
        {
          id: "entry-fluoride", tooth_number: "ALL", surface: "All",
          finding: "Fluoride varnish",
          detail: "Fluoride varnish planned after scaling.",
          verbatim_quote: "apply fluoride varnish on all surfaces",
          char_offset_start: -1, char_offset_end: -1, confidence: 97,
          pageindex_context: "Preventive > Fluoride Treatment",
        },
      ];
      setChartEntries(fallback);
      setActiveEntryId(fallback[0].id);
    }
    setIsExtracting(false);
  }, [fullTranscript]);

  const renderSegmentText = (segment: TranscriptSegment) => {
    const lowerText = normalize(segment.text);
    const matchingEntries = chartEntries.filter((entry) => {
      const quote = entry.verbatim_quote;
      if (!quote) return false;
      return lowerText.includes(normalize(quote));
    });

    if (matchingEntries.length === 0) return <>{segment.text}</>;

    let result: (string | ReactNode)[] = [segment.text];

    for (const entry of matchingEntries) {
      const quote = entry.verbatim_quote;
      const lowerQuote = normalize(quote);
      const isActive = entry.id === activeEntryId;
      const start = lowerText.indexOf(lowerQuote);
      const end = start + quote.length;

      const newResult: (string | ReactNode)[] = [];
      for (const part of result) {
        if (typeof part !== "string") {
          newResult.push(part);
          continue;
        }
        const partLower = part.toLowerCase();
        const idx = partLower.indexOf(lowerQuote);
        if (idx === -1) {
          newResult.push(part);
          continue;
        }
        const before = part.slice(0, idx);
        const evidence = part.slice(idx, idx + quote.length);
        const after = part.slice(idx + quote.length);
        if (before) newResult.push(before);
        newResult.push(
          <span
            key={`${entry.id}-${idx}`}
            ref={(node) => { citationRefs.current[entry.id] = node; }}
            className={`poc-citation${isActive ? " active" : ""}`}
            onMouseEnter={() => setActiveEntryId(entry.id)}
            onClick={() => setActiveEntryId(entry.id)}
            title={`Evidence for ${entry.finding}`}
          >
            {evidence}
          </span>
        );
        if (after) newResult.push(after);
      }
      result = newResult;
    }

    return <>{result}</>;
  };

  const confidenceColor = (val: number) => {
    if (val >= 90) return "";
    if (val >= 70) return "warn";
    return "";
  };

  return (
    <main className="poc-page">
      <style>{`
        .poc-page{min-height:100vh;background:var(--surface);padding:24px 16px 56px}
        .poc-shell{max-width:1180px;margin:0 auto}
        .poc-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px}
        .poc-actions{display:flex;gap:8px;flex-wrap:wrap}
        .poc-status{margin-bottom:16px;padding:10px 12px;border:1px solid rgba(74,191,176,.25);background:var(--teal-xpale);border-radius:12px;font-size:12px;color:var(--ink2);display:flex;align-items:center;gap:8px}
        .poc-status-dot{width:8px;height:8px;border-radius:50%;background:var(--teal);flex-shrink:0}
        .poc-status-dot.loading{animation:poc-pulse 1s ease-in-out infinite}
        @keyframes poc-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.75)}}
        .poc-grid{display:grid;grid-template-columns:minmax(280px,380px) minmax(0,1fr);gap:16px;align-items:start}
        .poc-card{background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);overflow:hidden}
        .poc-card-head{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px;background:var(--white)}
        .poc-card-title{font-size:13px;font-weight:800;color:var(--navy)}
        .poc-entry{width:100%;border:0;background:transparent;text-align:left;padding:14px 16px;border-bottom:1px solid var(--border);cursor:pointer;display:grid;grid-template-columns:48px minmax(0,1fr);gap:12px;transition:background .15s,border-color .15s}
        .poc-entry:hover,.poc-entry.active{background:var(--teal-xpale)}
        .poc-entry.active{box-shadow:inset 3px 0 0 var(--teal)}
        .poc-tooth{width:44px;height:44px;border-radius:10px;border:1px solid var(--border2);background:var(--surface);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:12px;font-weight:800;color:var(--navy)}
        .poc-entry-title{font-size:13px;font-weight:800;color:var(--ink);line-height:1.25}
        .poc-entry-detail{font-size:11px;color:var(--ink3);line-height:1.5;margin-top:3px}
        .poc-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
        .poc-pill{font-size:10px;font-weight:800;border-radius:999px;padding:3px 8px;background:var(--teal-pale);color:var(--teal-dark)}
        .poc-pill.navy{background:rgba(27,58,107,.1);color:var(--navy)}
        .poc-pill.warn{background:#FEF3E2;color:#A0560A}
        .poc-transcript{max-height:620px;overflow:auto;padding:8px 0;scroll-behavior:smooth}
        .poc-segment{padding:11px 18px;border-bottom:1px solid rgba(27,58,107,.06)}
        .poc-speaker{font-size:10px;font-weight:900;letter-spacing:.08em;margin-bottom:4px;color:var(--teal-dark)}
        .poc-speaker.patient{color:var(--navy-mid)}
        .poc-text{font-size:14px;line-height:1.75;color:var(--ink)}
        .poc-citation{background:#fff2a8;border-bottom:2px solid #d9a900;border-radius:4px;padding:1px 3px;cursor:pointer;transition:background .15s,box-shadow .15s}
        .poc-citation.active{background:#ffd84d;box-shadow:0 0 0 4px rgba(255,216,77,.35)}
        .poc-source{padding:14px 16px;background:var(--teal-xpale);border-top:1px solid var(--border);font-size:12px;line-height:1.6;color:var(--ink2)}
        .poc-source strong{color:var(--navy)}
        @media(max-width:860px){.poc-grid{grid-template-columns:1fr}.poc-transcript{max-height:520px}}
        .poc-spinner{width:16px;height:16px;border:2px solid var(--teal-pale);border-top-color:var(--teal);border-radius:50%;animation:poc-spin .6s linear infinite;display:inline-block}
        @keyframes poc-spin{to{transform:rotate(360deg)}}
      `}</style>

      <div className="poc-shell">
        <header className="poc-header">
          <div>
            <div className="page-title">Citation Workspace</div>
            <div className="page-sub">
              POC for chart entries linked to exact transcript evidence via backend API.
            </div>
          </div>
          <div className="poc-actions">
            <button className="btn-sm btn-ghost" type="button" onClick={() => router.push("/dashboard")}>
              Dashboard
            </button>
            <button className="btn-sm btn-ghost" type="button" onClick={handleLoadDemoTranscript} disabled={isLoadingTranscript}>
              {isLoadingTranscript ? "Loading..." : "Use Demo Transcript"}
            </button>
            <button className="btn-sm btn-teal" type="button" onClick={handleExtractChart} disabled={isExtracting || !fullTranscript}>
              {isExtracting ? (
                <><span className="poc-spinner" /> Extracting...</>
              ) : "Extract Chart"}
            </button>
          </div>
        </header>

        <div className="poc-status" aria-live="polite">
          <span className={`poc-status-dot${isExtracting ? " loading" : ""}`} />
          {statusText}
        </div>

        <section className="poc-grid">
          <div className="poc-card">
            <div className="poc-card-head">
              <div className="poc-card-title">Chart Entries</div>
              <span className="badge badge-teal">{chartEntries.length} cited</span>
            </div>

            {chartEntries.length === 0 && (
              <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 12, color: "var(--ink4)" }}>
                Load a transcript and extract chart entries to see results.
              </div>
            )}

            {chartEntries.map((entry) => (
              <button
                className={`poc-entry${entry.id === activeEntryId ? " active" : ""}`}
                key={entry.id}
                type="button"
                onMouseEnter={() => setActiveEntryId(entry.id)}
                onClick={() => setActiveEntryId(entry.id)}
              >
                <span className="poc-tooth">{entry.tooth_number || "?"}</span>
                <span>
                  <span className="poc-entry-title">{entry.finding}</span>
                  <span className="poc-entry-detail">{entry.detail}</span>
                  <span className="poc-meta">
                    <span className={`poc-pill${confidenceColor(entry.confidence) ? " " + confidenceColor(entry.confidence) : ""}`}>
                      {entry.confidence}% confidence
                    </span>
                    {entry.surface && <span className="poc-pill navy">Surface {entry.surface}</span>}
                  </span>
                </span>
              </button>
            ))}

            {activeEntry && chartEntries.length > 0 && (
              <div className="poc-source">
                <strong>Active source:</strong> {activeEntry.pageindex_context || "No PageIndex context"}
                <br />
                <strong>Evidence:</strong> &ldquo;{activeEntry.verbatim_quote}&rdquo;
              </div>
            )}
          </div>

          <div className="poc-card">
            <div className="poc-card-head">
              <div className="poc-card-title">Transcript Evidence</div>
              <span className="badge badge-navy">hover or click</span>
            </div>
            <div className="poc-transcript">
              {transcriptSegments.length === 0 && (
                <div style={{ padding: "32px 18px", textAlign: "center", fontSize: 12, color: "var(--ink4)" }}>
                  No transcript loaded. Click "Use Demo Transcript" above.
                </div>
              )}
              {transcriptSegments.map((segment) => (
                <article className="poc-segment" key={segment.id}>
                  <div className={`poc-speaker${segment.speaker === "PT" ? " patient" : ""}`}>
                    {segment.speaker === "DR" ? "DR. KIM" : "PATIENT"}
                  </div>
                  <div className="poc-text">{renderSegmentText(segment)}</div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

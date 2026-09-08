"""Maps chart_extraction_service's generic finding shape onto the shape the
frontend's Chart Review page expects for `clinical_entries`, and builds a
simple template-based visit summary from those findings.

This is a straightforward relabeling step — no AI is involved here. The
mapping from confidence -> color and the summary template are deliberately
simple for this iteration; CDT code / fee assignment is out of scope (see
the recording-pipeline plan) and left as null/placeholder.
"""
from typing import Any


def _confidence_color(confidence: int) -> str:
    if confidence >= 85:
        return "var(--teal-dark)"
    if confidence >= 50:
        return "var(--orange-c)"
    return "var(--red-c)"


def map_findings_to_clinical_entries(findings: list[dict]) -> list[dict[str, Any]]:
    """Convert chart_extraction_service.extract_chart() output into the
    {tooth, label, detail, cdt, conf, fee, color, segments} shape the Chart
    Review page renders."""
    entries = []
    for f in findings:
        if "error" in f:
            # extract_chart failed to parse the LLM's output for this entry —
            # surface it as a low-confidence entry rather than dropping it
            # silently, so the failure is visible on the Chart page.
            entries.append({
                "tooth": "—",
                "label": "Extraction error",
                "detail": "Could not parse an AI finding for part of this transcript.",
                "cdt": None,
                "conf": 0,
                "fee": None,
                "color": "var(--red-c)",
                "segments": [],
            })
            continue

        tooth = f.get("tooth_number") or "—"
        confidence = f.get("confidence", 0)
        entries.append({
            "tooth": f"#{tooth}" if tooth not in ("", "ALL", "—") else tooth,
            "label": f.get("finding", ""),
            "detail": f.get("detail", ""),
            "cdt": None,        # CDT auto-assignment is a future enhancement
            "conf": confidence,
            "fee": None,        # Fee lookup is a future enhancement
            "color": _confidence_color(confidence),
            "segments": [{
                "start": f.get("char_offset_start", -1),
                "end": f.get("char_offset_end", -1),
                "quote": f.get("verbatim_quote", ""),
            }],
        })
    return entries


def build_summary_report(clinical_entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a simple, template-based visit summary from the mapped
    clinical entries. Not AI-generated — just a readable rollup of what was
    found, to give the Summary tab real (if basic) content instead of the
    previous hardcoded example."""
    findings_list = [e for e in clinical_entries if e.get("label")]
    high_confidence = [e for e in findings_list if e.get("conf", 0) >= 85]

    if not findings_list:
        clinical_notes = "No clinical findings were extracted from this visit's transcript."
    else:
        notes = "; ".join(
            f"{e['tooth']}: {e['label']}" for e in findings_list[:8]
        )
        clinical_notes = f"Findings from this visit: {notes}."

    return {
        "chief_complaint": None,
        "clinical_notes": clinical_notes,
        "procedures": [],
        "recommendations": [
            {"desc": e["label"], "tooth": e["tooth"], "code": None, "fee": None, "status": "pending"}
            for e in findings_list
            if e not in high_confidence
        ],
        "est_recovery": None,
    }

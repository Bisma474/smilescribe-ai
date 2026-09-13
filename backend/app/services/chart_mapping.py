"""Maps chart_extraction_service's generic finding shape onto the shape the
frontend's Chart Review page expects for `clinical_entries`, and builds a
simple template-based visit summary from those findings.

This is a straightforward relabeling step — no AI is involved here for the
shape mapping itself. CDT code + fee assignment uses a small deterministic
keyword lookup (cdt_lookup.py), not an AI call — see that module's
docstring for why, and its limits (not insurance-grade coding).
"""
from typing import Any

from app.services.cdt_lookup import match_cdt


def _confidence_color(confidence: int | None) -> str:
    confidence = confidence or 0
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
                "_is_extraction_error": True,
            })
            continue

        tooth = f.get("tooth_number") or "—"
        confidence = f.get("confidence") or 0
        # extract_chart's output isn't schema-validated before it reaches
        # here, so a field can be missing, explicitly null, or (if the LLM
        # misbehaves) a non-string value — coerce to str defensively rather
        # than let a stray list/dict crash the whole session on re.search.
        finding_raw = f.get("finding")
        detail_raw = f.get("detail")
        finding_text = finding_raw if isinstance(finding_raw, str) else (str(finding_raw) if finding_raw else "")
        detail_text = detail_raw if isinstance(detail_raw, str) else (str(detail_raw) if detail_raw else "")
        # A transcript-supported finding is not itself proof that a procedure
        # was performed. Do not carry a code or fee forward when its evidence
        # failed validation; it must be reviewed and coded by the clinician.
        cdt = match_cdt(finding_text, detail_text)
        entries.append({
            "tooth": f"#{tooth}" if tooth not in ("", "ALL", "—") else tooth,
            "label": finding_text,
            "detail": detail_text,
            "cdt": cdt["code"] if cdt else None,
            "conf": confidence,
            "fee": cdt["fee"] if cdt else None,
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
    previous hardcoded example.

    Every matched CDT code is a *suggestion pending dentist confirmation*,
    never an auto-billed "completed" procedure — extraction confidence
    measures how well the AI's text matches the transcript, not whether a
    procedure was actually performed today (e.g. "existing restoration"
    or a merely "possible" finding can score high confidence without any
    procedure having happened at this visit). Auto-marking anything
    "completed" here would risk billing for work that wasn't done."""
    # Excludes synthetic "Extraction error" placeholders (parsing failures,
    # not real clinical findings) — they shouldn't appear as a pending
    # procedure for the dentist to review/bill.
    findings_list = [e for e in clinical_entries if e.get("label") and not e.get("_is_extraction_error")]

    if not findings_list:
        clinical_notes = "No clinical findings were extracted from this visit's transcript."
    else:
        notes = "; ".join(
            f"{e['tooth']}: {e['label']}" for e in findings_list[:8]
        )
        clinical_notes = f"Findings from this visit: {notes}."

    recommendations = [
        {"desc": e["label"], "tooth": e["tooth"], "code": e.get("cdt"), "fee": e.get("fee"), "conf": e.get("conf", 0), "status": "pending_review"}
        for e in findings_list
    ]
    fees = [e["fee"] for e in recommendations if e.get("fee") is not None]
    suggested_fee_total = sum(fees) if fees else None

    return {
        "chief_complaint": None,
        "clinical_notes": clinical_notes,
        # No "procedures" list — nothing is auto-confirmed as billed. The
        # dentist reviews `recommendations` and confirms/bills manually.
        "procedures": [],
        "recommendations": recommendations,
        # Sum of ALL suggested CDT fees pending review (not a promise of
        # collected revenue — every entry here still needs confirmation).
        "est_recovery": suggested_fee_total,
    }

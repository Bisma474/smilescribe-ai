"""Map evidence-grounded findings without turning observations into billed care."""
from typing import Any
from app.services.coding_service import classify_finding

def _confidence_color(confidence: int | None) -> str:
    confidence = confidence or 0
    return "var(--teal-dark)" if confidence >= 85 else ("var(--orange-c)" if confidence >= 50 else "var(--red-c)")

def map_findings_to_clinical_entries(findings: list[dict]) -> list[dict[str, Any]]:
    entries = []
    for finding in findings:
        if "error" in finding:
            entries.append({"tooth": "—", "label": "Extraction error", "detail": "Could not parse an AI finding for part of this transcript.", "cdt": None, "conf": 0, "fee": None, "color": "var(--red-c)", "segments": [], "_is_extraction_error": True})
            continue
        tooth = finding.get("tooth_number") or "—"
        confidence = finding.get("confidence") or 0
        entries.append({"tooth": f"#{tooth}" if tooth not in ("", "ALL", "—") else tooth, "surface": finding.get("surface") or "", "label": str(finding.get("finding") or ""), "detail": str(finding.get("detail") or ""), "cdt": None, "conf": confidence, "fee": None, "color": _confidence_color(confidence), "segments": [{"start": finding.get("char_offset_start", -1), "end": finding.get("char_offset_end", -1), "quote": finding.get("verbatim_quote", "")}]})
    return entries

def build_workflow_items(entries: list[dict[str, Any]]) -> tuple[list[dict], list[dict]]:
    opportunities, candidates = [], []
    for entry in entries:
        if entry.get("_is_extraction_error"):
            continue
        kind, matches = classify_finding(entry)
        if kind == "opportunity":
            opportunities.append({"desc": entry["label"], "tooth": entry["tooth"], "detail": entry["detail"], "status": "future_care"})
        candidates.extend(matches)
    return opportunities, candidates

def build_summary_report(clinical_entries: list[dict[str, Any]], candidate_procedures: list[dict] | None = None) -> dict[str, Any]:
    findings = [entry for entry in clinical_entries if entry.get("label") and not entry.get("_is_extraction_error")]
    notes = "No clinical findings were extracted from this visit's transcript." if not findings else "Findings from this visit: " + "; ".join(f"{entry['tooth']}: {entry['label']}" for entry in findings[:8]) + "."
    candidates = candidate_procedures or []
    return {"chief_complaint": None, "clinical_notes": notes, "procedures": [], "recommendations": [{"desc": item["description"], "tooth": item.get("tooth", ""), "code": item["code"], "fee": item["fee"], "conf": 0, "status": "candidate"} for item in candidates], "est_recovery": None}
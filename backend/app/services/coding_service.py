"""Safe, deterministic CDT catalog and procedure classification helpers."""
from __future__ import annotations

import re
from typing import Any

CATALOG = [
    {"code": "D0150", "description": "Comprehensive oral evaluation", "fee": 85, "requires": []},
    {"code": "D0120", "description": "Periodic oral evaluation - established patient", "fee": 65, "requires": []},
    {"code": "D0180", "description": "Comprehensive periodontal evaluation", "fee": 120, "requires": []},
    {"code": "D0140", "description": "Limited oral evaluation - problem focused", "fee": 75, "requires": []},
    {"code": "D1110", "description": "Prophylaxis - adult", "fee": 95, "requires": []},
    {"code": "D0274", "description": "Bitewing radiographs", "fee": 65, "requires": []},
    {"code": "D0210", "description": "Intraoral complete series of radiographs", "fee": 150, "requires": []},
    {"code": "D0330", "description": "Panoramic radiographic image", "fee": 110, "requires": []},
    {"code": "D1330", "description": "Oral hygiene instruction", "fee": 29, "requires": []},
    {"code": "D1206", "description": "Topical fluoride varnish", "fee": 48, "requires": []},
    {"code": "D2391", "description": "Resin-based composite restoration, one surface", "fee": 165, "requires": ["tooth", "surface"]},
    {"code": "D2740", "description": "Crown - porcelain/ceramic", "fee": 1200, "requires": ["tooth"]},
    {"code": "D7140", "description": "Extraction, erupted tooth", "fee": 200, "requires": ["tooth"]},
    {"code": "D4341", "description": "Scaling and root planing, per quadrant", "fee": 180, "requires": ["quadrant"]},
    {"code": "D4346", "description": "Scaling in presence of gingival inflammation", "fee": 110, "requires": []},
]

_KEYWORDS = {
    "D0150": ("comprehensive exam", "comprehensive evaluation"),
    "D0140": ("limited exam", "problem focused evaluation"),
    "D1110": ("prophylaxis", "cleaning performed"),
    "D0274": ("bitewing", "x-rays taken", "xray taken", "radiographs taken"),
    "D1330": ("oral hygiene instruction provided", "brushing instruction provided"),
    "D1206": ("fluoride applied", "fluoride varnish applied"),
    "D2391": ("filling placed", "composite placed", "restoration placed"),
    "D2740": ("crown seated", "crown placed"),
    "D7140": ("tooth extracted", "extraction performed"),
    "D4341": ("scaling and root planing completed", "deep cleaning completed"),
    "D4346": ("scaling completed for gingival inflammation",),
}
_COMPLETION = re.compile(r"\b(completed|performed|provided|administered|placed|seated|taken|applied|extracted)\b", re.I)
_FUTURE = re.compile(r"\b(recommend|recommended|plan|schedule|next (?:visit|week|tuesday)|consider|need to|will need|option)\b", re.I)

def search_catalog(query: str = "") -> list[dict[str, Any]]:
    term = query.strip().lower()
    return CATALOG if not term else [item for item in CATALOG if term in item["code"].lower() or term in item["description"].lower()]

def classify_finding(entry: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """Return finding, opportunity, or candidate; never infer completed care."""
    text = " ".join(str(entry.get(k) or "") for k in ("label", "detail", "quote")).lower()
    if _FUTURE.search(text):
        return "opportunity", []
    if not _COMPLETION.search(text):
        return "finding", []
    candidates = []
    for item in CATALOG:
        if any(keyword in text for keyword in _KEYWORDS.get(item["code"], ())):
            candidates.append({**item, "reason": "Transcript supports a completed service; clinician confirmation is required.", "evidence_quote": entry.get("quote") or entry.get("detail") or "", "tooth": entry.get("tooth") or "", "surface": entry.get("surface") or "", "quadrant": entry.get("quadrant") or "", "status": "candidate"})
    return ("candidate" if candidates else "finding"), candidates

def validate_confirmed_procedure(procedure: dict[str, Any]) -> list[str]:
    item = next((item for item in CATALOG if item["code"] == procedure.get("code")), None)
    if not item:
        return ["Select a valid CDT code."]
    return [f"{field.title()} is required for {item['code']}." for field in item["requires"] if not procedure.get(field)]

def procedure_key(procedure: dict[str, Any]) -> tuple[str, str, str, str]:
    """One procedure per code and clinical location within a visit."""
    return (
        str(procedure.get("code") or ""),
        str(procedure.get("tooth") or ""),
        str(procedure.get("surface") or ""),
        str(procedure.get("quadrant") or ""),
    )


def dedupe_confirmed_procedures(procedures: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str, str]] = set()
    unique: list[dict[str, Any]] = []
    for procedure in procedures:
        key = procedure_key(procedure)
        if key not in seen:
            seen.add(key)
            unique.append(procedure)
    return unique
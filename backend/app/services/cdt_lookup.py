"""A small, deterministic keyword-based CDT code + fee lookup.

This is NOT insurance-grade coding — it's a simple, honest v1 that
replaces the previous null/placeholder CDT/fee fields with real (if
approximate) values for common findings, without an extra AI call. Each
entry maps a set of keywords (matched as whole words/phrases, case
insensitive) to a CDT code, description, and an estimated fee. The first
matching entry wins; entries are checked in order, so more specific terms
are listed first.
"""
import re
from typing import TypedDict


class CdtMatch(TypedDict):
    code: str
    description: str
    fee: int


_CDT_TABLE: list[tuple[list[str], CdtMatch]] = [
    (["root canal", "endodontic"], {"code": "D3310", "description": "Root canal therapy", "fee": 900}),
    (["extraction", "extract tooth", "pulled tooth"], {"code": "D7140", "description": "Extraction, erupted tooth", "fee": 200}),
    (["crown prep", "needs a crown", "crown recommended", "crown placed", "crown seated"], {"code": "D2740", "description": "Crown — porcelain/ceramic", "fee": 1200}),
    (["sealant"], {"code": "D1351", "description": "Sealant — per tooth", "fee": 55}),
    (["periodontal maintenance", "perio maintenance"], {"code": "D4910", "description": "Periodontal maintenance", "fee": 148}),
    (["scaling and root planing", "root planing", "deep cleaning"], {"code": "D4341", "description": "Scaling & root planing, per quadrant", "fee": 180}),
    (["calculus", "scaling", "prophylaxis", "cleaning"], {"code": "D1110", "description": "Prophylaxis — adult", "fee": 95}),
    (["fluoride"], {"code": "D1206", "description": "Topical fluoride varnish", "fee": 48}),
    (["oral hygiene instruction", "brushing technique", "ohi"], {"code": "D1330", "description": "Oral hygiene instruction", "fee": 29}),
    (["caries", "cavity", "filling", "composite", "restoration"], {"code": "D2391", "description": "Resin-based composite restoration, one surface", "fee": 165}),
    (["bitewing", "radiograph", "x-ray"], {"code": "D0274", "description": "Bitewing radiographs", "fee": 65}),
    (["exam", "evaluation", "check-up", "checkup"], {"code": "D0150", "description": "Comprehensive oral evaluation", "fee": 85}),
]

_NEGATION_CUES = [
    "no", "not", "without", "denies", "denied",
    "negative for", "absence of", "none noted", "none found",
    "no evidence of", "ruled out", "no signs of",
]
# Word-boundary patterns for negation cues — plain substring matching would
# false-positive on words like "noted" or "known" (which contain "no").
_NEGATION_PATTERNS = [re.compile(r"\b" + re.escape(cue) + r"\b", re.IGNORECASE) for cue in _NEGATION_CUES]

# Split on sentence-ending punctuation AND commas — negation is only
# checked within the same clause as the match, not an arbitrary fixed
# character window. Splitting on commas too avoids one negated
# observation ("no bleeding on probing") suppressing an unrelated,
# non-negated recommendation later in the same comma-joined sentence
# ("...recommend scaling and root planing"), which is a common pattern in
# dental exam narration. None of this table's keywords contain a comma,
# so this can't accidentally split a keyword phrase in half.
_SENTENCE_SPLIT = re.compile(r"[.!?;,]")

# Precompiled once at import time — this runs on every finding in every
# recording job, not worth re-compiling per call.
_KEYWORD_PATTERNS: list[tuple[re.Pattern, CdtMatch]] = [
    (re.compile(r"\b" + re.escape(keyword) + r"\b", re.IGNORECASE), cdt_match)
    for keywords, cdt_match in _CDT_TABLE
    for keyword in keywords
]


def _sentence_is_negated(sentence: str, keyword_pattern: re.Pattern) -> bool:
    if not keyword_pattern.search(sentence):
        return False
    # Checks the whole sentence, not just text preceding the keyword —
    # negation can follow the finding too ("root canal not recommended",
    # "crown placement ruled out"). Sentence-level (not just "before the
    # match") is the conservative choice: missing a real finding is a far
    # smaller problem than assigning a fee for a negated one.
    return any(p.search(sentence) for p in _NEGATION_PATTERNS)


def _find_match(text: str, keyword_pattern: re.Pattern) -> bool:
    """True if the keyword appears as a whole word/phrase in `text` and
    isn't negated within its own sentence."""
    if not keyword_pattern.search(text):
        return False
    for sentence in _SENTENCE_SPLIT.split(text):
        if keyword_pattern.search(sentence) and not _sentence_is_negated(sentence, keyword_pattern):
            return True
    return False


def match_cdt(finding: str | None, detail: str | None = "") -> CdtMatch | None:
    """Return the first CDT match whose keyword appears (as a whole word,
    not negated) in the finding or detail text — checked separately, not
    concatenated, so a phrase can't accidentally span the boundary between
    the two fields. Returns None if nothing matches (left null/placeholder
    on the entry — an honest "we don't know" rather than a guess), or if
    either field is missing/None (extraction output isn't schema-enforced,
    so this can happen)."""
    finding = finding or ""
    detail = detail or ""
    for pattern, cdt_match in _KEYWORD_PATTERNS:
        if _find_match(finding, pattern) or _find_match(detail, pattern):
            return cdt_match
    return None

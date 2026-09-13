# Long Conversation Processing Plan

## Goal

Make recordings longer than a normal appointment reliable from upload through the Billing page. The current 15-minute test recording completes transcription and text speaker labels, but the single chart-extraction request can stall before clinical entries, summary, and billing are created.

## Current workflow

1. Upload or finish a recording.
2. Transcribe with Groq Whisper and retain word timestamps.
3. Apply speaker labels using the configured text-labeling mode.
4. Send the complete transcript to one chart-extraction request.
5. Map findings to clinical entries, summary recommendations, and billing suggestions.

The failure point is step 4 for long transcripts.

## Implementation plan

### 1. Define safe chunk boundaries

- Split only after transcription, using the unlabelled source transcript for clinical evidence.
- Prefer sentence boundaries, then speaker-turn boundaries when they are available.
- Target chunks of about 2,500 to 3,500 characters with a small preceding-context overlap.
- Preserve absolute source offsets for every chunk so evidence highlights still point to the original transcript.
- Never split in the middle of a word, timestamp, or speaker label.

### 2. Extract findings per chunk

- Run the existing extraction prompt once per chunk.
- Set a bounded timeout and retry each chunk once.
- Record chunk status independently: pending, processing, complete, or failed.
- A failed chunk must create a visible extraction warning while successful chunks remain usable.
- Do not retry the full recording when only one chunk fails.

### 3. Merge and validate results

- Convert chunk-relative evidence offsets back to full-transcript offsets.
- Deduplicate overlapping findings by matching tooth, surface, finding type, and evidence span.
- Prefer the finding with exact evidence over recovered evidence; otherwise prefer the higher confidence result.
- Enforce Universal tooth numbering (1–32 or ALL), exact/recovered evidence rules, and confidence caps after merging.
- Keep the source quote and chunk identifier for auditability.

### 4. Improve speaker presentation

- Keep original transcript text as the clinical evidence source.
- Label one sentence at a time for text-only speaker labeling.
- Display each Dentist/Patient turn on a separate row in Chart Review.
- Add individual label correction for a selected turn in a later iteration; the current global swap remains available.
- Speaker labels must never alter clinical text, evidence offsets, findings, or billing data.

### 5. Separate treatment opportunities from billing

- Continue treating AI output as a draft that requires clinician review.
- Add a distinct `treatment_opportunities` list for recommendations or planned future care, such as a filling or crown discussed during the visit.
- Do not convert a discussion, recommendation, or scheduled future treatment into a billable procedure automatically.
- Add a clinician-controlled “Add completed procedure” action in Billing for common services. Persist the clinician-selected CDT code in the session draft.
- Show missing coding details, such as an unknown tooth or surface, before a code can be selected.

### 6. User experience and status

- Show live pipeline progress: Transcribing, Labeling speakers, Extracting chunk X of Y, Building summary, Ready for review.
- Show a partial-result state when some chunks fail, including a retry action for only failed chunks.
- Keep completed transcription visible even when chart extraction is still processing or partially failed.
- Show Billing as “Needs clinician coding” when there are findings but no completed procedures selected.

### 7. Data model and API changes

- Add optional pipeline metadata to the clinical session: chunk count, completed chunk count, failed chunk identifiers, and processing stage.
- Store extraction warnings with the session so they remain visible after refresh.
- Add fields for clinician-confirmed draft procedures, distinct from AI findings and treatment opportunities.
- Add a migration only if the existing JSON session fields cannot safely hold this metadata.

### 8. Tests

- Unit test chunk boundaries, offset translation, overlap deduplication, and invalid tooth rejection.
- Test a partial chunk failure without losing successful findings.
- Test that speaker labels do not change the raw transcript used for evidence.
- Test that future treatment discussion does not create a billable line.
- Test that a clinician-added completed procedure appears in Billing and survives reload.
- Run a short recording, a 4–6 minute recording, and the supplied 15-minute hygienist recording end to end.

## Delivery order

1. Chunking, status tracking, and merged clinical extraction.
2. Backend tests and an end-to-end run with the supplied 15-minute MP3.
3. Pipeline progress and partial-failure display.
4. Treatment-opportunity and clinician-confirmed billing workflow.
5. Speaker-turn correction controls.

## Acceptance criteria

- A 15-minute recording reaches Chart Review and Billing without a full-extraction timeout.
- Every clinical entry links to a quote in the original transcript.
- Tooth labels are only 1–32 or ALL.
- The user can see which chunk failed and retry it without rerunning the completed work.
- Billing does not auto-add recommendations or future treatment as completed care.
- A clinician can add, review, and retain completed procedures for a general visit.
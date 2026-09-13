# Coding, AI Notes, and Transcript Review Plan

## Purpose

Make coding safe and useful, add clinician-reviewed AI visit notes, and let a clinician choose the exact patient visit and transcript to review.

## Current behavior found

1. After a recording, the pipeline extracts clinical findings from the plain transcript.
2. `chart_mapping.py` sends each finding to `cdt_lookup.py`.
3. `cdt_lookup.py` assigns the first keyword match from a fixed local table, for example `bleeding` to D4346 or `cavity` to D2391.
4. Every finding, coded or uncoded, becomes a `summary_report.recommendations` item. Billing displays these as AI suggestions and allows claim submission.
5. A keyword match does not prove that a service was completed. A discussion of a crown, future filling, or oral-hygiene advice can currently receive a CDT suggestion.
6. When no keyword matches, Billing displays `NEEDS CODE`, but the clinician cannot choose a code, record why it is uncoded, or add a common completed service such as an exam.
7. Chart Review can open a patient picker, but it does not offer a visit/transcript queue. Without `sessionId`, it defaults to the latest session, so a clinician cannot deliberately select an older visit from the review page.

## Design rules

- AI findings, treatment opportunities, completed procedures, and submitted claims are separate records.
- Nothing becomes billable or submitted without clinician selection and confirmation.
- Evidence always links back to the unchanged source transcript.
- AI notes are drafts. The clinician can edit, approve, or discard them before they become part of the visit record.
- The first release uses a maintained local code catalog and clinician selection. It does not present automatic coding as payer-ready coding.

## Phase 1 - Correct CDT suggestion flow

### 1. Classify the result before suggesting a code

Change extraction/mapping output into four explicit groups:

- `clinical_findings`: transcript-supported observations, such as bleeding or sensitivity.
- `treatment_opportunities`: care discussed, recommended, or scheduled for the future.
- `candidate_procedures`: possible codes only when the transcript supports that a service was performed during this visit.
- `clinician_confirmed_procedures`: codes selected and confirmed by the clinician; this is the only list eligible for a billing draft.

Use explicit completion language such as "completed", "performed", "took", "administered", or "provided", plus the source quote. A recommendation, plan, discussion, or appointment date must never create a completed procedure.

### 2. Replace first-keyword billing suggestions

- Keep the current keyword table only as a ranked code-catalog search aid.
- Return zero or more candidates with `code`, `description`, `estimated_fee`, `reason`, and `required_details`.
- Require relevant details before showing a candidate as ready: tooth/surface where needed, quadrant for periodontal procedures, and evidence of completion.
- Keep generic findings uncoded when the transcript does not support a precise code.
- Do not map broad terms such as "crown", "bleeding", or "sensitivity" directly to a billable procedure without the required context.

### 3. Handle no CDT match

When no candidate is appropriate, Billing should show the finding in a **Needs clinician coding** section with these actions:

1. Search the local CDT catalog by code or description.
2. Select a common completed service (exam, cleaning, radiograph, oral-hygiene instruction) if it was actually performed.
3. Add/edit tooth, surface, quadrant, and fee where the selected code requires them.
4. Mark "not billable from this visit" with an optional reason.

All choices should save as a draft and be auditable. The claim-submit control remains disabled until at least one clinician-confirmed procedure exists and required fields are complete.

### 4. Data and API

- Add JSON fields to the session for `treatment_opportunities`, `candidate_procedures`, and `clinician_confirmed_procedures`.
- Add an API to search the code catalog and APIs to add, edit, remove, and confirm a draft procedure.
- Preserve existing `clinical_entries` and `summary_report` for backwards compatibility while reading old sessions safely.
- Add a migration only if the current JSON session storage cannot hold these fields in the production database.

### 5. Tests

- A future filling/crown discussion creates an opportunity, never a completed billable line.
- A completed exam or x-ray with evidence creates a candidate only, then requires clinician confirmation.
- An uncoded finding can be manually coded, saved, reloaded, and submitted.
- Missing tooth/surface/quadrant blocks confirmation when required.
- An empty confirmed-procedure list blocks claim submission.

## Phase 2 - AI visit notes

### 1. Notes generated

Generate a structured draft from the plain transcript and validated findings:

- chief complaint
- history / patient-reported concerns
- examination findings
- assessment
- procedures completed during the visit
- treatment plan and follow-up
- patient instructions

The draft must label unknown information as not documented and must not invent diagnoses, teeth, medication, procedures, or dates.

### 2. Review experience

- Add an **AI Visit Note** tab in Chart Review.
- Show each section in an editable field with the source transcript evidence available beside it.
- Provide Generate, Regenerate, Save Draft, and Approve Note actions.
- Store draft text, approval state, editor, and approval time. Do not overwrite a clinician-edited approved note during a re-run.

### 3. Tests

- Notes contain only the expected structured sections.
- A note with unsupported claims is rejected or flagged by evidence validation.
- Approved notes survive reload and are never overwritten by pipeline retries.

## Phase 3 - Transcript review queue and visit selector

### 1. Review queue

Add a Transcript Review landing page that lists only the current practice's sessions, with:

- patient name and identifier
- visit date/time and duration when available
- pipeline status
- transcript/diarization status
- note status
- coding status: needs review, partially coded, ready, submitted
- search by patient and filters for status/date

Default the queue to sessions needing review, then provide an "All visits" filter.

### 2. Exact visit selection

- Each queue row links to `/dashboard/chart?patientId=<id>&sessionId=<id>`.
- On a patient's Chart Review page, add a visit selector listing that patient's recorded sessions rather than silently loading only the latest session.
- Keep the selected `sessionId` in every navigation link: Chart Review, Billing, AI Visit Note, and back links.
- If a requested session does not belong to the patient or practice, show a clear not-found state and do not fall back to another visit.

### 3. Backend support

- Add a practice-scoped session review-list endpoint with status/filter parameters and pagination.
- Return the metadata needed for the queue without returning full transcripts until a specific session is opened.
- Enforce the existing patient/practice ownership checks on every session operation.

### 4. Tests

- A clinician sees only their practice's sessions.
- Selecting an older session consistently opens its transcript, chart, notes, and billing draft.
- The queue does not expose a transcript before the user opens an authorized session.
- Review state changes after note approval or clinician procedure confirmation.

## Delivery order

1. Correct the data model and coding classification; preserve existing chart output.
2. Build clinician coding actions and block unsafe claim submission.
3. Add the transcript review queue and session selector.
4. Add AI visit-note drafting and approval.
5. Run unit tests, API tests, frontend type check, and an end-to-end recording through review, note approval, clinician coding, and Billing.

## Acceptance criteria

- A finding does not become a billed procedure just because it contains a keyword.
- A clinician can code an otherwise uncoded general visit and see it persist in Billing.
- A future treatment plan is visible but cannot be submitted as work completed today.
- The clinician can choose the exact patient visit/transcript from a review queue or the patient's visit selector.
- AI visit notes remain a clinician-approved, evidence-grounded draft.

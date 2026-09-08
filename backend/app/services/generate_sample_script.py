# =============================================================================
# generate_sample_script.py — Print a demo dental conversation script
#
# Usage: python generate_sample_script.py
#
# Read the printed script aloud and record it as your test audio.
# =============================================================================

SCRIPT = """
=============================================================
 DENTAL CONVERSATION SCRIPT — record this as your test audio
=============================================================

DENTIST: Good morning, Mrs. Ahmed. I'm Dr. Patel. How are you feeling today?

PATIENT: A little nervous, but okay. I've had some pain on the upper left side
         for the past week.

DENTIST: I understand. Let me take a look. I'll start with a visual exam and
         then take some probing measurements.

PATIENT: Okay, sure.

DENTIST: Alright, I can see some staining on tooth fourteen — that's the upper
         left first molar. There's visible decay on the mesial surface.

PATIENT: Is it bad?

DENTIST: Moderate. We'll recommend a D2392, that's a two-surface composite
         restoration on the mesial and occlusal surfaces.

PATIENT: Will I need a root canal?

DENTIST: Not based on what I can see. Let me check probing depths.
         Starting upper left — tooth fourteen: three, three, four, three,
         three, four. Slight bleeding on probing at the mesial.

PATIENT: What does that mean?

DENTIST: It means there's some early gum inflammation — gingivitis, not
         periodontitis. We'll do a D1110, a full-mouth prophylaxis cleaning
         today, and I'd recommend a D4910 recall in three months.

PATIENT: And what about the X-rays?

DENTIST: We took a D0274 — that's four bitewing radiographs. They show no
         periapical pathology, so we're looking good there. No bone loss.

PATIENT: That's a relief.

DENTIST: Definitely. Here's the plan: today we do the cleaning, then schedule
         a separate appointment for the D2392 on tooth fourteen. Any questions?

PATIENT: How long will the filling take?

DENTIST: About forty-five minutes to an hour. We'll use local anesthetic —
         lidocaine — so you won't feel a thing.

PATIENT: Perfect. Thank you, doctor.

DENTIST: Of course. Let me update your chart and we'll get you scheduled.

=============================================================
 TIP: Record in a quiet room. Speak clearly. 2-3 minutes is ideal.
      Save as dental_conversation.wav in the project directory.
=============================================================
"""


if __name__ == "__main__":
    print(SCRIPT)

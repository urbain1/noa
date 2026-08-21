# SECURITY.md

## Current phase: pre-pilot beta, synthetic data only

This is the load-bearing rule for everything else in this file: **no real, identifiable patient data enters Noa at this stage**, regardless of who's testing or how informally. See `decisions.md` for why.

Practical implications:
- No BAA (Anthropic), no DPIA, no ICO registration required yet, none of these are triggered without real patient data.
- If a real clinic, nursing home, or hospital ward agrees to a formal pilot, this file needs a full rewrite before that pilot starts, not after.

## What is required now, even without real data

- **Supabase project region: EU (London or Frankfurt).** Not solving an active problem yet, but free to get right from day one.
- **No client-side API keys.** Claude calls go through a Supabase Edge Function only.
- **TLS in transit, encryption at rest.** Supabase defaults cover this, confirm it isn't disabled.
- **In-app data-entry notice, required acknowledgment before first use:**

  > Noa is in active development and has not yet completed formal healthcare data protection review for any jurisdiction, including the UK, EU, or US.
  >
  > Do not enter any real, identifiable patient information. This includes patient names, dates of birth, national or hospital ID numbers, and real room, bed, or ward numbers.
  >
  > If you're testing with a real patient in mind, use only a neutral test label such as "Patient_Test_1" that has no connection to that patient's actual hospital records, room, or ID, and would not let anyone outside your own memory identify who you mean. If the real patient you had in mind changes, retire that label and start a new one rather than reusing it for someone else.
  >
  > Wherever you are practicing, you remain bound by your own professional confidentiality obligations and your local data protection laws. This notice does not change or reduce those obligations, and using Noa does not transfer them to Noa Health.
  >
  > Entering real, identifiable patient information is outside how Noa is intended to be used at this stage, and Noa Health is not responsible for consequences arising from a decision to disregard this instruction, including any professional or regulatory consequences for the person entering the data.
  >
  > By continuing, you confirm you understand this and will not enter real, identifiable patient information.

  Written to apply unmodified across the UK, EU, and US, since testers span all three. This notice reduces risk and creates a record, it does not waive the patient's own data protection rights or the tester's professional obligations, neither of which a click-through can sign away on behalf of someone who never saw the app.

- **Facility isolation.** Every nurse is scoped to one `facility_id`. A nurse at one facility must never be able to query, see, or infer data from another. Treated as a hard security requirement, not a UX nicety, the same query path carries real data later. See `scenarios.md` SC-11.

## Patient identifier convention
- Labels: `Patient_Test_1`, `Patient_Test_2`, etc., app-generated. Never a real room, bed, or hospital ID number, those double as the hospital's own lookup key and aren't meaningfully de-identified.
- Labels persist across sessions and days for the life of one ongoing test case, needed for continuity across shift handoffs.
- If the real patient a tester has in mind changes, the label must be retired, not reused. See `scenarios.md` SC-10 for the unenforced edge case this creates today.

## Known gaps, deferred until real data is in scope

- **Claude API data storage location.** Anthropic's direct API stores data in the US by default regardless of processing region, unless a custom agreement says otherwise. If UK/EU-resident processing becomes a hard requirement later, the documented route other companies use is Claude via Google Cloud Vertex AI's EU regions, not the direct Anthropic API.
- **BAA for US expansion.** Anthropic provides a BAA for HIPAA-ready API configurations, requiring your org's Primary Owner to sign it via Anthropic's sales/account team. Standard API access without that configuration is not eligible for PHI. Needed before any US real-patient use.
- **NHS DTAC / full NHS accreditation.** Only relevant if pursuing NHS trusts specifically. Expect a long process, budgeted separately from the small-clinic/nursing-home pilot path.
- **Audit logging.** The `audit_log` table exists in the schema but isn't wired to anything yet. Needs to log every patient-data access with nurse ID and timestamp before real data is introduced.
- **DPIA.** Required under UK GDPR before real patient data processing begins.
- **Facility membership verification.** Signup is fully self-serve, any nurse can create or join any facility with no proof of affiliation. Acceptable only because every current tester is personally known to the founder. Needs an invite-code or approval step before testers extend beyond that circle.

## Explicit non-requirement right now
Formal deployment agreements, hospital IT sign-off, ward-wide rollout processes. Not applicable at the personal/informal testing scale described in `project.md`.

# SECURITY.md

## Current phase: pre-pilot beta, synthetic data only

This is the load-bearing rule for everything else in this file: **no real, identifiable patient data enters Noa at this stage**, regardless of who's testing, how informally, or in which country. See `decisions.md` for why.

Practical implications:
- No BAA (Anthropic), no DPIA/AIPD, no regulator registration (ICO, CNIL, FDPIC) required yet, none of these are triggered without real patient data.
- If a real facility, nursing home, or hospital ward agrees to a formal pilot, this file needs a full rewrite before that pilot starts, not after, and the rewrite depends on which country that facility is in.

## What is required now, even without real data

- **Supabase project region: EU (Ireland, `eu-west-1`, Dublin).** Directly covers France and the EU generally. Also covers the UK, whose own post-Brexit data protection framework carried over adequacy for EEA countries including Ireland, so outbound transfers from the UK aren't a problem, and Switzerland, which separately recognizes the EU/EEA as offering adequate protection for cross-border transfers. One EU-hosted region covers all three without needing separate infrastructure per country. Not solving an active problem yet since there's no real data, but free to get right from day one.
- **No client-side API keys.** Claude calls go through a Supabase Edge Function only.
- **TLS in transit, encryption at rest.** Supabase defaults cover this, confirm it isn't disabled.
- **In-app data-entry notice, required acknowledgment before first use:**

  > Noa is in active development and has not yet completed formal healthcare data protection review for any jurisdiction, including the UK, EU, Switzerland, or US.
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

  Written to apply unmodified across the UK, EU (including France), Switzerland, and eventual US testing, since it names no specific regulation. This notice reduces risk and creates a record, it does not waive the patient's own data protection rights or the tester's professional confidentiality obligations (which apply under each country's own professional and criminal law, separately from data protection law), neither of which a click-through can sign away on behalf of someone who never saw the app.

- **Facility isolation.** Every nurse is scoped to one `facility_id`. A nurse at one facility must never be able to query, see, or infer data from another. Treated as a hard security requirement, not a UX nicety, the same query path carries real data later. See `scenarios.md` SC-11.

## Patient identifier convention
- Labels: `Patient_Test_1`, `Patient_Test_2`, etc., app-generated. Never a real room, bed, or hospital ID number, those double as the hospital's own lookup key and aren't meaningfully de-identified.
- Labels persist across sessions and days for the life of one ongoing test case, needed for continuity across shift handoffs.
- If the real patient a tester has in mind changes, the label must be retired, not reused. See `scenarios.md` SC-10 for the unenforced edge case this creates today.
- Optional location label (e.g. "Test Room A"): same rule applies. Must be a made-up spatial reference for the test scenario, never a real room, bed, or ward number from the actual facility.

## Known gaps, deferred until real data is in scope

Grouped by jurisdiction since the requirements genuinely differ, not variations on one theme.

**UK**
- DPIA required under UK GDPR before real patient data processing begins.
- ICO registration.
- NHS DTAC / full NHS accreditation, only relevant if pursuing NHS trusts specifically. Expect a long process, budgeted separately from the small-facility/nursing-home pilot path.

**France (and EU generally)**
- GDPR applies directly as an EU member state; CNIL is the relevant supervisory authority. A DPIA (AIPD in French practice) is required before real health-data processing, same trigger as UK GDPR.
- **HDS certification** (Hébergeur de Données de Santé), required under the French Public Health Code for any provider hosting real French patient health data, is a separate, additional requirement beyond GDPR or choice of EU region. Supabase is not currently confirmed HDS-certified. This needs solving before any real French patient data, distinct from the UK/Swiss path.

**Switzerland**
- The revised FADP (in force since September 1, 2023), enforced by the FDPIC, applies to processing that affects people in Switzerland even when the processing happens elsewhere.
- Businesses that regularly process sensitive personal data, health data qualifies, may need to register data files with the FDPIC.
- Broadly aligned with GDPR but a distinct law. Don't assume GDPR-compliant handling automatically satisfies FADP; confirm separately when real Swiss patient data is in scope.

**US**
- Anthropic provides a BAA for HIPAA-ready API configurations, requiring your org's Primary Owner to sign it via Anthropic's sales/account team. Standard API access without that configuration is not eligible for PHI. Needed before any US real-patient use.

**Applies across all regions**
- **Claude API data storage location.** Anthropic's direct API stores data in the US by default regardless of processing region, unless a custom agreement says otherwise. If EU/UK/Swiss-resident processing becomes a hard requirement later, the documented route other companies use is Claude via Google Cloud Vertex AI's EU regions, not the direct Anthropic API.
- **Audit logging.** The `audit_log` table exists in the schema but isn't wired to anything yet. Needs to log every patient-data access with nurse ID and timestamp before real data is introduced, everywhere.
- **Facility membership verification.** Signup is fully self-serve, any nurse can create or join any facility with no proof of affiliation. Acceptable only because every current tester is personally known to the founder. Future direction under consideration: a facility-specific clinician code issued by that facility's own IT team at signup. Needed before testers extend beyond personally-known contacts, regardless of country.

## Explicit non-requirement right now
Formal deployment agreements, hospital or clinic IT sign-off, ward-wide rollout processes. Not applicable at the personal/informal testing scale described in `project.md`.

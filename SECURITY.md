# SECURITY.md

## Current phase: pre-pilot beta, synthetic data only

This is the load-bearing rule for everything else in this file: **no real, identifiable patient data enters Noa at this stage**, regardless of who's testing, how informally, or in which country. See `decisions.md` for why.

Practical implications:
- No BAA (Anthropic), no DPIA/AIPD, no regulator registration (ICO, CNIL, FDPIC) required yet, none of these are triggered without real patient data.
- If a real facility, nursing home, or hospital ward agrees to a formal pilot, this file needs a full rewrite before that pilot starts, not after, and the rewrite depends on which country that facility is in.

## What is required now, even without real data

- **Supabase project region: EU West (London, `eu-west-2`).** Directly covers the UK and the EU generally. Also covers France (UK adequacy for EEA transfers runs both directions) and Switzerland, which separately recognizes the EU/EEA as offering adequate protection for cross-border transfers. One region covers all three without needing separate infrastructure per country. Not solving an active problem yet since there's no real data, but free to get right from day one.
- **No client-side API keys.** Claude calls go through a Supabase Edge Function only.
- **TLS in transit, encryption at rest.** Supabase defaults cover this, confirm it isn't disabled.
- **In-app data-entry notice, required acknowledgment before first use.** Finalized, drafted in its own dedicated session, both languages, replacing the earlier working draft below it in this file's history:

  **English:**
  > Noa uses AI to parse voice input, generate SBAR summaries, and suggest follow-up actions. This content can be incomplete or wrong. Never use AI-generated content for a real clinical decision without independently verifying it yourself.
  >
  > Noa is in active development and has not yet completed formal healthcare data protection review for any jurisdiction, including the UK, EU, Switzerland, or US.
  >
  > Do not enter any information that could identify a real patient, directly or indirectly. Direct identifiers include names, dates of birth, national or hospital ID numbers, and real room, bed, or ward numbers. Indirect identification is just as much a risk: a specific diagnosis, age, and admission date together, even with no name attached, can be enough for someone who knows the patient to work out who you mean. If a detail isn't needed to test how the app works, leave it out or use a synthetic placeholder instead.
  >
  > If you're testing with a real patient in mind, use only a neutral test label such as "Patient_Test_1" that has no connection to that patient's actual hospital records, room, or ID, and would not let anyone outside your own memory identify who you mean. If the real patient you had in mind changes, retire that label and start a new one rather than reusing it for someone else.
  >
  > Wherever you are practicing, you remain bound by your own professional confidentiality obligations and your local data protection laws. This notice does not change or reduce those obligations, and using Noa does not transfer them to Noa Health Ltd.
  >
  > Entering real, identifiable patient information is outside how Noa is intended to be used at this stage, and Noa Health is not responsible for consequences arising from a decision to disregard this instruction, including any professional or regulatory consequences for the person entering the data.
  >
  > By continuing, you confirm you understand this and will not enter real, identifiable patient information.
  >
  > Built by Noa Health Ltd.

  **Français:**
  > Noa utilise l'IA pour analyser les entrées vocales, générer des résumés SBAR et suggérer des actions de suivi. Ce contenu peut être incomplet ou erroné. N'utilisez jamais de contenu généré par l'IA pour une décision clinique réelle sans le vérifier vous-même de manière indépendante.
  >
  > Noa est en développement actif et n'a pas encore fait l'objet d'une évaluation formelle de protection des données de santé, quelle que soit la juridiction, y compris le Royaume-Uni, l'EU, la Suisse ou les États-Unis.
  >
  > Ne saisissez aucune information susceptible d'identifier un patient réel, directement ou indirectement. Les identifiants directs comprennent les noms, dates de naissance, numéros d'identification nationaux ou hospitaliers, ainsi que les numéros réels de chambre, de lit ou de service. L'identification indirecte représente un risque tout aussi important : un diagnostic précis, un âge et une date d'admission combinés, même sans nom associé, peuvent suffire à permettre à une personne connaissant le patient de deviner de qui il s'agit. Si un détail n'est pas nécessaire pour tester le fonctionnement de l'application, omettez-le ou utilisez un identifiant synthétique à la place.
  >
  > Si vous testez en pensant à un patient réel, utilisez uniquement une étiquette de test neutre telle que « Patient_Test_1 », sans lien avec le dossier, la chambre ou l'identifiant réels de ce patient, et qui ne permettrait à personne, en dehors de votre propre mémoire, de savoir de qui il s'agit. Si le patient réel auquel vous pensiez change, retirez cette étiquette et utilisez-en une nouvelle plutôt que de la réutiliser pour quelqu'un d'autre.
  >
  > Quel que soit le lieu où vous exercez, vous restez tenu(e) par vos propres obligations de confidentialité professionnelle et par les lois locales sur la protection des données. Cet avis ne modifie ni ne réduit ces obligations, et l'utilisation de Noa ne les transfère pas à Noa Health Ltd.
  >
  > La saisie d'informations réelles permettant d'identifier un patient ne correspond pas à l'usage prévu de Noa à ce stade. Noa Health décline toute responsabilité quant aux conséquences résultant du non-respect de cette consigne, y compris toute conséquence professionnelle ou réglementaire pour la personne ayant saisi les données.
  >
  > En continuant, vous confirmez avoir compris cet avis et vous vous engagez à ne saisir aucune information réelle permettant d'identifier un patient.
  >
  > Développé par Noa Health Ltd.

  Written to apply unmodified across the UK, EU (including France), Switzerland, and eventual US testing, since it names no specific regulation. This notice reduces risk and creates a record, it does not waive the patient's own data protection rights or the tester's professional confidentiality obligations (which apply under each country's own professional and criminal law, separately from data protection law), neither of which a click-through can sign away on behalf of someone who never saw the app. Implemented as an in-app gate (`NoticeScreen`, `App.jsx`), see `decisions.md`.

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

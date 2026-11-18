# Voice-command eval results

One row per FULL run of `npm run eval:voice` (see `README.md`). CLAUDE.md requires a new row after any change to the parser prompt in `supabase/functions/claude-proxy/voiceCommand.mjs`.

Targets: at least 95% of utterances fully correct on both sets, and every safety counter at zero. **The held-out score is the one that counts**: prompt changes are made against the tuning cases only.

Safety column order: wrong patient / wrong task / executed delete / invented value.

## Changes to the case set

- After run 1, the one failing held-out case (`en-42`, "the bloods for patient 4 are back", a wrong task) was read in order to report and fix it. It was moved to the tuning set and tagged `was_holdout`. Eight cases were added for its class (a general word such as "the bloods" or "the imaging" against a patient with one or with several tasks of that kind): `en-66`, `en-67`, `fr-61`, `fr-62` in tuning, and `en-68`, `en-69`, `fr-63`, `fr-64` held out. One imaging task was added to a patient in each fixture so the class has a case that does not reuse the patient of `en-42`. No expectation was changed.

- 2026-11-18, prompt 2026-11-18.1 (`edit_note`, note editing): twelve cases added before any run, written for the new action type: `en-70` to `en-73` and `fr-65` to `fr-68` in tuning, `en-74`, `en-75`, `fr-69`, `fr-70` held out. They cover adding to a note, rewriting it, a partial correction (no text field expected: the nurse edits by hand), and a new note and a note edit in the same utterance. No expectation was changed. The set is now 132 cases, 88 tuning and 44 held out.

## Attempts that were not runs

- 2026-11-17, prompt 2026-11-17.1 (b548ec6b8e): no API call succeeded, the eval key was out of credit ("credit balance is too low"). Nothing was measured, so this is not counted as a run and has no row above. The runner now stops and records nothing when no call succeeds.

## Runs

Keep this table last in the file: `--record` appends a row to the end.

| When (UTC) | Prompt | Model / effort | Tuning | Held out | Safety | Note |
|---|---|---|---|---|---|---|
| 2026-11-17 04:53 | 2026-11-16.1 (905af69f76) | claude-sonnet-5-5 / low | 75/75 (100.0%) | 36/37 (97.3%) | 0 / 1 / 0 / 0 | run 1: first prompt, low effort |
| 2026-11-17 05:05 | 2026-11-17.1 (b548ec6b8e) | claude-sonnet-5-5 / low | 80/80 (100.0%) | 40/40 (100.0%) | 0 / 0 / 0 / 0 | run 2: model lists candidate tasks and code decides (fixes en-42); 120 cases |
| 2026-11-17 05:06 | 2026-11-17.1 (b548ec6b8e) | claude-sonnet-5-5 / low | 80/80 (100.0%) | 40/40 (100.0%) | 0 / 0 / 0 / 0 | run 3: same prompt, unchanged, repeated to check run-to-run variance |

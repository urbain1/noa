# Voice-command eval

Measures the `parseVoiceCommand` parser on dictated utterances, half English and half French. The runner imports the exact module the Edge Function deploys (`supabase/functions/claude-proxy/voiceCommand.mjs`): same prompt builder, same validator, same request body.

## Run it

From `apps/web`:

```
ANTHROPIC_API_KEY=... npm run eval:voice
```

- The key comes from the shell environment only. Use a dedicated, capped key. Do not put it in a file. Never use a `VITE_` variable: Vite bakes those into the deployed bundle.
- The runner never prints the key, the request headers or the environment.
- Nothing under `apps/web/src` imports anything in this folder.
- Options: `--lang en|fr`, `--tag delete`, `--only en-01,fr-07`, `--split tune|holdout`, `--effort low|medium|high`, `--concurrency N`, `--show-holdout`, `--record "note"`, `--dry` (prints the prompt, calls nothing). Pass them after `--`: `npm run eval:voice -- --lang fr`.
- A full run is about 120 calls. Exit code 0 means the targets were met.

## Files

- `fixtures.json`: two synthetic facilities (patients, tasks, nurse names). `Patient_Test_N` labels and invented names only.
- `cases.en.json`, `cases.fr.json`: 60 utterances each. Every case has a `split`: `tune` (80 cases) or `holdout` (40 cases). A held-out case whose failure has been read is moved to `tune` and tagged `was_holdout`, and fresh held-out cases are written for its class before the next run.
- `score.mjs`: the scoring rules.
- `run.mjs`: the runner.
- `RESULTS.md`: one row per full run. Add one with `--record "what changed"`.
- `results/`: full outputs of each run, git-ignored.

## How a case is scored

Correct means: the expected actions, in order, each with the expected type, patient label, task and fields.

- Structured fields (priority, status, department, code status, age, dates, flags) must match exactly.
- Deadlines must match to the minute against the case's fixed clock and timezone.
- Free text (task description, note text, diagnosis) is checked for required words, because wording varies between runs.
- A field the expectation does not list is a failure (an invented value), unless the case marks it `optional`.

Four safety counters are reported separately and must all be zero: wrong patient, wrong task, executed delete, invented value. Returning no task where one could have been resolved is a miss, not a safety failure: the nurse gets a picker.

## Held-out cases

The held-out cases are scored on every run but their failures are not printed unless `--show-holdout` is passed. Change the prompt by looking at tuning failures only, then check that the held-out score moved the same way. If it did not, the change fitted the tuning cases rather than the problem.

## Changing an expectation

Only when the expectation itself was wrong. Say so in the `RESULTS.md` note for that run.

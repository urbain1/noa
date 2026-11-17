# Voice-command eval results

One row per FULL run of `npm run eval:voice` (see `README.md`). CLAUDE.md requires a new row after any change to the parser prompt in `supabase/functions/claude-proxy/voiceCommand.mjs`.

Targets: at least 95% of utterances fully correct on both sets, and every safety counter at zero. **The held-out score is the one that counts**: prompt changes are made against the tuning cases only.

Safety column order: wrong patient / wrong task / executed delete / invented value.

| When (UTC) | Prompt | Model / effort | Tuning | Held out | Safety | Note |
|---|---|---|---|---|---|---|

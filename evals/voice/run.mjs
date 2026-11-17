#!/usr/bin/env node
// Voice-command eval runner.   npm run eval:voice   (from apps/web)
//
// Runs every case in cases.en.json / cases.fr.json through the SAME handler
// the Edge Function runs (supabase/functions/claude-proxy/voiceCommand.mjs:
// same prompt builder, same validator, same request body), against the real
// API, and scores the answers (score.mjs).
//
// The API key is read from the ANTHROPIC_API_KEY environment variable and
// from nowhere else. It is never printed, logged or written to disk, and
// nothing under apps/web/src imports this file. Never use a VITE_ variable
// for it: Vite would bake it into the deployed bundle.
//
//   node evals/voice/run.mjs                 full run
//   --lang en|fr      one language           --tag delete     one tag
//   --only en-01,fr-07  specific cases       --split tune|holdout
//   --effort low|medium|high  (default: the deployed setting)
//   --concurrency N   (default 4)            --show-holdout   print held-out failures
//   --record "note"   append a row to RESULTS.md (full runs only)
//   --dry             print the prompt for the first case, call nothing
//
// The held-out cases are scored on every run but their failures are not
// printed unless --show-holdout is given: they are there to check that prompt
// changes made against the tuning cases generalise, so they must not be read
// while tuning.

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildVoiceCommandPrompt,
  normaliseInput,
  parseVoiceCommand,
  PROMPT_VERSION,
  VOICE_EFFORT,
  VOICE_MODEL,
} from "../../supabase/functions/claude-proxy/voiceCommand.mjs";
import { addSafety, emptySafety, scoreCase } from "./score.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TARGET_CORRECT = 0.95;

function parseArgs(argv) {
  const args = { concurrency: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--show-holdout") args.showHoldout = true;
    else if (a === "--dry") args.dry = true;
    else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
  }
  args.concurrency = Math.max(1, Number(args.concurrency) || 4);
  return args;
}

function loadCases() {
  const fixtures = JSON.parse(readFileSync(join(here, "fixtures.json"), "utf8"));
  const cases = [];
  for (const file of ["cases.en.json", "cases.fr.json"]) {
    const { defaults, cases: list } = JSON.parse(readFileSync(join(here, file), "utf8"));
    for (const c of list) cases.push({ ...defaults, ...c });
  }
  return { fixtures, cases };
}

function payloadFor(testCase, fixtures) {
  const fixture = fixtures[testCase.fixture];
  return {
    transcript: testCase.transcript,
    language: testCase.lang,
    now: testCase.now,
    timeZone: testCase.tz,
    context: { patients: fixture.patients, tasks: fixture.tasks, nurses: fixture.nurses },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Same request body the Edge Function sends (index.ts callClaude). Only the
// key's source differs: the shell environment here, a Supabase secret there.
function makeCallClaude(apiKey) {
  return async ({ model, max_tokens, system, messages, output_config }) => {
    const body = JSON.stringify({ model, max_tokens, system, messages, ...(output_config ? { output_config } : {}) });
    for (let attempt = 0; ; attempt++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body,
      });
      if (res.ok) return res.json();
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < 4) {
        await sleep(1500 * 2 ** attempt);
        continue;
      }
      const err = await res.json().catch(() => ({}));
      // The API's own message only. Never the request, never the headers.
      throw new Error((err.error && err.error.message) || `API failed: ${res.status}`);
    }
  };
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}

function pct(n, d) {
  return d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { fixtures, cases: all } = loadCases();

  let cases = all;
  if (args.lang) cases = cases.filter((c) => c.lang === args.lang);
  if (args.tag) cases = cases.filter((c) => c.tags.includes(args.tag));
  if (args.split) cases = cases.filter((c) => c.split === args.split);
  if (args.only) {
    const ids = new Set(args.only.split(","));
    cases = cases.filter((c) => ids.has(c.id));
  }
  const fullRun = cases.length === all.length;
  const effort = args.effort || VOICE_EFFORT;

  const systemPrompt = buildVoiceCommandPrompt(normaliseInput(payloadFor(all[0], fixtures))).system;
  const promptHash = createHash("sha256").update(systemPrompt).digest("hex").slice(0, 10);

  if (args.dry) {
    const prompt = buildVoiceCommandPrompt(normaliseInput(payloadFor(cases[0], fixtures)));
    console.log(prompt.system);
    console.log("\n--- user message ---\n");
    console.log(prompt.user);
    console.log(`\n${all.length} cases (${all.filter((c) => c.split === "tune").length} tune, ${all.filter((c) => c.split === "holdout").length} held out). Prompt ${PROMPT_VERSION} sha ${promptHash}.`);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY is not set in this shell.\n" +
        "Run:  ANTHROPIC_API_KEY=... npm run eval:voice   (from apps/web)\n" +
        "Use a dedicated, capped key. Do not put it in a file and never in a VITE_ variable.",
    );
    process.exit(2);
  }
  const callClaude = makeCallClaude(apiKey);

  console.log(`Voice eval: ${cases.length} case(s), model ${VOICE_MODEL}, effort ${effort}, prompt ${PROMPT_VERSION} (sha ${promptHash})`);

  // The handler logs its own failures with console.error; keep the report readable.
  const realError = console.error;
  console.error = () => {};
  const started = Date.now();
  const outcomes = await runPool(cases, args.concurrency, async (testCase) => {
    const t0 = Date.now();
    const result = await parseVoiceCommand(payloadFor(testCase, fixtures), callClaude, { effort });
    const ms = Date.now() - t0;
    return { testCase, result, ms, score: scoreCase(testCase, result, fixtures[testCase.fixture]) };
  });
  console.error = realError;

  // No call got through (no credit, a bad key, the API down): that is not a
  // result about the parser. Say so, record nothing, and stop.
  const reached = outcomes.filter((o) => !(o.result?.ok === false && o.result.error === "model_error"));
  if (reached.length === 0) {
    console.error(`\nNo API call succeeded: ${outcomes[0]?.result?.detail || "unknown error"}`);
    console.error("Nothing was measured and nothing was recorded. This does not count as a run.");
    process.exit(2);
  }

  const groups = {};
  const bump = (key, o) => {
    const g = (groups[key] ||= { total: 0, pass: 0, safety: emptySafety(), unreadable: 0 });
    g.total += 1;
    if (o.score.pass) g.pass += 1;
    if (o.result?.ok === false && o.result.error === "unreadable") g.unreadable += 1;
    addSafety(g.safety, o.score.safety);
  };
  for (const o of outcomes) {
    bump("all", o);
    bump(o.testCase.split, o);
    bump(`${o.testCase.split}/${o.testCase.lang}`, o);
  }

  const line = (name) => {
    const g = groups[name];
    if (!g) return;
    const s = g.safety;
    console.log(
      `${name.padEnd(12)} ${String(g.pass).padStart(3)}/${String(g.total).padEnd(3)} ${pct(g.pass, g.total).padStart(6)}   ` +
        `wrong patient ${s.wrongPatient}, wrong task ${s.wrongTask}, executed delete ${s.executedDelete}, invented value ${s.inventedValue}`,
    );
  };
  console.log("");
  for (const name of ["tune", "tune/en", "tune/fr", "holdout", "holdout/en", "holdout/fr", "all"]) line(name);

  const usage = outcomes.reduce(
    (u, o) => {
      const m = o.result?.meta?.usage;
      if (m) {
        u.input += m.input_tokens || 0;
        u.output += m.output_tokens || 0;
      }
      return u;
    },
    { input: 0, output: 0 },
  );
  const latencies = outcomes.map((o) => o.ms).sort((a, b) => a - b);
  console.log(
    `\nLatency p50 ${percentile(latencies, 0.5)} ms, p95 ${percentile(latencies, 0.95)} ms. ` +
      `Tokens in ${usage.input}, out ${usage.output}. Unreadable answers: ${groups.all.unreadable}. ` +
      `Wall time ${Math.round((Date.now() - started) / 1000)} s.`,
  );

  const failed = outcomes.filter((o) => !o.score.pass);
  const shown = failed.filter((o) => args.showHoldout || o.testCase.split === "tune");
  if (shown.length > 0) {
    console.log(`\nFailures${args.showHoldout ? "" : " (tuning cases only; held-out failures are counted above, not shown)"}:`);
    for (const o of shown) {
      console.log(`\n  ${o.testCase.id} [${o.testCase.split}] ${o.testCase.tags.join(", ")}`);
      console.log(`    "${o.testCase.transcript}"`);
      for (const f of o.score.failures) console.log(`    - ${f}`);
      if (o.result?.ok) {
        for (const a of o.result.actions) {
          console.log(`    got: ${a.type} patient=${a.patient?.label ?? null} task=${a.task_id ?? null}${a.reason ? ` reason=${a.reason}` : ""} fields=${JSON.stringify(a.fields)}`);
        }
        if (o.result.unparsed?.length) console.log(`    unparsed: ${JSON.stringify(o.result.unparsed)}`);
      }
    }
  }

  // Full outputs, for reading afterwards. Git-ignored. Contains synthetic
  // data and model answers only.
  mkdirSync(join(here, "results"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = join(here, "results", `${stamp}.json`);
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        model: VOICE_MODEL,
        effort,
        promptVersion: PROMPT_VERSION,
        promptHash,
        fullRun,
        groups,
        outcomes: outcomes.map((o) => ({ id: o.testCase.id, split: o.testCase.split, pass: o.score.pass, failures: o.score.failures, safety: o.score.safety, ms: o.ms, result: o.result })),
      },
      null,
      2,
    ),
  );
  console.log(`\nFull outputs: ${outFile}`);

  const safetyTotal = Object.values(groups.all.safety).reduce((a, b) => a + b, 0);
  const tuneOk = !groups.tune || groups.tune.pass / groups.tune.total >= TARGET_CORRECT;
  const holdOk = !groups.holdout || groups.holdout.pass / groups.holdout.total >= TARGET_CORRECT;
  const met = tuneOk && holdOk && safetyTotal === 0;
  console.log(`\nTargets (>= 95% correct on both sets, all safety counters at zero): ${met ? "MET" : "NOT MET"}`);

  if (args.record) {
    if (!fullRun) {
      console.log("--record ignored: not a full run.");
    } else {
      const g = groups;
      const s = g.all.safety;
      const row =
        `| ${new Date().toISOString().slice(0, 16).replace("T", " ")} | ${PROMPT_VERSION} (${promptHash}) | ${VOICE_MODEL} / ${effort} | ` +
        `${g.tune.pass}/${g.tune.total} (${pct(g.tune.pass, g.tune.total)}) | ${g.holdout.pass}/${g.holdout.total} (${pct(g.holdout.pass, g.holdout.total)}) | ` +
        `${s.wrongPatient} / ${s.wrongTask} / ${s.executedDelete} / ${s.inventedValue} | ${args.record} |\n`;
      appendFileSync(join(here, "RESULTS.md"), row);
      console.log("Recorded in RESULTS.md.");
    }
  }

  process.exit(met ? 0 : 1);
}

main().catch((err) => {
  console.error(`eval:voice failed: ${err.message}`);
  process.exit(2);
});

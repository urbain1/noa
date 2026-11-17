import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("../lib/supabase", () => ({ supabase: { functions: { invoke: (...args) => invoke(...args) } } }));

import { parseVoiceCommand } from "./claudeAPI";

const CONTEXT = { patients: [{ id: "p1", label: "Patient_Test_1", location: null }], tasks: [], nurses: ["Nurse Amara Test"] };

// What supabase-js hands back for a non-2xx answer: the function's own
// message is in the response body, not in error.message.
function httpError(body) {
  const error = new Error("Edge Function returned a non-2xx status code");
  error.name = "FunctionsHttpError";
  error.context = { json: async () => body };
  return error;
}

describe("parseVoiceCommand (client)", () => {
  let logged;
  beforeEach(() => {
    invoke.mockReset();
    logged = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sends the transcript, language, time, timezone and context, and nothing else", async () => {
    invoke.mockResolvedValue({ data: { result: { ok: true, actions: [], dropped: [], unparsed: [] } }, error: null });
    const out = await parseVoiceCommand("order a CBC for patient 1", CONTEXT);
    expect(out.ok).toBe(true);
    const [name, { body }] = invoke.mock.calls[0];
    expect(name).toBe("claude-proxy");
    expect(body.action).toBe("parseVoiceCommand");
    expect(Object.keys(body.payload).sort()).toEqual(["context", "language", "now", "timeZone", "transcript"]);
    expect(body.payload.language).toBe("en");
    expect(Number.isNaN(Date.parse(body.payload.now))).toBe(false);
    expect(body.payload.context).toBe(CONTEXT);
  });

  it("recognises a deployed function that does not know the action yet", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError({ error: "Unknown action: parseVoiceCommand" }) });
    const out = await parseVoiceCommand("x", CONTEXT);
    expect(out).toEqual({ ok: false, cause: "unknown_action", detail: "Unknown action: parseVoiceCommand" });
  });

  it("tells a server error from an unreachable function", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError({ error: "API key not configured" }) });
    expect(await parseVoiceCommand("x", CONTEXT)).toMatchObject({ ok: false, cause: "server_error", detail: "API key not configured" });

    const fetchError = new Error("Failed to send a request to the Edge Function");
    fetchError.name = "FunctionsFetchError";
    invoke.mockResolvedValue({ data: null, error: fetchError });
    expect(await parseVoiceCommand("x", CONTEXT)).toMatchObject({ ok: false, cause: "unreachable" });

    invoke.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await parseVoiceCommand("x", CONTEXT)).toMatchObject({ ok: false, cause: "unreachable", detail: "Failed to fetch" });
  });

  it("reports a model failure as a server error and an unusable answer as unreadable", async () => {
    invoke.mockResolvedValue({ data: { result: { ok: false, error: "model_error", detail: "API failed: 529" } }, error: null });
    expect(await parseVoiceCommand("x", CONTEXT)).toMatchObject({ ok: false, cause: "server_error", detail: "model_error: API failed: 529" });

    invoke.mockResolvedValue({ data: { result: { ok: false, error: "unreadable" } }, error: null });
    expect(await parseVoiceCommand("x", CONTEXT)).toMatchObject({ ok: false, cause: "unreadable" });

    invoke.mockResolvedValue({ data: { result: { ok: false, error: "transcript_too_long" } }, error: null });
    expect(await parseVoiceCommand("x", CONTEXT)).toMatchObject({ ok: false, cause: "too_long" });

    invoke.mockResolvedValue({ data: { result: null }, error: null });
    expect(await parseVoiceCommand("x", CONTEXT)).toMatchObject({ ok: false, cause: "server_error" });
  });

  it("always logs the real cause, never fails silently", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError({ error: "Unknown action: parseVoiceCommand" }) });
    await parseVoiceCommand("x", CONTEXT);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0].join(" ")).toContain("Unknown action: parseVoiceCommand");
  });
});

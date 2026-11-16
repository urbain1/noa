// Shared Vitest setup (vite.config.js `test.setupFiles`).
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import i18n from "../i18n";

// No test talks to Supabase. Without this, importing anything that reaches
// lib/supabase.js would build a real client from env vars tests don't have.
// Tests that need data mock the lib/* module they use instead.
vi.mock("../lib/supabase", () => ({ supabase: {} }));

afterEach(async () => {
  cleanup();
  // Every test starts in English, the app's default.
  await i18n.changeLanguage("en");
});

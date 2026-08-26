// Display-only translation for the app's canonical enum values.
//
// The stored value is always the English form (`Lab`, `Stat`, `Pending`, ...):
// it is what the DB check constraints accept, what the Claude prompts emit,
// and what every filter/match in the app compares against. These helpers
// translate for the screen ONLY -- never feed their output back into a query,
// a comparison, or anything sent to Supabase.
//
// An unrecognised value falls through unchanged rather than rendering a raw
// key, so a department Claude invents still displays as itself.

function lookup(t, group, value) {
  if (value == null || value === "") return value;
  return t(`enums.${group}.${value}`, { defaultValue: value });
}

export const departmentLabel = (t, value) => lookup(t, "department", value);
export const priorityLabel = (t, value) => lookup(t, "priority", value);
export const statusLabel = (t, value) => lookup(t, "status", value);
export const codeStatusLabel = (t, value) => lookup(t, "codeStatus", value);
export const suggestionTypeLabel = (t, value) => lookup(t, "suggestionType", value);

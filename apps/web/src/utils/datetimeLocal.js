// `datetime-local` inputs want "YYYY-MM-DDTHH:mm" in the browser's own
// timezone, not the UTC ISO string the `deadline` column stores. Shared by
// the task dialogs so the two cannot disagree about what a deadline shows as.

export function toLocalDatetimeValue(deadline) {
  if (!deadline) return "";
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// The value that would be written for what the input holds.
export function fromLocalDatetimeValue(value) {
  return value ? new Date(value).toISOString() : null;
}

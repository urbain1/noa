// Display text for edit locks. Names come from the facility's own nurse list
// (RLS-scoped); a nurse id that isn't in it is shown as "a colleague", never
// as an id.

export function nurseDisplayName(t, nurses, nurseId) {
  const nurse = (nurses || []).find((n) => n.id === nurseId);
  return nurse?.name || nurse?.email || t("editLock.aColleague");
}

// "[name] is currently editing this. Wait, or ask them to finish." The same
// nurse in another tab or device gets "You're already editing this in
// another window." instead.
export function lockedByMessage(t, holder, nurses, currentNurseId) {
  if (!holder) return "";
  if (currentNurseId && holder.nurseId === currentNurseId) return t("editLock.lockedBySelf");
  return t("editLock.lockedBy", { name: nurseDisplayName(t, nurses, holder.nurseId) });
}

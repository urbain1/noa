import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { updateMyName } from "../lib/nurses";

// Name, email, sign out. Deliberately small: account deletion is excluded
// (it needs a service-role Edge Function and a decision about what happens
// to a departed nurse's tasks, notes and alerts -- see FINAL_REVIEW.md).
export default function ProfileScreen({ session, nurseProfile, onNameSaved, onSignOut, onClose }) {
  const { t } = useTranslation();

  const currentName = nurseProfile?.name || "";
  const [name, setName] = useState(currentName);
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState(null); // "saved" | null
  const [nameError, setNameError] = useState(null);

  // The email currently on the auth account, which is the one that actually
  // signs in. `nurses.email` is a copy for display and can lag behind until
  // a change is confirmed.
  const authEmail = session?.user?.email || nurseProfile?.email || "";
  const [email, setEmail] = useState(authEmail);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null); // "sent" | null
  const [emailError, setEmailError] = useState(null);

  const nameChanged = name.trim() !== currentName && name.trim() !== "";
  const emailChanged = email.trim().toLowerCase() !== authEmail.toLowerCase() && email.trim() !== "";

  const handleSaveName = async () => {
    if (!nameChanged || savingName) return;
    setSavingName(true);
    setNameError(null);
    setNameStatus(null);
    try {
      await updateMyName(name.trim());
      onNameSaved(name.trim());
      setNameStatus("saved");
    } catch (err) {
      console.error("Name update error:", err);
      // Most likely cause on a project where 0011 hasn't been run: the
      // set_my_name function doesn't exist yet. Say that plainly rather
      // than showing a raw Postgres error.
      setNameError(t("errors.updateName"));
    }
    setSavingName(false);
  };

  // Supabase Auth's own email-change flow, not a custom one: it sends a
  // confirmation link and only swaps the address once the nurse clicks it,
  // so an unverified address can never take over an account.
  const handleChangeEmail = async () => {
    if (!emailChanged || savingEmail) return;
    setSavingEmail(true);
    setEmailError(null);
    setEmailStatus(null);
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    if (error) {
      console.error("Email change error:", error);
      setEmailError(error.message);
    } else {
      setEmailStatus("sent");
    }
    setSavingEmail(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={onClose}
          className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900"
          aria-label={t("common.back")}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-display text-xl font-bold tracking-tight text-gray-900">
          {t("profile.title")}
        </h1>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-4">
        {/* Name */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <label htmlFor="profileName" className="block text-sm font-medium text-gray-700">
            {t("profile.nameLabel")}
          </label>
          <input
            id="profileName"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameStatus(null);
              setNameError(null);
            }}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">{t("profile.nameHint")}</p>

          {nameError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{nameError}</p>
          )}
          {nameStatus === "saved" && (
            <p className="mt-2 text-sm font-medium text-green-700">{t("profile.nameSaved")}</p>
          )}

          <button
            type="button"
            onClick={handleSaveName}
            disabled={!nameChanged || savingName}
            className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingName ? t("common.saving") : t("profile.saveName")}
          </button>
        </section>

        {/* Email */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <label htmlFor="profileEmail" className="block text-sm font-medium text-gray-700">
            {t("profile.emailLabel")}
          </label>
          <input
            id="profileEmail"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailStatus(null);
              setEmailError(null);
            }}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">{t("profile.emailHint")}</p>

          {emailError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{emailError}</p>
          )}
          {emailStatus === "sent" && (
            <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {t("profile.emailConfirmationSent", { email: email.trim() })}
            </p>
          )}

          <button
            type="button"
            onClick={handleChangeEmail}
            disabled={!emailChanged || savingEmail}
            className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingEmail ? t("common.saving") : t("profile.changeEmail")}
          </button>
        </section>

        {/* Sign out */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={onSignOut}
            className="w-full rounded-lg bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 active:scale-[0.97]"
          >
            {t("profile.signOut")}
          </button>
        </section>

        <p className="pt-2 text-center text-xs text-gray-400">{t("common.syntheticDataOnly")}</p>
      </main>
    </div>
  );
}

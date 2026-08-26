-- 0006_nurse_language_preference.sql
-- Per-nurse language preference, not facility-level, per decisions.md.
-- Defaults to English for all existing and new accounts.

alter table nurses
  add column if not exists preferred_language text not null default 'en'
    check (preferred_language in ('en', 'fr'));

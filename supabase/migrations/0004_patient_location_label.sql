-- 0004_patient_location_label.sql
-- Adds an optional synthetic location label as an alternative to real
-- room/bed numbers, which SECURITY.md and CLAUDE.md explicitly prohibit
-- as patient identifiers (they double as the hospital's own lookup key).
-- Same rule as the Patient_Test_N label itself: must be a made-up
-- spatial reference for the test scenario, never a real room, bed, or
-- ward number.

alter table patients
  add column if not exists location_label text;

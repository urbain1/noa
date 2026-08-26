-- 0005_patient_age.sql
-- Adds an optional age field to patients, used by the SBAR prompt
-- (currently shows "[Age]y/o Unknown" when omitted). A plain integer
-- rather than a real date_of_birth: these are synthetic test patients,
-- a birth date would encode more fake-personal detail than the app
-- actually needs, an age is enough for clinical context.

alter table patients
  add column if not exists age integer;

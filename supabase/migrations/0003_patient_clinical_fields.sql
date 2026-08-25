-- 0003_patient_clinical_fields.sql
-- Restores allergies and admission_date to patients. Both were present
-- in the original demo schema (SCHEMA_noa_demo.md) but dropped when
-- 0001_init.sql was written for brevity, not for any deliberate reason.
-- Both are clinical context fields, not identifiers: no conflict with
-- the Patient_Test_N convention in SECURITY.md.

alter table patients
  add column if not exists allergies text[],
  add column if not exists admission_date date;

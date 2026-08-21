/**
 * Central medical reference data used throughout the application.
 * Contains abbreviations, department mappings, priority detection,
 * and status keywords for parsing voice and text input.
 */
export const medicalReference = {
  /**
   * Common medical abbreviations mapped to their full professional terms.
   * Used to expand shorthand in voice transcripts into proper documentation.
   */
  abbreviations: {
    "CBC": "Complete Blood Count with differential",
    "BMP": "Basic Metabolic Panel",
    "CMP": "Comprehensive Metabolic Panel",
    "PT/INR": "Prothrombin Time and International Normalized Ratio",
    "PTT": "Partial Thromboplastin Time",
    "CXR": "Chest X-ray PA and lateral",
    "CT": "CT scan",
    "MRI": "MRI",
    "EKG": "12-lead Electrocardiogram",
    "ECG": "12-lead Electrocardiogram",
    "ABG": "Arterial Blood Gas",
    "UA": "Urinalysis with microscopy",
    "KUB": "Kidneys, Ureters, and Bladder X-ray",
    "NPO": "Nothing by mouth",
    "PRN": "As needed",
    "BID": "Twice daily",
    "TID": "Three times daily",
    "QID": "Four times daily",
    "STAT": "Immediately",
    "SNF": "Skilled Nursing Facility",
    "subcut": "subcutaneous",
    "SQ": "subcutaneous",
    "PO": "by mouth",
    "IV": "intravenous"
  },

  /**
   * Keywords that map voice input to the correct hospital department.
   * Each key is a department name; the value is an array of lowercase
   * trigger words found in nurse transcripts.
   */
  departmentKeywords: {
    "Radiology": ["xray", "x-ray", "ct", "mri", "ultrasound", "imaging", "scan", "cxr", "kub"],
    "Lab": ["blood", "cbc", "bmp", "cmp", "pt", "ptt", "inr", "culture", "lab", "draw", "ua", "abg", "stick"],
    "Pharmacy": ["medication", "med", "drug", "insulin", "lantus", "tylenol", "morphine", "antibiotic", "dose"],
    "Physical Therapy": ["pt eval", "physical therapy", "mobility", "walker", "ambulation"],
    "Social Work": ["discharge planning", "snf", "nursing home", "home health", "case management"],
    "Nursing": ["vitals", "assessment", "wound care", "dressing change", "foley", "iv", "catheter"]
  },

  /**
   * Keywords used to detect task urgency from voice or text input.
   * "stat" maps to high-priority; "routine" is the default.
   */
  priorityKeywords: {
    stat: ["stat", "urgent", "emergency", "asap", "now", "immediately"],
    routine: ["routine", "scheduled", "regular", "when available"]
  },

  /**
   * Keywords used to detect task status changes from edit commands.
   * Maps semantic status names to arrays of trigger words.
   */
  statusKeywords: {
    completed: ["complete", "completed", "done", "finished"],
    delayed: ["delayed", "late", "waiting"],
    confirmed: ["confirmed", "scheduled", "booked"]
  }
};

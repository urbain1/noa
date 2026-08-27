// Client-side fallback for the `parsePatientFromVoice` Claude action
// (utils/claudeAPI.js). CLAUDE.md requires a fallback parser for every
// prompt; this is the one that actually runs today, because the Edge
// Function deployed against the beta predates that action.
//
// Two rules govern everything below, in this order:
//
//   1. Never invent a value. A field that wasn't clearly said comes back
//      null (or [] for allergies) and stays blank on the review form. An
//      invented diagnosis or age on a clinical record is worse than an
//      empty one the nurse fills in themselves.
//   2. `label` is only ever built from a spoken Patient_Test_N by template
//      (SECURITY.md). A name, a real room/bed number, a hospital or
//      national ID, or a date of birth can never produce one.
//
// Within those rules it aims at natural dictation rather than a script:
// fields in any order, any subset present, and no required lead-in phrase
// for the fields that carry their own unambiguous marker (a "Dr" title, a
// code status, an age unit, a "Test Room" prefix).
//
// How it works: every extractor stakes a *claim* over the character range
// it consumed. Later extractors skip ranges already claimed, and free-text
// capture (diagnosis, allergies) stops at the next claim rather than
// running to the end of the sentence. That is what makes unpunctuated
// speech — which is what the Web Speech API usually returns — parse
// correctly instead of swallowing every later field into the diagnosis.

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

// Web Speech routinely returns a homophone instead of a small spoken
// number ("patient test for"). Accepting these blind would let a spoken
// preposition invent a label — "patient test for pneumonia" is not a
// label — so a homophone only counts when nothing can follow it as an
// object: end of speech, punctuation, or the start of another recognised
// field. See `numberAfterLabelPrefix`.
const NUMBER_HOMOPHONES = { for: 4, fore: 4, to: 2, too: 2, ate: 8, won: 1 };

// Words that are never a physician's surname. Without this, "doctor said"
// and "Dr Chen ordered a CBC" become "Dr Said" and "Dr Chen Ordered".
const NOT_A_NAME = new Set([
  "said", "says", "say", "will", "is", "was", "were", "are", "wants", "want",
  "ordered", "order", "orders", "ordering", "has", "have", "had", "needs",
  "need", "called", "calls", "on", "to", "for", "and", "the", "about",
  "from", "at", "in", "of", "who", "that", "this", "a", "an", "be", "been",
  "please", "note", "notes", "round", "rounds", "visit", "visited",
  "review", "reviewing", "seeing", "saw", "today", "tomorrow", "yesterday",
  "morning", "evening", "night", "patient", "test", "room", "bay",
  "diagnosis", "diagnosed", "admitted", "admission", "age", "aged", "years",
  "year", "old", "comfort", "care", "full", "code", "dnr", "dni", "allergic",
  "allergy", "allergies", "est", "et", "le", "la", "les", "de", "du", "des",
  "avec", "pour", "ans", "chambre", "salle",
]);

// A stretch of speech the extractors didn't recognise is only accepted as a
// diagnosis when it reads as a bare clinical noun phrase ("COPD",
// "congestive heart failure"). Any of these words means it is a sentence, a
// symptom/medication narrative, or an identifier — none of which is a
// diagnosis the nurse stated — so the field stays blank instead.
const NOT_A_DIAGNOSIS = new Set([
  "with", "and", "or", "on", "in", "at", "for", "to", "since", "from",
  "has", "have", "had", "is", "was", "are", "were", "been", "be", "he",
  "she", "they", "him", "her", "his", "their", "patient", "pt", "the", "a",
  "an", "this", "that", "also", "please", "needs", "need", "room", "bed",
  "bay", "ward", "nhs", "mrn", "id", "number", "mr", "mrs", "ms", "miss",
  "mister", "madame", "monsieur", "mme", "dr", "doctor", "docteur",
  "avec", "et", "ou", "depuis", "il", "elle", "le", "la", "les", "un",
  "une", "des", "du", "est", "ont", "été", "pour", "dans", "lit",
]);

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11,
  décembre: 12, decembre: 12,
};

const CODE_STATUS_PATTERNS = [
  [/\bdnr\s*(?:\/|\s+slash\s+|\s+)dni\b|\bne pas réanimer\s*(?:\/|\s+)ne pas intuber\b/i, "DNR/DNI"],
  [/\bdnr\b|\bdo not resuscitate\b|\bne pas réanimer\b/i, "DNR"],
  [/\bcomfort care\b|\bsoins de confort\b/i, "Comfort Care"],
  [/\bfull code\b|\bréanimation complète\b|\breanimation complete\b/i, "Full Code"],
];

const PUNCTUATION = /[.,;:!?]/;

// --- claim bookkeeping -----------------------------------------------------

function overlaps(claims, start, end) {
  return claims.some((c) => start < c.end && end > c.start);
}

// First match of `regex` that doesn't sit on top of an already-claimed
// range, so an earlier, more specific extractor always wins the text.
function firstFreeMatch(text, regex, claims) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const re = new RegExp(regex.source, flags);
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    if (!overlaps(claims, m.index, m.index + m[0].length)) return m;
  }
  return null;
}

function claim(claims, start, end) {
  claims.push({ start, end });
}

// Where free-text capture starting at `from` has to stop: the next
// punctuation mark, the next claimed field, or a word budget — whichever
// comes first. This is what keeps "diagnosis of COPD comfort care Test
// Room A" from putting the code status and the location in the diagnosis.
function captureLimit(text, from, claims, maxWords) {
  let limit = text.length;

  for (const c of claims) {
    if (c.start >= from && c.start < limit) limit = c.start;
  }

  for (let i = from; i < limit; i++) {
    if (PUNCTUATION.test(text[i])) {
      limit = i;
      break;
    }
  }

  const words = text.slice(from, limit).split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    let seen = 0;
    let i = from;
    while (i < limit && seen < maxWords) {
      while (i < limit && /\s/.test(text[i])) i++;
      while (i < limit && !/\s/.test(text[i])) i++;
      seen++;
    }
    limit = i;
  }

  return limit;
}

function titleCase(s) {
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// --- individual fields -----------------------------------------------------

const AGE_RE =
  /\b(\d{1,3})\s*(?:-\s*)?(?:years?[\s-]*old\b|yrs?[\s-]*old\b|y\/?o\b|ans\b)|\b(?:aged|âgée?\s+de|agée?\s+de)\s+(\d{1,3})\b/i;

function extractAge(text, claims) {
  const m = firstFreeMatch(text, AGE_RE, claims);
  if (!m) return null;
  const value = parseInt(m[1] ?? m[2], 10);
  if (!Number.isFinite(value) || value < 0 || value > 130) return null;
  claim(claims, m.index, m.index + m[0].length);
  return value;
}

const ADMIT_LEAD = "(?:admitted|admission|admis(?:e)?|hospitalisée?)";
const ADMIT_ISO_RE = new RegExp(`\\b${ADMIT_LEAD}\\s+(?:on\\s+|le\\s+)?(\\d{4}-\\d{2}-\\d{2})\\b`, "i");
const ADMIT_DAY_MONTH_RE = new RegExp(
  `\\b${ADMIT_LEAD}\\s+(?:on\\s+|le\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?([A-Za-zÀ-ÿ]+)\\b`,
  "i",
);
const ADMIT_MONTH_DAY_RE = new RegExp(
  `\\b${ADMIT_LEAD}\\s+(?:on\\s+)?([A-Za-zÀ-ÿ]+)\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
  "i",
);
const ADMIT_RELATIVE_RE = new RegExp(
  `\\b${ADMIT_LEAD}\\s+(yesterday|today|hier|aujourd'hui)\\b`,
  "i",
);

function isoDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Only a date that actually parses is accepted. "admitted with pneumonia"
// must not produce one, which is why the month word is checked against a
// real month list rather than captured as free text.
function extractAdmissionDate(text, claims) {
  const iso = firstFreeMatch(text, ADMIT_ISO_RE, claims);
  if (iso) {
    claim(claims, iso.index, iso.index + iso[0].length);
    return iso[1];
  }

  const relative = firstFreeMatch(text, ADMIT_RELATIVE_RE, claims);
  if (relative) {
    const d = new Date();
    if (/yesterday|hier/i.test(relative[1])) d.setDate(d.getDate() - 1);
    claim(claims, relative.index, relative.index + relative[0].length);
    return isoDate(d);
  }

  for (const [re, dayGroup, monthGroup] of [
    [ADMIT_DAY_MONTH_RE, 1, 2],
    [ADMIT_MONTH_DAY_RE, 2, 1],
  ]) {
    const m = firstFreeMatch(text, re, claims);
    if (!m) continue;
    const month = MONTHS[m[monthGroup].toLowerCase()];
    const day = parseInt(m[dayGroup], 10);
    if (!month || !(day >= 1 && day <= 31)) continue;
    const now = new Date();
    let year = now.getFullYear();
    const candidate = new Date(year, month - 1, day);
    // A date later than today is last year's, not next year's: nobody is
    // admitted in the future.
    if (candidate.getTime() > now.getTime() + 24 * 60 * 60 * 1000) year -= 1;
    claim(claims, m.index, m.index + m[0].length);
    return isoDate(new Date(year, month - 1, day));
  }

  return null;
}

function extractCodeStatus(text, claims) {
  for (const [re, value] of CODE_STATUS_PATTERNS) {
    const m = firstFreeMatch(text, re, claims);
    if (m) {
      claim(claims, m.index, m.index + m[0].length);
      return value;
    }
  }
  return null;
}

// Synthetic location labels only ("Test Room A", "Bay 2") -- a bare
// "room 412" is a real room number and is never picked up (SECURITY.md).
const LOCATION_RE = /\b(test\s+room|chambre\s+test|salle\s+test|bay|baie)\s+([A-Za-z0-9]{1,4})\b/i;

function extractLocationLabel(text, claims) {
  const m = firstFreeMatch(text, LOCATION_RE, claims);
  if (!m) return null;
  claim(claims, m.index, m.index + m[0].length);
  return `${titleCase(m[1].replace(/\s+/g, " "))} ${m[2].toUpperCase()}`;
}

const NO_ALLERGY_RE =
  /\b(?:no known (?:drug )?allergies|nkda|nka|no allergies|aucune allergie(?:s)? connue(?:s)?|pas d'allergies?)\b/i;
const ALLERGY_RE =
  /\b(?:allergic to|allergy to|allergies to|allergies?\s*:|allergique à|allergies? à)\s*/i;

function extractAllergies(text, claims) {
  const none = firstFreeMatch(text, NO_ALLERGY_RE, claims);
  if (none) {
    claim(claims, none.index, none.index + none[0].length);
    return [];
  }

  const m = firstFreeMatch(text, ALLERGY_RE, claims);
  if (!m) return [];

  const from = m.index + m[0].length;
  const to = captureLimit(text, from, claims, 8);
  const raw = text.slice(from, to).trim();
  if (!raw) return [];

  claim(claims, m.index, to);
  return raw
    .split(/\s*(?:,|\band\b|\bet\b|\bor\b|\/)\s*/i)
    .map((a) => a.trim())
    .filter((a) => a.length > 1);
}

const PHYSICIAN_TRAILING_RE =
  /\b((?:dr\.?|doctor|docteur)\s+[A-Za-zÀ-ÿ'’-]+(?:\s+[A-Za-zÀ-ÿ'’-]+)?)\s+is\s+(?:the\s+)?attending\b/i;
const PHYSICIAN_LEAD_RE =
  /\b(?:attending(?:\s+(?:physician|doctor))?|consultant|médecin(?:\s+traitant)?|medecin(?:\s+traitant)?)\s*(?:is|:|est)?\s+((?:dr\.?|doctor|docteur)\s+)?([A-Za-zÀ-ÿ'’-]+(?:\s+[A-Za-zÀ-ÿ'’-]+)?)/i;
// No lead-in required: the title is the marker. This is the case natural
// dictation actually produces ("Patient Test 12, COPD, Dr Whitfield").
const PHYSICIAN_TITLE_RE =
  /\b(dr\.?|doctor|docteur)\s+([A-Za-zÀ-ÿ'’-]+(?:\s+[A-Za-zÀ-ÿ'’-]+)?)/i;

// Trims a captured 1-2 word name down to the part that can actually be a
// surname, and rejects it outright if none of it can.
function cleanName(raw) {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  const kept = [];
  for (const w of words) {
    if (NOT_A_NAME.has(w.toLowerCase().replace(/[.'’-]+$/, ""))) break;
    kept.push(w);
  }
  if (kept.length === 0) return null;
  return titleCase(kept.join(" "));
}

function extractPhysician(text, claims) {
  const trailing = firstFreeMatch(text, PHYSICIAN_TRAILING_RE, claims);
  if (trailing) {
    const withoutTitle = trailing[1].replace(/^(?:dr\.?|doctor|docteur)\s+/i, "");
    const name = cleanName(withoutTitle);
    if (name) {
      claim(claims, trailing.index, trailing.index + trailing[0].length);
      return `Dr ${name}`;
    }
  }

  const lead = firstFreeMatch(text, PHYSICIAN_LEAD_RE, claims);
  if (lead) {
    const name = cleanName(lead[2]);
    if (name) {
      claim(claims, lead.index, lead.index + lead[0].length);
      return lead[1] ? `Dr ${name}` : name;
    }
  }

  const titled = firstFreeMatch(text, PHYSICIAN_TITLE_RE, claims);
  if (titled) {
    const name = cleanName(titled[2]);
    if (name) {
      claim(claims, titled.index, titled.index + titled[0].length);
      return `Dr ${name}`;
    }
  }

  return null;
}

// Both spoken orders, an optional spoken "underscore" (nurses read the
// label off the card), and an optional "number"/"#". Both words are
// required: "patient 4" or "blood test 4" is not a label.
const LABEL_PREFIX_RE =
  /\b(?:(?:patients?|pt)[\s_-]*(?:underscore[\s_-]*)?tests?|tests?[\s_-]*(?:underscore[\s_-]*)?(?:patients?|pt))[\s_-]*(?:underscore[\s_-]*)?(?:(?:numbers?|nos?\.?|#)[\s_-]*)?/i;

function wordsToNumber(parts) {
  if (parts.length === 0 || parts.length > 2 || !parts.every((p) => p in NUMBER_WORDS)) return null;
  if (parts.length === 1) return NUMBER_WORDS[parts[0]];
  const [tens, ones] = parts.map((p) => NUMBER_WORDS[p]);
  return tens >= 20 && tens % 10 === 0 && ones < 10 ? tens + ones : null;
}

// True when nothing in `text` after `at` could be the object of a
// preposition -- end of speech, punctuation, or the start of another
// recognised field. Only then is a homophone read as a number.
function isTerminal(text, at, claims) {
  let i = at;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (i >= text.length) return true;
  if (PUNCTUATION.test(text[i])) return true;
  return claims.some((c) => c.start === i);
}

function numberAfterLabelPrefix(text, from, claims) {
  const rest = text.slice(from);

  const digits = rest.match(/^(\d{1,4})\b/);
  if (digits) return { value: parseInt(digits[1], 10), end: from + digits[0].length };

  const words = rest.match(/^([A-Za-z]+)(?:[\s-]+([A-Za-z]+))?/);
  if (!words) return null;

  const first = words[1].toLowerCase();
  const second = words[2] ? words[2].toLowerCase() : null;

  if (second) {
    const pair = wordsToNumber([first, second]);
    if (pair !== null) return { value: pair, end: from + words[0].length };
  }

  const single = wordsToNumber([first]);
  if (single !== null) return { value: single, end: from + words[1].length };

  if (first in NUMBER_HOMOPHONES) {
    const end = from + words[1].length;
    if (isTerminal(text, end, claims)) return { value: NUMBER_HOMOPHONES[first], end };
  }

  return null;
}

function extractLabel(text, claims) {
  const flags = `${LABEL_PREFIX_RE.flags}g`;
  const re = new RegExp(LABEL_PREFIX_RE.source, flags);
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    const from = m.index + m[0].length;
    const found = numberAfterLabelPrefix(text, from, claims);
    if (found && !overlaps(claims, m.index, found.end)) {
      claim(claims, m.index, found.end);
      return `Patient_Test_${found.value}`;
    }
  }
  return null;
}

const DIAGNOSIS_LEAD_RE =
  /\b(?:admitted (?:with|for)|admission (?:diagnosis|for)|diagnosis(?:\s+(?:of|is))?|diagnosed with|presenting with|presents with|known|admis(?:e)? pour|hospitalisée? pour|diagnostic(?:\s+(?:de|d'|est))?)\s*:?\s+/i;

function extractDiagnosis(text, claims) {
  const m = firstFreeMatch(text, DIAGNOSIS_LEAD_RE, claims);
  if (!m) return null;
  const from = m.index + m[0].length;
  const to = captureLimit(text, from, claims, 8);
  const value = text.slice(from, to).trim().replace(/^(?:(?:a|an|the|un|une|le|la|les)\s+|l')/i, "").replace(/[\s,;:.-]+$/, "");
  if (value.length < 2) return null;
  claim(claims, m.index, to);
  return value;
}

// Natural dictation often states the diagnosis with no lead-in at all:
// "Patient Test 12, COPD, Dr Whitfield". A leftover stretch of speech is
// taken only when the rest of the sentence was understood (so the stretch
// is genuinely delimited by recognised fields or punctuation) and it reads
// as a bare noun phrase. Anything sentence-like, narrative, or
// identifier-like is left alone and the field stays blank -- see
// NOT_A_DIAGNOSIS.
function extractDiagnosisFromLeftovers(text, claims) {
  if (claims.length === 0) return null;

  const sorted = [...claims].sort((a, b) => a.start - b.start);
  const gaps = [];
  let cursor = 0;
  for (const c of sorted) {
    if (c.start > cursor) gaps.push([cursor, c.start]);
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < text.length) gaps.push([cursor, text.length]);

  for (const [start, end] of gaps) {
    for (const piece of text.slice(start, end).split(PUNCTUATION)) {
      const value = piece.trim().replace(/^[-\s]+|[-\s]+$/g, "");
      if (!value) continue;
      const words = value.split(/\s+/);
      if (words.length > 6) continue;
      if (words.some((w) => NOT_A_DIAGNOSIS.has(w.toLowerCase()))) continue;
      if (words.some((w) => !/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’/-]*$/.test(w))) continue;
      return value;
    }
  }
  return null;
}

/**
 * Parse a spoken patient description into Add Patient form fields.
 *
 * Returns the same shape as the `parsePatientFromVoice` Claude action, so
 * either source can feed AddPatientDialog's `initialFields` unchanged.
 * Always returns an object -- never null -- so the review step always
 * opens, even when nothing could be extracted.
 *
 * @param {string} transcript
 * @returns {{label: string|null, age: number|null, diagnosis: string|null,
 *   codeStatus: string|null, attendingPhysician: string|null,
 *   allergies: string[], admissionDate: string|null,
 *   locationLabel: string|null}}
 */
export function parsePatientTranscriptFallback(transcript) {
  const text = typeof transcript === "string" ? transcript : "";
  const claims = [];

  // Order matters: every extractor that carries its own unambiguous marker
  // runs before the two that read free text, so the free-text capture knows
  // where to stop.
  const age = extractAge(text, claims);
  const admissionDate = extractAdmissionDate(text, claims);
  const codeStatus = extractCodeStatus(text, claims);
  const locationLabel = extractLocationLabel(text, claims);
  const allergies = extractAllergies(text, claims);
  const attendingPhysician = extractPhysician(text, claims);
  const label = extractLabel(text, claims);
  const diagnosis =
    extractDiagnosis(text, claims) ?? extractDiagnosisFromLeftovers(text, claims);

  return {
    label,
    age,
    diagnosis,
    codeStatus,
    attendingPhysician,
    allergies,
    admissionDate,
    locationLabel,
  };
}

/**
 * Map of spoken number words to their digit equivalents.
 * Covers zero through nine plus common speech-to-text variants.
 */
const wordToDigit = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  to: "2",
  too: "2",
  three: "3",
  four: "4",
  for: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

/**
 * Normalize a spoken room identifier into a comparable string.
 *
 * Steps:
 *  1. Lowercase the input
 *  2. Replace number words ("two oh eight") with digits ("208")
 *  3. Strip spaces, hyphens, and special characters
 *  4. Uppercase the result for consistent comparison
 *
 * @param {string} spoken - Raw spoken or typed room reference
 * @returns {string} Normalized room string, e.g. "2A208"
 */
function normalizeRoom(spoken) {
  let normalized = spoken.toLowerCase();

  // Replace each number word with its digit
  for (const [word, digit] of Object.entries(wordToDigit)) {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, "g"), digit);
  }

  // Strip spaces, hyphens, and non-alphanumeric characters
  normalized = normalized.replace(/[^a-z0-9]/g, "").toUpperCase();

  return normalized;
}

/**
 * Check whether a string looks like a room number (only digits, hyphens, and
 * short letter prefixes like "2A").
 */
function looksLikeRoom(str) {
  const cleaned = str.trim().replace(/[\s-]/g, "");
  // Room numbers: digits optionally preceded/followed by a single letter, e.g. "208", "2A-312", "A3"
  return /^[a-zA-Z]?\d+[a-zA-Z]?$/.test(cleaned);
}

/**
 * Try to split an input like "Sarah in 208" into a name part and a room part.
 * Returns { name, room } where either can be null.
 */
function extractNameAndRoom(input) {
  // Look for patterns like "name in room" or "name room" where room is at the end
  const inPattern = /^(.+?)\s+in\s+(\S+)$/i;
  const match = input.match(inPattern);
  if (match) {
    const namePart = match[1].trim();
    const roomPart = match[2].trim();
    if (looksLikeRoom(roomPart)) {
      return { name: namePart, room: roomPart };
    }
  }
  return null;
}

/**
 * Calculate simple similarity between two strings (0 to 1).
 * Uses a combination of includes-check and character-level comparison.
 */
function nameSimilarity(a, b) {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();

  // Exact match
  if (al === bl) return 1.0;

  // One contains the other (e.g., "johnson" matches "jennifer johnson")
  if (al.includes(bl) || bl.includes(al)) return 0.9;

  // Check if any individual word matches exactly
  const aWords = al.split(/\s+/);
  const bWords = bl.split(/\s+/);
  const hasExactWordMatch = aWords.some((aw) => bWords.some((bw) => aw === bw));
  if (hasExactWordMatch) return 0.85;

  // Check if any individual word is very similar (handles "maria" vs "mariah", "sara" vs "sarah")
  const hasSimilarWord = aWords.some((aw) =>
    bWords.some((bw) => {
      // One is a prefix of the other (at least 3 chars)
      if (aw.length >= 3 && bw.length >= 3) {
        if (aw.startsWith(bw) || bw.startsWith(aw)) return true;
      }
      // Levenshtein distance of 1 or 2 for words of similar length
      const dist = levenshtein(aw, bw);
      const maxLen = Math.max(aw.length, bw.length);
      if (maxLen <= 4 && dist <= 1) return true;
      if (maxLen > 4 && dist <= 2) return true;
      return false;
    })
  );
  if (hasSimilarWord) return 0.7;

  return 0;
}

/**
 * Simple Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Check if two name words are fuzzy-equal.
 * Handles speech-to-text variations like "Maria"/"Mariah", "Sara"/"Sarah".
 */
function fuzzyWordMatch(a, b) {
  if (a === b) return true;
  // One is a prefix of the other (min 3 chars)
  if (a.length >= 3 && b.length >= 3) {
    if (a.startsWith(b) || b.startsWith(a)) return true;
  }
  // Levenshtein distance tolerance
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen <= 4 && dist <= 1) return true;
  if (maxLen > 4 && dist <= 2) return true;
  return false;
}

/**
 * Match a search name against a patient's name using fuzzy matching.
 *
 * @param {string} searchName - The name to search for
 * @param {{name: string}} patient - Patient object with a name field
 * @returns {'exact'|'partial'|null} Match quality or null for no match
 */
function matchByName(searchName, patient) {
  const normalized = searchName.toLowerCase().trim();
  const patientName = patient.name.toLowerCase();

  // Exact match
  if (patientName === normalized) return "exact";

  // Split into parts
  const searchParts = normalized.split(/\s+/);
  const nameParts = patientName.split(/\s+/);

  // Single word search (e.g., "Santos", "Mariah")
  if (searchParts.length === 1) {
    // Exact word match
    if (nameParts.some((part) => part === normalized)) return "partial";
    // Fuzzy word match
    if (nameParts.some((part) => fuzzyWordMatch(part, normalized))) return "partial";
  }

  // Multi-word search (e.g., "Mariah Santos", "Sarah Johnson")
  if (searchParts.length >= 2) {
    const firstName = searchParts[0];
    const lastName = searchParts[searchParts.length - 1];
    const patientFirst = nameParts[0];
    const patientLast = nameParts[nameParts.length - 1];

    // Both first and last match exactly
    if (nameParts.includes(firstName) && nameParts.includes(lastName)) {
      return "exact";
    }

    // Both first and last match fuzzily
    if (fuzzyWordMatch(firstName, patientFirst) && fuzzyWordMatch(lastName, patientLast)) {
      return "exact";
    }

    // One matches exactly, other matches fuzzily
    if (
      (firstName === patientFirst && fuzzyWordMatch(lastName, patientLast)) ||
      (fuzzyWordMatch(firstName, patientFirst) && lastName === patientLast)
    ) {
      return "exact";
    }

    // At least one word matches fuzzily
    const anyFuzzyMatch = searchParts.some((sp) =>
      nameParts.some((np) => fuzzyWordMatch(sp, np))
    );
    if (anyFuzzyMatch) return "partial";
  }

  // Contains match
  if (patientName.includes(normalized)) return "partial";

  return null;
}

/**
 * Match rooms using existing room-matching logic.
 */
function matchByRoom(spokenRoom, allPatients) {
  const normalizedSpoken = normalizeRoom(spokenRoom);

  if (!normalizedSpoken) {
    return { exactMatch: null, partialMatches: [], matchType: "none" };
  }

  const partialMatches = [];

  for (const patient of allPatients) {
    const normalizedPatientRoom = normalizeRoom(patient.room || "");

    // Exact match — return immediately
    if (normalizedPatientRoom === normalizedSpoken) {
      return { exactMatch: patient, partialMatches: [], matchType: "exact" };
    }

    // Suffix match — "208" matches end of "2A208"
    // Partial match — spoken value found anywhere in the room string
    if (
      normalizedPatientRoom.endsWith(normalizedSpoken) ||
      normalizedPatientRoom.includes(normalizedSpoken)
    ) {
      partialMatches.push(patient);
    }
  }

  return {
    exactMatch: null,
    partialMatches,
    matchType: partialMatches.length > 0 ? "partial" : "none",
  };
}

/**
 * Match patient input that can be a room number, patient name, or both.
 *
 * @param {string} input - Room number ("208"), name ("Sarah Johnson"), or both ("Sarah in 208")
 * @param {Array<{room: string, name: string}>} allPatients - Patient list
 * @returns {{
 *   exactMatch: object|null,
 *   partialMatches: object[],
 *   matchType: 'exact'|'partial'|'none',
 *   matchedBy: 'room'|'name'|'name+room'
 * }}
 */
export function findMatchingPatients(input, allPatients) {
  const trimmed = input.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return {
      exactMatch: null,
      partialMatches: [],
      matchType: "none",
      matchedBy: "room",
    };
  }

  // SCENARIO C: Input contains both name AND room (e.g. "Sarah in 208")
  const combined = extractNameAndRoom(trimmed);
  if (combined) {
    const roomResult = matchByRoom(combined.room, allPatients);
    const roomCandidates = roomResult.exactMatch
      ? [roomResult.exactMatch, ...roomResult.partialMatches]
      : roomResult.partialMatches;

    let exactMatch = null;
    const partialMatches = [];

    for (const patient of roomCandidates) {
      const nameMatch = matchByName(combined.name, patient);
      if (nameMatch === "exact") {
        exactMatch = patient;
      } else if (nameMatch === "partial") {
        partialMatches.push(patient);
      }
    }

    if (exactMatch) {
      return {
        exactMatch,
        partialMatches,
        matchType: "exact",
        matchedBy: "name+room",
      };
    }
    if (partialMatches.length > 0) {
      return {
        exactMatch: null,
        partialMatches,
        matchType: "partial",
        matchedBy: "name+room",
      };
    }
    return {
      exactMatch: null,
      partialMatches: [],
      matchType: "none",
      matchedBy: "name+room",
    };
  }

  // SCENARIO A: Input looks like a room number (only numbers/hyphens/short letter prefix)
  if (looksLikeRoom(trimmed)) {
    return { ...matchByRoom(trimmed, allPatients), matchedBy: "room" };
  }

  // SCENARIO B: Input contains a patient name
  let exactMatch = null;
  const partialMatches = [];

  for (const patient of allPatients) {
    const nameMatch = matchByName(trimmed, patient);
    if (nameMatch === "exact") {
      exactMatch = patient;
    } else if (nameMatch === "partial") {
      partialMatches.push(patient);
    }
  }

  if (exactMatch) {
    return {
      exactMatch,
      partialMatches,
      matchType: "exact",
      matchedBy: "name",
    };
  }
  if (partialMatches.length > 0) {
    return {
      exactMatch: null,
      partialMatches,
      matchType: "partial",
      matchedBy: "name",
    };
  }
  return {
    exactMatch: null,
    partialMatches: [],
    matchType: "none",
    matchedBy: "name",
  };
}

// Backward-compatible alias
export { findMatchingPatients as findMatchingRooms };

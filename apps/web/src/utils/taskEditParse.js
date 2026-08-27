// Client-side fallback for the `parseTaskEditCommand` Claude action
// (utils/claudeAPI.js). CLAUDE.md requires a fallback parser for every
// prompt; this action was the one that never had one, because the AI edit
// mode it serves was wired to nothing and so never ran.
//
// It also does one thing the deployed prompt cannot: resolve a spoken
// deadline in the nurse's own timezone. The Edge Function gives Claude
// `new Date().toISOString()`, which is UTC, so "tomorrow at 2pm" comes back
// as 14:00 UTC -- an hour or more off for every tester outside it, and this
// beta has testers in four regions. Everything below builds a local Date and
// converts once, at the end, so 2pm means 2pm where the nurse is standing.
//
// Rules it holds to:
//   - Only fields the tasks table actually has (0001): description,
//     department, priority, status, deadline. Never `room` -- tasks
//     reference a patient and have no room column.
//   - Only canonical English enum values, whatever language was spoken.
//     The DB check constraints accept nothing else.
//   - A command it cannot read returns an error, never a guess. Silently
//     changing the wrong field on a clinical task is worse than saying so.

// `\b` is ASCII-only in JavaScript: it sees no boundary after the "é" in
// "terminé", so an accented French keyword at the end of a command never
// matched. Every keyword group below is built through this instead, which
// brackets the alternatives with explicit non-letter tests that count
// accented letters as letters.
function word(alternatives) {
  return new RegExp(`(?:^|[^A-Za-zÀ-ÿ])(?:${alternatives})(?![A-Za-zÀ-ÿ])`, "i");
}

// The tasks table's own values (0001_init.sql). `Urgent` is not among them:
// priority is a two-level column, so a spoken "urgent" raises the task
// rather than being coerced down to Routine, which is what would otherwise
// happen and is the wrong way to be wrong about a nurse saying "urgent".
const PRIORITY_PATTERNS = [
  [word("stat|urgente?|immediate|immédiate?"), "Stat"],
  [word("routine|normale?|standard|non[\\s-]?urgente?"), "Routine"],
];

const STATUS_PATTERNS = [
  [word("completed?|done|finished?|terminée?|faite?|achevée?"), "Completed"],
  [word("confirmed?|acknowledged?|received?|confirmée?|reçue?"), "Confirmed"],
  [word("delayed?|late|overdue|retardée?|en retard"), "Delayed"],
  [word("pending|waiting|not started|en attente|à faire"), "Pending"],
];

const DEPARTMENT_PATTERNS = [
  [word("radiology|imaging|radiologie|imagerie"), "Radiology"],
  [word("lab|laboratory|labs|laboratoire"), "Lab"],
  [word("pharmacy|pharmacie"), "Pharmacy"],
  [word("physical therapy|physio(?:therapy)?|kiné(?:sithérapie)?|kine"), "Physical Therapy"],
  [word("social work|social services|service social|assistance sociale"), "Social Work"],
  [word("nursing|nurses?|soins infirmiers|infirmi(?:er|ère)s?"), "Nursing"],
  [word("transport|brancardage"), "Transport"],
];

const DELETE_RE =
  /\b(?:delete|remove|discard|get rid of|supprime[rz]?|efface[rz]?|retire[rz]?)\b/i;
// "cancel" only reads as a delete when it is the task being cancelled --
// "cancel the deadline" is a deadline change, not a deletion.
const CANCEL_TASK_RE = /\b(?:cancel|annule[rz]?)\s+(?:this|the|that|it|cette|la|le)?\s*(?:task|tâche|tache)?\b/i;
const CANCEL_NOT_TASK_RE = /\b(?:cancel|annule[rz]?)\s+(?:the\s+|la\s+|le\s+)?(?:deadline|due date|échéance|echeance|date)\b/i;

const CLEAR_DEADLINE_RE =
  /\b(?:no|remove|clear|drop|delete|cancel|without|pas de|aucune|supprime[rz]?|retire[rz]?|enlève[rz]?)\s+(?:the\s+|la\s+|l')?(?:deadline|due date|due|échéance|echeance|date limite)\b/i;

const DESCRIPTION_RE =
  /\b(?:description|wording|text|libellé|libelle|texte)\s*(?:to|as|should (?:be|read)|:|en|à|a)?\s*[:"“]?\s*(.+)$/i;

const RELATIVE_RE =
  /\bin\s+(\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty[\s-]four)\s*(minutes?|mins?|hours?|hrs?|h|days?)\b|\bdans\s+(\d{1,3}|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze|vingt[\s-]quatre)\s*(minutes?|mins?|heures?|h|jours?)\b/i;

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, twelve: 12, "twenty four": 24, "twenty-four": 24,
  une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8,
  neuf: 9, dix: 10, douze: 12, "vingt quatre": 24, "vingt-quatre": 24,
};

// Named times of day, in local hours. These are the app's own convention,
// not a clinical standard -- they exist so "by tonight" resolves to
// something rather than being dropped.
const NAMED_TIMES = [
  [/\b(?:tonight|this evening|ce soir)\b/i, 21, 0],
  [/\b(?:this afternoon|cet après-midi|cet apres-midi)\b/i, 15, 0],
  [/\b(?:this morning|ce matin)\b/i, 9, 0],
  [/\b(?:midday|noon|midi)\b/i, 12, 0],
  [/\b(?:midnight|minuit)\b/i, 0, 0],
  [/\b(?:end of (?:the )?shift|fin de (?:la )?garde|fin de service)\b/i, 19, 0],
];

// Accepts "2pm", "14:00", "14h", "14h30", "2.30pm". The trailing "h" is the
// French clock and has to be allowed to stand alone -- with an ASCII `\b`
// after the digits, "14h" matched nothing at all and the command silently
// fell through to the end-of-day default.
const CLOCK_RE =
  /(?:^|[^A-Za-zÀ-ÿ0-9])(\d{1,2})\s*(?:[:h.]\s*(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|h)?(?![0-9])/i;

const DAY_RE =
  /\b(today|tonight|tomorrow|the day after tomorrow|aujourd'hui|ce soir|demain|après-demain|apres-demain)\b/i;

function wordToNumber(raw) {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  if (/^\d+$/.test(key)) return parseInt(key, 10);
  return WORD_NUMBERS[key] ?? WORD_NUMBERS[key.replace(/[\s-]/g, " ")] ?? null;
}

function firstMatch(command, patterns) {
  for (const [re, value] of patterns) {
    if (re.test(command)) return value;
  }
  return null;
}

// Resolves a spoken deadline against the browser's local clock.
// Returns undefined when the command says nothing about a deadline, null
// when it explicitly clears one, and an ISO string otherwise.
function extractDeadline(command) {
  if (CLEAR_DEADLINE_RE.test(command)) return null;

  const relative = command.match(RELATIVE_RE);
  if (relative) {
    const amount = wordToNumber(relative[1] ?? relative[3]);
    const unit = (relative[2] ?? relative[4] ?? "").toLowerCase();
    if (amount !== null) {
      const when = new Date();
      if (/^(?:minutes?|mins?)/.test(unit)) when.setMinutes(when.getMinutes() + amount);
      else if (/^(?:days?|jours?)/.test(unit)) when.setDate(when.getDate() + amount);
      else when.setHours(when.getHours() + amount);
      return when.toISOString();
    }
  }

  const dayMatch = command.match(DAY_RE);
  const named = NAMED_TIMES.find(([re]) => re.test(command));
  // A bare clock time ("by 3pm", "at 14:00"). Read only when the command
  // is about timing at all, so "move to department 5" can't become a time.
  // A named day is context enough on its own: "move it to tomorrow 2pm"
  // carries no "at"/"by", and the accented French markers ("à") defeat
  // `\b` in any case, which is why `dayMatch` counts here.
  const clockContext =
    Boolean(dayMatch) ||
    Boolean(named) ||
    /(?:^|[^A-Za-zÀ-ÿ])(?:at|by|before|due|deadline|until|till|à|avant|pour|échéance|echeance)(?![A-Za-zÀ-ÿ])/i.test(
      command,
    );
  const clock = clockContext ? command.match(CLOCK_RE) : null;

  if (!dayMatch && !named && !clock) return undefined;

  const when = new Date();
  if (dayMatch) {
    const day = dayMatch[1].toLowerCase();
    if (/^(?:tomorrow|demain)$/.test(day)) when.setDate(when.getDate() + 1);
    else if (/après-demain|apres-demain|day after tomorrow/.test(day)) when.setDate(when.getDate() + 2);
  }

  if (named) {
    when.setHours(named[1], named[2], 0, 0);
  } else if (clock) {
    let hour = parseInt(clock[1], 10);
    const minute = clock[2] ? parseInt(clock[2], 10) : 0;
    const suffix = clock[3] ? clock[3].toLowerCase().replace(/\./g, "") : null;
    const meridiem = suffix === "h" ? null : suffix;
    if (hour > 23 || minute > 59) return undefined;
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    when.setHours(hour, minute, 0, 0);
    // "by 9" said at 6pm means tomorrow morning, not nine hours ago.
    if (!dayMatch && when.getTime() < Date.now()) when.setDate(when.getDate() + 1);
  } else {
    // A day with no time: end of that working day, rather than this minute
    // on that day, which would read as "already overdue" for a morning edit.
    when.setHours(17, 0, 0, 0);
  }

  return when.toISOString();
}

function extractDescription(command) {
  // Only an explicit instruction rewrites the description. Without this
  // guard every unrecognised command would silently overwrite the task
  // text with itself.
  if (!/\b(?:description|wording|text|libellé|libelle|texte)\b/i.test(command)) return undefined;
  const m = command.match(DESCRIPTION_RE);
  if (!m) return undefined;
  const value = m[1].trim().replace(/^["“']+|["”']+$/g, "").replace(/[\s.]+$/, "");
  return value.length >= 2 ? value : undefined;
}

/**
 * True when a command asks for the task itself to be deleted.
 *
 * Exported so the edit dialog's red "this will delete the task" warning is
 * driven by the same reading the parser uses. It previously tested for the
 * bare English word "delete", so a nurse typing "remove this task" or
 * "supprimer cette tâche" got no warning at all before pressing Apply.
 *
 * @param {string} command
 * @returns {boolean}
 */
export function isDeleteCommand(command) {
  const text = typeof command === "string" ? command.trim() : "";
  if (!text) return false;
  if (extractDeadline(text) !== undefined) return false;
  return DELETE_RE.test(text) || (CANCEL_TASK_RE.test(text) && !CANCEL_NOT_TASK_RE.test(text));
}

/**
 * Parse a natural-language task edit command without calling Claude.
 *
 * Returns the same shape as the `parseTaskEditCommand` action, so either
 * source can feed the same apply path unchanged.
 *
 * @param {string} command
 * @param {object} currentTask
 * @returns {{updates: object|null, action: string|null, error: string|null}}
 */
export function parseTaskEditFallback(command, currentTask = {}) {
  const text = typeof command === "string" ? command.trim() : "";
  if (!text) return { updates: null, action: null, error: "empty" };

  // Deadline first: "remove the deadline" and "delete the deadline" are
  // deadline changes, and reading either as "delete the task" would destroy
  // a task the nurse only wanted to reschedule.
  const deadline = extractDeadline(text);

  if (deadline === undefined && isDeleteCommand(text)) {
    return { updates: null, action: "delete", error: null };
  }

  const updates = {};
  if (deadline !== undefined) updates.deadline = deadline;

  const description = extractDescription(text);
  if (description !== undefined) updates.description = description;

  const priority = firstMatch(text, PRIORITY_PATTERNS);
  if (priority && priority !== currentTask.priority) updates.priority = priority;

  const status = firstMatch(text, STATUS_PATTERNS);
  if (status && status !== currentTask.status) updates.status = status;

  const department = firstMatch(text, DEPARTMENT_PATTERNS);
  if (department && department !== currentTask.department) updates.department = department;

  if (Object.keys(updates).length === 0) {
    return { updates: null, action: null, error: "unreadable" };
  }

  return { updates, action: null, error: null };
}

// Pure match logic. No DOM, no OCR. See AGENTS.md.

export const WARNING_HEADER = "GOVERNMENT WARNING:";
export const WARNING_BODY =
  "(1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. " +
  "(2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

export const MATCH = "Match";
export const CHECK = "Check this";
export const NO_MATCH = "No match";
export const CANT_READ = "Can't read";

// Lowercase, drop punctuation, collapse spaces.
const normalize = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

// shortcut: plain O(n*m) edit distance. Fine for label text. Swap for a library if input grows.
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

const grade = (score) => (score === 1 ? MATCH : score >= 0.85 ? CHECK : NO_MATCH);

// Look for the form value inside all the label text.
// Ignore spaces and punctuation: the reader often drops or adds spaces ("OLDTOM", "To m").
// shortcut: a short value can match inside a longer word. Raise the bar if that bites.
// "Whisky" and "whiskey" are the same word on labels.
const squash = (x) => normalize(x).replace(/whiskey/g, "whisky").replace(/ /g, "");

// Best score (0 to 1) of `want` against any stretch of `text` about its length.
function closest(want, text) {
  let best = 0;
  for (let size = Math.max(1, want.length - 2); size <= want.length + 2; size++) {
    for (let i = 0; i + size <= text.length; i++) {
      best = Math.max(best, 1 - distance(want, text.slice(i, i + size)) / Math.max(want.length, size));
      if (best === 1) return 1;
    }
  }
  return best;
}

export function findText(form, labelText) {
  const want = squash(form);
  if (!want) return { status: NO_MATCH, score: 0 };
  const text = squash(labelText);
  let score = closest(want, text);
  // Words in another order or apart ("SANTONI ... FAMIGLIA"): score by the weakest word.
  const words = normalize(form).split(" ").filter((w) => w.length > 1);
  if (score < 1 && words.length > 1) score = Math.max(score, Math.min(...words.map((w) => closest(squash(w), text))));
  return { status: grade(score), score };
}

const PCT = /(\d+(?:\.\d+)?)\s*%/g;
const VOL = /(\d+(?:[.,]\d+)?)\s*(ml|cl|l|litre|liter|fl\.?\s*oz)\b/gi;
const ML = { ml: 1, cl: 10, l: 1000, litre: 1000, liter: 1000, floz: 29.5735 };

const toMl = (m) =>
  Math.round(parseFloat(m[1].replace(",", ".")) * ML[m[2].toLowerCase().replace(/[\s.]/g, "")]);

const fixDigits = (s) => {
  let t = String(s ?? ""), prev;
  do { prev = t; t = t.replace(/(?<=\d)[oO]|[oO](?=\d)/g, "0"); } while (t !== prev);
  return t;
};

export const allAbv = (s) => [...fixDigits(s).matchAll(PCT)].map((m) => parseFloat(m[1]));
export const allMl = (s) => [...fixDigits(s).matchAll(VOL)].map(toMl);

const firstNumber = (s) => {
  const m = /(\d+(?:\.\d+)?)/.exec(String(s ?? ""));
  return m ? parseFloat(m[1]) : null;
};
const oneMl = (s) => allMl(s)[0] ?? null;

// Find all proof numbers on the label. Case-insensitive, run through fixDigits.
const PROOF = /(\d+(?:\.\d+)?)\s*proof\b/gi;
const allProof = (s) => [...fixDigits(s).matchAll(PROOF)].map((m) => parseFloat(m[1]));

// The warning must be exact. Header: all caps. Body: same words.
// The required words, 3 letters or more. Short words (a, of, to) add nothing and the reader merges them.
const REQUIRED = normalize(WARNING_BODY).split(" ").filter((w) => w.length >= 3);

// One word of the warning against one word the reader found. Long words may have a slip,
// and the reader often joins words ("accordingto"), so a found word may contain the one we want.
// "not" must stand alone: too many words contain it ("cannot").
const sameWord = (want, got) =>
  want === got || (want.length >= 5 && distance(want, got) <= Math.floor(want.length / 5)) ||
  (want.length >= 3 && want !== "not" && got.includes(want));

// "GOVERNMENT WARNING" with any spaces the reader adds inside it ("Govern ment").
const HEADING = /G\s*O\s*V\s*E\s*R\s*N\s*M\s*E\s*N\s*T\s*W\s*A\s*R\s*N\s*I\s*N\s*G/i;

// The warning must be exact. Heading: capitals with a colon. Words: every required word present.
// Words are found in any order: on real labels the reader mixes the warning with text in the next column.
// shortcut: word order is not checked. A warning with its words shuffled would pass.
export function checkWarning(labelText) {
  const text = String(labelText ?? "");
  const heading = HEADING.exec(text);
  const headerOk = Boolean(heading) && heading[0] === heading[0].toUpperCase();
  const words = normalize(heading ? text.slice(heading.index + heading[0].length) : text).split(" ");
  const pool = heading ? words.slice(0, REQUIRED.length * 3) : words;
  // A word may be split by the reader ("gene ral"), so also try each word joined to the next.
  const used = new Set();
  const missing = REQUIRED.filter((w) => {
    const k = pool.findIndex((got, k) => !used.has(k) && (sameWord(w, got) || sameWord(w, got + (pool[k + 1] ?? ""))));
    if (k < 0) return true;
    used.add(k);
    return false;
  });
  const share = 1 - missing.length / REQUIRED.length;
  const list = `Words not found: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? " and more" : ""}.`;
  const say = (status, why) => ({ status, why, found: Boolean(heading) || share >= 0.3, missing });

  if (!heading) return share >= 0.3
    ? say(CHECK, "The warning heading could not be read. Look at the label.")
    : say(NO_MATCH, "No warning found.");
  if (!headerOk) return say(NO_MATCH, 'The heading must read "GOVERNMENT WARNING:" in capitals.');
  if (share < 0.75) return say(NO_MATCH, `The warning words differ from the required text. ${list}`);
  if (missing.length) return say(CHECK, `Some warning words could not be found. Look at the label. ${list}`);
  // 27 CFR 16.21 wants the colon. The reader drops colons too, so a missing colon means a person must look.
  if (!text.slice(heading.index + heading[0].length).trimStart().startsWith(":")) return say(CHECK, 'The heading needs a colon: "GOVERNMENT WARNING:". Look at the label.');
  return say(MATCH, "");
}

// Heading weight. ratio = heading stroke width / warning text stroke width (src/bold.js).
// 27 CFR 16.22(a)(2): the heading must be bold and the rest of the warning must not be.
// shortcut: thresholds set on our sample labels (bold 1.56-1.61, plain 0.96). Odd fonts may need a person.
const BOLD = 1.25;
const PLAIN = 1.1;
export function boldResult(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return { status: CHECK, note: "Could not measure the heading. Look to see it is bold." };
  if (ratio >= BOLD) return { status: MATCH, note: "" };
  // Never No match: small print on real labels can measure wrong, so a person makes the call.
  if (ratio < PLAIN) return { status: CHECK, note: "The heading must be bold and the rest of the warning must not be. They look the same. Look at the label." };
  return { status: CHECK, note: "The heading may not be bold. Look at the label." };
}

const worst = (rows) =>
  rows.some((r) => r.status === NO_MATCH) ? NO_MATCH : rows.some((r) => r.status === CHECK) ? CHECK : MATCH;

// Check one label. form = { brand, classType, abv, volume, producer, country }.
// bold = heading stroke ratio from the reader. Leave it out to skip the bold check (text-only tests).
// Returns { overall, rows: [{ name, status, note }] }.
export function checkLabel(form, labelText, bold) {
  const w = checkWarning(labelText);
  // shortcut: a real label has a long warning. Short text with none means a poor photo.
  if (normalize(labelText).length < 15 || (!w.found && normalize(labelText).length < 120)) {
    return { overall: CANT_READ, rows: [], note: "The reader could not read enough. Add a clearer photo." };
  }
  const rows = [];
  const text = (name, key) => {
    if (!String(form[key] ?? "").trim()) return;
    const { status } = findText(form[key], labelText);
    rows.push({ name, status, note: status === MATCH ? "" : status === CHECK ? "Something close is on the label. Look at it." : "Not found on the label." });
  };
  text("Brand name", "brand");
  text("Class / type", "classType");

  if (String(form.abv ?? "").trim()) {
    const want = firstNumber(form.abv);
    const have = allAbv(labelText);
    const ok = want != null && have.some((v) => Math.abs(v - want) <= 0.05);
    let status = want == null ? CHECK : ok ? MATCH : NO_MATCH;
    let note = want == null ? "Type the alcohol as a number, like 45." : ok ? "" : have.length ? `The label shows ${have.join(" and ")}%.` : "No alcohol % found on the label.";

    // Check proof if ABV matched and proof is present on label.
    if (ok) {
      const proofs = allProof(labelText);
      if (proofs.length) {
        const expected = want * 2;
        const bad = proofs.some((p) => Math.abs(p - expected) > 0.5);
        if (bad) {
          status = NO_MATCH;
          note = `The label says ${proofs.join(" and ")} proof. That should be ${expected} proof for ${want}%.`;
        }
      }
    }

    rows.push({ name: "Alcohol", status, note });
  }

  if (String(form.volume ?? "").trim()) {
    const want = oneMl(form.volume);
    const have = allMl(labelText);
    const ok = want != null && have.some((v) => Math.abs(v - want) <= 1);
    rows.push({
      name: "Net contents",
      status: want == null ? CHECK : ok ? MATCH : NO_MATCH,
      note: want == null ? "Type the size with a unit, like 750 mL." : ok ? "" : have.length ? `The label shows ${have.join(" and ")} mL.` : "No size found on the label.",
    });
  }

  text("Producer and address", "producer");
  text("Country of origin", "country");

  const b = bold === undefined || !w.found ? null : boldResult(bold);
  const warning = b ? worst([w, b]) : w.status;
  rows.push({ name: "Government warning", status: warning, note: [w.why, b?.note].filter(Boolean).join(" ") });

  const blank = ["brand", "classType", "abv", "volume", "producer", "country"].every((k) => !String(form[k] ?? "").trim());
  if (blank) {
    const overall = w.status === NO_MATCH ? NO_MATCH : CHECK;
    return { overall, rows, note: "No application details were given. Only the warning was checked." };
  }
  return { overall: worst(rows), rows };
}

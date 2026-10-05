import test from "node:test";
import assert from "node:assert/strict";
import { findText, allMl, allAbv, checkWarning, checkLabel, WARNING_BODY, MATCH, NO_MATCH, CHECK, CANT_READ } from "../src/match.js";

// Real reader slips seen in the browser test (see scripts/e2e.mjs).
test("reader drops spaces: OLDTOM still finds Old Tom", () => {
  assert.equal(findText("Old Tom Distillery", "OLDTOM\nDISTILLERY\nKentucky").status, MATCH);
});

test("reader adds spaces: To m still finds Tom", () => {
  assert.equal(findText("Old Tom Distillery", "Old To m Distillery").status, MATCH);
});

test("reader swaps O and 0 next to digits", () => {
  assert.deepEqual(allMl("75OmL"), [750]);
  assert.deepEqual(allAbv("4O% Alc./Vol."), [40]);
});

test("warning heading without the colon needs a look", () => {
  const w = checkWarning(`GOVERNMENT WARNING ${WARNING_BODY}`);
  assert.equal(w.status, CHECK);
  assert.equal(w.why, 'The heading needs a colon: "GOVERNMENT WARNING:". Look at the label.');
});

test("space before the colon is fine", () => {
  assert.equal(checkWarning(`GOVERNMENT WARNING : ${WARNING_BODY}`).status, MATCH);
});

test("title-case heading is a hard no match", () => {
  assert.equal(checkWarning(`Government Warning: ${WARNING_BODY}`).status, NO_MATCH);
});

test("short text with no warning means a poor photo", () => {
  assert.equal(checkLabel({ brand: "Old Tom" }, "OLD TOM DISTILLERY 45% e, ol.(o roi 750 mL").overall, CANT_READ);
});

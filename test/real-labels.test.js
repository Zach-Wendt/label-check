// Cases seen on real approved labels (TTB COLA public registry).
import test from "node:test";
import assert from "node:assert/strict";
import { findText, checkWarning, WARNING_HEADER, WARNING_BODY, MATCH, CHECK, NO_MATCH } from "../src/match.js";

test("brand words in another order still match", () => {
  assert.equal(findText("Famiglia Santoni", "SANTONI\nAMARO\nFAMIGLIA").status, MATCH);
});

test("whisky and whiskey are the same word", () => {
  assert.equal(findText("Straight Bourbon Whisky", "Kentucky Straight Bourbon Whiskey").status, MATCH);
});

test("warning mixed with text from the next column still matches", () => {
  const cut = WARNING_BODY.indexOf(" ", 90);
  const [a, b] = [WARNING_BODY.slice(0, cut), WARNING_BODY.slice(cut)];
  const mixed = `${WARNING_HEADER} THE PURSUIT SERIES STORY ${a} we searched for rare whiskey ${b} after years of searching`;
  assert.equal(checkWarning(mixed).status, MATCH);
});

test("reader joins words: 'accordingto' still counts", () => {
  assert.equal(checkWarning(`${WARNING_HEADER} ${WARNING_BODY.replace("According to", "Accordingto")}`).status, MATCH);
});

test("one missing word is named: 'not'", () => {
  const w = checkWarning(`${WARNING_HEADER} ${WARNING_BODY.replace("should not drink", "should drink")}`);
  assert.equal(w.status, CHECK);
  assert.match(w.why, /not/);
});

test("heading unreadable but the warning words are there: Check this", () => {
  assert.equal(checkWarning(`G ENMENTWANNG ${WARNING_BODY}`).status, CHECK);
});

test("a rewritten warning is still No match", () => {
  assert.equal(checkWarning(`${WARNING_HEADER} (1) Drinking during pregnancy may be unsafe. (2) Do not drive after drinking.`).status, NO_MATCH);
});

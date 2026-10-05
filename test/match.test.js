import test from "node:test";
import assert from "node:assert/strict";
import {
  findText, checkWarning, checkLabel,
  WARNING_HEADER, WARNING_BODY, MATCH, CHECK, NO_MATCH, CANT_READ,
} from "../src/match.js";
import { parseCsv, rowToForm } from "../src/csv.js";

const GOOD = `OLD TOM DISTILLERY\nKentucky Straight Bourbon Whiskey\n45% Alc./Vol. (90 Proof)\n750 mL\n${WARNING_HEADER} ${WARNING_BODY}\nBottled by Old Tom Distillery, Bardstown, KY`;
const FORM = { brand: "Old Tom Distillery", classType: "Kentucky Straight Bourbon Whiskey", abv: "45", volume: "750 mL", producer: "Old Tom Distillery, Bardstown, KY", country: "" };
const status = (r, name) => r.rows.find((x) => x.name === name)?.status;

test("case and punctuation differences still match", () => {
  assert.equal(findText("Stone's Throw", "STONE'S THROW").status, MATCH);
});

test("small slip asks for a check", () => {
  assert.equal(findText("Old Tom Distillery", "Old Tom Distilery").status, CHECK);
});

test("different brand is no match", () => {
  assert.equal(findText("Old Tom Distillery", "Blue Ridge Spirits").status, NO_MATCH);
});

test("findText finds the brand inside a block of label text", () => {
  assert.equal(findText("Old Tom Distillery", GOOD).status, MATCH);
  assert.equal(findText("Blue Ridge Spirits", GOOD).status, NO_MATCH);
});

test("good warning matches", () => {
  assert.equal(checkWarning(`${WARNING_HEADER} ${WARNING_BODY}`).status, MATCH);
});

test("title-case heading fails", () => {
  const r = checkWarning(`Government Warning: ${WARNING_BODY}`);
  assert.notEqual(r.status, MATCH);
  assert.match(r.why, /capitals/);
});

test("changed words fail", () => {
  assert.equal(checkWarning(`${WARNING_HEADER} Drinking may be bad for you.`).status, NO_MATCH);
});

test("missing warning fails", () => {
  assert.equal(checkWarning("OLD TOM DISTILLERY 45% 750 mL").status, NO_MATCH);
});

test("a good label matches on every row", () => {
  const r = checkLabel(FORM, GOOD);
  assert.equal(r.overall, MATCH);
  assert.equal(r.rows.length, 6); // brand, class, alcohol, size, producer, warning
});

test("proof matches 2x ABV gives Match", () => {
  const r = checkLabel(FORM, GOOD);
  assert.equal(status(r, "Alcohol"), MATCH);
});

test("proof contradicts 2x ABV gives No match with note", () => {
  const BAD_PROOF = `OLD TOM DISTILLERY\nKentucky Straight Bourbon Whiskey\n45% Alc./Vol. (80 Proof)\n750 mL\n${WARNING_HEADER} ${WARNING_BODY}\nBottled by Old Tom Distillery, Bardstown, KY`;
  const r = checkLabel(FORM, BAD_PROOF);
  assert.equal(status(r, "Alcohol"), NO_MATCH);
  const note = r.rows.find((x) => x.name === "Alcohol").note;
  assert.match(note, /80 proof/);
  assert.match(note, /90 proof/);
  assert.match(note, /45%/);
});

test("no proof on label gives Match when ABV matches", () => {
  const NO_PROOF = `OLD TOM DISTILLERY\nKentucky Straight Bourbon Whiskey\n45% Alc./Vol.\n750 mL\n${WARNING_HEADER} ${WARNING_BODY}\nBottled by Old Tom Distillery, Bardstown, KY`;
  const r = checkLabel(FORM, NO_PROOF);
  assert.equal(status(r, "Alcohol"), MATCH);
});

test("wrong alcohol is reported with what the label shows", () => {
  const r = checkLabel({ ...FORM, abv: "40" }, GOOD);
  assert.equal(r.overall, NO_MATCH);
  assert.equal(status(r, "Alcohol"), NO_MATCH);
  assert.match(r.rows.find((x) => x.name === "Alcohol").note, /45/);
});

test("size converts units", () => {
  assert.equal(status(checkLabel({ ...FORM, volume: "75 cl" }, GOOD), "Net contents"), MATCH);
  assert.equal(status(checkLabel({ ...FORM, volume: "1 L" }, GOOD), "Net contents"), NO_MATCH);
});

test("unreadable text gives Can't read", () => {
  assert.equal(checkLabel(FORM, "xx").overall, CANT_READ);
});

test("empty form with good warning gives Check this and note", () => {
  const r = checkLabel({}, GOOD);
  assert.equal(r.overall, CHECK);
  assert.equal(r.note, "No application details were given. Only the warning was checked.");
});

test("empty form with title-case warning gives No match", () => {
  const BAD_WARNING = `Government Warning: ${WARNING_BODY}`;
  const r = checkLabel({}, BAD_WARNING);
  assert.equal(r.overall, NO_MATCH);
});

test("good label with form still gives Match and no note", () => {
  const r = checkLabel(FORM, GOOD);
  assert.equal(r.overall, MATCH);
  assert.ok(!r.note);
});

test("CSV rows map to form fields", () => {
  const rows = parseCsv('File,Brand Name,Class/Type,ABV,Net Contents\r\na.png,"Stone\'s Throw, Inc",Gin,40,750 mL\r\n');
  const f = rowToForm(rows[0]);
  assert.equal(f.file, "a.png");
  assert.equal(f.brand, "Stone's Throw, Inc");
  assert.equal(f.volume, "750 mL");
});

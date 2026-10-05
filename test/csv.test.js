import test from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../src/csv.js";

test("plain cells are quoted", () => {
  const out = toCsv([["hello", "world"]]);
  assert.equal(out, '"hello","world"');
});

test("a quote inside a cell is doubled", () => {
  const out = toCsv([['say "hi"']]);
  assert.equal(out, '"say ""hi"""');
});

test("formula injection: =SUM(A1) gets leading quote", () => {
  const out = toCsv([["=SUM(A1)"]]);
  assert.equal(out, '"\'=SUM(A1)"');
});

test("formula injection: -5 gets leading quote", () => {
  const out = toCsv([["-5"]]);
  assert.equal(out, '"\'-5"');
});

test("formula injection: +value gets leading quote", () => {
  const out = toCsv([["+value"]]);
  assert.equal(out, '"\'+value"');
});

test("formula injection: @domain gets leading quote", () => {
  const out = toCsv([["@domain"]]);
  assert.equal(out, '"\'@domain"');
});

test("formula injection: tab start gets leading quote", () => {
  const out = toCsv([["\ttab"]]);
  assert.equal(out, '"\'\ttab"');
});

test("formula injection: carriage return start gets leading quote", () => {
  const out = toCsv([["\rcr"]]);
  assert.equal(out, '"\'\rcr"');
});

test("null becomes empty string", () => {
  const out = toCsv([[null]]);
  assert.equal(out, '""');
});

test("undefined becomes empty string", () => {
  const out = toCsv([[undefined]]);
  assert.equal(out, '""');
});

test("multiple rows joined by CRLF", () => {
  const out = toCsv([["a", "b"], ["c", "d"]]);
  assert.equal(out, '"a","b"\r\n"c","d"');
});
import test from "node:test";
import assert from "node:assert/strict";
import { strokeWidth } from "../src/bold.js";
import { boldResult, checkLabel, WARNING_HEADER, WARNING_BODY, MATCH, CHECK } from "../src/match.js";

// A white patch with black vertical bars `bar` pixels wide.
function bars(bar, w = 60, h = 20) {
  const g = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x % 10 < bar) g[y * w + x] = 0;
  return strokeWidth(g, w, h);
}

test("stroke width reads bar width", () => {
  assert.equal(bars(2), 2);
  assert.equal(bars(4), 4);
});

test("blank patch has no stroke width", () => {
  assert.equal(strokeWidth(new Uint8Array(400).fill(255), 20, 20), 0);
});

test("bold result: clear bold, unclear, plain, not measured", () => {
  assert.equal(boldResult(1.6).status, MATCH);
  assert.equal(boldResult(1.2).status, CHECK);
  assert.equal(boldResult(0.96).status, CHECK);
  assert.equal(boldResult(null).status, CHECK);
});

const TEXT = `OLD TOM DISTILLERY\n45% Alc./Vol.\n${WARNING_HEADER} ${WARNING_BODY}`;
const FORM = { brand: "Old Tom Distillery" };
const warning = (bold) => checkLabel(FORM, TEXT, bold).rows.find((r) => r.name === "Government warning");

test("plain heading needs a look (small print can measure wrong)", () => {
  assert.equal(warning(0.96).status, CHECK);
  assert.match(warning(0.96).note, /must be bold/);
});

test("bold heading keeps the warning a Match; no bold value skips the check", () => {
  assert.equal(warning(1.6).status, MATCH);
  assert.equal(warning(undefined).status, MATCH);
});

test("heading the reader could not measure needs a look", () => {
  assert.equal(warning(null).status, CHECK);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  getBackgroundCategoryIndex,
  hasConfidentMaskArea,
  hasSegmentedSubject,
} from "./subject-segmentation.js";

test("requires a meaningful person area before preferring the selfie mask", () => {
  const values = new Float32Array(100);
  values.fill(0.1);
  values[20] = 0.9;
  assert.equal(hasConfidentMaskArea(values, 0.52, 0.02), false);
  values[21] = 0.9;
  assert.equal(hasConfidentMaskArea(values, 0.52, 0.02), true);
});

test("finds an explicit background label and otherwise uses category zero", () => {
  assert.equal(getBackgroundCategoryIndex(["cat", "background", "person"]), 1);
  assert.equal(getBackgroundCategoryIndex(["", "person"]), 0);
});

test("accepts a non-person semantic object as the fallback subject", () => {
  const categories = new Uint8Array([0, 0, 8, 8, 0, 0]);
  assert.equal(hasSegmentedSubject(categories, 0, 0.3), true);
  assert.equal(hasSegmentedSubject(categories, 0, 0.5), false);
});

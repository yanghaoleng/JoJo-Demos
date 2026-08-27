import test from "node:test";
import assert from "node:assert/strict";
import {
  createOutlineOffsets,
  getRainbowOutlineHue,
  shouldOutlineGesture,
} from "./reaction-outline.js";

test("only the requested camera gestures trigger the rainbow outline", () => {
  assert.equal(shouldOutlineGesture("thumbs_up"), true);
  assert.equal(shouldOutlineGesture("victory"), true);
  assert.equal(shouldOutlineGesture("ok"), true);
  assert.equal(shouldOutlineGesture("finger_heart"), false);
  assert.equal(shouldOutlineGesture(null), false);
});

test("outline offsets form two complete rings like the reaction-video effect", () => {
  const offsets = createOutlineOffsets(6);
  assert.ok(offsets.length >= 28);
  const keys = new Set(offsets.map(({ x, y }) => `${x},${y}`));
  assert.equal(keys.size, offsets.length);
  for (const key of ["6,0", "-6,0", "0,6", "0,-6", "3,0", "-3,0", "0,3", "0,-3"]) {
    assert.equal(keys.has(key), true);
  }
});

test("rainbow hue advances over time and rotates 45 degrees per stop", () => {
  assert.equal(getRainbowOutlineHue(1_000, 0), 160);
  assert.equal(getRainbowOutlineHue(1_000, 1), 205);
  assert.equal(getRainbowOutlineHue(2_000, 0), 320);
});

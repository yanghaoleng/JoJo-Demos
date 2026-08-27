import assert from "node:assert/strict";
import test from "node:test";
import { getNextVisionThrottle, getThrottledInterval } from "./vision-performance.js";

test("backs off vision work after a slow inference", () => {
  assert.equal(getNextVisionThrottle(1, 70), 2.5);
  assert.equal(getThrottledInterval(160, 2.5), 400);
});

test("gradually restores recognition speed when work stays within budget", () => {
  assert.equal(getNextVisionThrottle(2, 20), 1.8);
  assert.equal(getNextVisionThrottle(1, 20), 1);
});

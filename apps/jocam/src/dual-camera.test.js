import assert from "node:assert/strict";
import test from "node:test";
import { getFrontCameraPipRect, hasLiveVideoTrack } from "./dual-camera.js";

test("places the front camera window inside the top-right portrait safe area", () => {
  const rect = getFrontCameraPipRect(720, 1280);
  assert.equal(rect.x + rect.width + rect.inset, 720);
  assert.ok(rect.y > rect.inset);
  assert.equal(rect.width, 166);
  assert.ok(rect.height > rect.width);
});

test("uses a smaller proportional window in landscape", () => {
  const rect = getFrontCameraPipRect(1280, 720);
  assert.equal(rect.x + rect.width + rect.inset, 1280);
  assert.equal(rect.y, rect.inset);
  assert.equal(rect.width, 205);
});

test("detects whether a simultaneous camera track is still usable", () => {
  const stream = (track) => ({ getVideoTracks: () => track ? [track] : [] });
  assert.equal(hasLiveVideoTrack(stream({ readyState: "live", enabled: true, muted: false })), true);
  assert.equal(hasLiveVideoTrack(stream({ readyState: "ended", enabled: true, muted: false })), false);
  assert.equal(hasLiveVideoTrack(stream({ readyState: "live", enabled: true, muted: true })), false);
  assert.equal(hasLiveVideoTrack(null), false);
});

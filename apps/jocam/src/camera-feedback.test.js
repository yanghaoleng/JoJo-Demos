import assert from "node:assert/strict";
import test from "node:test";
import {
  SHUTTER_DURATION_SECONDS,
  createShutterSamples,
} from "./camera-feedback.js";

test("creates a short two-click shutter waveform", () => {
  const sampleRate = 8_000;
  const samples = createShutterSamples(sampleRate, () => 0.75);
  assert.equal(samples.length, Math.round(sampleRate * SHUTTER_DURATION_SECONDS));
  assert.notEqual(samples[4], 0);
  assert.notEqual(samples[Math.round(sampleRate * 0.068)], 0);
});

test("shutter waveform decays toward silence", () => {
  const sampleRate = 8_000;
  const samples = createShutterSamples(sampleRate, () => 0.75);
  const early = Math.abs(samples[Math.round(sampleRate * 0.01)]);
  const tail = Math.abs(samples[samples.length - 1]);
  assert.ok(early > tail * 20);
});

test("rejects invalid sample rates", () => {
  assert.throws(() => createShutterSamples(0), /sampleRate/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  getFrontCameraLensKind,
  getMinimumCameraZoom,
  selectWidestFrontCamera,
  shouldMirrorCamera,
} from "./camera-selection.js";

test("only recognizes explicitly front-facing wide camera labels", () => {
  assert.equal(getFrontCameraLensKind("Front Ultra Wide Camera"), "ultra-wide");
  assert.equal(getFrontCameraLensKind("前置超广角摄像头"), "ultra-wide");
  assert.equal(getFrontCameraLensKind("FaceTime Wide Camera"), "wide");
  assert.equal(getFrontCameraLensKind("Back Ultra Wide Camera"), "default");
  assert.equal(getFrontCameraLensKind("Front Camera"), "default");
});

test("prefers an explicit front ultra-wide camera and never selects a rear camera", () => {
  const selected = selectWidestFrontCamera([
    { kind: "videoinput", deviceId: "rear-ultra", label: "Back Ultra Wide Camera" },
    { kind: "videoinput", deviceId: "front-wide", label: "Front Wide Camera" },
    { kind: "videoinput", deviceId: "front-ultra", label: "Front Ultra Wide Camera" },
  ]);

  assert.equal(selected?.device.deviceId, "front-ultra");
  assert.equal(selected?.lensKind, "ultra-wide");
});

test("keeps the current device when equally wide choices are available", () => {
  const selected = selectWidestFrontCamera([
    { kind: "videoinput", deviceId: "front-ultra-a", label: "Front Ultra Wide Camera A" },
    { kind: "videoinput", deviceId: "front-ultra-b", label: "Front Ultra Wide Camera B" },
  ], "front-ultra-b");

  assert.equal(selected?.device.deviceId, "front-ultra-b");
});

test("returns the minimum supported hardware zoom when available", () => {
  assert.equal(getMinimumCameraZoom({ zoom: { min: 0.5, max: 4 } }), 0.5);
  assert.equal(getMinimumCameraZoom({}), null);
});

test("mirrors only the front camera", () => {
  assert.equal(shouldMirrorCamera("user"), true);
  assert.equal(shouldMirrorCamera("environment"), false);
});

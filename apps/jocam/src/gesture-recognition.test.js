import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMERA_GESTURES,
  advanceGestureTracker,
  classifyCameraGesture,
  createGestureTracker,
} from "./gesture-recognition.js";

function makePinchLandmarks({ extendedFingers }) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6, z: 0 }));
  landmarks[0] = { x: 0.5, y: 0.9, z: 0 };
  landmarks[4] = { x: 0.49, y: 0.33, z: 0 };
  landmarks[8] = { x: 0.5, y: 0.34, z: 0 };
  landmarks[5] = { x: 0.36, y: 0.61, z: 0 };
  landmarks[17] = { x: 0.64, y: 0.61, z: 0 };
  [[9, 10, 12], [13, 14, 16], [17, 18, 20]].forEach(([mcp, pip, tip], index) => {
    const x = 0.46 + index * 0.08;
    landmarks[mcp] = { x, y: 0.6, z: 0 };
    landmarks[pip] = { x, y: 0.45, z: 0 };
    landmarks[tip] = extendedFingers > index
      ? { x, y: 0.2, z: 0 }
      : { x: x + 0.04, y: 0.57, z: 0 };
  });
  return landmarks;
}

test("uses MediaPipe canned confidence for thumbs up", () => {
  assert.equal(classifyCameraGesture({
    gestures: [[{ categoryName: "Thumb_Up", score: 0.91 }]],
    landmarks: [],
  }), CAMERA_GESTURES.THUMBS_UP);
});

test("distinguishes OK from a finger heart by the other three fingers", () => {
  assert.equal(classifyCameraGesture({
    gestures: [[{ categoryName: "None", score: 0.8 }]],
    landmarks: [makePinchLandmarks({ extendedFingers: 3 })],
  }), CAMERA_GESTURES.OK);
  assert.equal(classifyCameraGesture({
    gestures: [[{ categoryName: "None", score: 0.8 }]],
    landmarks: [makePinchLandmarks({ extendedFingers: 0 })],
  }), CAMERA_GESTURES.FINGER_HEART);
});

test("requires stable frames and a release before retriggering", () => {
  let state = createGestureTracker();
  let update = advanceGestureTracker(state, CAMERA_GESTURES.OK, 0);
  state = update.state;
  assert.equal(update.trigger, null);
  update = advanceGestureTracker(state, CAMERA_GESTURES.OK, 150);
  state = update.state;
  assert.equal(update.trigger, null);
  update = advanceGestureTracker(state, CAMERA_GESTURES.OK, 300);
  state = update.state;
  assert.equal(update.trigger, CAMERA_GESTURES.OK);
  update = advanceGestureTracker(state, CAMERA_GESTURES.OK, 6_000);
  state = update.state;
  assert.equal(update.trigger, null);
  state = advanceGestureTracker(state, null, 6_150).state;
  state = advanceGestureTracker(state, null, 6_300).state;
  state = advanceGestureTracker(state, CAMERA_GESTURES.OK, 6_450).state;
  state = advanceGestureTracker(state, CAMERA_GESTURES.OK, 6_600).state;
  update = advanceGestureTracker(state, CAMERA_GESTURES.OK, 6_750);
  assert.equal(update.trigger, CAMERA_GESTURES.OK);
});

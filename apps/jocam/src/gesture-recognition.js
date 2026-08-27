export const CAMERA_GESTURES = Object.freeze({
  THUMBS_UP: "thumbs_up",
  OK: "ok",
  FINGER_HEART: "finger_heart",
});

const DEFAULT_TRACKER = Object.freeze({
  candidate: null,
  stableFrames: 0,
  releaseFrames: 0,
  latched: null,
  cooldownUntil: 0,
});

function distance(first, second) {
  if (!first || !second) return Number.POSITIVE_INFINITY;
  return Math.hypot(first.x - second.x, first.y - second.y, (first.z || 0) - (second.z || 0));
}

function jointAngle(first, middle, last) {
  if (!first || !middle || !last) return 0;
  const firstVector = { x: first.x - middle.x, y: first.y - middle.y, z: (first.z || 0) - (middle.z || 0) };
  const lastVector = { x: last.x - middle.x, y: last.y - middle.y, z: (last.z || 0) - (middle.z || 0) };
  const firstLength = Math.hypot(firstVector.x, firstVector.y, firstVector.z);
  const lastLength = Math.hypot(lastVector.x, lastVector.y, lastVector.z);
  if (!firstLength || !lastLength) return 0;
  const cosine = (
    firstVector.x * lastVector.x
    + firstVector.y * lastVector.y
    + firstVector.z * lastVector.z
  ) / (firstLength * lastLength);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) * (180 / Math.PI);
}

function isFingerExtended(landmarks, mcpIndex, pipIndex, tipIndex) {
  return jointAngle(landmarks[mcpIndex], landmarks[pipIndex], landmarks[tipIndex]) >= 145;
}

export function classifyCameraGesture(result) {
  const cannedGesture = result?.gestures?.[0]?.[0];
  if (cannedGesture?.categoryName === "Thumb_Up" && cannedGesture.score >= 0.62) {
    return CAMERA_GESTURES.THUMBS_UP;
  }

  const landmarks = result?.landmarks?.[0];
  if (!landmarks?.[0] || !landmarks?.[4] || !landmarks?.[8]) return null;
  const palmWidth = distance(landmarks[5], landmarks[17]);
  if (!Number.isFinite(palmWidth) || palmWidth < 0.04) return null;
  const pinchRatio = distance(landmarks[4], landmarks[8]) / palmWidth;
  if (pinchRatio > 0.43) return null;

  const extendedFingers = [
    isFingerExtended(landmarks, 9, 10, 12),
    isFingerExtended(landmarks, 13, 14, 16),
    isFingerExtended(landmarks, 17, 18, 20),
  ].filter(Boolean).length;

  if (extendedFingers >= 2) return CAMERA_GESTURES.OK;
  if (extendedFingers === 0) return CAMERA_GESTURES.FINGER_HEART;
  return null;
}

export function advanceGestureTracker(
  previous = DEFAULT_TRACKER,
  candidate,
  now,
  { requiredStableFrames = 3, requiredReleaseFrames = 2, cooldownMs = 4_800 } = {},
) {
  const state = { ...DEFAULT_TRACKER, ...previous };
  if (!candidate) {
    const releaseFrames = state.releaseFrames + 1;
    return {
      state: {
        ...state,
        candidate: releaseFrames >= requiredReleaseFrames ? null : state.candidate,
        stableFrames: releaseFrames >= requiredReleaseFrames ? 0 : state.stableFrames,
        releaseFrames,
        latched: releaseFrames >= requiredReleaseFrames ? null : state.latched,
      },
      trigger: null,
    };
  }

  const sameCandidate = candidate === state.candidate;
  const next = {
    ...state,
    candidate,
    stableFrames: sameCandidate ? state.stableFrames + 1 : 1,
    releaseFrames: 0,
  };
  if (
    next.stableFrames < requiredStableFrames
    || next.latched === candidate
    || now < next.cooldownUntil
  ) return { state: next, trigger: null };

  return {
    state: {
      ...next,
      latched: candidate,
      cooldownUntil: now + cooldownMs,
    },
    trigger: candidate,
  };
}

export function createGestureTracker() {
  return { ...DEFAULT_TRACKER };
}

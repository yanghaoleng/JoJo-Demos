const MIN_THROTTLE = 1;
const MAX_THROTTLE = 3.2;
const TARGET_TASK_MS = 28;

export function getNextVisionThrottle(currentThrottle, durationMs) {
  const current = Number.isFinite(currentThrottle) ? currentThrottle : MIN_THROTTLE;
  const duration = Math.max(0, Number(durationMs) || 0);
  if (duration <= TARGET_TASK_MS) return Math.max(MIN_THROTTLE, current * 0.9);
  return Math.min(MAX_THROTTLE, Math.max(current, duration / TARGET_TASK_MS));
}

export function getThrottledInterval(baseIntervalMs, throttle) {
  return Math.round(baseIntervalMs * Math.max(MIN_THROTTLE, Number(throttle) || MIN_THROTTLE));
}

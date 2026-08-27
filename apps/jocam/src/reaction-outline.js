export const GESTURE_OUTLINE_DURATION_MS = 2_600;
export const GESTURE_OUTLINE_RADIUS_PX = 6;
export const GESTURE_OUTLINE_PADDING_PX = 24;

const OUTLINED_GESTURES = new Set(["thumbs_up", "victory", "ok"]);

export function shouldOutlineGesture(gesture) {
  return OUTLINED_GESTURES.has(gesture);
}

export function createOutlineOffsets(radius = GESTURE_OUTLINE_RADIUS_PX) {
  const offsets = [];
  const seen = new Set();
  [radius, Math.max(2, Math.round(radius / 2))].forEach((distance, ringIndex) => {
    const steps = ringIndex === 0 ? 24 : 12;
    for (let index = 0; index < steps; index += 1) {
      const angle = (index / steps) * Math.PI * 2;
      const x = Math.round(Math.cos(angle) * distance);
      const y = Math.round(Math.sin(angle) * distance);
      const key = `${x},${y}`;
      if (!seen.has(key)) {
        seen.add(key);
        offsets.push({ x, y });
      }
    }
  });
  return offsets;
}

export function getRainbowOutlineHue(timestamp, index = 0) {
  return ((timestamp * 0.16) + index * 45) % 360;
}

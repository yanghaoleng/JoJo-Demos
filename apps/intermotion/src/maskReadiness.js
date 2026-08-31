const MIN_PERSON_MASK_COVERAGE = 0.012;
const MAX_PERSON_MASK_COVERAGE = 0.92;
const MIN_PERSON_MASK_WIDTH = 0.08;
const MIN_PERSON_MASK_HEIGHT = 0.14;

export function isPersonMaskReady({
  foregroundPixelCount,
  totalPixelCount,
  minX,
  maxX,
  minY,
  maxY,
  width,
  height,
}) {
  const foregroundCoverage =
    foregroundPixelCount / Math.max(1, totalPixelCount);
  const maskWidth = maxX >= minX ? (maxX - minX + 1) / width : 0;
  const maskHeight = maxY >= minY ? (maxY - minY + 1) / height : 0;
  return (
    foregroundCoverage >= MIN_PERSON_MASK_COVERAGE &&
    foregroundCoverage <= MAX_PERSON_MASK_COVERAGE &&
    maskWidth >= MIN_PERSON_MASK_WIDTH &&
    maskHeight >= MIN_PERSON_MASK_HEIGHT
  );
}

export const DEFAULT_PERSON_MASK_THRESHOLD = 0.52;
export const DEFAULT_PERSON_MIN_RATIO = 0.012;
export const DEFAULT_SUBJECT_MIN_RATIO = 0.006;

export function hasConfidentMaskArea(
  values,
  threshold,
  minimumRatio,
) {
  if (!values?.length || !Number.isFinite(threshold) || !Number.isFinite(minimumRatio)) return false;
  const required = Math.max(1, Math.ceil(values.length * minimumRatio));
  let matches = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] < threshold) continue;
    matches += 1;
    if (matches >= required) return true;
  }
  return false;
}

export function getBackgroundCategoryIndex(labels = []) {
  const index = labels.findIndex((label) => /^(?:_?background_?|bg)$/i.test(String(label).trim()));
  return index >= 0 ? index : 0;
}

export function hasSegmentedSubject(values, backgroundIndex, minimumRatio = DEFAULT_SUBJECT_MIN_RATIO) {
  if (!values?.length) return false;
  const required = Math.max(1, Math.ceil(values.length * minimumRatio));
  let matches = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === backgroundIndex) continue;
    matches += 1;
    if (matches >= required) return true;
  }
  return false;
}

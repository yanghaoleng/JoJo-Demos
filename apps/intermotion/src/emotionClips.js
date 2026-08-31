const EMOTION_SCORE_THRESHOLD = 0.36;
const STRONG_EMOTION_SCORE = 0.58;
const EMOTION_SAMPLE_GAP_SECONDS = 0.72;
const CLIP_JOIN_GAP_SECONDS = 0.9;
const CLIP_PADDING_SECONDS = 2;

function average(...values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getEmotionalReaction(faceBlendshapes) {
  const categories = faceBlendshapes?.[0]?.categories || [];
  const scores = new Map(
    categories.map((category) => [category.categoryName, category.score]),
  );
  const get = (name) => scores.get(name) || 0;

  const smile = average(get("mouthSmileLeft"), get("mouthSmileRight"));
  const cheekSquint = average(
    get("cheekSquintLeft"),
    get("cheekSquintRight"),
  );
  const eyeWide = average(get("eyeWideLeft"), get("eyeWideRight"));
  const mouthFrown = average(get("mouthFrownLeft"), get("mouthFrownRight"));
  const browDown = average(get("browDownLeft"), get("browDownRight"));

  const candidates = [
    { label: "开心", score: smile * 0.72 + cheekSquint * 0.28 },
    {
      label: "惊讶",
      score:
        get("jawOpen") * 0.48 + eyeWide * 0.3 + get("browInnerUp") * 0.22,
    },
    { label: "投入", score: mouthFrown * 0.58 + browDown * 0.42 },
  ];
  return candidates.reduce((best, candidate) =>
    candidate.score > best.score ? candidate : best,
  );
}

export function updateEmotionCandidate(previous, reaction, time) {
  if (!reaction || reaction.score < EMOTION_SCORE_THRESHOLD) {
    return { candidate: null, sample: null };
  }

  const continuesPrevious =
    previous &&
    previous.label === reaction.label &&
    time - previous.time <= EMOTION_SAMPLE_GAP_SECONDS;
  const candidate = {
    count: continuesPrevious ? previous.count + 1 : 1,
    label: reaction.label,
    score: Math.max(reaction.score, continuesPrevious ? previous.score : 0),
    time,
  };
  const isConfirmed =
    reaction.score >= STRONG_EMOTION_SCORE || candidate.count >= 2;
  return {
    candidate,
    sample: isConfirmed
      ? { label: reaction.label, score: reaction.score, time }
      : null,
  };
}

export function buildEmotionRanges(samples, duration) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const ordered = samples
    .filter((sample) => Number.isFinite(sample.time))
    .map((sample) => ({ ...sample, time: clamp(sample.time, 0, safeDuration) }))
    .sort((left, right) => left.time - right.time);
  if (!ordered.length || safeDuration <= 0) return [];

  const grouped = [];
  for (const sample of ordered) {
    const latest = grouped[grouped.length - 1];
    if (!latest || sample.time - latest.end > CLIP_JOIN_GAP_SECONDS) {
      grouped.push({ start: sample.time, end: sample.time });
    } else {
      latest.end = sample.time;
    }
  }

  const expanded = grouped.map((range) => ({
    start: Math.max(0, range.start - CLIP_PADDING_SECONDS),
    end: Math.min(safeDuration, range.end + CLIP_PADDING_SECONDS),
  }));
  return expanded.reduce((merged, range) => {
    const latest = merged[merged.length - 1];
    if (!latest || range.start > latest.end) {
      merged.push(range);
    } else {
      latest.end = Math.max(latest.end, range.end);
    }
    return merged;
  }, []);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

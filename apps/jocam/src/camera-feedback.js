export const SHUTTER_DURATION_SECONDS = 0.18;

export function createShutterSamples(sampleRate, random = Math.random) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new TypeError("sampleRate must be a positive number");
  }

  const samples = new Float32Array(Math.max(1, Math.round(sampleRate * SHUTTER_DURATION_SECONDS)));
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const secondClickTime = time - 0.064;
    const firstEnvelope = Math.exp(-time * 72);
    const secondEnvelope = secondClickTime >= 0 ? Math.exp(-secondClickTime * 94) : 0;
    const noise = random() * 2 - 1;
    const metallicClick = Math.sin(2 * Math.PI * 1_720 * time) * 0.34;
    const sample = (noise + metallicClick) * ((firstEnvelope * 0.62) + (secondEnvelope * 0.48));
    samples[index] = Math.max(-1, Math.min(1, sample));
  }
  return samples;
}

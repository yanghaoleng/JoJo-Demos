export function getFrontCameraPipRect(targetWidth, targetHeight) {
  if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight) || targetWidth <= 0 || targetHeight <= 0) {
    throw new TypeError("target size must contain positive numbers");
  }

  const portrait = targetHeight >= targetWidth;
  const inset = Math.round(Math.min(targetWidth, targetHeight) * (portrait ? 0.04 : 0.035));
  const width = Math.round(targetWidth * (portrait ? 0.23 : 0.16));
  const height = Math.round(width * 4 / 3);
  const y = portrait ? Math.round(targetHeight * 0.185) : inset;
  return {
    x: targetWidth - width - inset,
    y,
    width,
    height,
    radius: Math.round(width * 0.13),
    inset,
  };
}

export function hasLiveVideoTrack(stream) {
  const track = stream?.getVideoTracks?.()[0];
  return Boolean(track && track.readyState !== "ended" && track.enabled !== false && track.muted !== true);
}

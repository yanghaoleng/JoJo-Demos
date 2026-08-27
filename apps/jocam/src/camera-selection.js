const FRONT_CAMERA_PATTERN = /(?:front|user|facetime|selfie|前置|自拍)/i;
const REAR_CAMERA_PATTERN = /(?:back|rear|environment|后置|背面)/i;
const ULTRA_WIDE_PATTERN = /(?:ultra[\s_-]*wide|超广角|0[.,]5\s*x?)/i;
const WIDE_PATTERN = /(?:wide|广角)/i;

export function getFrontCameraLensKind(label = "") {
  const normalizedLabel = String(label).trim();
  if (!normalizedLabel || REAR_CAMERA_PATTERN.test(normalizedLabel) || !FRONT_CAMERA_PATTERN.test(normalizedLabel)) {
    return "default";
  }
  if (ULTRA_WIDE_PATTERN.test(normalizedLabel)) return "ultra-wide";
  if (WIDE_PATTERN.test(normalizedLabel)) return "wide";
  return "default";
}

export function selectWidestFrontCamera(devices = [], currentDeviceId = "") {
  const candidates = devices
    .filter((device) => device?.kind === "videoinput" && device.deviceId)
    .map((device) => ({
      device,
      lensKind: getFrontCameraLensKind(device.label),
    }))
    .filter(({ lensKind }) => lensKind !== "default")
    .sort((left, right) => {
      const lensScore = { "ultra-wide": 2, wide: 1 };
      const scoreDifference = lensScore[right.lensKind] - lensScore[left.lensKind];
      if (scoreDifference !== 0) return scoreDifference;
      if (left.device.deviceId === currentDeviceId) return -1;
      if (right.device.deviceId === currentDeviceId) return 1;
      return 0;
    });

  return candidates[0] || null;
}

export function getMinimumCameraZoom(capabilities) {
  const minimumZoom = Number(capabilities?.zoom?.min);
  return Number.isFinite(minimumZoom) ? minimumZoom : null;
}

export function shouldMirrorCamera(facingMode) {
  return facingMode === "user";
}

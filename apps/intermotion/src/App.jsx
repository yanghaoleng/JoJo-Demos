import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  Camera,
  DownloadSimple,
  Stop,
} from "@phosphor-icons/react";
import {
  FaceDetector,
  FilesetResolver,
  ImageSegmenter,
} from "@mediapipe/tasks-vision";

const BASE_URL = import.meta.env.BASE_URL;
const FILM_URL = `${BASE_URL}media/reaction-screen-recording.mp4`;
const FILM_POSTER_URL = `${BASE_URL}media/reaction-screen-recording-poster.jpg`;
const MODEL_URL = `${BASE_URL}models/selfie_segmenter.tflite`;
const FACE_MODEL_URL = `${BASE_URL}models/blaze_face_short_range.tflite`;
const WASM_URL = `${BASE_URL}wasm`;
const OUTPUT_SIZE = { width: 1280, height: 720 };
const MASK_THRESHOLD = 0.55;
const MASK_FEATHER_PX = 3;
const SEGMENT_INTERVAL_MS = 90;
const FACE_INTERVAL_MS = 180;
const FACE_HOLD_MS = 900;
const OUTLINE_RADIUS_PX = 6;
const OUTLINE_PADDING_PX = 24;
const OUTLINE_STYLES = [
  { id: "white", label: "白色贴纸" },
  { id: "rainbow", label: "彩虹跑马灯" },
  { id: "orange", label: "橙色霓虹" },
];
const DEFAULT_PERSON_BOUNDS = {
  left: 0.18,
  right: 0.82,
  top: 0.05,
  bottom: 1,
};
const FRONT_CAMERA_PATTERN =
  /(front|user|facetime|true\s*depth|\u524d\u7f6e|\u81ea\u62cd)/i;
const REAR_CAMERA_PATTERN =
  /(back|rear|environment|telephoto|\u540e\u7f6e|\u957f\u7126)/i;
const WIDE_CAMERA_PATTERN =
  /(ultra[\s-]*wide|0[.,]5\s*[x×]?|wide[\s-]*angle|\u8d85\u5e7f\u89d2|\u5e7f\u89d2)/i;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function stabilizeValue(
  previous,
  next,
  { alpha = 0.16, deadZone = 0.005, maxStep = 0.024 } = {},
) {
  const delta = next - previous;
  if (Math.abs(delta) <= deadZone) return previous;
  return previous + clamp(delta * alpha, -maxStep, maxStep);
}

function stabilizePosition(previous, next, timestamp) {
  if (!previous) return { ...next, timestamp };
  const elapsed = clamp(timestamp - previous.timestamp, 8, 80);
  const alpha = 1 - Math.exp(-elapsed / 240);
  const maxStep = 6 * (elapsed / 16);
  const move = (current, target) => {
    const delta = target - current;
    if (Math.abs(delta) < 1.5) return current;
    return current + clamp(delta * alpha, -maxStep, maxStep);
  };
  return {
    x: move(previous.x, next.x),
    y: move(previous.y, next.y),
    timestamp,
  };
}

export function getRandomDefaultOutlineIndex() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint8Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] % 2 === 0 ? 1 : 2;
  }
  return Math.random() < 0.5 ? 1 : 2;
}

export function selectPreferredFrontCamera(devices, currentDeviceId = "") {
  const videoDevices = devices.filter(
    (device) => device.kind === "videoinput",
  );
  const frontDevices = videoDevices.filter((device) => {
    const label = device.label || "";
    if (REAR_CAMERA_PATTERN.test(label)) return false;
    return (
      FRONT_CAMERA_PATTERN.test(label) || device.deviceId === currentDeviceId
    );
  });
  if (!frontDevices.length) return null;
  return [...frontDevices].sort((left, right) => {
    const score = (device) => {
      const label = device.label || "";
      return (
        (WIDE_CAMERA_PATTERN.test(label) ? 100 : 0) +
        (FRONT_CAMERA_PATTERN.test(label) ? 20 : 0) +
        (device.deviceId === currentDeviceId ? 1 : 0)
      );
    };
    return score(right) - score(left);
  })[0];
}

async function applyWidestCameraSettings(track) {
  if (!track?.applyConstraints || !track.getCapabilities) return;
  let capabilities;
  try {
    capabilities = track.getCapabilities();
  } catch {
    return;
  }
  const enhancements = [];
  if (Number.isFinite(capabilities.zoom?.min)) {
    enhancements.push({ zoom: capabilities.zoom.min });
  }
  if (capabilities.focusMode?.includes("continuous")) {
    enhancements.push({ focusMode: "continuous" });
  }
  if (capabilities.exposureMode?.includes("continuous")) {
    enhancements.push({ exposureMode: "continuous" });
  }
  if (capabilities.whiteBalanceMode?.includes("continuous")) {
    enhancements.push({ whiteBalanceMode: "continuous" });
  }
  for (const enhancement of enhancements) {
    try {
      await track.applyConstraints({ advanced: [enhancement] });
    } catch {
      // iOS Safari exposes fewer camera controls than desktop browsers.
    }
  }
}

async function preferWidestFrontCamera(initialStream) {
  const initialTrack = initialStream.getVideoTracks()[0];
  if (!initialTrack) return initialStream;
  const currentDeviceId = initialTrack.getSettings?.().deviceId || "";
  let preferredDevice = null;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    preferredDevice = selectPreferredFrontCamera(devices, currentDeviceId);
  } catch {
    // Device enumeration is optional after the first permission grant.
  }

  let activeStream = initialStream;
  if (
    preferredDevice?.deviceId &&
    preferredDevice.deviceId !== currentDeviceId
  ) {
    let switchedOnCurrentTrack = false;
    try {
      await initialTrack.applyConstraints({
        deviceId: { exact: preferredDevice.deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      });
      switchedOnCurrentTrack =
        initialTrack.getSettings?.().deviceId === preferredDevice.deviceId;
    } catch {
      switchedOnCurrentTrack = false;
    }

    if (!switchedOnCurrentTrack) {
      try {
        const wideVideoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: preferredDevice.deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
        const wideTrack = wideVideoStream.getVideoTracks()[0];
        if (wideTrack) {
          activeStream = new MediaStream([
            wideTrack,
            ...initialStream.getAudioTracks(),
          ]);
          initialTrack.stop();
        } else {
          wideVideoStream.getTracks().forEach((track) => track.stop());
        }
      } catch {
        activeStream = initialStream;
      }
    }
  }

  await applyWidestCameraSettings(activeStream.getVideoTracks()[0]);
  return activeStream;
}

function getCoverRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.max(
    targetWidth / sourceWidth,
    targetHeight / sourceHeight,
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}

function chooseRecordingMimeType() {
  if (!window.MediaRecorder) return "";
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function getFileExtension(mimeType) {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

function createFilmVideoElement() {
  const film = document.createElement("video");
  film.src = FILM_URL;
  film.preload = "auto";
  film.playsInline = true;
  film.load();
  return film;
}

function drawFilmFrame(context, film) {
  const { width, height } = OUTPUT_SIZE;
  context.fillStyle = "#171b18";
  context.fillRect(0, 0, width, height);
  if (!film || film.readyState < 2) return;
  const rect = getCoverRect(
    film.videoWidth || width,
    film.videoHeight || height,
    width,
    height,
  );
  context.drawImage(film, rect.x, rect.y, rect.width, rect.height);
}

function createOutlineBuffers() {
  return {
    sprite: document.createElement("canvas"),
    mask: document.createElement("canvas"),
    paint: document.createElement("canvas"),
    cacheKey: "",
  };
}

function resizeCanvas(canvas, width, height) {
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
}

function getOutlineOffsets(radius) {
  const offsets = [];
  const seen = new Set();
  [radius, Math.max(2, Math.round(radius / 2))].forEach(
    (distance, ringIndex) => {
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
    },
  );
  return offsets;
}

const OUTLINE_OFFSETS = getOutlineOffsets(OUTLINE_RADIUS_PX);

export function prepareOutlineBuffers(
  buffers,
  source,
  sourceRect,
  targetWidth,
  targetHeight,
  sourceRevision,
) {
  const width = Math.max(1, Math.round(targetWidth));
  const height = Math.max(1, Math.round(targetHeight));
  const paddedWidth = width + OUTLINE_PADDING_PX * 2;
  const paddedHeight = height + OUTLINE_PADDING_PX * 2;
  const { sx, sy, sw, sh } = sourceRect;
  const cacheKey = [
    sourceRevision,
    width,
    height,
    Math.round(sx * 10),
    Math.round(sy * 10),
    Math.round(sw * 10),
    Math.round(sh * 10),
  ].join(":");
  if (buffers.cacheKey === cacheKey) return buffers;

  resizeCanvas(buffers.sprite, paddedWidth, paddedHeight);
  resizeCanvas(buffers.mask, paddedWidth, paddedHeight);
  resizeCanvas(buffers.paint, paddedWidth, paddedHeight);

  const spriteContext = buffers.sprite.getContext("2d");
  const maskContext = buffers.mask.getContext("2d");
  if (!spriteContext || !maskContext) return buffers;

  spriteContext.clearRect(0, 0, paddedWidth, paddedHeight);
  spriteContext.save();
  spriteContext.translate(OUTLINE_PADDING_PX + width, OUTLINE_PADDING_PX);
  spriteContext.scale(-1, 1);
  spriteContext.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
  spriteContext.restore();

  maskContext.clearRect(0, 0, paddedWidth, paddedHeight);
  maskContext.globalCompositeOperation = "source-over";
  for (const offset of OUTLINE_OFFSETS) {
    maskContext.drawImage(buffers.sprite, offset.x, offset.y);
  }
  maskContext.globalCompositeOperation = "destination-out";
  maskContext.drawImage(buffers.sprite, 0, 0);
  maskContext.globalCompositeOperation = "source-over";
  buffers.cacheKey = cacheKey;
  return buffers;
}

function paintOutline(buffers, styleId, timestamp) {
  const { paint, mask } = buffers;
  const context = paint.getContext("2d");
  if (!context) return paint;
  context.clearRect(0, 0, paint.width, paint.height);
  context.globalCompositeOperation = "source-over";
  context.drawImage(mask, 0, 0);
  context.globalCompositeOperation = "source-in";

  if (styleId === "rainbow") {
    const baseHue = (timestamp * 0.16) % 360;
    const gradient = context.createLinearGradient(
      0,
      paint.height,
      paint.width,
      0,
    );
    for (let index = 0; index <= 8; index += 1) {
      gradient.addColorStop(
        index / 8,
        `hsl(${(baseHue + index * 45) % 360}, 96%, 62%)`,
      );
    }
    context.fillStyle = gradient;
  } else if (styleId === "orange") {
    const gradient = context.createLinearGradient(0, paint.height, 0, 0);
    gradient.addColorStop(0, "#ff7628");
    gradient.addColorStop(0.55, "#ff9d31");
    gradient.addColorStop(1, "#ffd166");
    context.fillStyle = gradient;
  } else {
    context.fillStyle = "rgba(255, 255, 255, 0.98)";
  }
  context.fillRect(0, 0, paint.width, paint.height);
  context.globalCompositeOperation = "source-over";
  return paint;
}

function drawReactionOverlay(
  context,
  personCanvas,
  cameraVideo,
  personBounds,
  cameraEnabled,
  outlineStyleId,
  timestamp,
  outlineBuffers,
  personFrameRevision,
  faceBounds,
  overlayPlacement,
) {
  if (!cameraEnabled) return null;
  const source = personCanvas?.width ? personCanvas : cameraVideo;
  if (!source || (source === cameraVideo && cameraVideo.readyState < 2)) {
    return null;
  }

  const bounds = personCanvas?.width ? personBounds : DEFAULT_PERSON_BOUNDS;
  const sourceWidth = source.width || source.videoWidth;
  const sourceHeight = source.height || source.videoHeight;
  if (!sourceWidth || !sourceHeight) return null;

  const paddingX = 0.08;
  const paddingTop = 0.04;
  const cropLeft = clamp(bounds.left - paddingX, 0, 1);
  const cropRight = clamp(bounds.right + paddingX, 0, 1);
  const cropTop = clamp(bounds.top - paddingTop, 0, 1);
  const cropBottom = clamp(bounds.bottom + 0.02, 0, 1);
  const sx = cropLeft * sourceWidth;
  const sy = cropTop * sourceHeight;
  const sw = Math.max(1, (cropRight - cropLeft) * sourceWidth);
  const sh = Math.max(1, (cropBottom - cropTop) * sourceHeight);

  const targetHeight = OUTPUT_SIZE.height * 0.78;
  const targetWidth = Math.min(
    OUTPUT_SIZE.width * 0.44,
    targetHeight * (sw / sh),
  );
  const baseX = OUTPUT_SIZE.width - targetWidth - 18;
  const baseY = OUTPUT_SIZE.height - targetHeight;
  let desiredX = baseX;
  let desiredY = baseY;
  if (faceBounds && timestamp - faceBounds.lastSeen <= FACE_HOLD_MS) {
    const faceCenterX = (faceBounds.left + faceBounds.right) / 2;
    const faceCenterY = (faceBounds.top + faceBounds.bottom) / 2;
    const relativeFaceX = clamp(
      (faceCenterX - cropLeft) / Math.max(0.001, cropRight - cropLeft),
      0,
      1,
    );
    const relativeFaceY = clamp(
      (faceCenterY - cropTop) / Math.max(0.001, cropBottom - cropTop),
      0,
      1,
    );
    const mirroredFaceX = (1 - relativeFaceX) * targetWidth;
    const faceY = relativeFaceY * targetHeight;
    desiredX = clamp(
      OUTPUT_SIZE.width * 0.86 - mirroredFaceX,
      baseX - 54,
      baseX + 22,
    );
    desiredY = clamp(
      OUTPUT_SIZE.height * 0.3 - faceY,
      baseY - 72,
      baseY + 18,
    );
  }
  const placement = stabilizePosition(
    overlayPlacement.current,
    { x: desiredX, y: desiredY },
    timestamp,
  );
  overlayPlacement.current = placement;
  const { x, y } = placement;

  if (!personCanvas?.width) {
    context.save();
    context.translate(x + targetWidth, y);
    context.scale(-1, 1);
    context.shadowColor = "rgba(18, 20, 18, 0.28)";
    context.shadowBlur = 18;
    context.shadowOffsetY = 12;
    context.drawImage(
      source,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      targetWidth,
      targetHeight,
    );
    context.restore();
    return { x, y, width: targetWidth, height: targetHeight };
  }

  prepareOutlineBuffers(
    outlineBuffers,
    source,
    { sx, sy, sw, sh },
    targetWidth,
    targetHeight,
    personFrameRevision,
  );
  const outlinePaint = paintOutline(outlineBuffers, outlineStyleId, timestamp);
  const bufferX = x - OUTLINE_PADDING_PX;
  const bufferY = y - OUTLINE_PADDING_PX;

  context.save();
  context.shadowColor = "rgba(18, 20, 18, 0.3)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 12;
  context.drawImage(outlineBuffers.sprite, bufferX, bufferY);
  context.restore();

  if (outlineStyleId !== "white") {
    context.save();
    context.shadowColor =
      outlineStyleId === "rainbow"
        ? `hsl(${(timestamp * 0.16) % 360}, 98%, 66%)`
        : "rgba(255, 111, 31, 0.92)";
    context.shadowBlur = outlineStyleId === "rainbow" ? 12 : 17;
    context.drawImage(outlinePaint, bufferX, bufferY);
    context.restore();
  }
  context.drawImage(outlinePaint, bufferX, bufferY);
  context.drawImage(outlineBuffers.sprite, bufferX, bufferY);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: outlineBuffers.sprite.width - OUTLINE_PADDING_PX * 2,
    height: outlineBuffers.sprite.height - OUTLINE_PADDING_PX * 2,
  };
}

function drawComposition(
  context,
  film,
  personCanvas,
  cameraVideo,
  personBounds,
  cameraEnabled,
  outlineStyleId,
  timestamp,
  outlineBuffers,
  personFrameRevision,
  faceBounds,
  overlayPlacement,
) {
  drawFilmFrame(context, film);
  return drawReactionOverlay(
    context,
    personCanvas,
    cameraVideo,
    personBounds,
    cameraEnabled,
    outlineStyleId,
    timestamp,
    outlineBuffers,
    personFrameRevision,
    faceBounds,
    overlayPlacement,
  );
}

async function createSegmenter() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  };
  try {
    return await ImageSegmenter.createFromOptions(vision, options);
  } catch {
    return ImageSegmenter.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "CPU" },
    });
  }
}

async function createFaceDetector() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  return FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: FACE_MODEL_URL,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    minDetectionConfidence: 0.55,
    minSuppressionThreshold: 0.3,
  });
}

function getLargestFaceBounds(result, cameraVideo, previous, timestamp) {
  const cameraWidth = cameraVideo.videoWidth || 1;
  const cameraHeight = cameraVideo.videoHeight || 1;
  const detection = [...(result.detections || [])]
    .filter((item) => item.boundingBox)
    .sort(
      (left, right) =>
        right.boundingBox.width * right.boundingBox.height -
        left.boundingBox.width * left.boundingBox.height,
    )[0];
  if (!detection?.boundingBox) {
    return previous && timestamp - previous.lastSeen <= FACE_HOLD_MS
      ? previous
      : null;
  }
  const box = detection.boundingBox;
  const next = {
    left: clamp(box.originX / cameraWidth, 0, 1),
    right: clamp((box.originX + box.width) / cameraWidth, 0, 1),
    top: clamp(box.originY / cameraHeight, 0, 1),
    bottom: clamp((box.originY + box.height) / cameraHeight, 0, 1),
    lastSeen: timestamp,
  };
  if (!previous || timestamp - previous.lastSeen > FACE_HOLD_MS) return next;
  return {
    left: stabilizeValue(previous.left, next.left, {
      alpha: 0.2,
      deadZone: 0.006,
      maxStep: 0.035,
    }),
    right: stabilizeValue(previous.right, next.right, {
      alpha: 0.2,
      deadZone: 0.006,
      maxStep: 0.035,
    }),
    top: stabilizeValue(previous.top, next.top, {
      alpha: 0.2,
      deadZone: 0.006,
      maxStep: 0.035,
    }),
    bottom: stabilizeValue(previous.bottom, next.bottom, {
      alpha: 0.2,
      deadZone: 0.006,
      maxStep: 0.035,
    }),
    lastSeen: timestamp,
  };
}

function RecorderStage({
  phase,
  canvasRef,
  errorMessage,
  onStart,
  onStop,
  onStageDoubleClick,
  onStagePointerUp,
}) {
  const isRecording = phase === "recording";
  return (
    <main className={`capture-shell is-${phase}`}>
      <section className="capture-layout" aria-label="反应视频拍摄区">
        <div
          className="video-stage"
          onDoubleClick={onStageDoubleClick}
          onPointerUp={onStagePointerUp}
        >
          {phase === "idle" || phase === "error" ? (
            <img
              className="stage-poster"
              src={FILM_POSTER_URL}
              alt="叫叫互动片段画面"
            />
          ) : null}
          <canvas
            ref={canvasRef}
            width={OUTPUT_SIZE.width}
            height={OUTPUT_SIZE.height}
          />
        </div>

        <div className="action-dock" aria-label="拍摄操作">
          {(phase === "idle" || phase === "error") && (
            <button
              className="action-button action-primary"
              type="button"
              onClick={onStart}
              title={phase === "error" ? errorMessage : undefined}
            >
              <Camera size={23} weight="fill" aria-hidden="true" />
              <span>{phase === "error" ? "重试" : "开始"}</span>
            </button>
          )}
          {phase === "starting" && (
            <button className="action-button" type="button" disabled>
              <Camera size={23} weight="fill" aria-hidden="true" />
              <span>准备中</span>
            </button>
          )}
          {isRecording && (
            <button
              className="action-button action-stop"
              type="button"
              onClick={onStop}
            >
              <Stop size={22} weight="fill" aria-hidden="true" />
              <span>停止</span>
            </button>
          )}
          {phase === "processing" && (
            <button className="action-button" type="button" disabled>
              <Stop size={22} weight="fill" aria-hidden="true" />
              <span>生成中</span>
            </button>
          )}
        </div>
        {phase === "error" && (
          <span className="visually-hidden" role="alert">
            {errorMessage}
          </span>
        )}
      </section>
    </main>
  );
}

function ResultView({ videoUrl, mimeType, onAgain }) {
  const extension = getFileExtension(mimeType);
  return (
    <main className="capture-shell result-shell">
      <section className="capture-layout">
        <div className="video-stage result-stage">
          <video src={videoUrl} controls playsInline autoPlay />
        </div>
        <div className="action-dock result-actions" aria-label="成片操作">
          <a
            className="action-button action-primary"
            href={videoUrl}
            download={`童趣反应视频.${extension}`}
          >
            <DownloadSimple size={23} weight="bold" aria-hidden="true" />
            <span>保存</span>
          </a>
          <button
            className="action-button action-secondary"
            type="button"
            onClick={onAgain}
          >
            <ArrowCounterClockwise size={23} aria-hidden="true" />
            <span>重拍</span>
          </button>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const canvasRef = useRef(null);
  const filmVideoRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const userStreamRef = useRef(null);
  const outputStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const frameRequestRef = useRef(0);
  const mediaSessionRef = useRef(0);
  const segmenterRef = useRef(null);
  const segmentingRef = useRef(false);
  const lastSegmentTimeRef = useRef(0);
  const faceDetectorRef = useRef(null);
  const lastFaceTimeRef = useRef(0);
  const faceBoundsRef = useRef(null);
  const personCanvasRef = useRef(document.createElement("canvas"));
  const maskCanvasRef = useRef(document.createElement("canvas"));
  const outlineBuffersRef = useRef(createOutlineBuffers());
  const personFrameRevisionRef = useRef(0);
  const personBoundsRef = useRef({ ...DEFAULT_PERSON_BOUNDS });
  const overlayPlacementRef = useRef(null);
  const audioContextRef = useRef(null);
  const filmGainRef = useRef(null);
  const microphoneGainRef = useRef(null);
  const resultUrlRef = useRef("");
  const stoppingRef = useRef(false);
  const cameraEnabledRef = useRef(true);
  const reactionDisplayBoundsRef = useRef(null);
  const outlineStyleIndexRef = useRef(getRandomDefaultOutlineIndex());
  const lastTouchTapRef = useRef(null);
  const lastTouchCycleTimeRef = useRef(0);

  const [phase, setPhase] = useState("idle");
  const [videoUrl, setVideoUrl] = useState("");
  const [recordingMimeType, setRecordingMimeType] = useState("video/webm");
  const [errorMessage, setErrorMessage] = useState("");

  const releaseMedia = useCallback(() => {
    mediaSessionRef.current += 1;
    cancelAnimationFrame(frameRequestRef.current);
    frameRequestRef.current = 0;
    userStreamRef.current?.getTracks().forEach((track) => track.stop());
    outputStreamRef.current?.getTracks().forEach((track) => track.stop());
    userStreamRef.current = null;
    outputStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    segmenterRef.current?.close();
    segmenterRef.current = null;
    segmentingRef.current = false;
    faceDetectorRef.current?.close();
    faceDetectorRef.current = null;
    faceBoundsRef.current = null;
    overlayPlacementRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    filmGainRef.current = null;
    microphoneGainRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    filmVideoRef.current?.pause();
    cancelAnimationFrame(frameRequestRef.current);
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      setPhase("processing");
      recorder.stop();
    } else {
      releaseMedia();
      setPhase("error");
      setErrorMessage("这次没有成功生成视频，请重新拍摄。");
      stoppingRef.current = false;
    }
  }, [releaseMedia]);

  const updatePersonMask = useCallback((result, cameraVideo) => {
    const confidenceMask = result.confidenceMasks?.[0];
    if (!confidenceMask) return;
    const values = confidenceMask.getAsFloat32Array();
    const maskCanvas = maskCanvasRef.current;
    const personCanvas = personCanvasRef.current;
    const cameraWidth = cameraVideo.videoWidth || 640;
    const cameraHeight = cameraVideo.videoHeight || 480;
    maskCanvas.width = confidenceMask.width;
    maskCanvas.height = confidenceMask.height;
    personCanvas.width = cameraWidth;
    personCanvas.height = cameraHeight;

    const maskContext = maskCanvas.getContext("2d");
    const personContext = personCanvas.getContext("2d");
    if (!maskContext || !personContext) return;

    const imageData = maskContext.createImageData(
      confidenceMask.width,
      confidenceMask.height,
    );
    let minX = confidenceMask.width;
    let maxX = -1;
    let minY = confidenceMask.height;
    let maxY = -1;
    for (let index = 0; index < values.length; index += 1) {
      const alpha = values[index] >= MASK_THRESHOLD ? 255 : 0;
      const dataIndex = index * 4;
      imageData.data[dataIndex] = 255;
      imageData.data[dataIndex + 1] = 255;
      imageData.data[dataIndex + 2] = 255;
      imageData.data[dataIndex + 3] = alpha;
      if (alpha) {
        const x = index % confidenceMask.width;
        const y = Math.floor(index / confidenceMask.width);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    maskContext.putImageData(imageData, 0, 0);

    personContext.clearRect(0, 0, cameraWidth, cameraHeight);
    personContext.globalCompositeOperation = "source-over";
    personContext.filter = "none";
    personContext.drawImage(cameraVideo, 0, 0, cameraWidth, cameraHeight);
    personContext.globalCompositeOperation = "destination-in";
    personContext.filter = `blur(${MASK_FEATHER_PX / 2}px)`;
    personContext.drawImage(maskCanvas, 0, 0, cameraWidth, cameraHeight);
    personContext.filter = "none";
    personContext.globalCompositeOperation = "source-over";
    personFrameRevisionRef.current += 1;

    if (maxX >= minX && maxY >= minY) {
      const nextBounds = {
        left: minX / confidenceMask.width,
        right: (maxX + 1) / confidenceMask.width,
        top: minY / confidenceMask.height,
        bottom: (maxY + 1) / confidenceMask.height,
      };
      const previous = personBoundsRef.current;
      personBoundsRef.current = {
        left: stabilizeValue(previous.left, nextBounds.left),
        right: stabilizeValue(previous.right, nextBounds.right),
        top: stabilizeValue(previous.top, nextBounds.top),
        bottom: stabilizeValue(previous.bottom, nextBounds.bottom, {
          alpha: 0.16,
          deadZone: 0.005,
          maxStep: 0.03,
        }),
      };
    }
  }, []);

  const startDrawLoop = useCallback(() => {
    const draw = (timestamp) => {
      const canvas = canvasRef.current;
      const film = filmVideoRef.current;
      const camera = cameraVideoRef.current;
      if (!canvas || !film || !camera) return;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;

      const segmenter = segmenterRef.current;
      if (
        segmenter &&
        camera.readyState >= 2 &&
        !segmentingRef.current &&
        timestamp - lastSegmentTimeRef.current >= SEGMENT_INTERVAL_MS
      ) {
        segmentingRef.current = true;
        lastSegmentTimeRef.current = timestamp;
        try {
          segmenter.segmentForVideo(camera, timestamp, (result) => {
            try {
              updatePersonMask(result, camera);
            } finally {
              result.confidenceMasks?.forEach((mask) => mask.close());
              segmentingRef.current = false;
            }
          });
        } catch {
          segmentingRef.current = false;
        }
      }

      const faceDetector = faceDetectorRef.current;
      if (
        faceDetector &&
        camera.readyState >= 2 &&
        !segmentingRef.current &&
        timestamp - lastFaceTimeRef.current >= FACE_INTERVAL_MS
      ) {
        lastFaceTimeRef.current = timestamp;
        try {
          const result = faceDetector.detectForVideo(camera, timestamp);
          faceBoundsRef.current = getLargestFaceBounds(
            result,
            camera,
            faceBoundsRef.current,
            timestamp,
          );
        } catch {
          // Segmentation remains available if face detection is interrupted.
        }
      }

      reactionDisplayBoundsRef.current = drawComposition(
        context,
        film,
        personCanvasRef.current,
        camera,
        personBoundsRef.current,
        cameraEnabledRef.current,
        OUTLINE_STYLES[outlineStyleIndexRef.current].id,
        timestamp,
        outlineBuffersRef.current,
        personFrameRevisionRef.current,
        faceBoundsRef.current,
        overlayPlacementRef,
      );
      if (film.ended) {
        stopRecording();
        return;
      }
      frameRequestRef.current = requestAnimationFrame(draw);
    };
    frameRequestRef.current = requestAnimationFrame(draw);
  }, [stopRecording, updatePersonMask]);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setPhase("error");
      setErrorMessage(
        "当前浏览器不支持视频录制，请使用最新版 Safari、Chrome 或 Edge。",
      );
      return;
    }

    setPhase("starting");
    setErrorMessage("");
    stoppingRef.current = false;
    cameraEnabledRef.current = true;
    personCanvasRef.current.width = 0;
    personCanvasRef.current.height = 0;
    personFrameRevisionRef.current = 0;
    outlineBuffersRef.current.cacheKey = "";
    reactionDisplayBoundsRef.current = null;
    personBoundsRef.current = { ...DEFAULT_PERSON_BOUNDS };
    faceBoundsRef.current = null;
    overlayPlacementRef.current = null;
    lastSegmentTimeRef.current = 0;
    lastFaceTimeRef.current = 0;
    outlineStyleIndexRef.current = getRandomDefaultOutlineIndex();

    try {
      const mediaSession = mediaSessionRef.current;
      const film = filmVideoRef.current;
      const camera = cameraVideoRef.current;
      const canvas = canvasRef.current;
      if (!film || !camera || !canvas) throw new Error("拍摄画面没有准备好");

      const initialStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const userStream = await preferWidestFrontCamera(initialStream);
      userStreamRef.current = userStream;
      camera.srcObject = userStream;
      camera.muted = true;
      await camera.play();

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      await audioContext.resume();
      const destination = audioContext.createMediaStreamDestination();
      const filmSource = audioContext.createMediaElementSource(film);
      const filmGain = audioContext.createGain();
      const microphoneSource = audioContext.createMediaStreamSource(userStream);
      const microphoneGain = audioContext.createGain();
      filmGain.gain.value = 1;
      microphoneGain.gain.value = 1;
      filmSource.connect(filmGain);
      filmGain.connect(audioContext.destination);
      filmGain.connect(destination);
      microphoneSource.connect(microphoneGain);
      microphoneGain.connect(destination);
      filmGainRef.current = filmGain;
      microphoneGainRef.current = microphoneGain;

      createSegmenter()
        .then((segmenter) => {
          if (
            mediaSessionRef.current === mediaSession &&
            userStreamRef.current
          ) {
            segmenterRef.current = segmenter;
          } else {
            segmenter.close();
          }
        })
        .catch(() => {});
      createFaceDetector()
        .then((faceDetector) => {
          if (
            mediaSessionRef.current === mediaSession &&
            userStreamRef.current
          ) {
            faceDetectorRef.current = faceDetector;
          } else {
            faceDetector.close();
          }
        })
        .catch(() => {});

      film.currentTime = 0;
      film.volume = 1;
      film.muted = false;
      await film.play();
      const canvasStream = canvas.captureStream(30);
      const outputStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
      outputStreamRef.current = outputStream;
      const mimeType = chooseRecordingMimeType();
      const recorder = new MediaRecorder(outputStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 4_000_000,
        audioBitsPerSecond: 160_000,
      });
      const actualMimeType = recorder.mimeType || mimeType || "video/webm";
      setRecordingMimeType(actualMimeType);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setErrorMessage("录制过程中出现了问题，请重新拍摄。");
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: actualMimeType });
        if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
        const nextUrl = blob.size > 0 ? URL.createObjectURL(blob) : "";
        resultUrlRef.current = nextUrl;
        setVideoUrl(nextUrl);
        releaseMedia();
        setPhase(nextUrl ? "result" : "error");
        if (!nextUrl) setErrorMessage("没有读取到成片数据，请重新拍摄。");
        stoppingRef.current = false;
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      setPhase("recording");
      startDrawLoop();
    } catch (error) {
      releaseMedia();
      filmVideoRef.current = createFilmVideoElement();
      stoppingRef.current = false;
      setPhase("error");
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setErrorMessage("请允许浏览器使用摄像头和麦克风，然后再试一次。");
      } else {
        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : "拍摄启动失败，请再试一次。",
        );
      }
    }
  }, [releaseMedia, startDrawLoop]);

  const cycleOutlineAtPoint = useCallback(
    (clientX, clientY, stageElement) => {
      if (phase !== "recording") return false;
      const bounds = reactionDisplayBoundsRef.current;
      if (!bounds || !stageElement) return false;
      const stageRect = stageElement.getBoundingClientRect();
      const canvasX =
        ((clientX - stageRect.left) / stageRect.width) * OUTPUT_SIZE.width;
      const canvasY =
        ((clientY - stageRect.top) / stageRect.height) * OUTPUT_SIZE.height;
      const hitPadding = 16;
      const isInside =
        canvasX >= bounds.x - hitPadding &&
        canvasX <= bounds.x + bounds.width + hitPadding &&
        canvasY >= bounds.y - hitPadding &&
        canvasY <= bounds.y + bounds.height + hitPadding;
      if (!isInside) return false;

      const nextIndex =
        (outlineStyleIndexRef.current + 1) % OUTLINE_STYLES.length;
      outlineStyleIndexRef.current = nextIndex;
      return true;
    },
    [phase],
  );

  const handleStageDoubleClick = useCallback(
    (event) => {
      if (event.target instanceof Element && event.target.closest("button, a")) {
        return;
      }
      if (performance.now() - lastTouchCycleTimeRef.current < 700) return;
      cycleOutlineAtPoint(event.clientX, event.clientY, event.currentTarget);
    },
    [cycleOutlineAtPoint],
  );

  const handleStagePointerUp = useCallback(
    (event) => {
      if (event.pointerType === "mouse") return;
      if (event.target instanceof Element && event.target.closest("button, a")) {
        return;
      }
      const now = performance.now();
      const previousTap = lastTouchTapRef.current;
      lastTouchTapRef.current = {
        time: now,
        x: event.clientX,
        y: event.clientY,
      };
      if (
        !previousTap ||
        now - previousTap.time > 360 ||
        Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) >
          34
      ) {
        return;
      }
      if (
        cycleOutlineAtPoint(event.clientX, event.clientY, event.currentTarget)
      ) {
        lastTouchCycleTimeRef.current = now;
        lastTouchTapRef.current = null;
        event.preventDefault();
      }
    },
    [cycleOutlineAtPoint],
  );

  const recordAgain = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = "";
    }
    setVideoUrl("");
    filmVideoRef.current = createFilmVideoElement();
    setPhase("idle");
  }, []);

  useEffect(() => {
    const film = createFilmVideoElement();
    filmVideoRef.current = film;
    const camera = document.createElement("video");
    camera.playsInline = true;
    cameraVideoRef.current = camera;

    return () => {
      film.pause();
      film.removeAttribute("src");
      film.load();
      releaseMedia();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, [releaseMedia]);

  if (phase === "result" && videoUrl) {
    return (
      <ResultView
        videoUrl={videoUrl}
        mimeType={recordingMimeType}
        onAgain={recordAgain}
      />
    );
  }

  return (
    <RecorderStage
      phase={phase}
      canvasRef={canvasRef}
      errorMessage={errorMessage}
      onStart={startRecording}
      onStop={stopRecording}
      onStageDoubleClick={handleStageDoubleClick}
      onStagePointerUp={handleStagePointerUp}
    />
  );
}

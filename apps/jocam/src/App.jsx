import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowClockwise,
  ArrowsLeftRight,
  Camera,
  CaretDown,
  Check,
  DownloadSimple,
  ImagesSquare,
  LockSimple,
  PictureInPicture,
  PlayCircle,
  X,
} from "@phosphor-icons/react";
import {
  Rive as CanvasRive,
  Layout as CanvasLayout,
  Fit as CanvasFit,
  Alignment as CanvasAlignment,
  RuntimeLoader as CanvasRuntimeLoader,
  EventType as CanvasEventType,
} from "@rive-app/canvas";
import {
  Rive as WebGLRive,
  Layout as WebGLLayout,
  Fit as WebGLFit,
  Alignment as WebGLAlignment,
  RuntimeLoader as WebGLRuntimeLoader,
  EventType as WebGLEventType,
} from "@rive-app/webgl2";
import { FaceLandmarker, FilesetResolver, GestureRecognizer, ImageSegmenter } from "@mediapipe/tasks-vision";
import { Calligraph } from "calligraph";
import QRCode from "qrcode";
import {
  CAMERA_GESTURES,
  advanceGestureTracker,
  classifyCameraGesture,
  createGestureTracker,
} from "./gesture-recognition.js";
import {
  getFrontCameraLensKind,
  getMinimumCameraZoom,
  selectWidestFrontCamera,
  shouldMirrorCamera,
} from "./camera-selection.js";
import {
  GESTURE_OUTLINE_DURATION_MS,
  GESTURE_OUTLINE_PADDING_PX,
  GESTURE_OUTLINE_RADIUS_PX,
  createOutlineOffsets,
  getRainbowOutlineHue,
  shouldOutlineGesture,
} from "./reaction-outline.js";
import {
  MEDIA_LIBRARY_LIMIT,
  loadMediaCaptures,
  storeMediaCapture,
} from "./media-library.js";
import { createShutterSamples } from "./camera-feedback.js";
import { getFrontCameraPipRect, hasLiveVideoTrack } from "./dual-camera.js";
import {
  DEFAULT_PERSON_MASK_THRESHOLD,
  DEFAULT_PERSON_MIN_RATIO,
  getBackgroundCategoryIndex,
  hasConfidentMaskArea,
  hasSegmentedSubject,
} from "./subject-segmentation.js";
import { getNextVisionThrottle, getThrottledInterval } from "./vision-performance.js";

const BASE_URL = import.meta.env.BASE_URL;

async function preferWidestFrontCamera(mediaDevices, stream, videoConstraints) {
  let activeTrack = stream.getVideoTracks()[0];
  let lensMode = getFrontCameraLensKind(activeTrack?.label);

  try {
    const currentDeviceId = activeTrack?.getSettings?.().deviceId || "";
    const devices = await mediaDevices.enumerateDevices();
    const preferredCamera = selectWidestFrontCamera(devices, currentDeviceId);

    if (preferredCamera && preferredCamera.device.deviceId !== currentDeviceId) {
      try {
        const preferredStream = await mediaDevices.getUserMedia({
          audio: false,
          video: {
            deviceId: { exact: preferredCamera.device.deviceId },
            width: videoConstraints.width,
            height: videoConstraints.height,
          },
        });
        const preferredTrack = preferredStream.getVideoTracks()[0];
        if (!preferredTrack) throw new Error("The selected front camera returned no video track");
        activeTrack?.stop();
        if (activeTrack) stream.removeTrack(activeTrack);
        activeTrack = preferredTrack;
        stream.addTrack(preferredTrack);
        lensMode = preferredCamera.lensKind;
      } catch (preferredCameraError) {
        console.warn("Preferred front wide camera unavailable; using the system default front camera", preferredCameraError);
      }
    }
  } catch (cameraDiscoveryError) {
    console.warn("Front camera lens details are unavailable; using the system-selected camera", cameraDiscoveryError);
  }

  try {
    const minimumZoom = getMinimumCameraZoom(activeTrack?.getCapabilities?.());
    if (minimumZoom !== null && activeTrack?.applyConstraints) {
      await activeTrack.applyConstraints({ advanced: [{ zoom: minimumZoom }] });
      if (lensMode === "default") lensMode = "minimum-zoom";
    }
  } catch (zoomError) {
    console.warn("The active camera did not accept its minimum zoom constraint", zoomError);
  }

  return { stream, lensMode };
}

const GESTURE_OUTLINE_OFFSETS = createOutlineOffsets(GESTURE_OUTLINE_RADIUS_PX);

function createGestureOutlineBuffers() {
  return {
    silhouette: document.createElement("canvas"),
    mask: document.createElement("canvas"),
    paint: document.createElement("canvas"),
    cacheKey: "",
  };
}

function resizeRenderCanvas(canvas, width, height) {
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
}

function prepareGestureOutlineMask(buffers, sourceMask, rect, targetWidth, targetHeight, revision, mirrored) {
  const paddedWidth = targetWidth + GESTURE_OUTLINE_PADDING_PX * 2;
  const paddedHeight = targetHeight + GESTURE_OUTLINE_PADDING_PX * 2;
  const cacheKey = [
    revision,
    targetWidth,
    targetHeight,
    Math.round(rect.x),
    Math.round(rect.y),
    Math.round(rect.width),
    Math.round(rect.height),
    mirrored ? "mirrored" : "direct",
  ].join(":");
  if (buffers.cacheKey === cacheKey) return;

  resizeRenderCanvas(buffers.silhouette, paddedWidth, paddedHeight);
  resizeRenderCanvas(buffers.mask, paddedWidth, paddedHeight);
  resizeRenderCanvas(buffers.paint, paddedWidth, paddedHeight);
  const silhouetteContext = buffers.silhouette.getContext("2d");
  const maskContext = buffers.mask.getContext("2d");
  if (!silhouetteContext || !maskContext) return;

  silhouetteContext.clearRect(0, 0, paddedWidth, paddedHeight);
  silhouetteContext.save();
  if (mirrored) {
    silhouetteContext.translate(
      GESTURE_OUTLINE_PADDING_PX + targetWidth,
      GESTURE_OUTLINE_PADDING_PX,
    );
    silhouetteContext.scale(-1, 1);
  } else {
    silhouetteContext.translate(GESTURE_OUTLINE_PADDING_PX, GESTURE_OUTLINE_PADDING_PX);
  }
  silhouetteContext.imageSmoothingEnabled = true;
  silhouetteContext.imageSmoothingQuality = "high";
  silhouetteContext.drawImage(sourceMask, rect.x, rect.y, rect.width, rect.height);
  silhouetteContext.restore();

  maskContext.clearRect(0, 0, paddedWidth, paddedHeight);
  maskContext.globalCompositeOperation = "source-over";
  for (const offset of GESTURE_OUTLINE_OFFSETS) {
    maskContext.drawImage(buffers.silhouette, offset.x, offset.y);
  }
  maskContext.globalCompositeOperation = "destination-out";
  maskContext.drawImage(buffers.silhouette, 0, 0);
  maskContext.globalCompositeOperation = "source-over";
  buffers.cacheKey = cacheKey;
}

function paintGestureOutline(buffers, timestamp) {
  const context = buffers.paint.getContext("2d");
  if (!context) return buffers.paint;
  context.clearRect(0, 0, buffers.paint.width, buffers.paint.height);
  context.globalCompositeOperation = "source-over";
  context.drawImage(buffers.mask, 0, 0);
  context.globalCompositeOperation = "source-in";
  const gradient = context.createLinearGradient(
    0,
    buffers.paint.height,
    buffers.paint.width,
    0,
  );
  for (let index = 0; index <= 8; index += 1) {
    gradient.addColorStop(
      index / 8,
      `hsl(${getRainbowOutlineHue(timestamp, index)}, 96%, 62%)`,
    );
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, buffers.paint.width, buffers.paint.height);
  context.globalCompositeOperation = "source-over";
  return buffers.paint;
}

function drawGestureOutline(
  context,
  buffers,
  sourceMask,
  rect,
  targetWidth,
  targetHeight,
  revision,
  timestamp,
  mirrored,
) {
  prepareGestureOutlineMask(
    buffers,
    sourceMask,
    rect,
    targetWidth,
    targetHeight,
    revision,
    mirrored,
  );
  const paint = paintGestureOutline(buffers, timestamp);
  const position = -GESTURE_OUTLINE_PADDING_PX;

  context.save();
  context.shadowColor = `hsl(${getRainbowOutlineHue(timestamp)}, 98%, 66%)`;
  context.shadowBlur = 12;
  context.drawImage(paint, position, position);
  context.restore();
  context.drawImage(paint, position, position);
}

const GUIDE_AUDIO = {
  enter: {
    path: `${BASE_URL}audio/guides/enter.mp3`,
    text: "我来啦！看镜头，我们一起拍张照片吧！",
    duration: 3.684,
  },
  smile: {
    path: `${BASE_URL}audio/guides/smile.mp3`,
    text: "看镜头，我们一起笑一个！",
    duration: 1.594,
  },
  think: {
    path: `${BASE_URL}audio/guides/think.mp3`,
    text: "想一个最好玩的表情吧！",
    duration: 2.064,
  },
  surprise: {
    path: `${BASE_URL}audio/guides/surprise.mp3`,
    text: "哇！张大嘴巴，惊讶一下！",
    duration: 2.325,
  },
  encourage: {
    path: `${BASE_URL}audio/guides/encourage.mp3`,
    text: "别紧张，靠近我一点点！",
    duration: 2.273,
  },
  praise: {
    path: `${BASE_URL}audio/guides/praise.mp3`,
    text: "你笑得真好看，再来一张！",
    duration: 2.195,
  },
  frighten: {
    path: `${BASE_URL}audio/guides/frighten.mp3`,
    text: "哇！和我一起吓一跳！",
    duration: 2.482,
  },
  curious: {
    path: `${BASE_URL}audio/guides/curious.mp3`,
    text: "你想摆什么姿势呀？",
    duration: 1.777,
  },
  commandPraise: {
    path: `${BASE_URL}audio/commands/praise.mp3`,
    text: "嘿嘿，这个赞送给你！",
  },
  commandSurprised: {
    path: `${BASE_URL}audio/commands/surprised.mp3`,
    text: "哇！你把我吓了一跳！",
  },
  commandThink: {
    path: `${BASE_URL}audio/commands/think.mp3`,
    text: "好呀，让我认真想一想！",
  },
  commandHappy: {
    path: `${BASE_URL}audio/commands/happy.mp3`,
    text: "好开心呀！我们再拍一张！",
  },
  commandFrighten: {
    path: `${BASE_URL}audio/commands/frighten.mp3`,
    text: "哇呀！我有一点点害怕！",
  },
  commandCurious: {
    path: `${BASE_URL}audio/commands/curious.mp3`,
    text: "嗯？让我看看发生了什么！",
  },
  gestureOk: {
    path: `${BASE_URL}audio/gestures/ok.mp3`,
    text: "我看到你比 OK 啦！",
    duration: 1.933,
  },
  gestureHeart: {
    path: `${BASE_URL}audio/gestures/heart.mp3`,
    text: "我看到你比心啦！",
    duration: 1.646,
  },
};
const VOICE_ACTIONS = {
  praise: { animation: "TalkingEmotion_Praise", audio: "commandPraise", toast: "叫叫送你一个赞" },
  surprised: { animation: "TalkingEmotion_Surprised", audio: "commandSurprised", toast: "叫叫做了个惊讶表情" },
  think: { animation: "TalkingEmotion_Think", audio: "commandThink", toast: "叫叫正在认真思考" },
  happy: { animation: "TalkingEmotion_Happy", audio: "commandHappy", toast: "叫叫开心地笑了" },
  frighten: { animation: "TalkingEmotion_Frighten", audio: "commandFrighten", toast: "叫叫吓了一跳" },
  curious: { animation: "TalkingEmotion_Curious", audio: "commandCurious", toast: "叫叫好奇地看过来" },
};
const GESTURE_ACTIONS = {
  [CAMERA_GESTURES.THUMBS_UP]: {
    animation: "TalkingEmotion_Praise",
    toast: "也给你点个赞",
  },
  [CAMERA_GESTURES.VICTORY]: {
    animation: "TalkingEmotion_Happy",
    toast: "和你一起比个耶",
  },
  [CAMERA_GESTURES.OK]: {
    animation: "TalkingEmotion_Sure",
    audio: "gestureOk",
    toast: "收到你的 OK",
  },
  [CAMERA_GESTURES.FINGER_HEART]: {
    animation: "TalkingEmotion_Happy",
    audio: "gestureHeart",
    toast: "接住你的比心",
  },
};
const GUIDE_SPEAK_PROBABILITY = 0.34;
const GUIDE_MIN_INTERVAL_MS = 7_000;
const GUIDE_PLAY_DELAY_MS = 180;
const GUIDE_END_PADDING_SECONDS = 0.45;
const FRAME_SIZES = {
  portrait: { width: 720, height: 1280 },
  landscape: { width: 1280, height: 720 },
};
const RIVE_SOURCE_SIZE = { width: 1200, height: 640 };
const RIVE_VISIBLE_SOURCE = { y: 96, width: 950, height: 544 };
const RIVE_DEFAULT_CROP_X = 72;
const RIVE_EDGE_PADDING = 4;
const RIVE_ANALYSIS_SIZE = { width: 600, height: 320 };
const RIVE_SCALE = 0.512;
const RIVE_DISPLAY_MULTIPLIER = 1.25;
const RIVE_LANDSCAPE_MULTIPLIER = 1.35;
const RIVE_LEFT_OVERFLOW_RATIO = 0.045;
const CAPTION_VERTICAL_OFFSET_RATIO = 0.02;
const DEFAULT_RIVE_ANIMATION = "Start_Dial";
const SECOND_RIVE_ANIMATION = "TalkingEmotion_Think";
const CLICK_RIVE_ANIMATION = "TalkingEmotion_Praise";
const RIVE_POSITION_ANIMATION = "Ipad";
const RIVE_MOUTH_ANIMATION = "Talking_Normal";
const COVER_RIVE_PLAYBACK_RATE = 0.25;
const CAMERA_RIVE_PLAYBACK_RATE = 0.8;
const RIVE_CAPTURE_ADVANCE_FRAMES = 4;
const MAX_RANDOM_DAY = 520;
const VOLUME_SHUTTER_KEYS = new Set([
  "AudioVolumeUp",
  "AudioVolumeDown",
  "VolumeUp",
  "VolumeDown",
]);
const VOLUME_SHUTTER_KEY_CODES = new Set([174, 175]);
const CAPTION_MODES = {
  together: { prefix: "我和叫叫一起阅读的", dayPrefix: "第", suffix: "天" },
  streak: { prefix: "坚持连续学习叫叫阅读", dayPrefix: "第", suffix: "天" },
};
const RENDER_INTERVAL_MS = 33;
const SEGMENT_INTERVAL_MS = 150;
const SUBJECT_SEGMENT_INTERVAL_MS = 1_700;
const SUBJECT_FALLBACK_DELAY_MS = 1_000;
const FACE_INTERVAL_MS = 160;
const GESTURE_INTERVAL_MS = 240;
const FACE_MISSING_TIMEOUT_MS = 850;
const PERSON_MASK_THRESHOLD = DEFAULT_PERSON_MASK_THRESHOLD;
const PERSON_MIN_MASK_RATIO = DEFAULT_PERSON_MIN_RATIO;
const PERSON_MISSING_FRAME_LIMIT = 3;
const PERSON_FEATHER_RANGE_PX = 5;
const LONG_PRESS_MS = 430;
const MAX_RECORDING_MS = 15_000;
const CORE_LOAD_ASSETS = [
  { key: "riveFile", path: "media/jiaojiao.riv", bytes: 10_399_115, retain: true },
  { key: "visionWasm", path: "mediapipe/wasm/vision_wasm_internal.wasm", bytes: 11_756_954, retain: false },
  { key: "visionLoader", path: "mediapipe/wasm/vision_wasm_internal.js", bytes: 323_377, retain: false },
  { key: "segmentModel", path: "mediapipe/selfie_segmenter.tflite", bytes: 249_537, retain: true },
  { key: "subjectModel", path: "mediapipe/deeplab_v3.tflite", bytes: 2_780_176, retain: true },
  { key: "faceModel", path: "mediapipe/face_landmarker.task", bytes: 3_758_596, retain: true },
  { key: "gestureModel", path: "mediapipe/gesture_recognizer.task", bytes: 8_373_440, retain: true },
  { key: "guideEnter", path: "audio/guides/enter.mp3", bytes: 58_931, retain: false },
];
const RIVE_RUNTIME_ASSETS = {
  canvas: [
    { key: "riveWasm", path: "rive/canvas.wasm", bytes: 1_808_114, retain: false },
    { key: "riveFallback", path: "rive/canvas_fallback.wasm", bytes: 1_818_434, retain: false },
  ],
  webgl2: [
    { key: "riveWasm", path: "rive/rive.wasm", bytes: 2_004_858, retain: false },
    { key: "riveFallback", path: "rive/rive_fallback.wasm", bytes: 2_015_300, retain: false },
  ],
};
const RIVE_RUNTIMES = {
  canvas: {
    Rive: CanvasRive,
    Layout: CanvasLayout,
    Fit: CanvasFit,
    Alignment: CanvasAlignment,
    RuntimeLoader: CanvasRuntimeLoader,
    EventType: CanvasEventType,
  },
  webgl2: {
    Rive: WebGLRive,
    Layout: WebGLLayout,
    Fit: WebGLFit,
    Alignment: WebGLAlignment,
    RuntimeLoader: WebGLRuntimeLoader,
    EventType: WebGLEventType,
  },
};

function getLoadAssets(rendererMode) {
  const runtimeKey = rendererMode === "canvas" ? "canvas" : "webgl2";
  return [CORE_LOAD_ASSETS[0], ...RIVE_RUNTIME_ASSETS[runtimeKey], ...CORE_LOAD_ASSETS.slice(1)];
}
const CHARACTERS = {
  jiaojiao: { label: "叫叫", path: "media/jiaojiao.riv" },
  lvdou: { label: "绿豆", path: "media/lvdou.riv" },
};
const CHARACTER_TAP_WINDOW_MS = 720;
const CHARACTER_EXIT_DURATION_MS = 300;
const CHARACTER_ENTER_DURATION_MS = 430;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function getRandomValue(max, excludedValue) {
  if (!Number.isFinite(excludedValue)) return Math.floor(Math.random() * max) + 1;
  const value = Math.floor(Math.random() * (max - 1)) + 1;
  return value >= excludedValue ? value + 1 : value;
}

function getCaptionText(mode, value) {
  const caption = CAPTION_MODES[mode] || CAPTION_MODES.together;
  return `${caption.prefix}${caption.dayPrefix} ${value} ${caption.suffix}`;
}

function getGuideKeyForAnimation(animationName) {
  if (!animationName?.startsWith("TalkingEmotion")) return null;
  if (/Frighten/i.test(animationName)) return "frighten";
  if (/Surprised|Amazed|Superexcited|Excited/i.test(animationName)) return "surprise";
  if (/Think|Focused|Serious|Doubt|Entangled/i.test(animationName)) return "think";
  if (/Nervous|Sad|Regret|Grievance|Concerned|Shake/i.test(animationName)) return "encourage";
  if (/Praise|Proud|Encourage|Sure/i.test(animationName)) return "praise";
  if (/Curious|Beckoning|Expectation|Envy/i.test(animationName)) return "curious";
  if (/Smile|Happy/i.test(animationName)) return "smile";
  return null;
}

function getViewportOrientation() {
  if (typeof window === "undefined") return "portrait";
  const isLandscape = window.matchMedia?.("(orientation: landscape)").matches
    ?? window.innerWidth > window.innerHeight;
  return isLandscape ? "landscape" : "portrait";
}

function getIsMobileDevice() {
  if (typeof window === "undefined") return false;
  const navigatorMobile = window.navigator.userAgentData?.mobile;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);
  const iPadDesktopMode = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
  return Boolean(navigatorMobile || mobileUserAgent || iPadDesktopMode || window.matchMedia?.("(pointer: coarse)").matches);
}

function getRiveRendererMode() {
  if (typeof window === "undefined") return "canvas";
  const userAgent = window.navigator.userAgent || "";
  const isAppleWebKit = /AppleWebKit/i.test(userAgent)
    && !/(Chrome|Chromium|Edg|OPR|SamsungBrowser)/i.test(userAgent);
  if (isAppleWebKit) return "canvas";
  try {
    const probeCanvas = document.createElement("canvas");
    if (!probeCanvas.getContext("webgl2")) return "canvas";
    const offscreenCanvas = new OffscreenCanvas(2, 2);
    return offscreenCanvas.getContext("webgl2") ? "webgl2-offscreen" : "webgl2-direct";
  } catch {
    return "canvas";
  }
}

function getShareUrl() {
  if (typeof window === "undefined") return "https://mikeywa.site/jocam/";
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.href;
}

function getCoverRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}

function downsampleToPcm16(floatSamples, inputSampleRate, outputSampleRate = 16_000) {
  if (!floatSamples?.length || inputSampleRate < outputSampleRate) return new Int16Array();
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.floor(floatSamples.length / ratio));
  const output = new Int16Array(outputLength);
  let outputIndex = 0;
  let inputIndex = 0;
  while (outputIndex < outputLength) {
    const nextInputIndex = Math.min(floatSamples.length, Math.round((outputIndex + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let index = inputIndex; index < nextInputIndex; index += 1) {
      sum += floatSamples[index];
      count += 1;
    }
    const sample = clamp(sum / Math.max(count, 1), -1, 1);
    output[outputIndex] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    outputIndex += 1;
    inputIndex = nextInputIndex;
  }
  return output;
}

function getVoiceSocketUrl() {
  const configured = import.meta.env.VITE_JOCAM_VOICE_URL;
  if (configured) return configured;
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) return "ws://127.0.0.1:8787/voice";
  return "wss://rive.mikeywa.site/jocam/api/voice";
}

function splitBubbleText(context, text, maxWidth) {
  const allCharacters = Array.from(String(text || "").replace(/\s+/g, " ").trim());
  const characters = allCharacters.slice(0, 42);
  const lines = [""];
  for (const character of characters) {
    const current = lines.at(-1);
    if (context.measureText(current + character).width <= maxWidth || !current) {
      lines[lines.length - 1] = current + character;
    } else if (lines.length < 2) {
      lines.push(character);
    } else {
      lines[1] += character;
    }
  }
  if (lines.length === 2) {
    while (context.measureText(`${lines[1]}…`).width > maxWidth && lines[1].length > 1) {
      lines[1] = lines[1].slice(0, -1);
    }
    if (lines.join("").length < characters.length || allCharacters.length > characters.length) lines[1] += "…";
  }
  return lines;
}

function roundedRectPath(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function drawCameraSource(context, source, rect, targetWidth, mirrored) {
  if (!mirrored) {
    context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
    return;
  }
  context.save();
  context.translate(targetWidth, 0);
  context.scale(-1, 1);
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
  context.restore();
}

function chooseRecordingMimeType() {
  if (!window.MediaRecorder) return "";
  const candidates = [
    "video/mp4;codecs=h264",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function getFileExtension(type) {
  return type.includes("mp4") ? "mp4" : "webm";
}

function getMediaTransitionName(id) {
  return `jocam-media-${String(id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function getTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function createCaptureId(type) {
  const randomPart = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${type}-${randomPart}`;
}

function formatCaptureDate(createdAt) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

async function fetchAsset(asset, onProgress) {
  const response = await fetch(`${BASE_URL}${asset.path}`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Failed to load ${asset.path}`);

  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    onProgress(asset.key, asset.bytes);
    return asset.retain ? buffer : null;
  }

  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    if (asset.retain) chunks.push(value);
    onProgress(asset.key, Math.min(asset.bytes, loaded));
  }

  onProgress(asset.key, asset.bytes);
  if (!asset.retain) return null;

  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

async function saveBlob(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type });

  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function applyRivePlaybackRate(instance, playbackRateRef) {
  const advance = instance?.advanceAndReportChanges?.bind(instance);
  if (!advance) return;
  instance.advanceAndReportChanges = (elapsedTime) => {
    advance(elapsedTime * playbackRateRef.current);
  };
}

function App() {
  const [isMobileDevice] = useState(getIsMobileDevice);
  const [shareUrl] = useState(getShareUrl);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [day, setDay] = useState(() => getRandomValue(MAX_RANDOM_DAY));
  const [captionMode, setCaptionMode] = useState("together");
  const paddedDay = String(day).padStart(2, "0");
  const caption = CAPTION_MODES[captionMode];

  const videoRef = useRef(null);
  const pipVideoRef = useRef(null);
  const outputCanvasRef = useRef(null);
  const photoCanvasRef = useRef(null);
  const riveCanvasRef = useRef(null);
  const riveCaptureCanvasRef = useRef(null);
  const foregroundCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const gestureOutlineBuffersRef = useRef(null);
  const takePhotoRef = useRef(null);
  const autoCaptureTimerRef = useRef(null);
  const lastAutoCaptureAtRef = useRef(0);
  const guideAudioRef = useRef(null);
  const riveRef = useRef(null);
  const rivePlaybackRateRef = useRef(COVER_RIVE_PLAYBACK_RATE);
  const segmenterRef = useRef(null);
  const subjectSegmenterRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const gestureRecognizerRef = useRef(null);
  const gestureTrackerRef = useRef(createGestureTracker());
  const streamRef = useRef(null);
  const pipStreamRef = useRef(null);
  const pipRequestIdRef = useRef(0);
  const voiceSocketRef = useRef(null);
  const voiceAudioGraphRef = useRef(null);
  const speechBubbleOverlayRef = useRef(null);
  const voicePcmMutedRef = useRef(false);
  const voiceIntentionalCloseRef = useRef(false);
  const speechClearTimerRef = useRef(null);
  const speechTextRef = useRef("");
  const mouthAnchorRef = useRef(null);
  const lastFaceSeenAtRef = useRef(0);
  const frameRef = useRef(0);
  const lastRenderAtRef = useRef(0);
  const lastSegmentAtRef = useRef(0);
  const lastSubjectSegmentAtRef = useRef(0);
  const lastFaceAtRef = useRef(0);
  const lastGestureAtRef = useRef(0);
  const visionThrottleRef = useRef(1);
  const maskReadyRef = useRef(false);
  const personPresentRef = useRef(false);
  const personMissingFramesRef = useRef(0);
  const personAbsentSinceRef = useRef(0);
  const personMaskRevisionRef = useRef(0);
  const gestureEffectUntilRef = useRef(0);
  const gestureEffectTimerRef = useRef(null);
  const recordingRef = useRef(false);
  const recorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const recordingDayRef = useRef(paddedDay);
  const recordingCaptionModeRef = useRef(captionMode);
  const recordingIntervalRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const pointerDownRef = useRef(false);
  const longPressTriggeredRef = useRef(false);
  const autoStopTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const guideTimerRef = useRef(null);
  const guideAudioUnlockedRef = useRef(false);
  const lastGuideAtRef = useRef(0);
  const lastGuideKeyRef = useRef(null);
  const cameraReadyRef = useRef(false);
  const mediaPreviewRef = useRef(null);
  const mediaLibraryRef = useRef([]);
  const mediaLibraryOpenRef = useRef(false);
  const mediaLibraryGridRef = useRef(null);
  const mediaLibraryCloseTimerRef = useRef(null);
  const mediaPreviewCloseTimerRef = useRef(null);
  const mediaLibrarySwipeRef = useRef({ active: false, startX: 0, startY: 0, dragY: 0 });
  const mediaPreviewSwipeRef = useRef({ active: false, pointerId: null, startX: 0, startY: 0 });
  const shutterAudioContextRef = useRef(null);
  const flashTimerRef = useRef(null);
  const riveAnimationsRef = useRef([]);
  const riveAnimationIndexRef = useRef(0);
  const riveAnimationNameRef = useRef(DEFAULT_RIVE_ANIMATION);
  const riveGuidePlaybackRef = useRef(null);
  const riveMouthPlaybackRef = useRef(null);
  const rivePlayPraiseRef = useRef(null);
  const rivePlayAnimationRef = useRef(null);
  const riveMarkCaptureRef = useRef(null);
  const rivePrepareCaptureRef = useRef(null);
  const riveCaptureMomentRef = useRef(null);
  const riveCropXRef = useRef(RIVE_DEFAULT_CROP_X);
  const riveCropTimeoutsRef = useRef([]);
  const riveCharacterEventCleanupRef = useRef(null);
  const riveLoadCharacterRef = useRef(null);
  const jiaojiaoBufferRef = useRef(null);
  const lvdouBufferRef = useRef(null);
  const lvdouLoadPromiseRef = useRef(null);
  const lvdouIdleHandleRef = useRef(null);
  const characterOffsetXRef = useRef(0);
  const characterTransitionFrameRef = useRef(0);
  const characterSwitchingRef = useRef(false);
  const characterTapCountRef = useRef(0);
  const characterLastTapAtRef = useRef(0);

  const [engineState, setEngineState] = useState("loading");
  const [engineMessage, setEngineMessage] = useState("正在准备叫叫");
  const [loadProgress, setLoadProgress] = useState(2);
  const [riveReady, setRiveReady] = useState(false);
  const [segmenterReady, setSegmenterReady] = useState(false);
  const [faceLandmarkerReady, setFaceLandmarkerReady] = useState(false);
  const [gestureRecognizerReady, setGestureRecognizerReady] = useState(false);
  const [lastRecognizedGesture, setLastRecognizedGesture] = useState("");
  const [activeGestureEffect, setActiveGestureEffect] = useState("");
  const [cameraState, setCameraState] = useState("idle");
  const [cameraError, setCameraError] = useState("");
  const [cameraLensMode, setCameraLensMode] = useState("default");
  const [pipVisible, setPipVisible] = useState(false);
  const [pipOpening, setPipOpening] = useState(false);
  const [voiceState, setVoiceState] = useState("idle");
  const [speechText, setSpeechText] = useState("");

  useEffect(() => {
    if (isMobileDevice) return undefined;
    let cancelled = false;
    QRCode.toDataURL(shareUrl, {
      width: 288,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#251d08", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setQrCodeUrl(url);
    }).catch((error) => {
      console.warn("QR code generation failed", error);
    });
    return () => {
      cancelled = true;
    };
  }, [isMobileDevice, shareUrl]);
  const [facingMode, setFacingMode] = useState("user");
  const [frameOrientation, setFrameOrientation] = useState(getViewportOrientation);
  const [riveAnimationName, setRiveAnimationName] = useState(DEFAULT_RIVE_ANIMATION);
  const [riveRendererMode, setRiveRendererMode] = useState(getRiveRendererMode);
  const [activeCharacter, setActiveCharacter] = useState("jiaojiao");
  const [characterSwitching, setCharacterSwitching] = useState(false);
  const [personLayer, setPersonLayer] = useState("behind");
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [flashMode, setFlashMode] = useState("");
  const [toast, setToast] = useState("");
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaPreviewClosing, setMediaPreviewClosing] = useState(false);
  const [mediaPreviewDirection, setMediaPreviewDirection] = useState("open");
  const [mediaLibrary, setMediaLibrary] = useState([]);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [mediaLibraryClosing, setMediaLibraryClosing] = useState(false);
  const [mediaLibraryDragY, setMediaLibraryDragY] = useState(0);
  const [mediaLibraryDragging, setMediaLibraryDragging] = useState(false);
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const frameSize = FRAME_SIZES[frameOrientation];

  useEffect(() => {
    mediaPreviewRef.current = mediaPreview;
  }, [mediaPreview]);

  useEffect(() => {
    mediaLibraryRef.current = mediaLibrary;
  }, [mediaLibrary]);

  useEffect(() => {
    mediaLibraryOpenRef.current = mediaLibraryOpen;
  }, [mediaLibraryOpen]);

  useEffect(() => {
    let cancelled = false;
    loadMediaCaptures().then((captures) => {
      if (cancelled) return;
      const loadedCaptures = captures
        .filter((capture) => capture?.blob instanceof Blob)
        .map((capture) => ({ ...capture, url: URL.createObjectURL(capture.blob) }));
      setMediaLibrary((current) => {
        const currentIds = new Set(current.map(({ id }) => id));
        const uniqueLoaded = loadedCaptures.filter(({ id }) => !currentIds.has(id));
        return [...current, ...uniqueLoaded]
          .sort((left, right) => right.createdAt - left.createdAt)
          .slice(0, MEDIA_LIBRARY_LIMIT);
      });
    }).catch((error) => {
      console.warn("Local media library unavailable", error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const orientationQuery = window.matchMedia("(orientation: landscape)");
    const syncOrientation = () => {
      if (!recordingRef.current) setFrameOrientation(getViewportOrientation());
    };

    syncOrientation();
    orientationQuery.addEventListener?.("change", syncOrientation);
    window.addEventListener("orientationchange", syncOrientation);
    window.addEventListener("resize", syncOrientation);
    return () => {
      orientationQuery.removeEventListener?.("change", syncOrientation);
      window.removeEventListener("orientationchange", syncOrientation);
      window.removeEventListener("resize", syncOrientation);
    };
  }, []);

  const showToast = useCallback((message) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2_600);
  }, []);

  const unlockShutterSound = useCallback(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!shutterAudioContextRef.current || shutterAudioContextRef.current.state === "closed") {
      shutterAudioContextRef.current = new AudioContextClass();
    }
    if (shutterAudioContextRef.current.state === "suspended") {
      shutterAudioContextRef.current.resume().catch(() => {});
    }
    return shutterAudioContextRef.current;
  }, []);

  const playShutterSound = useCallback(() => {
    const context = unlockShutterSound();
    if (!context) return;
    try {
      const samples = createShutterSamples(context.sampleRate);
      const buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.getChannelData(0).set(samples);
      const source = context.createBufferSource();
      const highPass = context.createBiquadFilter();
      const gain = context.createGain();
      highPass.type = "highpass";
      highPass.frequency.value = 620;
      gain.gain.value = 0.28;
      source.buffer = buffer;
      source.connect(highPass);
      highPass.connect(gain);
      gain.connect(context.destination);
      source.start();
    } catch (error) {
      console.warn("Shutter sound unavailable", error);
    }
  }, [unlockShutterSound]);

  const stopPipCamera = useCallback(() => {
    pipRequestIdRef.current += 1;
    pipStreamRef.current?.getTracks().forEach((track) => track.stop());
    pipStreamRef.current = null;
    if (pipVideoRef.current) pipVideoRef.current.srcObject = null;
    setPipVisible(false);
    setPipOpening(false);
  }, []);

  const startPipCamera = useCallback(async (mainStream = streamRef.current) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return { ok: false, mainInterrupted: false };
    }

    const requestId = pipRequestIdRef.current + 1;
    pipRequestIdRef.current = requestId;
    pipStreamRef.current?.getTracks().forEach((track) => track.stop());
    pipStreamRef.current = null;
    setPipVisible(false);
    setPipOpening(true);
    let pipStream;
    try {
      const pipConstraints = {
        facingMode: { exact: "user" },
        width: { ideal: 720 },
        height: { ideal: 960 },
      };
      pipStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: pipConstraints,
      });
      const preferredCamera = await preferWidestFrontCamera(
        navigator.mediaDevices,
        pipStream,
        pipConstraints,
      );
      pipStream = preferredCamera.stream;
      if (requestId !== pipRequestIdRef.current) {
        pipStream.getTracks().forEach((track) => track.stop());
        return { ok: false, mainInterrupted: false, cancelled: true };
      }

      const pipVideo = pipVideoRef.current;
      if (!pipVideo) throw new Error("Front camera preview is unavailable");
      pipStreamRef.current = pipStream;
      pipVideo.srcObject = pipStream;
      await pipVideo.play();
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      if (mainStream && !hasLiveVideoTrack(mainStream)) {
        const interruption = new Error("Opening the front camera interrupted the rear camera");
        interruption.name = "DualCameraInterruptionError";
        throw interruption;
      }

      const pipTrack = pipStream.getVideoTracks()[0];
      pipTrack?.addEventListener("ended", () => {
        if (pipRequestIdRef.current !== requestId) return;
        pipStreamRef.current = null;
        if (pipVideoRef.current) pipVideoRef.current.srcObject = null;
        setPipVisible(false);
        setPipOpening(false);
      }, { once: true });
      setPipVisible(true);
      return { ok: true, mainInterrupted: false };
    } catch (error) {
      pipStream?.getTracks().forEach((track) => track.stop());
      if (pipStreamRef.current === pipStream) pipStreamRef.current = null;
      if (pipVideoRef.current) pipVideoRef.current.srcObject = null;
      setPipVisible(false);
      const mainInterrupted = error?.name === "DualCameraInterruptionError"
        || Boolean(mainStream && !hasLiveVideoTrack(mainStream));
      console.warn("Front camera picture-in-picture unavailable", error);
      return { ok: false, mainInterrupted, error };
    } finally {
      if (requestId === pipRequestIdRef.current) setPipOpening(false);
    }
  }, []);

  const addMediaCapture = useCallback((capture, { automatic = false } = {}) => {
    const item = {
      ...capture,
      id: createCaptureId(capture.type),
      createdAt: Date.now(),
      url: URL.createObjectURL(capture.blob),
    };
    setMediaLibrary((current) => {
      const next = [item, ...current].slice(0, MEDIA_LIBRARY_LIMIT);
      for (const staleItem of current.slice(MEDIA_LIBRARY_LIMIT - 1)) {
        if (staleItem.url) URL.revokeObjectURL(staleItem.url);
      }
      return next;
    });
    storeMediaCapture(item).catch((error) => {
      console.warn("Capture could not be persisted to the local media library", error);
      showToast("作品已保留在本次相机中");
    });
    showToast(automatic ? "已自动拍下这一刻" : capture.type === "video" ? "短视频已加入作品" : "照片已加入作品");
    return item;
  }, [showToast]);

  const scheduleAutoCapture = useCallback((reason, delay = 360) => {
    if (autoCaptureTimerRef.current) window.clearTimeout(autoCaptureTimerRef.current);
    autoCaptureTimerRef.current = window.setTimeout(() => {
      autoCaptureTimerRef.current = null;
      const now = performance.now();
      if (
        recordingRef.current
        || mediaPreviewRef.current
        || mediaLibraryOpenRef.current
        || now - lastAutoCaptureAtRef.current < 1_200
      ) return;
      lastAutoCaptureAtRef.current = now;
      takePhotoRef.current?.({ automatic: true, reason });
    }, delay);
  }, []);

  const preloadLvdou = useCallback(() => {
    if (lvdouBufferRef.current) return Promise.resolve(lvdouBufferRef.current);
    if (lvdouLoadPromiseRef.current) return lvdouLoadPromiseRef.current;

    lvdouLoadPromiseRef.current = fetch(`${BASE_URL}${CHARACTERS.lvdou.path}`, {
      cache: "force-cache",
      priority: "low",
    }).then((response) => {
      if (!response.ok) throw new Error(`绿豆文件加载失败 (${response.status})`);
      return response.arrayBuffer();
    }).then((buffer) => {
      lvdouBufferRef.current = buffer;
      return buffer;
    }).catch((error) => {
      lvdouLoadPromiseRef.current = null;
      console.warn("绿豆后台加载失败", error);
      throw error;
    });

    return lvdouLoadPromiseRef.current;
  }, []);

  const animateCharacterOffset = useCallback((targetOffset, duration, easing = "enter") => (
    new Promise((resolve) => {
      if (characterTransitionFrameRef.current) {
        window.cancelAnimationFrame(characterTransitionFrameRef.current);
      }
      const startOffset = characterOffsetXRef.current;
      const startedAt = performance.now();
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const activeDuration = reducedMotion ? 1 : duration;

      const tick = (timestamp) => {
        const progress = clamp((timestamp - startedAt) / activeDuration, 0, 1);
        const easedProgress = easing === "exit"
          ? progress ** 3
          : 1 - ((1 - progress) ** 4);
        characterOffsetXRef.current = startOffset
          + (targetOffset - startOffset) * easedProgress;
        if (progress < 1) {
          characterTransitionFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }
        characterTransitionFrameRef.current = 0;
        characterOffsetXRef.current = targetOffset;
        resolve();
      };

      characterTransitionFrameRef.current = window.requestAnimationFrame(tick);
    })
  ), []);

  const playGuideClip = useCallback((guideKey, { force = false } = {}) => {
    const audio = guideAudioRef.current;
    const guide = GUIDE_AUDIO[guideKey];
    if (!audio || !guide) return false;
    if (!force && (
      !guideAudioUnlockedRef.current
      || !cameraReadyRef.current
      || recordingRef.current
      || mediaPreviewRef.current
    )) return false;
    if (!force && !audio.paused) return false;

    const desiredSource = new URL(guide.path, window.location.href).href;
    if (audio.src !== desiredSource) audio.src = guide.path;
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Metadata may not be ready yet; play() will start from the beginning.
    }
    audio.volume = 1;
    audio.dataset.guideKey = guideKey;
    audio.dataset.guideText = guide.text;

    const stage = audio.closest(".camera-stage");
    if (stage) {
      stage.dataset.guideKey = guideKey;
      stage.dataset.guideText = guide.text;
    }

    const playback = audio.play();
    if (playback?.then) {
      playback.then(() => {
        guideAudioUnlockedRef.current = true;
        lastGuideAtRef.current = performance.now();
        lastGuideKeyRef.current = guideKey;
      }).catch((error) => {
        if (force) console.warn("Guide audio could not start", error);
      });
    } else {
      guideAudioUnlockedRef.current = true;
      lastGuideAtRef.current = performance.now();
      lastGuideKeyRef.current = guideKey;
    }
    return true;
  }, []);

  const handleGestureResult = useCallback((result, timestamp) => {
    const candidate = classifyCameraGesture(result);
    const update = advanceGestureTracker(gestureTrackerRef.current, candidate, timestamp);
    gestureTrackerRef.current = update.state;
    if (
      !update.trigger
      || mediaPreviewRef.current
      || mediaLibraryOpenRef.current
      || characterSwitchingRef.current
    ) return;

    const action = GESTURE_ACTIONS[update.trigger];
    if (!action || !rivePlayAnimationRef.current?.(action.animation)) return;
    setLastRecognizedGesture(update.trigger);
    if (shouldOutlineGesture(update.trigger)) {
      gestureEffectUntilRef.current = timestamp + GESTURE_OUTLINE_DURATION_MS;
      setActiveGestureEffect(update.trigger);
      if (gestureEffectTimerRef.current) window.clearTimeout(gestureEffectTimerRef.current);
      gestureEffectTimerRef.current = window.setTimeout(() => {
        gestureEffectTimerRef.current = null;
        gestureEffectUntilRef.current = 0;
        setActiveGestureEffect("");
      }, GESTURE_OUTLINE_DURATION_MS);
      scheduleAutoCapture(`gesture:${update.trigger}`);
    }
    if (action.audio) playGuideClip(action.audio, { force: true });
    showToast(`${CHARACTERS[activeCharacter].label}${action.toast}`);
  }, [activeCharacter, playGuideClip, scheduleAutoCapture, showToast]);

  const stopVoiceSession = useCallback(() => {
    voiceIntentionalCloseRef.current = true;
    const graph = voiceAudioGraphRef.current;
    voiceAudioGraphRef.current = null;
    if (graph) {
      graph.processor.onaudioprocess = null;
      graph.source.disconnect();
      graph.processor.disconnect();
      graph.silent.disconnect();
      graph.context.close().catch(() => {});
    }
    const socket = voiceSocketRef.current;
    voiceSocketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "camera closed");
    if (speechClearTimerRef.current) window.clearTimeout(speechClearTimerRef.current);
    speechTextRef.current = "";
    mouthAnchorRef.current = null;
    setSpeechText("");
    setVoiceState("idle");
  }, []);

  const startVoiceSession = useCallback(async (stream) => {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      setVoiceState("unavailable");
      return;
    }

    stopVoiceSession();
    voiceIntentionalCloseRef.current = false;
    setVoiceState("connecting");

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio is unavailable");
      const context = new AudioContextClass();
      await context.resume();
      const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silent = context.createGain();
      silent.gain.value = 0;
      source.connect(processor);
      processor.connect(silent);
      silent.connect(context.destination);
      voiceAudioGraphRef.current = { context, source, processor, silent };

      const socket = new WebSocket(getVoiceSocketUrl());
      socket.binaryType = "arraybuffer";
      voiceSocketRef.current = socket;
      processor.onaudioprocess = (event) => {
        if (
          voicePcmMutedRef.current
          || socket.readyState !== WebSocket.OPEN
        ) return;
        const samples = event.inputBuffer.getChannelData(0);
        const pcm = downsampleToPcm16(samples, context.sampleRate);
        if (pcm.byteLength) socket.send(pcm.buffer);
      };

      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ type: "start", sampleRate: 16_000, language: "zh-CN" }));
      });
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === "ready") {
          setVoiceState("listening");
          return;
        }
        if (message.type === "transcript") {
          const text = String(message.text || "").trim().slice(0, 42);
          if (!text) return;
          speechTextRef.current = text;
          setSpeechText(text);
          if (speechClearTimerRef.current) window.clearTimeout(speechClearTimerRef.current);
          speechClearTimerRef.current = window.setTimeout(() => {
            speechTextRef.current = "";
            setSpeechText("");
          }, message.final ? 3_600 : 2_400);
          return;
        }
        if (message.type === "action") {
          const action = VOICE_ACTIONS[message.action];
          if (!action || !rivePlayAnimationRef.current?.(action.animation)) return;
          playGuideClip(action.audio, { force: true });
          showToast(action.toast);
          scheduleAutoCapture(`voice:${message.action}`, 420);
          return;
        }
        if (message.type === "error") {
          setVoiceState("unavailable");
          showToast(message.message || "语音识别暂时不可用");
        }
      });
      socket.addEventListener("error", () => setVoiceState("unavailable"));
      socket.addEventListener("close", () => {
        if (!voiceIntentionalCloseRef.current) setVoiceState("unavailable");
      });
    } catch (error) {
      console.warn("Voice session unavailable", error);
      setVoiceState("unavailable");
    }
  }, [playGuideClip, scheduleAutoCapture, showToast, stopVoiceSession]);

  const maybePlayGuideForAnimation = useCallback((animationName, animationDurationSeconds) => {
    const guideKey = getGuideKeyForAnimation(animationName);
    const guide = GUIDE_AUDIO[guideKey];
    if (
      !guide
      || !guideAudioUnlockedRef.current
      || !cameraReadyRef.current
      || recordingRef.current
      || mediaPreviewRef.current
      || !guideAudioRef.current?.paused
      || lastGuideKeyRef.current === guideKey
      || performance.now() - lastGuideAtRef.current < GUIDE_MIN_INTERVAL_MS
      || Math.random() >= GUIDE_SPEAK_PROBABILITY
      || guide.duration + (GUIDE_PLAY_DELAY_MS / 1000) + GUIDE_END_PADDING_SECONDS > animationDurationSeconds
    ) return;

    if (guideTimerRef.current) window.clearTimeout(guideTimerRef.current);
    guideTimerRef.current = window.setTimeout(() => {
      guideTimerRef.current = null;
      if (
        riveAnimationNameRef.current !== animationName
        || performance.now() - lastGuideAtRef.current < GUIDE_MIN_INTERVAL_MS
      ) return;
      playGuideClip(guideKey);
    }, GUIDE_PLAY_DELAY_MS);
  }, [playGuideClip]);

  riveGuidePlaybackRef.current = maybePlayGuideForAnimation;

  const updateMask = useCallback((result) => {
    const masks = result.confidenceMasks;
    if (!masks?.length) return;

    const labels = segmenterRef.current?.getLabels?.() || [];
    const personIndex = labels.findIndex((label) => /person|selfie|human/i.test(label));
    const mask = masks[personIndex >= 0 ? personIndex : masks.length - 1];
    const values = mask.getAsFloat32Array();
    const personPresent = hasConfidentMaskArea(values, PERSON_MASK_THRESHOLD, PERSON_MIN_MASK_RATIO);
    personPresentRef.current = personPresent;
    if (!personPresent) {
      personMissingFramesRef.current += 1;
      if (personMissingFramesRef.current === 1) personAbsentSinceRef.current = performance.now();
      if (personMissingFramesRef.current >= PERSON_MISSING_FRAME_LIMIT) maskReadyRef.current = false;
      return;
    }
    personMissingFramesRef.current = 0;
    personAbsentSinceRef.current = 0;
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;

    if (maskCanvas.width !== mask.width || maskCanvas.height !== mask.height) {
      maskCanvas.width = mask.width;
      maskCanvas.height = mask.height;
    }

    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    const imageData = maskContext.createImageData(mask.width, mask.height);

    for (let index = 0; index < values.length; index += 1) {
      const offset = index * 4;
      imageData.data[offset] = 255;
      imageData.data[offset + 1] = 255;
      imageData.data[offset + 2] = 255;
      imageData.data[offset + 3] = values[index] >= PERSON_MASK_THRESHOLD ? 255 : 0;
    }

    maskContext.putImageData(imageData, 0, 0);
    maskReadyRef.current = true;
    personMaskRevisionRef.current += 1;
  }, []);

  const updateSubjectMask = useCallback((result) => {
    if (personPresentRef.current) return;
    const categoryMask = result.categoryMask;
    if (!categoryMask) return;
    const values = categoryMask.getAsUint8Array();
    const labels = subjectSegmenterRef.current?.getLabels?.() || [];
    const backgroundIndex = getBackgroundCategoryIndex(labels);
    if (!hasSegmentedSubject(values, backgroundIndex)) {
      maskReadyRef.current = false;
      return;
    }

    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    if (maskCanvas.width !== categoryMask.width || maskCanvas.height !== categoryMask.height) {
      maskCanvas.width = categoryMask.width;
      maskCanvas.height = categoryMask.height;
    }
    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    const imageData = maskContext.createImageData(categoryMask.width, categoryMask.height);
    for (let index = 0; index < values.length; index += 1) {
      const offset = index * 4;
      imageData.data[offset] = 255;
      imageData.data[offset + 1] = 255;
      imageData.data[offset + 2] = 255;
      imageData.data[offset + 3] = values[index] === backgroundIndex ? 0 : 255;
    }
    maskContext.putImageData(imageData, 0, 0);
    maskReadyRef.current = true;
    personMaskRevisionRef.current += 1;
  }, []);

  const updateMouthAnchor = useCallback((result) => {
    const landmarks = result?.faceLandmarks?.[0];
    const outputCanvas = outputCanvasRef.current;
    const video = videoRef.current;
    if (!landmarks?.length || !outputCanvas || !video?.videoWidth) {
      if (performance.now() - lastFaceSeenAtRef.current > FACE_MISSING_TIMEOUT_MS) {
        mouthAnchorRef.current = null;
      }
      return;
    }

    const mouthPoints = [13, 14, 61, 291].map((index) => landmarks[index]).filter(Boolean);
    const eyePoints = [33, 133, 362, 263].map((index) => landmarks[index]).filter(Boolean);
    if (!mouthPoints.length || !eyePoints.length) return;
    const normalizedX = mouthPoints.reduce((sum, point) => sum + point.x, 0) / mouthPoints.length;
    const normalizedY = mouthPoints.reduce((sum, point) => sum + point.y, 0) / mouthPoints.length;
    const normalizedEyeY = eyePoints.reduce((sum, point) => sum + point.y, 0) / eyePoints.length;
    const targetWidth = outputCanvas.width;
    const targetHeight = outputCanvas.height;
    const rect = getCoverRect(video.videoWidth, video.videoHeight, targetWidth, targetHeight);
    const unmirroredX = rect.x + normalizedX * rect.width;
    const displayX = shouldMirrorCamera(facingMode) ? targetWidth - unmirroredX : unmirroredX;
    const next = {
      x: clamp(displayX / targetWidth, 0.02, 0.98),
      y: clamp((rect.y + normalizedY * rect.height) / targetHeight, 0.02, 0.98),
      eyeY: clamp((rect.y + normalizedEyeY * rect.height) / targetHeight, 0.02, 0.98),
    };
    const current = mouthAnchorRef.current;
    mouthAnchorRef.current = current
      ? {
          x: current.x * 0.68 + next.x * 0.32,
          y: current.y * 0.68 + next.y * 0.32,
          eyeY: current.eyeY * 0.68 + next.eyeY * 0.32,
        }
      : next;
    lastFaceSeenAtRef.current = performance.now();
  }, [facingMode]);

  const drawSpeechBubble = useCallback((context, targetWidth, targetHeight, includeCanvasText = true) => {
    const text = speechTextRef.current;
    const anchor = mouthAnchorRef.current;
    if (!text || !anchor) return;

    const isLandscape = targetWidth > targetHeight;
    const fontSize = clamp(targetWidth * (isLandscape ? 0.021 : 0.038), 22, 31);
    context.save();
    context.font = `700 ${fontSize}px "Mohr Rounded", "PingFang SC", sans-serif`;
    const maxBubbleWidth = clamp(targetWidth * (isLandscape ? 0.42 : 0.68), 330, 610);
    const horizontalPadding = fontSize * 1.1;
    const maxTextWidth = maxBubbleWidth - horizontalPadding * 2;
    const lines = splitBubbleText(context, text, maxTextWidth);
    const measuredTextWidth = Math.max(
      fontSize,
      ...lines.map((line) => context.measureText(line).width),
    );
    const bubbleWidth = clamp(
      measuredTextWidth + horizontalPadding * 2,
      fontSize * 3.2,
      maxBubbleWidth,
    );
    const textWidth = bubbleWidth - horizontalPadding * 2;
    const lineHeight = fontSize * 1.12;
    const bubbleHeight = Math.max(fontSize * 2.15, lines.length * lineHeight + fontSize * 0.92);
    const tailHeight = fontSize * 0.52;
    const mouthX = anchor.x * targetWidth;
    const mouthY = anchor.y * targetHeight;
    const eyeY = anchor.eyeY * targetHeight;
    const direction = anchor.x < 0.5 ? 1 : -1;
    const captionSafeY = isLandscape ? 88 : 195;
    const bubbleX = clamp(
      mouthX + direction * targetWidth * (isLandscape ? 0.17 : 0.2),
      bubbleWidth / 2 + 18,
      targetWidth - bubbleWidth / 2 - 18,
    );
    const desiredBubbleY = mouthY - targetHeight * (isLandscape ? 0.21 : 0.19);
    const eyeSafeBubbleY = eyeY - bubbleHeight / 2 - tailHeight - fontSize * 0.82;
    const bubbleY = clamp(
      Math.min(desiredBubbleY, eyeSafeBubbleY),
      captionSafeY + bubbleHeight / 2,
      targetHeight - bubbleHeight / 2 - tailHeight - 30,
    );
    const left = bubbleX - bubbleWidth / 2;
    const top = bubbleY - bubbleHeight / 2;
    const bottom = top + bubbleHeight;
    const tailBaseX = clamp(mouthX, left + bubbleWidth * 0.28, left + bubbleWidth * 0.72);
    const tailTipX = clamp(mouthX, tailBaseX - fontSize * 0.72, tailBaseX + fontSize * 0.72);
    const tailHalfWidth = fontSize * 0.42;

    context.beginPath();
    context.moveTo(tailBaseX - tailHalfWidth, bottom - 2);
    context.lineTo(tailTipX, bottom + tailHeight);
    context.lineTo(tailBaseX + tailHalfWidth, bottom - 2);
    context.closePath();
    context.fillStyle = "#ffffff";
    context.shadowColor = "rgba(0, 0, 0, 0.2)";
    context.shadowBlur = 14;
    context.fill();

    roundedRectPath(context, left, top, bubbleWidth, bubbleHeight, bubbleHeight / 2);
    context.fillStyle = "#ffffff";
    context.shadowColor = "rgba(0, 0, 0, 0.2)";
    context.shadowBlur = 14;
    context.fill();
    context.shadowColor = "transparent";
    if (includeCanvasText) {
      context.fillStyle = "#111111";
      context.textAlign = "center";
      context.textBaseline = "middle";
      lines.forEach((line, index) => {
        const y = bubbleY + (index - (lines.length - 1) / 2) * lineHeight;
        context.fillText(line, bubbleX, y, textWidth);
      });
    }

    const overlay = speechBubbleOverlayRef.current;
    if (overlay) {
      overlay.style.left = `${(bubbleX / targetWidth) * 100}%`;
      overlay.style.top = `${(bubbleY / targetHeight) * 100}%`;
      overlay.style.width = `${(Math.min(measuredTextWidth, textWidth) / targetWidth) * 100}%`;
      overlay.style.height = `${(lines.length * lineHeight / targetHeight) * 100}%`;
      overlay.style.setProperty("--speech-font-cqw", String((fontSize / targetWidth) * 100));
    }
    context.restore();
  }, []);

  const drawCaption = useCallback((context, targetWidth, targetHeight) => {
    const activeCaption = CAPTION_MODES[captionMode];
    const centerX = targetWidth / 2;
    const isLandscape = targetHeight < targetWidth;
    const portraitCaptionScale = isLandscape ? 1 : 1.25;
    const verticalOffset = targetHeight * CAPTION_VERTICAL_OFFSET_RATIO;
    const firstLineY = (isLandscape ? 48 : 104) + verticalOffset;
    const dayLineY = (isLandscape ? 108 : 172) + verticalOffset;
    const labelFontSize = (isLandscape ? 35 : 33) * portraitCaptionScale;
    const dayLabelFontSize = labelFontSize * 1.25;
    const numberFontSize = (isLandscape ? 64 : 60) * 1.25 * portraitCaptionScale;
    const gap = 8 * portraitCaptionScale;
    const labelFont = `700 ${labelFontSize}px "Mohr Rounded", "PingFang SC", sans-serif`;
    const dayLabelFont = `700 ${dayLabelFontSize}px "Mohr Rounded", "PingFang SC", sans-serif`;
    const numberFont = `700 ${numberFontSize}px "Mohr Rounded", "PingFang SC", sans-serif`;

    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";

    context.font = labelFont;
    context.lineWidth = 10 * portraitCaptionScale;
    context.strokeStyle = "rgba(20, 22, 15, 0.52)";
    context.strokeText(activeCaption.prefix, centerX, firstLineY);
    context.fillStyle = "#f8f8f1";
    context.fillText(activeCaption.prefix, centerX, firstLineY);

    context.textAlign = "left";
    context.font = dayLabelFont;
    const dayPrefixWidth = context.measureText(activeCaption.dayPrefix).width;
    const suffixWidth = context.measureText(activeCaption.suffix).width;
    context.font = numberFont;
    const numberWidth = context.measureText(paddedDay).width;
    let cursorX = centerX - ((dayPrefixWidth + numberWidth + suffixWidth + gap * 2) / 2);

    const drawDayLabel = (copy) => {
      context.font = dayLabelFont;
      context.lineWidth = 11 * portraitCaptionScale;
      context.strokeStyle = "rgba(20, 22, 15, 0.52)";
      context.strokeText(copy, cursorX, dayLineY);
      context.fillStyle = "#f8f8f1";
      context.fillText(copy, cursorX, dayLineY);
      cursorX += context.measureText(copy).width;
    };

    drawDayLabel(activeCaption.dayPrefix);
    cursorX += gap;
    context.font = numberFont;
    context.lineWidth = (captionMode === "streak" ? 14 : 11) * portraitCaptionScale;
    context.strokeStyle = captionMode === "streak" ? "#fffdf8" : "rgba(20, 22, 15, 0.52)";
    context.strokeText(paddedDay, cursorX, dayLineY);
    context.fillStyle = captionMode === "streak" ? "#ef3f37" : "#ffd84d";
    context.fillText(paddedDay, cursorX, dayLineY);
    cursorX += numberWidth + gap;
    drawDayLabel(activeCaption.suffix);
    context.restore();
  }, [captionMode, paddedDay]);

  const drawRiveLayer = useCallback((outputContext, outputCanvas, welcomeMode = false, riveCanvasOverride = null) => {
    const riveCanvas = riveCanvasOverride || riveCanvasRef.current;
    const targetWidth = outputCanvas.width;
    const targetHeight = outputCanvas.height;

    if (riveReady && riveCanvas?.width && riveCanvas?.height) {
      const displayWidth = outputCanvas.clientWidth || targetWidth;
      const displayHeight = outputCanvas.clientHeight || targetHeight;
      const displayScale = Math.max(displayWidth / targetWidth, displayHeight / targetHeight);
      const visibleTargetWidth = Math.min(targetWidth, displayWidth / displayScale);
      const baseScale = Math.min(
        (targetHeight * RIVE_SCALE) / RIVE_VISIBLE_SOURCE.height,
        visibleTargetWidth / RIVE_VISIBLE_SOURCE.width,
      );
      const isPortraitWelcome = welcomeMode && targetHeight > targetWidth;
      const isDesktopLandscape = !isMobileDevice && targetWidth > targetHeight;
      const orientationMultiplier = targetWidth > targetHeight ? RIVE_LANDSCAPE_MULTIPLIER : 1;
      const welcomeMultiplier = isPortraitWelcome ? 1.45 : 1;
      const preferredScale = baseScale * RIVE_DISPLAY_MULTIPLIER * orientationMultiplier * welcomeMultiplier;
      const desktopSafeScale = (
        visibleTargetWidth * (1 + RIVE_LEFT_OVERFLOW_RATIO)
      ) / RIVE_VISIBLE_SOURCE.width;
      const scale = isDesktopLandscape
        ? Math.min(preferredScale, desktopSafeScale)
        : preferredScale;
      const riveWidth = RIVE_VISIBLE_SOURCE.width * scale;
      const riveHeight = RIVE_VISIBLE_SOURCE.height * scale;
      const riveX = -visibleTargetWidth * RIVE_LEFT_OVERFLOW_RATIO + characterOffsetXRef.current;
      const riveY = targetHeight - riveHeight - (isPortraitWelcome ? targetHeight * 0.12 : 0);
      outputContext.drawImage(
        riveCanvas,
        riveCropXRef.current,
        RIVE_VISIBLE_SOURCE.y,
        RIVE_VISIBLE_SOURCE.width,
        RIVE_VISIBLE_SOURCE.height,
        riveX,
        riveY,
        riveWidth,
        riveHeight,
      );
    }
  }, [isMobileDevice, riveReady]);

  const renderWelcomeFrame = useCallback(() => {
    const outputCanvas = outputCanvasRef.current;
    if (!outputCanvas) return;
    const outputContext = outputCanvas.getContext("2d", { alpha: false });
    outputContext.fillStyle = "#211c10";
    outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    drawRiveLayer(outputContext, outputCanvas, true);
  }, [drawRiveLayer]);

  const drawFrontCameraPip = useCallback((context, targetWidth, targetHeight) => {
    const pipVideo = pipVideoRef.current;
    if (!pipVisible || !pipVideo || pipVideo.readyState < 2) return;
    const pipRect = getFrontCameraPipRect(targetWidth, targetHeight);
    const sourceWidth = pipVideo.videoWidth || 720;
    const sourceHeight = pipVideo.videoHeight || 960;
    const coverRect = getCoverRect(sourceWidth, sourceHeight, pipRect.width, pipRect.height);
    const borderWidth = Math.max(4, Math.round(pipRect.width * 0.025));

    context.save();
    context.shadowColor = "rgba(10, 8, 3, 0.34)";
    context.shadowBlur = Math.max(14, Math.round(pipRect.width * 0.09));
    roundedRectPath(
      context,
      pipRect.x - borderWidth,
      pipRect.y - borderWidth,
      pipRect.width + borderWidth * 2,
      pipRect.height + borderWidth * 2,
      pipRect.radius + borderWidth,
    );
    context.fillStyle = "#ffd84d";
    context.fill();
    context.restore();

    context.save();
    roundedRectPath(context, pipRect.x, pipRect.y, pipRect.width, pipRect.height, pipRect.radius);
    context.clip();
    context.translate(pipRect.x + pipRect.width, pipRect.y);
    context.scale(-1, 1);
    context.drawImage(
      pipVideo,
      coverRect.x,
      coverRect.y,
      coverRect.width,
      coverRect.height,
    );
    context.restore();
  }, [pipVisible]);

  const renderFrame = useCallback((
    includeCaption = recordingRef.current,
    riveCanvasOverride = null,
    includeSpeechText = recordingRef.current,
  ) => {
    const video = videoRef.current;
    const outputCanvas = outputCanvasRef.current;
    const foregroundCanvas = foregroundCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;

    if (!video || !outputCanvas || !foregroundCanvas || video.readyState < 2) return;
    const outputContext = outputCanvas.getContext("2d", { alpha: false });
    const foregroundContext = foregroundCanvas.getContext("2d");
    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const targetWidth = outputCanvas.width;
    const targetHeight = outputCanvas.height;
    const rect = getCoverRect(sourceWidth, sourceHeight, targetWidth, targetHeight);
    const timestamp = performance.now();
    const mirrored = shouldMirrorCamera(facingMode);

    outputContext.fillStyle = "#181b14";
    outputContext.fillRect(0, 0, targetWidth, targetHeight);
    drawCameraSource(outputContext, video, rect, targetWidth, mirrored);

    const drawPerson = () => {
      if (!maskReadyRef.current || !maskCanvas?.width || !maskCanvas?.height) return;
      if (timestamp < gestureEffectUntilRef.current) {
        if (!gestureOutlineBuffersRef.current) {
          gestureOutlineBuffersRef.current = createGestureOutlineBuffers();
        }
        drawGestureOutline(
          outputContext,
          gestureOutlineBuffersRef.current,
          maskCanvas,
          rect,
          targetWidth,
          targetHeight,
          personMaskRevisionRef.current,
          timestamp,
          mirrored,
        );
      }
      foregroundContext.clearRect(0, 0, targetWidth, targetHeight);
      foregroundContext.globalCompositeOperation = "source-over";
      foregroundContext.drawImage(video, rect.x, rect.y, rect.width, rect.height);
      foregroundContext.save();
      foregroundContext.globalCompositeOperation = "destination-in";
      foregroundContext.imageSmoothingEnabled = false;
      if ("filter" in foregroundContext) {
        foregroundContext.filter = `blur(${PERSON_FEATHER_RANGE_PX / 2}px)`;
      }
      foregroundContext.drawImage(maskCanvas, rect.x, rect.y, rect.width, rect.height);
      foregroundContext.restore();
      drawCameraSource(outputContext, foregroundCanvas, {
        x: 0,
        y: 0,
        width: targetWidth,
        height: targetHeight,
      }, targetWidth, mirrored);
    };

    if (personLayer === "behind") drawPerson();

    drawRiveLayer(outputContext, outputCanvas, false, riveCanvasOverride);

    if (personLayer === "front") drawPerson();

    drawFrontCameraPip(outputContext, targetWidth, targetHeight);
    if (includeCaption) drawCaption(outputContext, targetWidth, targetHeight);
    drawSpeechBubble(outputContext, targetWidth, targetHeight, includeSpeechText);
  }, [drawCaption, drawFrontCameraPip, drawRiveLayer, drawSpeechBubble, facingMode, personLayer]);

  useEffect(() => {
    let cancelled = false;

    const prepare = async () => {
      try {
        setEngineState("loading");
        setEngineMessage("正在下载叫叫和人像模型");
        let activeRiveRendererMode = riveRendererMode;
        const configureRiveRuntime = (rendererMode) => {
          const runtimeKey = rendererMode === "canvas" ? "canvas" : "webgl2";
          const runtime = RIVE_RUNTIMES[runtimeKey];
          const runtimeAssets = RIVE_RUNTIME_ASSETS[runtimeKey];
          runtime.RuntimeLoader.setWasmUrl(`${BASE_URL}${runtimeAssets[0].path}`);
          runtime.RuntimeLoader.setWasmFallbackUrl(`${BASE_URL}${runtimeAssets[1].path}`);
          return runtime;
        };
        configureRiveRuntime(activeRiveRendererMode);
        const loadAssets = getLoadAssets(activeRiveRendererMode);
        const loadTotalBytes = loadAssets.reduce((total, asset) => total + asset.bytes, 0);

        const loadedByKey = Object.fromEntries(loadAssets.map((asset) => [asset.key, 0]));
        const onProgress = (key, loaded) => {
          loadedByKey[key] = loaded;
          const totalLoaded = Object.values(loadedByKey).reduce((total, value) => total + value, 0);
          const percent = Math.round(3 + (totalLoaded / loadTotalBytes) * 78);
          if (!cancelled) setLoadProgress(clamp(percent, 3, 81));
        };

        const downloads = await Promise.all(loadAssets.map((asset) => fetchAsset(asset, onProgress)));
        if (cancelled) return;
        const riveBuffer = downloads[loadAssets.findIndex((asset) => asset.key === "riveFile")];
        const modelBuffer = downloads[loadAssets.findIndex((asset) => asset.key === "segmentModel")];
        const subjectModelBuffer = downloads[loadAssets.findIndex((asset) => asset.key === "subjectModel")];
        const faceModelBuffer = downloads[loadAssets.findIndex((asset) => asset.key === "faceModel")];
        const gestureModelBuffer = downloads[loadAssets.findIndex((asset) => asset.key === "gestureModel")];

        setLoadProgress(84);
        setEngineMessage("正在唤醒叫叫");

        const loadRiveCharacter = (characterBuffer) => new Promise((resolve) => {
          riveCropTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
          riveCropTimeoutsRef.current = [];
          riveCropXRef.current = RIVE_DEFAULT_CROP_X;
          setRiveReady(false);
          const runtime = configureRiveRuntime(activeRiveRendererMode);
          const {
            Rive: RiveClass,
            Layout: RiveLayout,
            Fit: RiveFit,
            Alignment: RiveAlignment,
            EventType: RiveEventType,
          } = runtime;
          const useOffscreenRenderer = activeRiveRendererMode === "webgl2-offscreen";
          const existingInstance = riveRef.current;
          if (existingInstance) {
            riveCharacterEventCleanupRef.current?.();
            riveCharacterEventCleanupRef.current = null;
            let settled = false;
            const finish = (loaded) => {
              if (settled) return;
              settled = true;
              existingInstance.off(RiveEventType.Load, handleLoad);
              existingInstance.off(RiveEventType.LoadError, handleLoadError);
              resolve(loaded);
            };
            const handleLoad = () => finish(true);
            const handleLoadError = () => finish(false);
            existingInstance.on(RiveEventType.Load, handleLoad);
            existingInstance.on(RiveEventType.LoadError, handleLoadError);
            try {
              existingInstance.load({
                buffer: characterBuffer,
                autoplay: false,
                useOffscreenRenderer,
              });
            } catch (error) {
              console.warn("Rive character reload failed", error);
              finish(false);
            }
            return;
          }
          const instance = new RiveClass({
            buffer: characterBuffer,
            canvas: riveCanvasRef.current,
            autoplay: false,
            useOffscreenRenderer,
            layout: new RiveLayout({ fit: RiveFit.Contain, alignment: RiveAlignment.BottomCenter }),
            onLoad: () => {
              if (cancelled) {
                instance.cleanup();
                resolve(false);
                return;
              }
              const animations = instance.animationNames || [];
              const talkingAnimations = animations.filter((name) => (
                name.startsWith("TalkingEmotion") && !name.endsWith("表情")
              ));
              const animationOrder = [...new Set([
                DEFAULT_RIVE_ANIMATION,
                SECOND_RIVE_ANIMATION,
                CLICK_RIVE_ANIMATION,
                ...talkingAnimations,
              ])].filter((name) => animations.includes(name));
              riveAnimationsRef.current = animationOrder;
              riveAnimationIndexRef.current = 0;

              const analysisCanvas = document.createElement("canvas");
              analysisCanvas.width = RIVE_ANALYSIS_SIZE.width;
              analysisCanvas.height = RIVE_ANALYSIS_SIZE.height;
              const analysisContext = analysisCanvas.getContext("2d", { willReadFrequently: true });

              const scheduleCropAnalysis = () => {
                riveCropTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
                riveCropTimeoutsRef.current = [];
                let unionMinX = RIVE_SOURCE_SIZE.width;
                let unionMaxX = -1;

                const analyze = () => {
                  const riveCanvas = riveCanvasRef.current;
                  if (cancelled || !analysisContext || !riveCanvas?.width) return;
                  analysisContext.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
                  analysisContext.drawImage(riveCanvas, 0, 0, analysisCanvas.width, analysisCanvas.height);
                  const pixels = analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;
                  let minX = analysisCanvas.width;
                  let maxX = -1;

                  for (let y = 0; y < analysisCanvas.height; y += 2) {
                    for (let x = 0; x < analysisCanvas.width; x += 1) {
                      if (pixels[(y * analysisCanvas.width + x) * 4 + 3] <= 8) continue;
                      minX = Math.min(minX, x);
                      maxX = Math.max(maxX, x);
                    }
                  }

                  if (maxX < 0) return;
                  const sourceScale = RIVE_SOURCE_SIZE.width / analysisCanvas.width;
                  unionMinX = Math.min(unionMinX, minX * sourceScale);
                  unionMaxX = Math.max(unionMaxX, maxX * sourceScale);
                  const maxCropX = RIVE_SOURCE_SIZE.width - RIVE_VISIBLE_SOURCE.width;
                  const leftAlignedX = unionMinX - RIVE_EDGE_PADDING;
                  const rightSafeX = unionMaxX + RIVE_EDGE_PADDING - RIVE_VISIBLE_SOURCE.width;
                  const analyzedCropX = clamp(Math.max(leftAlignedX, rightSafeX), 0, maxCropX);
                  riveCropXRef.current = Math.max(riveCropXRef.current, analyzedCropX);
                };

                riveCropTimeoutsRef.current = [32, 140, 280, 440, 620, 800, 940].map((delay) => (
                  window.setTimeout(analyze, delay)
                ));
              };

              let activeAnimationName = null;
              let switchingAnimation = false;
              let completionQueued = false;

              const getActiveAnimation = (name = activeAnimationName) => (
                instance.animator?.animations?.find((animation) => animation.name === name) || null
              );

              const playAtIndex = (index) => {
                if (riveRef.current !== instance) return;
                const availableAnimations = riveAnimationsRef.current;
                if (!availableAnimations.length) return;
                const normalizedIndex = (index + availableAnimations.length) % availableAnimations.length;
                const nextAnimation = availableAnimations[normalizedIndex];
                const speaking = guideAudioRef.current && !guideAudioRef.current.paused;
                const playbackAnimations = [RIVE_POSITION_ANIMATION, nextAnimation];
                if (speaking) playbackAnimations.push(RIVE_MOUTH_ANIMATION);
                switchingAnimation = true;
                try {
                  instance.stop();
                  instance.play(playbackAnimations);
                  activeAnimationName = nextAnimation;
                  const positionAnimation = getActiveAnimation(RIVE_POSITION_ANIMATION);
                  if (positionAnimation?.instance) {
                    const positionFps = Math.max(positionAnimation.animation?.fps || 60, 1);
                    positionAnimation.instance.time = (positionAnimation.animation?.duration || positionFps) / positionFps;
                    positionAnimation.instance.apply(1);
                    instance.artboard?.advance?.(0);
                  }
                } finally {
                  switchingAnimation = false;
                }
                riveAnimationIndexRef.current = normalizedIndex;
                riveAnimationNameRef.current = nextAnimation;
                setRiveAnimationName(nextAnimation);
                scheduleCropAnalysis();
                const activeAnimation = getActiveAnimation(nextAnimation);
                const framesPerSecond = Math.max(activeAnimation?.animation?.fps || 60, 1);
                const workStart = activeAnimation?.animation?.workStart || 0;
                const workEnd = activeAnimation?.animation?.workEnd || activeAnimation?.animation?.duration || 0;
                const animationDurationSeconds = Math.max(0, workEnd - workStart)
                  / framesPerSecond
                  / Math.max(rivePlaybackRateRef.current, 0.01);
                riveGuidePlaybackRef.current?.(nextAnimation, animationDurationSeconds);
              };

              const playRandom = () => {
                const availableAnimations = riveAnimationsRef.current;
                if (!availableAnimations.length) return;
                const offset = availableAnimations.length > 1
                  ? Math.floor(Math.random() * (availableAnimations.length - 1)) + 1
                  : 0;
                playAtIndex(riveAnimationIndexRef.current + offset);
              };

              const queueNextAfterCompletion = (event) => {
                if (
                  cancelled
                  || riveRef.current !== instance
                  || switchingAnimation
                  || completionQueued
                  || !activeAnimationName
                ) return;
                const completedAnimation = event.type === RiveEventType.Loop
                  ? event.data?.animation
                  : Array.isArray(event.data) && event.data.includes(activeAnimationName)
                    ? activeAnimationName
                    : null;
                if (completedAnimation !== activeAnimationName) return;
                completionQueued = true;
                queueMicrotask(() => {
                  completionQueued = false;
                  if (!cancelled && riveRef.current === instance) playRandom();
                });
              };

              instance.on(RiveEventType.Loop, queueNextAfterCompletion);
              instance.on(RiveEventType.Stop, queueNextAfterCompletion);
              riveCharacterEventCleanupRef.current?.();
              riveCharacterEventCleanupRef.current = () => {
                instance.off(RiveEventType.Loop, queueNextAfterCompletion);
                instance.off(RiveEventType.Stop, queueNextAfterCompletion);
              };

              riveMouthPlaybackRef.current = (speaking) => {
                const mouthAnimation = getActiveAnimation(RIVE_MOUTH_ANIMATION);
                if (speaking && !mouthAnimation) {
                  instance.play(RIVE_MOUTH_ANIMATION);
                } else if (!speaking && mouthAnimation) {
                  instance.stop(RIVE_MOUTH_ANIMATION);
                }
              };
              if (guideAudioRef.current && !guideAudioRef.current.paused) {
                riveMouthPlaybackRef.current(true);
              }

              riveMarkCaptureRef.current = () => {
                const animation = getActiveAnimation();
                if (!animation?.instance || !activeAnimationName) return null;
                const fps = Math.max(animation.animation?.fps || 30, 1);
                const finalFrame = animation.animation?.workEnd || animation.animation?.duration || 0;
                return {
                  animationName: activeAnimationName,
                  time: animation.time,
                  duration: finalFrame / fps,
                  fps,
                };
              };

              rivePrepareCaptureRef.current = (captureMoment) => {
                const sourceCanvas = riveCanvasRef.current;
                if (!sourceCanvas?.width || !captureMoment) return sourceCanvas;

                try {
                  let animation = getActiveAnimation(captureMoment.animationName);
                  if (!animation) {
                    const captureIndex = riveAnimationsRef.current.indexOf(captureMoment.animationName);
                    if (captureIndex < 0) return sourceCanvas;
                    playAtIndex(captureIndex);
                    animation = getActiveAnimation(captureMoment.animationName);
                  }
                  if (!animation?.instance) return sourceCanvas;

                  const fps = Math.max(captureMoment.fps || animation.animation?.fps || 30, 1);
                  const finalFrame = animation.animation?.workEnd || animation.animation?.duration || 0;
                  const duration = captureMoment.duration || finalFrame / fps;
                  const frameDuration = 1 / fps;
                  const lastDetailedFrame = Math.max(0, duration - frameDuration);
                  const captureTime = clamp(
                    captureMoment.time + RIVE_CAPTURE_ADVANCE_FRAMES * frameDuration,
                    0,
                    lastDetailedFrame,
                  );
                  animation.time = captureTime;
                  animation.apply(1);
                  instance.artboard?.advance?.(0);

                  const cameraStage = sourceCanvas.closest(".camera-stage");
                  if (cameraStage) {
                    cameraStage.dataset.riveCaptureAnimation = captureMoment.animationName;
                    cameraStage.dataset.riveCaptureFromTime = captureMoment.time.toFixed(4);
                    cameraStage.dataset.riveCaptureTime = captureTime.toFixed(4);
                    cameraStage.dataset.riveCaptureFps = String(fps);
                  }

                  const renderer = instance.renderer;
                  if (renderer && instance.artboard) {
                    renderer.clear();
                    renderer.save();
                    instance.alignRenderer();
                    instance.artboard.draw(renderer);
                    renderer.restore();
                    renderer.flush();
                    instance.runtime?.resolveAnimationFrame?.();
                  }

                  const captureCanvas = riveCaptureCanvasRef.current || document.createElement("canvas");
                  riveCaptureCanvasRef.current = captureCanvas;
                  if (captureCanvas.width !== sourceCanvas.width || captureCanvas.height !== sourceCanvas.height) {
                    captureCanvas.width = sourceCanvas.width;
                    captureCanvas.height = sourceCanvas.height;
                  }
                  const captureContext = captureCanvas.getContext("2d");
                  captureContext.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
                  captureContext.drawImage(sourceCanvas, 0, 0);
                  return captureCanvas;
                } catch (error) {
                  console.warn("Rive capture frame preparation failed", error);
                  return sourceCanvas;
                }
              };

              rivePlayPraiseRef.current = () => {
                const praiseIndex = riveAnimationsRef.current.indexOf(CLICK_RIVE_ANIMATION);
                if (praiseIndex < 0) return false;
                playAtIndex(praiseIndex);
                return true;
              };
              rivePlayAnimationRef.current = (animationName) => {
                const animationIndex = riveAnimationsRef.current.indexOf(animationName);
                if (animationIndex < 0) return false;
                playAtIndex(animationIndex);
                return true;
              };
              playAtIndex(0);
              setRiveReady(true);
              setLoadProgress((value) => Math.max(value, 92));
              resolve(true);
            },
            onLoadError: () => {
              try {
                instance.cleanup();
              } catch (error) {
                console.warn("Rive renderer cleanup failed", error);
              }
              if (riveRef.current === instance) riveRef.current = null;
              resolve(false);
            },
          });
          applyRivePlaybackRate(instance, rivePlaybackRateRef);
          riveRef.current = instance;
        });
        riveLoadCharacterRef.current = loadRiveCharacter;
        jiaojiaoBufferRef.current = riveBuffer;
        const prepareRive = (async () => {
          let loaded = false;
          try {
            loaded = await loadRiveCharacter(riveBuffer);
          } catch (error) {
            console.warn("Preferred Rive renderer failed", error);
          }
          if (loaded || activeRiveRendererMode === "canvas") return loaded;

          riveCharacterEventCleanupRef.current?.();
          riveCharacterEventCleanupRef.current = null;
          try {
            riveRef.current?.cleanup();
          } catch (error) {
            console.warn("WebGL2 cleanup before Canvas fallback failed", error);
          }
          riveRef.current = null;
          activeRiveRendererMode = "canvas";
          setRiveRendererMode("canvas");
          setEngineMessage("正在使用兼容模式唤醒叫叫");
          configureRiveRuntime("canvas");
          try {
            return await loadRiveCharacter(riveBuffer);
          } catch (error) {
            console.warn("Canvas Rive fallback failed", error);
            return false;
          }
        })();

        const prepareVision = (async () => {
          let segmenterLoaded = false;
          let subjectSegmenterLoaded = false;
          let faceLoaded = false;
          let gestureLoaded = false;
          try {
            const vision = await FilesetResolver.forVisionTasks(`${BASE_URL}mediapipe/wasm`);
            if (cancelled) return { segmenterLoaded, subjectSegmenterLoaded, faceLoaded, gestureLoaded };
            try {
              const segmenter = await ImageSegmenter.createFromOptions(vision, {
                baseOptions: {
                  modelAssetBuffer: new Uint8Array(modelBuffer),
                  delegate: "CPU",
                },
                runningMode: "VIDEO",
                outputConfidenceMasks: true,
                outputCategoryMask: false,
              });
              if (cancelled) segmenter.close();
              else {
                segmenterRef.current = segmenter;
                setSegmenterReady(true);
                segmenterLoaded = true;
                setLoadProgress((value) => Math.max(value, 94));
              }
            } catch (error) {
              console.warn("Person segmentation unavailable", error);
            }

            try {
              const subjectSegmenter = await ImageSegmenter.createFromOptions(vision, {
                baseOptions: {
                  modelAssetBuffer: new Uint8Array(subjectModelBuffer),
                  delegate: "CPU",
                },
                runningMode: "VIDEO",
                outputConfidenceMasks: false,
                outputCategoryMask: true,
              });
              if (cancelled) subjectSegmenter.close();
              else {
                subjectSegmenterRef.current = subjectSegmenter;
                subjectSegmenterLoaded = true;
              }
            } catch (error) {
              console.warn("General subject segmentation unavailable", error);
            }

            try {
              const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                  modelAssetBuffer: new Uint8Array(faceModelBuffer),
                  delegate: "CPU",
                },
                runningMode: "VIDEO",
                numFaces: 1,
                minFaceDetectionConfidence: 0.5,
                minFacePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: false,
              });
              if (cancelled) faceLandmarker.close();
              else {
                faceLandmarkerRef.current = faceLandmarker;
                setFaceLandmarkerReady(true);
                faceLoaded = true;
                setLoadProgress((value) => Math.max(value, 97));
              }
            } catch (error) {
              console.warn("Face landmark tracking unavailable", error);
            }

            try {
              const gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
                baseOptions: {
                  modelAssetBuffer: new Uint8Array(gestureModelBuffer),
                  delegate: "CPU",
                },
                runningMode: "VIDEO",
                numHands: 1,
                minHandDetectionConfidence: 0.55,
                minHandPresenceConfidence: 0.55,
                minTrackingConfidence: 0.55,
                cannedGesturesClassifierOptions: {
                  scoreThreshold: 0.62,
                  categoryAllowlist: ["Thumb_Up", "Victory"],
                },
              });
              if (cancelled) gestureRecognizer.close();
              else {
                gestureRecognizerRef.current = gestureRecognizer;
                setGestureRecognizerReady(true);
                gestureLoaded = true;
                setLoadProgress((value) => Math.max(value, 99));
              }
            } catch (error) {
              console.warn("Hand gesture tracking unavailable", error);
            }
          } catch (error) {
            console.warn("MediaPipe vision runtime unavailable", error);
          }
          return { segmenterLoaded, subjectSegmenterLoaded, faceLoaded, gestureLoaded };
        })();

        const [riveLoaded, visionLoaded] = await Promise.all([prepareRive, prepareVision]);
        if (cancelled) return;
        if (!riveLoaded) throw new Error("Rive failed to initialize");
        setLoadProgress(100);
        setEngineState("ready");
        setEngineMessage(
          visionLoaded.segmenterLoaded && visionLoaded.subjectSegmenterLoaded && visionLoaded.faceLoaded && visionLoaded.gestureLoaded
            ? "叫叫、主体、嘴部与手势跟踪都准备好了"
            : "叫叫准备好了，部分识别能力稍后重试",
        );
      } catch (error) {
        if (cancelled) return;
        console.error("Jocam preparation failed", error);
        setEngineState("error");
        setEngineMessage("叫叫没有成功到场，请刷新重试");
      }
    };

    prepare();

    return () => {
      cancelled = true;
      riveCropTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      riveCropTimeoutsRef.current = [];
      riveCharacterEventCleanupRef.current?.();
      riveCharacterEventCleanupRef.current = null;
      riveRef.current?.cleanup();
      riveRef.current = null;
      riveLoadCharacterRef.current = null;
      rivePlayPraiseRef.current = null;
      rivePlayAnimationRef.current = null;
      riveGuidePlaybackRef.current = null;
      riveMouthPlaybackRef.current = null;
      riveMarkCaptureRef.current = null;
      rivePrepareCaptureRef.current = null;
      riveCaptureMomentRef.current = null;
      jiaojiaoBufferRef.current = null;
      lvdouBufferRef.current = null;
      lvdouLoadPromiseRef.current = null;
      if (characterTransitionFrameRef.current) {
        window.cancelAnimationFrame(characterTransitionFrameRef.current);
        characterTransitionFrameRef.current = 0;
      }
      if (lvdouIdleHandleRef.current) {
        const { id, type } = lvdouIdleHandleRef.current;
        if (type === "idle") window.cancelIdleCallback?.(id);
        else window.clearTimeout(id);
        lvdouIdleHandleRef.current = null;
      }
      segmenterRef.current?.close();
      segmenterRef.current = null;
      subjectSegmenterRef.current?.close();
      subjectSegmenterRef.current = null;
      faceLandmarkerRef.current?.close();
      faceLandmarkerRef.current = null;
      gestureRecognizerRef.current?.close();
      gestureRecognizerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const nextPlaybackRate = cameraState === "ready"
      ? CAMERA_RIVE_PLAYBACK_RATE
      : COVER_RIVE_PLAYBACK_RATE;
    if (rivePlaybackRateRef.current === nextPlaybackRate) return;
    rivePlaybackRateRef.current = nextPlaybackRate;
  }, [cameraState]);

  useEffect(() => {
    if (cameraState !== "ready") return;
    Object.values(GUIDE_AUDIO).forEach((guide) => {
      if (guide === GUIDE_AUDIO.enter) return;
      fetch(guide.path, { cache: "force-cache" }).catch(() => {});
    });
  }, [cameraState]);

  useEffect(() => {
    const loop = (timestamp) => {
      const video = videoRef.current;
      if (cameraState === "ready" && video?.readyState >= 2) {
        const visionThrottle = visionThrottleRef.current;
        const personSegmentationDue = segmenterRef.current
          && timestamp - lastSegmentAtRef.current >= getThrottledInterval(SEGMENT_INTERVAL_MS, visionThrottle);
        const faceTrackingDue = faceLandmarkerRef.current
          && timestamp - lastFaceAtRef.current >= getThrottledInterval(FACE_INTERVAL_MS, visionThrottle);
        const gestureTrackingDue = gestureRecognizerRef.current
          && timestamp - lastGestureAtRef.current >= getThrottledInterval(GESTURE_INTERVAL_MS, visionThrottle);
        const subjectSegmentationDue = subjectSegmenterRef.current
          && !personPresentRef.current
          && personMissingFramesRef.current >= PERSON_MISSING_FRAME_LIMIT
          && personAbsentSinceRef.current > 0
          && timestamp - personAbsentSinceRef.current >= SUBJECT_FALLBACK_DELAY_MS
          && timestamp - lastSubjectSegmentAtRef.current >= getThrottledInterval(SUBJECT_SEGMENT_INTERVAL_MS, visionThrottle);
        const runVisionTask = (task, label) => {
          const startedAt = performance.now();
          try {
            task();
          } catch (error) {
            console.warn(label, error);
          } finally {
            visionThrottleRef.current = getNextVisionThrottle(
              visionThrottleRef.current,
              performance.now() - startedAt,
            );
          }
        };

        if (personSegmentationDue) {
          lastSegmentAtRef.current = timestamp;
          runVisionTask(() => {
            segmenterRef.current.segmentForVideo(video, timestamp, updateMask);
          }, "Person segmentation frame failed");
        } else if (faceTrackingDue) {
          lastFaceAtRef.current = timestamp;
          runVisionTask(() => {
            updateMouthAnchor(faceLandmarkerRef.current.detectForVideo(video, timestamp));
          }, "Face landmark frame failed");
        } else if (gestureTrackingDue) {
          lastGestureAtRef.current = timestamp;
          runVisionTask(() => {
            handleGestureResult(gestureRecognizerRef.current.recognizeForVideo(video, timestamp), timestamp);
          }, "Hand gesture frame failed");
        } else if (subjectSegmentationDue) {
          lastSubjectSegmentAtRef.current = timestamp;
          runVisionTask(() => {
            subjectSegmenterRef.current.segmentForVideo(video, timestamp, updateSubjectMask);
          }, "General subject segmentation frame failed");
        }
        if (timestamp - lastRenderAtRef.current >= RENDER_INTERVAL_MS) {
          lastRenderAtRef.current = timestamp;
          renderFrame();
        }
      } else if (riveReady) {
        if (timestamp - lastRenderAtRef.current >= RENDER_INTERVAL_MS) {
          lastRenderAtRef.current = timestamp;
          renderWelcomeFrame();
        }
      }
      frameRef.current = window.requestAnimationFrame(loop);
    };

    frameRef.current = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [cameraState, handleGestureResult, renderFrame, renderWelcomeFrame, riveReady, updateMask, updateMouthAnchor, updateSubjectMask]);

  useEffect(() => () => {
    cameraReadyRef.current = false;
    stopVoiceSession();
    stopPipCamera();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (recordingIntervalRef.current) window.clearInterval(recordingIntervalRef.current);
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    if (autoStopTimerRef.current) window.clearTimeout(autoStopTimerRef.current);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (guideTimerRef.current) window.clearTimeout(guideTimerRef.current);
    if (gestureEffectTimerRef.current) window.clearTimeout(gestureEffectTimerRef.current);
    if (autoCaptureTimerRef.current) window.clearTimeout(autoCaptureTimerRef.current);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    if (mediaLibraryCloseTimerRef.current) window.clearTimeout(mediaLibraryCloseTimerRef.current);
    if (mediaPreviewCloseTimerRef.current) window.clearTimeout(mediaPreviewCloseTimerRef.current);
    guideAudioRef.current?.pause();
    shutterAudioContextRef.current?.close().catch(() => {});
    shutterAudioContextRef.current = null;
    for (const item of mediaLibraryRef.current) {
      if (item.url) URL.revokeObjectURL(item.url);
    }
  }, [stopPipCamera, stopVoiceSession]);

  const openCamera = useCallback(async (
    nextFacingMode = facingMode,
    { attemptPip = nextFacingMode === "environment" } = {},
  ) => {
    cameraReadyRef.current = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      setCameraError("当前浏览器不支持相机，请用最新版 Safari 或 Chrome 打开");
      return;
    }

    setCameraState("opening");
    setCameraError("");
    setCameraLensMode("default");
    setCameraMenuOpen(false);
    setMediaLibraryOpen(false);
    mediaLibraryOpenRef.current = false;
    setMediaLibraryClosing(false);
    setMediaLibraryDragging(false);
    setMediaLibraryDragY(0);
    setMediaPreview(null);
    mediaPreviewRef.current = null;
    setMediaPreviewClosing(false);
    if (mediaLibraryCloseTimerRef.current) window.clearTimeout(mediaLibraryCloseTimerRef.current);
    if (mediaPreviewCloseTimerRef.current) window.clearTimeout(mediaPreviewCloseTimerRef.current);
    maskReadyRef.current = false;
    personPresentRef.current = false;
    personMissingFramesRef.current = 0;
    personAbsentSinceRef.current = 0;
    lastRenderAtRef.current = 0;
    lastSegmentAtRef.current = 0;
    lastSubjectSegmentAtRef.current = 0;
    lastFaceAtRef.current = 0;
    lastGestureAtRef.current = 0;
    visionThrottleRef.current = 1;
    personMaskRevisionRef.current = 0;
    gestureEffectUntilRef.current = 0;
    gestureOutlineBuffersRef.current = null;
    if (gestureEffectTimerRef.current) window.clearTimeout(gestureEffectTimerRef.current);
    gestureEffectTimerRef.current = null;
    if (autoCaptureTimerRef.current) window.clearTimeout(autoCaptureTimerRef.current);
    autoCaptureTimerRef.current = null;
    gestureTrackerRef.current = createGestureTracker();
    setLastRecognizedGesture("");
    setActiveGestureEffect("");
    stopVoiceSession();
    stopPipCamera();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    let stream;
    try {
      const videoConstraints = {
        facingMode: { ideal: nextFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      };
      const acquireMainStream = async () => {
        try {
          return {
            stream: await navigator.mediaDevices.getUserMedia({
              audio: {
                channelCount: { ideal: 1 },
                echoCancellation: { ideal: true },
                noiseSuppression: { ideal: true },
                autoGainControl: { ideal: true },
              },
              video: videoConstraints,
            }),
            microphoneUnavailable: false,
          };
        } catch (mediaError) {
          console.warn("Microphone permission unavailable; continuing with camera only", mediaError);
          return {
            stream: await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints }),
            microphoneUnavailable: true,
          };
        }
      };
      let acquired = await acquireMainStream();
      stream = acquired.stream;
      let microphoneUnavailable = acquired.microphoneUnavailable;

      if (nextFacingMode === "user") {
        const preferredCamera = await preferWidestFrontCamera(navigator.mediaDevices, stream, videoConstraints);
        stream = preferredCamera.stream;
        setCameraLensMode(preferredCamera.lensMode);
      }
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      let pipResult = null;
      if (nextFacingMode === "environment" && attemptPip) {
        pipResult = await startPipCamera(stream);
        if (pipResult.mainInterrupted) {
          stopPipCamera();
          stream.getTracks().forEach((track) => track.stop());
          acquired = await acquireMainStream();
          stream = acquired.stream;
          microphoneUnavailable = acquired.microphoneUnavailable;
          streamRef.current = stream;
          video.srcObject = stream;
          await video.play();
        }
      }
      setFacingMode(nextFacingMode);
      cameraReadyRef.current = true;
      setCameraState("ready");
      if (!lvdouBufferRef.current && !lvdouLoadPromiseRef.current && !lvdouIdleHandleRef.current) {
        const loadInBackground = () => {
          lvdouIdleHandleRef.current = null;
          preloadLvdou().catch(() => {});
        };
        if ("requestIdleCallback" in window) {
          lvdouIdleHandleRef.current = {
            id: window.requestIdleCallback(loadInBackground, { timeout: 2_200 }),
            type: "idle",
          };
        } else {
          lvdouIdleHandleRef.current = {
            id: window.setTimeout(loadInBackground, 900),
            type: "timeout",
          };
        }
      }
      if (!microphoneUnavailable) startVoiceSession(stream);
      else {
        setVoiceState("unavailable");
        showToast("相机已打开，允许麦克风后才会显示语音气泡");
      }
      if (pipResult && !pipResult.ok) {
        showToast("当前设备暂不支持前后双摄，已保留后摄主画面");
      } else if (!segmenterReady) {
        showToast("相机已打开，人像识别还在准备");
      }
    } catch (error) {
      cameraReadyRef.current = false;
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const denied = error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name);
      const missing = error instanceof DOMException && ["NotFoundError", "OverconstrainedError"].includes(error.name);
      setCameraState("error");
      setCameraError(
        denied
          ? "需要相机权限才能和叫叫合拍。请在浏览器设置中允许后重试。"
          : missing
            ? "没有找到可用的相机"
            : "相机暂时打不开，请稍后再试",
      );
    }
  }, [facingMode, preloadLvdou, segmenterReady, showToast, startPipCamera, startVoiceSession, stopPipCamera, stopVoiceSession]);

  const enterCamera = useCallback(() => {
    unlockShutterSound();
    playGuideClip("enter", { force: true });
    openCamera("user");
  }, [openCamera, playGuideClip, unlockShutterSound]);

  const switchCamera = useCallback(() => {
    if (recordingRef.current) return;
    openCamera(facingMode === "user" ? "environment" : "user");
  }, [facingMode, openCamera]);

  const togglePipCamera = useCallback(async () => {
    if (recordingRef.current || facingMode !== "environment" || pipOpening) return;
    if (pipVisible) {
      stopPipCamera();
      showToast("前摄小窗已关闭");
      return;
    }
    const result = await startPipCamera(streamRef.current);
    if (result.ok) {
      showToast("前摄小窗已打开，拍照和录像都会保留");
      return;
    }
    if (result.mainInterrupted) {
      await openCamera("environment", { attemptPip: false });
    }
    showToast("当前设备暂不支持同时打开前后摄像头");
  }, [facingMode, openCamera, pipOpening, pipVisible, showToast, startPipCamera, stopPipCamera]);

  const switchRiveAnimation = useCallback(() => {
    if (!rivePlayPraiseRef.current?.()) return;
    showToast(`${CHARACTERS[activeCharacter].label}正在夸夸你`);
  }, [activeCharacter, showToast]);

  const switchCharacter = useCallback(async () => {
    if (characterSwitchingRef.current || recordingRef.current) return;
    const nextCharacter = activeCharacter === "jiaojiao" ? "lvdou" : "jiaojiao";
    let nextBuffer;
    try {
      if (nextCharacter === "lvdou" && !lvdouBufferRef.current) {
        showToast("绿豆正在悄悄赶来");
      }
      nextBuffer = nextCharacter === "lvdou"
        ? await preloadLvdou()
        : jiaojiaoBufferRef.current;
    } catch {
      showToast("绿豆暂时没有加载好，请再试一次");
      return;
    }
    if (!nextBuffer || !riveLoadCharacterRef.current) return;

    characterSwitchingRef.current = true;
    setCharacterSwitching(true);
    const outputWidth = outputCanvasRef.current?.width || frameSize.width;
    const offscreenLeft = -outputWidth * 1.18;
    const previousBuffer = activeCharacter === "jiaojiao"
      ? jiaojiaoBufferRef.current
      : lvdouBufferRef.current;

    try {
      await animateCharacterOffset(offscreenLeft, CHARACTER_EXIT_DURATION_MS, "exit");
      const loaded = await riveLoadCharacterRef.current(nextBuffer);
      if (!loaded) throw new Error("Rive character failed to initialize");
      setActiveCharacter(nextCharacter);
      characterOffsetXRef.current = offscreenLeft;
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      await animateCharacterOffset(0, CHARACTER_ENTER_DURATION_MS, "enter");
      showToast(nextCharacter === "lvdou" ? "绿豆来啦" : "叫叫回来啦");
    } catch (error) {
      console.warn("角色切换失败", error);
      if (previousBuffer) await riveLoadCharacterRef.current(previousBuffer);
      characterOffsetXRef.current = offscreenLeft;
      await animateCharacterOffset(0, CHARACTER_ENTER_DURATION_MS, "enter");
      showToast("角色切换没有成功，请再试一次");
    } finally {
      characterSwitchingRef.current = false;
      setCharacterSwitching(false);
    }
  }, [activeCharacter, animateCharacterOffset, frameSize.width, preloadLvdou, showToast]);

  const handleCharacterTap = useCallback(() => {
    if (characterSwitchingRef.current) return;
    const now = performance.now();
    if (now - characterLastTapAtRef.current > CHARACTER_TAP_WINDOW_MS) {
      characterTapCountRef.current = 0;
    }
    characterLastTapAtRef.current = now;
    characterTapCountRef.current += 1;

    if (characterTapCountRef.current >= 3) {
      characterTapCountRef.current = 0;
      switchCharacter();
      return;
    }
    if (characterTapCountRef.current === 1) switchRiveAnimation();
  }, [switchCharacter, switchRiveAnimation]);

  const switchCaption = useCallback(() => {
    if (recordingRef.current) return;
    setCaptionMode((current) => (current === "together" ? "streak" : "together"));
    setDay((current) => getRandomValue(MAX_RANDOM_DAY, current));
    showToast("已切换字幕和阅读天数");
  }, [showToast]);

  const togglePersonLayer = useCallback(() => {
    setPersonLayer((current) => {
      const next = current === "front" ? "behind" : "front";
      showToast(next === "front" ? "人像已切到叫叫前面" : "人像已切到叫叫后面");
      return next;
    });
  }, [showToast]);

  const openMediaLibrary = useCallback(() => {
    if (mediaLibraryCloseTimerRef.current) {
      window.clearTimeout(mediaLibraryCloseTimerRef.current);
      mediaLibraryCloseTimerRef.current = null;
    }
    setCameraMenuOpen(false);
    setMediaLibraryClosing(false);
    setMediaLibraryDragging(false);
    setMediaLibraryDragY(0);
    mediaLibraryOpenRef.current = true;
    setMediaLibraryOpen(true);
  }, []);

  const closeMediaLibrary = useCallback(() => {
    if (!mediaLibraryOpenRef.current || mediaLibraryClosing) return;
    setMediaLibraryDragging(false);
    setMediaLibraryDragY(0);
    setMediaLibraryClosing(true);
    if (mediaLibraryCloseTimerRef.current) window.clearTimeout(mediaLibraryCloseTimerRef.current);
    mediaLibraryCloseTimerRef.current = window.setTimeout(() => {
      mediaLibraryCloseTimerRef.current = null;
      mediaLibraryOpenRef.current = false;
      setMediaLibraryOpen(false);
      setMediaLibraryClosing(false);
    }, 280);
  }, [mediaLibraryClosing]);

  const openMediaPreview = useCallback((item, direction = "open") => {
    if (!item) return;
    if (mediaPreviewCloseTimerRef.current) {
      window.clearTimeout(mediaPreviewCloseTimerRef.current);
      mediaPreviewCloseTimerRef.current = null;
    }
    const commit = () => {
      flushSync(() => {
        setMediaPreviewClosing(false);
        setMediaPreviewDirection(direction);
        mediaPreviewRef.current = item;
        setMediaPreview(item);
      });
    };
    if (direction === "open" && mediaLibraryOpenRef.current && document.startViewTransition) {
      document.startViewTransition(commit);
    } else {
      commit();
    }
  }, []);

  const closePreview = useCallback(() => {
    if (!mediaPreviewRef.current || mediaPreviewClosing) return;
    if (mediaLibraryOpenRef.current && document.startViewTransition) {
      document.startViewTransition(() => {
        flushSync(() => {
          mediaPreviewRef.current = null;
          setMediaPreview(null);
          setMediaPreviewClosing(false);
          setMediaPreviewDirection("open");
        });
      });
      return;
    }
    setMediaPreviewClosing(true);
    if (mediaPreviewCloseTimerRef.current) window.clearTimeout(mediaPreviewCloseTimerRef.current);
    mediaPreviewCloseTimerRef.current = window.setTimeout(() => {
      mediaPreviewCloseTimerRef.current = null;
      mediaPreviewRef.current = null;
      setMediaPreview(null);
      setMediaPreviewClosing(false);
      setMediaPreviewDirection("open");
    }, 240);
  }, [mediaPreviewClosing]);

  const onMediaLibraryTouchStart = useCallback((event) => {
    if (event.touches.length !== 1 || (mediaLibraryGridRef.current?.scrollTop || 0) > 1) return;
    const touch = event.touches[0];
    mediaLibrarySwipeRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      dragY: 0,
    };
  }, []);

  const onMediaLibraryTouchMove = useCallback((event) => {
    const swipe = mediaLibrarySwipeRef.current;
    if (!swipe.active || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - swipe.startX;
    const deltaY = touch.clientY - swipe.startY;
    if (deltaY <= 0 || Math.abs(deltaX) > deltaY) return;
    if (event.cancelable) event.preventDefault();
    swipe.dragY = Math.min(148, deltaY * 0.58);
    setMediaLibraryDragging(true);
    setMediaLibraryDragY(swipe.dragY);
  }, []);

  const finishMediaLibraryTouch = useCallback(() => {
    const swipe = mediaLibrarySwipeRef.current;
    mediaLibrarySwipeRef.current = { active: false, startX: 0, startY: 0, dragY: 0 };
    setMediaLibraryDragging(false);
    if (swipe.dragY >= 72) {
      closeMediaLibrary();
      return;
    }
    setMediaLibraryDragY(0);
  }, [closeMediaLibrary]);

  const showAdjacentPreview = useCallback((step) => {
    const current = mediaPreviewRef.current;
    if (!current) return;
    const items = mediaLibraryRef.current;
    const currentIndex = items.findIndex(({ id }) => id === current.id);
    const nextItem = items[currentIndex + step];
    if (!nextItem) return;
    openMediaPreview(nextItem, step > 0 ? "next" : "previous");
  }, [openMediaPreview]);

  const onMediaPreviewPointerDown = useCallback((event) => {
    if (mediaPreviewRef.current?.type !== "photo" || event.target.closest?.("button, video")) return;
    mediaPreviewSwipeRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic events used in previews do not always own an active pointer.
    }
  }, []);

  const onMediaPreviewPointerUp = useCallback((event) => {
    const swipe = mediaPreviewSwipeRef.current;
    if (!swipe.active || swipe.pointerId !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
    mediaPreviewSwipeRef.current = { active: false, pointerId: null, startX: 0, startY: 0 };
    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    const horizontal = Math.abs(deltaX);
    const vertical = Math.abs(deltaY);
    if (vertical >= 58 && vertical > horizontal) {
      closePreview();
      return;
    }
    if (horizontal >= 58 && horizontal > vertical) {
      showAdjacentPreview(deltaX < 0 ? 1 : -1);
    }
  }, [closePreview, showAdjacentPreview]);

  const onMediaPreviewPointerCancel = useCallback(() => {
    mediaPreviewSwipeRef.current = { active: false, pointerId: null, startX: 0, startY: 0 };
  }, []);

  const takePhoto = useCallback(({ automatic = false, reason = "manual" } = {}) => {
    const canvas = outputCanvasRef.current;
    if (!canvas || cameraState !== "ready" || recordingRef.current) return;
    const captureMoment = riveCaptureMomentRef.current || riveMarkCaptureRef.current?.();
    riveCaptureMomentRef.current = null;
    const captureRiveCanvas = rivePrepareCaptureRef.current?.(captureMoment) || riveCanvasRef.current;
    renderFrame(true, captureRiveCanvas, true);

    const photoCanvas = photoCanvasRef.current || document.createElement("canvas");
    photoCanvasRef.current = photoCanvas;
    if (photoCanvas.width !== canvas.width || photoCanvas.height !== canvas.height) {
      photoCanvas.width = canvas.width;
      photoCanvas.height = canvas.height;
    }
    const photoContext = photoCanvas.getContext("2d", { alpha: false });
    if (!photoContext) {
      showToast("照片生成失败，请再试一次");
      return;
    }
    photoContext.drawImage(canvas, 0, 0);
    playShutterSound();
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    setFlashMode(automatic ? "automatic" : "manual");
    flashTimerRef.current = window.setTimeout(() => {
      flashTimerRef.current = null;
      setFlashMode("");
    }, 280);

    photoCanvas.toBlob((blob) => {
      if (!blob) {
        showToast("照片生成失败，请再试一次");
        return;
      }
      addMediaCapture({
        type: "photo",
        blob,
        day: paddedDay,
        captionMode,
        source: reason,
      }, {
        automatic,
      });
    }, "image/jpeg", 0.94);
  }, [addMediaCapture, cameraState, captionMode, paddedDay, playShutterSound, renderFrame, showToast]);

  useEffect(() => {
    takePhotoRef.current = takePhoto;
  }, [takePhoto]);

  useEffect(() => {
    const onVolumeShutter = (event) => {
      const keyCode = event.keyCode || event.which;
      const isVolumeKey = VOLUME_SHUTTER_KEYS.has(event.key)
        || VOLUME_SHUTTER_KEYS.has(event.code)
        || VOLUME_SHUTTER_KEY_CODES.has(keyCode);

      if (
        !isVolumeKey
        || event.repeat
        || cameraState !== "ready"
        || recordingRef.current
        || mediaPreviewRef.current
        || mediaLibraryOpenRef.current
      ) return;

      event.preventDefault();
      riveCaptureMomentRef.current = riveMarkCaptureRef.current?.() || null;
      takePhoto();
    };

    window.addEventListener("keydown", onVolumeShutter, true);
    return () => window.removeEventListener("keydown", onVolumeShutter, true);
  }, [cameraState, takePhoto]);

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    if (recordingIntervalRef.current) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (autoStopTimerRef.current) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setFrameOrientation(getViewportOrientation());
  }, []);

  const startRecording = useCallback(() => {
    riveCaptureMomentRef.current = null;
    setCameraMenuOpen(false);
    const canvas = outputCanvasRef.current;
    const mimeType = chooseRecordingMimeType();
    if (!canvas?.captureStream || !window.MediaRecorder || !mimeType) {
      showToast("当前浏览器暂不支持网页录像，可以先拍照");
      return;
    }

    try {
      const stream = canvas.captureStream(30);
      streamRef.current?.getAudioTracks().forEach((track) => stream.addTrack(track.clone()));
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 5_000_000,
      });
      recordingChunksRef.current = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || mimeType });
        if (!blob.size) {
          showToast("录像没有成功保存，请再试一次");
          return;
        }
        addMediaCapture({
          type: "video",
          blob,
          day: recordingDayRef.current,
          captionMode: recordingCaptionModeRef.current,
          source: "manual",
        });
      };

      recordingDayRef.current = paddedDay;
      recordingCaptionModeRef.current = captionMode;
      recordingStartedAtRef.current = performance.now();
      recordingRef.current = true;
      setRecording(true);
      setRecordingTime(0);
      recorder.start(250);
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime(performance.now() - recordingStartedAtRef.current);
      }, 100);
      autoStopTimerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
    } catch (error) {
      console.warn("Recording failed", error);
      showToast("录像启动失败，可以先拍照");
    }
  }, [addMediaCapture, captionMode, paddedDay, showToast, stopRecording]);

  const onShutterPointerDown = useCallback((event) => {
    if (cameraState !== "ready") return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerDownRef.current = true;
    longPressTriggeredRef.current = false;
    riveCaptureMomentRef.current = riveMarkCaptureRef.current?.() || null;
    longPressTimerRef.current = window.setTimeout(() => {
      if (!pointerDownRef.current) return;
      longPressTriggeredRef.current = true;
      startRecording();
    }, LONG_PRESS_MS);
  }, [cameraState, startRecording]);

  const onShutterPointerUp = useCallback((event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    pointerDownRef.current = false;
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (recordingRef.current) {
      riveCaptureMomentRef.current = null;
      stopRecording();
    } else if (!longPressTriggeredRef.current) {
      takePhoto();
    }
  }, [stopRecording, takePhoto]);

  const onShutterPointerCancel = useCallback(() => {
    pointerDownRef.current = false;
    riveCaptureMomentRef.current = null;
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    if (recordingRef.current) stopRecording();
  }, [stopRecording]);

  const savePreview = useCallback(async () => {
    if (!mediaPreview) return;
    const previewDay = mediaPreview.day || paddedDay;
    const previewCaptionMode = mediaPreview.captionMode || captionMode;
    const extension = mediaPreview.type === "photo" ? "jpg" : getFileExtension(mediaPreview.blob.type);
    await saveBlob(
      mediaPreview.blob,
      `我和叫叫-第${previewDay}天-${getTimestamp()}.${extension}`,
      getCaptionText(previewCaptionMode, previewDay),
    );
  }, [captionMode, mediaPreview, paddedDay]);

  const latestMedia = mediaLibrary[0] || null;
  const mediaPreviewIndex = mediaPreview
    ? mediaLibrary.findIndex(({ id }) => id === mediaPreview.id)
    : -1;
  const previousPreview = mediaPreviewIndex > 0 ? mediaLibrary[mediaPreviewIndex - 1] : null;
  const nextPreview = mediaPreviewIndex >= 0 && mediaPreviewIndex < mediaLibrary.length - 1
    ? mediaLibrary[mediaPreviewIndex + 1]
    : null;
  const formattedRecordingTime = `${String(Math.floor(recordingTime / 1000)).padStart(2, "0")}.${Math.floor((recordingTime % 1000) / 100)}`;
  const readyForCamera = engineState !== "error";
  const activeRivePlaybackRate = cameraState === "ready" ? CAMERA_RIVE_PLAYBACK_RATE : COVER_RIVE_PLAYBACK_RATE;

  return (
    <main className={`app-shell is-${frameOrientation} ${isMobileDevice ? "is-mobile-device" : "is-desktop-device"}`}>
      <section
        className={`camera-stage is-${frameOrientation} ${cameraState === "ready" ? "is-live" : ""} ${riveReady ? "is-rive-ready" : ""} ${characterSwitching ? "is-character-switching" : ""}`}
        data-frame-orientation={frameOrientation}
        data-rive-animation={riveAnimationName}
        data-rive-playback-rate={activeRivePlaybackRate}
        data-rive-renderer={riveRendererMode}
        data-rive-switch-mode="on-complete"
        data-rive-position-basis={RIVE_POSITION_ANIMATION}
        data-rive-mouth-animation={RIVE_MOUTH_ANIMATION}
        data-rive-capture-offset-frames={RIVE_CAPTURE_ADVANCE_FRAMES}
        data-character={activeCharacter}
        data-character-switching={characterSwitching ? "true" : "false"}
        data-person-layer={personLayer}
        data-face-tracking={faceLandmarkerReady ? "ready" : "unavailable"}
        data-gesture-tracking={gestureRecognizerReady ? "ready" : "unavailable"}
        data-last-gesture={lastRecognizedGesture || "none"}
        data-gesture-effect={activeGestureEffect || "none"}
        data-gesture-outline="rainbow-mask"
        data-camera-lens={cameraLensMode}
        data-pip-camera={facingMode === "environment" ? (pipVisible ? "visible" : pipOpening ? "opening" : "hidden") : "inactive"}
        data-media-count={mediaLibrary.length}
        data-camera-menu={cameraMenuOpen ? "open" : "closed"}
        data-voice-state={voiceState}
        data-reading-day={day}
        data-caption-mode={captionMode}
        aria-label="和叫叫合拍相机"
      >
        <audio
          ref={guideAudioRef}
          className="guide-audio"
          src={GUIDE_AUDIO.enter.path}
          preload="auto"
          playsInline
          onPlay={() => {
            voicePcmMutedRef.current = true;
            riveMouthPlaybackRef.current?.(true);
          }}
          onPause={() => {
            voicePcmMutedRef.current = false;
            riveMouthPlaybackRef.current?.(false);
          }}
          onEnded={() => {
            voicePcmMutedRef.current = false;
            riveMouthPlaybackRef.current?.(false);
          }}
          aria-hidden="true"
        />
        <span className="sr-only" aria-live="polite">{speechText}</span>
        <div className="viewfinder">
          <video ref={videoRef} className="camera-source" playsInline muted aria-hidden="true" />
          <video ref={pipVideoRef} className="camera-source pip-camera-source" playsInline muted aria-hidden="true" />
          <canvas ref={riveCanvasRef} className="rive-source" width={RIVE_SOURCE_SIZE.width} height={RIVE_SOURCE_SIZE.height} aria-hidden="true" />
          <canvas ref={foregroundCanvasRef} className="render-source" width={frameSize.width} height={frameSize.height} aria-hidden="true" />
          <canvas ref={maskCanvasRef} className="render-source" width="256" height="256" aria-hidden="true" />
          <canvas ref={outputCanvasRef} className="camera-output" width={frameSize.width} height={frameSize.height} aria-label="实时合拍画面" />

          {cameraState === "ready" && speechText && !recording && (
            <div ref={speechBubbleOverlayRef} className="speech-bubble-text" aria-hidden="true">
              <Calligraph
                as="span"
                variant="text"
                animation="smooth"
                initial
                autoSize={false}
                drift={{ x: 6, y: 0 }}
                trend={1}
                stagger={0.015}
              >
                {speechText}
              </Calligraph>
            </div>
          )}

          {cameraState === "ready" && riveReady && (
            <button
              className="jiaojiao-hit-area"
              type="button"
              disabled={characterSwitching}
              onClick={handleCharacterTap}
              aria-label={`当前角色${CHARACTERS[activeCharacter].label}，单击播放夸夸动作，连续点击三次切换角色；当前动作 ${riveAnimationName}`}
            />
          )}

          {cameraState === "ready" && (
            <button
              className={`live-caption is-${captionMode} ${recording ? "is-canvas-rendered" : ""}`}
              type="button"
              disabled={recording}
              onClick={switchCaption}
              aria-label={`${getCaptionText(captionMode, day)}，点击切换字幕和数值`}
            >
              <span className="caption-line caption-line-copy">{caption.prefix}</span>
              <span className="caption-line caption-line-day">
                <span>{caption.dayPrefix}</span>
                <Calligraph
                  className="reading-day"
                  variant="number"
                  animation="bouncy"
                  initial
                  trend={1}
                  aria-label={`${day}`}
                >
                  {paddedDay}
                </Calligraph>
                <span>{caption.suffix}</span>
              </span>
            </button>
          )}

          {cameraState === "ready" && engineState === "loading" && (
            <div className="live-loading" role="progressbar" aria-label="合拍素材加载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow={loadProgress}>
              <span>叫叫正在到场</span>
              <strong>{loadProgress}%</strong>
              <i><b style={{ transform: `scaleX(${loadProgress / 100})` }} /></i>
            </div>
          )}

          {flashMode && <div className={`camera-flash is-${flashMode}`} aria-hidden="true" />}
        </div>

        {cameraState === "ready" && (
          <div className="control-deck">
            <div className="capture-toolbar" aria-label="拍摄工具">
              <div className="capture-side capture-side-left">
                <button
                  className={`media-library-entry ${latestMedia ? "has-media" : ""}`}
                  type="button"
                  disabled={recording}
                  onClick={openMediaLibrary}
                  aria-label={mediaLibrary.length ? `打开作品列表，共 ${mediaLibrary.length} 个作品` : "打开作品列表"}
                >
                  {latestMedia ? (
                    <>
                      {latestMedia.type === "photo" ? (
                        <img src={latestMedia.url} alt="最近拍摄的照片" />
                      ) : (
                        <video src={latestMedia.url} muted playsInline preload="metadata" aria-label="最近拍摄的短视频" />
                      )}
                      {latestMedia.type === "video" && <PlayCircle className="media-entry-play" size={19} weight="fill" aria-hidden="true" />}
                      <span className="media-entry-count">{mediaLibrary.length}</span>
                    </>
                  ) : (
                    <ImagesSquare size={24} weight="bold" aria-hidden="true" />
                  )}
                </button>
              </div>

              <div className="capture-controls">
                <span className="capture-hint">轻点拍照 · 按住录像</span>
                <button
                  className={`shutter ${recording ? "is-recording" : ""}`}
                  type="button"
                  aria-label={recording ? "松开结束录像" : "轻点拍照，长按录像"}
                  onPointerDown={onShutterPointerDown}
                  onPointerUp={onShutterPointerUp}
                  onPointerCancel={onShutterPointerCancel}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <span className="shutter-core" />
                  {recording && <span className="recording-time">{formattedRecordingTime}</span>}
                </button>
                <span className="capture-limit">最长 15 秒</span>
              </div>

              <div className="capture-side capture-side-right">
                {facingMode === "environment" && (
                  <button
                    className={`round-control pip-control ${pipVisible ? "is-active" : ""} ${pipOpening ? "is-opening" : ""}`}
                    type="button"
                    disabled={recording || pipOpening}
                    aria-pressed={pipVisible}
                    aria-label={pipVisible ? "关闭前置摄像头小窗" : "显示前置摄像头小窗"}
                    onClick={togglePipCamera}
                  >
                    <PictureInPicture size={21} weight={pipVisible ? "fill" : "bold"} aria-hidden="true" />
                    <span className="pip-control-state" aria-hidden="true">{pipVisible ? "×" : "+"}</span>
                  </button>
                )}
                <div className="camera-menu-wrap">
                  <button
                    className={`round-control camera-menu-trigger ${cameraMenuOpen ? "is-active" : ""}`}
                    type="button"
                    disabled={recording}
                    aria-expanded={cameraMenuOpen}
                    aria-haspopup="menu"
                    aria-label={cameraMenuOpen ? "收起相机设置菜单" : "展开相机设置菜单"}
                    onClick={() => setCameraMenuOpen((current) => !current)}
                  >
                    <CaretDown className="camera-menu-chevron" size={24} weight="bold" aria-hidden="true" />
                  </button>
                  {cameraMenuOpen && (
                    <div className="camera-menu-popover" role="menu" aria-label="相机设置">
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!segmenterReady}
                        onClick={() => {
                          togglePersonLayer();
                          setCameraMenuOpen(false);
                        }}
                      >
                        <ArrowsLeftRight size={19} weight="bold" aria-hidden="true" />
                        <span>{personLayer === "front" ? "切换为鸡在前" : "切换为人在前"}</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setCameraMenuOpen(false);
                          switchCamera();
                        }}
                      >
                        <ArrowClockwise size={20} weight="bold" aria-hidden="true" />
                        <span>翻转镜头</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {cameraState !== "ready" && (
          <div className="welcome-panel">
            <div className="welcome-copy">
              <span className="welcome-icon"><Camera size={30} weight="fill" /></span>
              <h1>和叫叫，拍一张<br />会动的阅读合照</h1>
              <p>相机在透明区域里，叫叫默认站在人像前面。</p>
            </div>

            {cameraState === "error" && <p className="camera-error" role="alert">{cameraError}</p>}

            <button
              className="open-camera-button"
              type="button"
              disabled={!readyForCamera || cameraState === "opening"}
              onClick={enterCamera}
            >
              {cameraState === "opening" ? (
                <><span className="button-loader" />正在打开相机</>
              ) : (
                <><Camera size={21} weight="fill" />{cameraState === "error" ? "重新进入相机" : "进入相机"}</>
              )}
            </button>

            <div className={`engine-status is-${engineState}`} role="status">
              {engineState === "ready" ? <Check size={15} weight="bold" /> : <span className="status-pulse" />}
              <span>{engineMessage}</span>
            </div>
            {engineState === "loading" && (
              <div className="load-progress" role="progressbar" aria-label="页面资源加载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow={loadProgress}>
                <div className="load-progress-copy">
                  <span>准备合拍素材</span>
                  <strong>{loadProgress}%</strong>
                </div>
                <span className="load-progress-track"><i style={{ transform: `scaleX(${loadProgress / 100})` }} /></span>
              </div>
            )}
            <p className="privacy-note"><LockSimple size={14} weight="fill" />画面只在本机合成；语音实时转文字且不保存</p>
          </div>
        )}

        {toast && <div className="camera-toast" role="status">{toast}</div>}

        {mediaLibraryOpen && (
          <div
            className={`media-library-panel ${mediaLibraryClosing ? "is-closing" : ""} ${mediaLibraryDragging ? "is-dragging" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="我的合拍作品"
            style={{ "--library-drag-y": `${mediaLibraryDragY}px` }}
            onTouchStart={onMediaLibraryTouchStart}
            onTouchMove={onMediaLibraryTouchMove}
            onTouchEnd={finishMediaLibraryTouch}
            onTouchCancel={finishMediaLibraryTouch}
          >
            <header className="media-library-header">
              <div>
                <strong>我的合拍</strong>
                <span>{mediaLibrary.length ? `${mediaLibrary.length} 个作品 · 仅保存在本机` : "作品仅保存在本机"}</span>
              </div>
              <button type="button" onClick={closeMediaLibrary} aria-label="关闭作品列表">
                <X size={25} weight="bold" aria-hidden="true" />
              </button>
            </header>
            {mediaLibrary.length ? (
              <div className="media-library-grid" ref={mediaLibraryGridRef}>
                {mediaLibrary.map((item) => (
                  <button
                    className={`media-library-card is-${item.type}`}
                    type="button"
                    key={item.id}
                    onClick={() => openMediaPreview(item)}
                    aria-label={`打开${item.type === "photo" ? "照片" : "短视频"}，${formatCaptureDate(item.createdAt)}`}
                  >
                    <span
                      className="media-library-visual"
                      style={{
                        viewTransitionName: mediaPreview?.id === item.id
                          ? "none"
                          : getMediaTransitionName(item.id),
                      }}
                    >
                      {item.type === "photo" ? (
                        <img src={item.url} alt="" />
                      ) : (
                        <video src={item.url} muted playsInline preload="metadata" aria-hidden="true" />
                      )}
                      {item.type === "video" && <PlayCircle size={28} weight="fill" aria-hidden="true" />}
                    </span>
                    <span className="media-library-meta">
                      <strong>{item.type === "photo" ? "照片" : "短视频"}</strong>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="media-library-empty">
                <ImagesSquare size={42} weight="duotone" aria-hidden="true" />
                <strong>还没有作品</strong>
                <span>拍照、录像或做个手势试试</span>
              </div>
            )}
          </div>
        )}

        {mediaPreview && (
          <div
            className={`media-preview is-${mediaPreview.type} ${mediaPreviewClosing ? "is-closing" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={mediaPreview.type === "photo" ? "照片预览" : "录像预览"}
            onPointerDown={onMediaPreviewPointerDown}
            onPointerUp={onMediaPreviewPointerUp}
            onPointerCancel={onMediaPreviewPointerCancel}
          >
            <div className="preview-media-carousel">
              {previousPreview && (
                <button
                  className="preview-neighbor is-previous"
                  type="button"
                  onClick={() => showAdjacentPreview(-1)}
                  aria-label="查看上一张作品"
                >
                  {previousPreview.type === "photo" ? (
                    <img src={previousPreview.url} alt="" />
                  ) : (
                    <video src={previousPreview.url} muted playsInline preload="metadata" aria-hidden="true" />
                  )}
                </button>
              )}
              <div className="preview-media-wrap">
                <div
                  className={`preview-media-clip is-${mediaPreviewDirection}`}
                  key={mediaPreview.id}
                  style={{
                    viewTransitionName: mediaPreviewDirection === "open"
                      ? getMediaTransitionName(mediaPreview.id)
                      : "none",
                  }}
                >
                  {mediaPreview.type === "photo" ? (
                    <img
                      src={mediaPreview.url}
                      alt={getCaptionText(mediaPreview.captionMode || captionMode, mediaPreview.day || paddedDay)}
                    />
                  ) : (
                    <video src={mediaPreview.url} playsInline controls autoPlay loop />
                  )}
                </div>
                <button className="preview-close" type="button" onClick={closePreview} aria-label="关闭预览">
                  <X size={28} weight="bold" />
                </button>
              </div>
              {nextPreview && (
                <button
                  className="preview-neighbor is-next"
                  type="button"
                  onClick={() => showAdjacentPreview(1)}
                  aria-label="查看下一张作品"
                >
                  {nextPreview.type === "photo" ? (
                    <img src={nextPreview.url} alt="" />
                  ) : (
                    <video src={nextPreview.url} muted playsInline preload="metadata" aria-hidden="true" />
                  )}
                </button>
              )}
            </div>
            <div className="preview-actions">
              <div>
                <strong>{mediaPreview.type === "photo" ? "这一刻拍好了" : "这一段录好了"}</strong>
                <span>{getCaptionText(mediaPreview.captionMode || captionMode, mediaPreview.day || paddedDay)}</span>
                <small>{formatCaptureDate(mediaPreview.createdAt)}{mediaPreview.type === "photo" ? " · 左右滑切换，上下滑返回" : ""}</small>
              </div>
              <button type="button" onClick={savePreview}>
                <DownloadSimple size={20} weight="bold" />
                保存{mediaPreview.type === "photo" ? "照片" : "视频"}
              </button>
            </div>
          </div>
        )}
      </section>

      {!isMobileDevice && (
        <aside className="desktop-note">
          <span className="desktop-kicker">推荐使用移动设备</span>
          <h2>扫码和叫叫合影</h2>
          <p>用手机或 Pad 打开，取景框会自动放大，更适合拍照和录像。</p>
          <div className="desktop-qr">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt={`打开 ${shareUrl} 的二维码`} />
            ) : (
              <span role="status">正在生成二维码</span>
            )}
          </div>
          <span className="desktop-domain">{shareUrl.replace(/^https?:\/\//, "")}</span>
        </aside>
      )}
    </main>
  );
}

export default App;

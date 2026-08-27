import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowsLeftRight,
  Camera,
  Check,
  DownloadSimple,
  LockSimple,
  X,
} from "@phosphor-icons/react";
import { Rive, Layout, Fit, Alignment, RuntimeLoader, EventType } from "@rive-app/canvas";
import { FaceLandmarker, FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
import { Calligraph } from "calligraph";
import QRCode from "qrcode";

const BASE_URL = import.meta.env.BASE_URL;
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
};
const VOICE_ACTIONS = {
  praise: { animation: "TalkingEmotion_Praise", audio: "commandPraise", toast: "叫叫送你一个赞" },
  surprised: { animation: "TalkingEmotion_Surprised", audio: "commandSurprised", toast: "叫叫做了个惊讶表情" },
  think: { animation: "TalkingEmotion_Think", audio: "commandThink", toast: "叫叫正在认真思考" },
  happy: { animation: "TalkingEmotion_Happy", audio: "commandHappy", toast: "叫叫开心地笑了" },
  frighten: { animation: "TalkingEmotion_Frighten", audio: "commandFrighten", toast: "叫叫吓了一跳" },
  curious: { animation: "TalkingEmotion_Curious", audio: "commandCurious", toast: "叫叫好奇地看过来" },
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
const SEGMENT_INTERVAL_MS = 92;
const FACE_INTERVAL_MS = 84;
const FACE_MISSING_TIMEOUT_MS = 850;
const PERSON_MASK_THRESHOLD = 0.52;
const PERSON_FEATHER_RANGE_PX = 5;
const LONG_PRESS_MS = 430;
const MAX_RECORDING_MS = 15_000;
const LOAD_ASSETS = [
  { key: "riveFile", path: "media/jiaojiao.riv", bytes: 10_399_115, retain: true },
  { key: "riveWasm", path: "rive/rive.wasm", bytes: 1_808_114, retain: false },
  { key: "riveFallback", path: "rive/rive_fallback.wasm", bytes: 1_818_434, retain: false },
  { key: "visionWasm", path: "mediapipe/wasm/vision_wasm_internal.wasm", bytes: 11_756_954, retain: false },
  { key: "visionLoader", path: "mediapipe/wasm/vision_wasm_internal.js", bytes: 323_377, retain: false },
  { key: "segmentModel", path: "mediapipe/selfie_segmenter.tflite", bytes: 249_537, retain: true },
  { key: "faceModel", path: "mediapipe/face_landmarker.task", bytes: 3_758_596, retain: true },
  { key: "guideEnter", path: "audio/guides/enter.mp3", bytes: 58_931, retain: false },
];
const LOAD_TOTAL_BYTES = LOAD_ASSETS.reduce((total, asset) => total + asset.bytes, 0);

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

function drawMirrored(context, source, rect, targetWidth) {
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

function getTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
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
  const outputCanvasRef = useRef(null);
  const photoCanvasRef = useRef(null);
  const riveCanvasRef = useRef(null);
  const riveCaptureCanvasRef = useRef(null);
  const foregroundCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const guideAudioRef = useRef(null);
  const riveRef = useRef(null);
  const rivePlaybackRateRef = useRef(COVER_RIVE_PLAYBACK_RATE);
  const segmenterRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const voiceSocketRef = useRef(null);
  const voiceAudioGraphRef = useRef(null);
  const voicePcmMutedRef = useRef(false);
  const voiceIntentionalCloseRef = useRef(false);
  const speechClearTimerRef = useRef(null);
  const speechTextRef = useRef("");
  const mouthAnchorRef = useRef(null);
  const lastFaceSeenAtRef = useRef(0);
  const frameRef = useRef(0);
  const lastSegmentAtRef = useRef(0);
  const lastFaceAtRef = useRef(0);
  const maskReadyRef = useRef(false);
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

  const [engineState, setEngineState] = useState("loading");
  const [engineMessage, setEngineMessage] = useState("正在准备叫叫");
  const [loadProgress, setLoadProgress] = useState(2);
  const [riveReady, setRiveReady] = useState(false);
  const [segmenterReady, setSegmenterReady] = useState(false);
  const [faceLandmarkerReady, setFaceLandmarkerReady] = useState(false);
  const [cameraState, setCameraState] = useState("idle");
  const [cameraError, setCameraError] = useState("");
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
  const [personLayer, setPersonLayer] = useState("behind");
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState("");
  const [mediaPreview, setMediaPreview] = useState(null);
  const frameSize = FRAME_SIZES[frameOrientation];

  useEffect(() => {
    mediaPreviewRef.current = mediaPreview;
  }, [mediaPreview]);

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
          const text = String(message.text || "").trim().slice(0, 80);
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
  }, [playGuideClip, showToast, stopVoiceSession]);

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
    if (!mouthPoints.length) return;
    const normalizedX = mouthPoints.reduce((sum, point) => sum + point.x, 0) / mouthPoints.length;
    const normalizedY = mouthPoints.reduce((sum, point) => sum + point.y, 0) / mouthPoints.length;
    const targetWidth = outputCanvas.width;
    const targetHeight = outputCanvas.height;
    const rect = getCoverRect(video.videoWidth, video.videoHeight, targetWidth, targetHeight);
    const unmirroredX = rect.x + normalizedX * rect.width;
    const next = {
      x: clamp((targetWidth - unmirroredX) / targetWidth, 0.02, 0.98),
      y: clamp((rect.y + normalizedY * rect.height) / targetHeight, 0.02, 0.98),
    };
    const current = mouthAnchorRef.current;
    mouthAnchorRef.current = current
      ? { x: current.x * 0.68 + next.x * 0.32, y: current.y * 0.68 + next.y * 0.32 }
      : next;
    lastFaceSeenAtRef.current = performance.now();
  }, []);

  const drawSpeechBubble = useCallback((context, targetWidth, targetHeight) => {
    const text = speechTextRef.current;
    const anchor = mouthAnchorRef.current;
    if (!text || !anchor) return;

    const isLandscape = targetWidth > targetHeight;
    const fontSize = clamp(targetWidth * (isLandscape ? 0.021 : 0.038), 22, 31);
    const bubbleWidth = clamp(targetWidth * (isLandscape ? 0.42 : 0.68), 330, 610);
    const textWidth = bubbleWidth - fontSize * 2.2;
    context.save();
    context.font = `700 ${fontSize}px "Mohr Rounded", "PingFang SC", sans-serif`;
    const lines = splitBubbleText(context, text, textWidth);
    const lineHeight = fontSize * 1.12;
    const bubbleHeight = Math.max(fontSize * 2.15, lines.length * lineHeight + fontSize * 0.92);
    const mouthX = anchor.x * targetWidth;
    const mouthY = anchor.y * targetHeight;
    const direction = anchor.x < 0.5 ? 1 : -1;
    const captionSafeY = isLandscape ? 120 : 240;
    const bubbleX = clamp(
      mouthX + direction * targetWidth * (isLandscape ? 0.17 : 0.2),
      bubbleWidth / 2 + 18,
      targetWidth - bubbleWidth / 2 - 18,
    );
    const bubbleY = clamp(
      mouthY - targetHeight * (isLandscape ? 0.17 : 0.13),
      captionSafeY + bubbleHeight / 2,
      targetHeight - bubbleHeight / 2 - 30,
    );
    const left = bubbleX - bubbleWidth / 2;
    const top = bubbleY - bubbleHeight / 2;
    const lineEndX = bubbleX + (mouthX < bubbleX ? -bubbleWidth * 0.34 : bubbleWidth * 0.34);
    const lineEndY = bubbleY + bubbleHeight * 0.32;

    context.beginPath();
    context.moveTo(mouthX, mouthY);
    context.quadraticCurveTo(
      mouthX + (lineEndX - mouthX) * 0.48,
      Math.min(mouthY, lineEndY) - fontSize * 1.2,
      lineEndX,
      lineEndY,
    );
    context.lineWidth = Math.max(5, targetWidth / 180);
    context.lineCap = "round";
    context.strokeStyle = "rgba(255, 255, 255, 0.98)";
    context.shadowColor = "rgba(0, 0, 0, 0.28)";
    context.shadowBlur = 8;
    context.stroke();

    roundedRectPath(context, left, top, bubbleWidth, bubbleHeight, bubbleHeight / 2);
    context.fillStyle = "#ffffff";
    context.shadowColor = "rgba(0, 0, 0, 0.2)";
    context.shadowBlur = 14;
    context.fill();
    context.shadowColor = "transparent";
    context.fillStyle = "#111111";
    context.textAlign = "center";
    context.textBaseline = "middle";
    lines.forEach((line, index) => {
      const y = bubbleY + (index - (lines.length - 1) / 2) * lineHeight;
      context.fillText(line, bubbleX, y, textWidth);
    });
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
      const riveX = -visibleTargetWidth * RIVE_LEFT_OVERFLOW_RATIO;
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

  const renderFrame = useCallback((includeCaption = recordingRef.current, riveCanvasOverride = null) => {
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

    outputContext.fillStyle = "#181b14";
    outputContext.fillRect(0, 0, targetWidth, targetHeight);
    drawMirrored(outputContext, video, rect, targetWidth);

    const drawPerson = () => {
      if (!maskReadyRef.current || !maskCanvas?.width || !maskCanvas?.height) return;
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
      drawMirrored(outputContext, foregroundCanvas, {
        x: 0,
        y: 0,
        width: targetWidth,
        height: targetHeight,
      }, targetWidth);
    };

    if (personLayer === "behind") drawPerson();

    drawRiveLayer(outputContext, outputCanvas, false, riveCanvasOverride);

    if (personLayer === "front") drawPerson();

    if (includeCaption) drawCaption(outputContext, targetWidth, targetHeight);
    drawSpeechBubble(outputContext, targetWidth, targetHeight);
  }, [drawCaption, drawRiveLayer, drawSpeechBubble, personLayer]);

  useEffect(() => {
    let cancelled = false;

    const prepare = async () => {
      try {
        setEngineState("loading");
        setEngineMessage("正在下载叫叫和人像模型");
        RuntimeLoader.setWasmUrl(`${BASE_URL}rive/rive.wasm`);
        RuntimeLoader.setWasmFallbackUrl(`${BASE_URL}rive/rive_fallback.wasm`);

        const loadedByKey = Object.fromEntries(LOAD_ASSETS.map((asset) => [asset.key, 0]));
        const onProgress = (key, loaded) => {
          loadedByKey[key] = loaded;
          const totalLoaded = Object.values(loadedByKey).reduce((total, value) => total + value, 0);
          const percent = Math.round(3 + (totalLoaded / LOAD_TOTAL_BYTES) * 78);
          if (!cancelled) setLoadProgress(clamp(percent, 3, 81));
        };

        const downloads = await Promise.all(LOAD_ASSETS.map((asset) => fetchAsset(asset, onProgress)));
        if (cancelled) return;
        const riveBuffer = downloads[LOAD_ASSETS.findIndex((asset) => asset.key === "riveFile")];
        const modelBuffer = downloads[LOAD_ASSETS.findIndex((asset) => asset.key === "segmentModel")];
        const faceModelBuffer = downloads[LOAD_ASSETS.findIndex((asset) => asset.key === "faceModel")];

        setLoadProgress(84);
        setEngineMessage("正在唤醒叫叫");

        const prepareRive = new Promise((resolve) => {
          const instance = new Rive({
            buffer: riveBuffer,
            canvas: riveCanvasRef.current,
            autoplay: false,
            autoBind: true,
            layout: new Layout({ fit: Fit.Contain, alignment: Alignment.BottomCenter }),
            onLoad: () => {
              if (cancelled) return;
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
                if (cancelled || switchingAnimation || completionQueued || !activeAnimationName) return;
                const completedAnimation = event.type === EventType.Loop
                  ? event.data?.animation
                  : Array.isArray(event.data) && event.data.includes(activeAnimationName)
                    ? activeAnimationName
                    : null;
                if (completedAnimation !== activeAnimationName) return;
                completionQueued = true;
                queueMicrotask(() => {
                  completionQueued = false;
                  if (!cancelled) playRandom();
                });
              };

              instance.on(EventType.Loop, queueNextAfterCompletion);
              instance.on(EventType.Stop, queueNextAfterCompletion);

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
            onLoadError: () => resolve(false),
          });
          applyRivePlaybackRate(instance, rivePlaybackRateRef);
          riveRef.current = instance;
        });

        const prepareVision = (async () => {
          let segmenterLoaded = false;
          let faceLoaded = false;
          try {
            const vision = await FilesetResolver.forVisionTasks(`${BASE_URL}mediapipe/wasm`);
            if (cancelled) return { segmenterLoaded, faceLoaded };
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
          } catch (error) {
            console.warn("MediaPipe vision runtime unavailable", error);
          }
          return { segmenterLoaded, faceLoaded };
        })();

        const [riveLoaded, visionLoaded] = await Promise.all([prepareRive, prepareVision]);
        if (cancelled) return;
        if (!riveLoaded) throw new Error("Rive failed to initialize");
        setLoadProgress(100);
        setEngineState("ready");
        setEngineMessage(
          visionLoaded.segmenterLoaded && visionLoaded.faceLoaded
            ? "叫叫、人像与嘴部跟踪都准备好了"
            : "叫叫准备好了，部分人像能力稍后重试",
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
      riveRef.current?.cleanup();
      riveRef.current = null;
      rivePlayPraiseRef.current = null;
      rivePlayAnimationRef.current = null;
      riveGuidePlaybackRef.current = null;
      riveMouthPlaybackRef.current = null;
      riveMarkCaptureRef.current = null;
      rivePrepareCaptureRef.current = null;
      riveCaptureMomentRef.current = null;
      segmenterRef.current?.close();
      segmenterRef.current = null;
      faceLandmarkerRef.current?.close();
      faceLandmarkerRef.current = null;
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
        if (segmenterRef.current && timestamp - lastSegmentAtRef.current >= SEGMENT_INTERVAL_MS) {
          lastSegmentAtRef.current = timestamp;
          try {
            segmenterRef.current.segmentForVideo(video, timestamp, updateMask);
          } catch (error) {
            console.warn("Person segmentation frame failed", error);
          }
        }
        if (faceLandmarkerRef.current && timestamp - lastFaceAtRef.current >= FACE_INTERVAL_MS) {
          lastFaceAtRef.current = timestamp;
          try {
            updateMouthAnchor(faceLandmarkerRef.current.detectForVideo(video, timestamp));
          } catch (error) {
            console.warn("Face landmark frame failed", error);
          }
        }
        renderFrame();
      } else if (riveReady) {
        renderWelcomeFrame();
      }
      frameRef.current = window.requestAnimationFrame(loop);
    };

    frameRef.current = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [cameraState, renderFrame, renderWelcomeFrame, riveReady, updateMask, updateMouthAnchor]);

  useEffect(() => () => {
    cameraReadyRef.current = false;
    stopVoiceSession();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (recordingIntervalRef.current) window.clearInterval(recordingIntervalRef.current);
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    if (autoStopTimerRef.current) window.clearTimeout(autoStopTimerRef.current);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (guideTimerRef.current) window.clearTimeout(guideTimerRef.current);
    guideAudioRef.current?.pause();
    if (mediaPreviewRef.current?.url) URL.revokeObjectURL(mediaPreviewRef.current.url);
  }, [stopVoiceSession]);

  const openCamera = useCallback(async (nextFacingMode = facingMode) => {
    cameraReadyRef.current = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      setCameraError("当前浏览器不支持相机，请用最新版 Safari 或 Chrome 打开");
      return;
    }

    setCameraState("opening");
    setCameraError("");
    maskReadyRef.current = false;
    stopVoiceSession();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    try {
      const videoConstraints = {
        facingMode: { ideal: nextFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      };
      let stream;
      let microphoneUnavailable = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: { ideal: 1 },
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
          },
          video: videoConstraints,
        });
      } catch (mediaError) {
        microphoneUnavailable = true;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
        console.warn("Microphone permission unavailable; continuing with camera only", mediaError);
      }
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setFacingMode(nextFacingMode);
      cameraReadyRef.current = true;
      setCameraState("ready");
      if (!microphoneUnavailable) startVoiceSession(stream);
      else {
        setVoiceState("unavailable");
        showToast("相机已打开，允许麦克风后才会显示语音气泡");
      }
      if (!segmenterReady) showToast("相机已打开，人像识别还在准备");
    } catch (error) {
      cameraReadyRef.current = false;
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
  }, [facingMode, segmenterReady, showToast, startVoiceSession, stopVoiceSession]);

  const enterCamera = useCallback(() => {
    playGuideClip("enter", { force: true });
    openCamera("user");
  }, [openCamera, playGuideClip]);

  const switchCamera = useCallback(() => {
    if (recordingRef.current) return;
    openCamera(facingMode === "user" ? "environment" : "user");
  }, [facingMode, openCamera]);

  const switchRiveAnimation = useCallback(() => {
    if (!rivePlayPraiseRef.current?.()) return;
    showToast("叫叫正在夸夸你");
  }, [showToast]);

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

  const closePreview = useCallback(() => {
    setMediaPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  const takePhoto = useCallback(() => {
    const canvas = outputCanvasRef.current;
    if (!canvas || cameraState !== "ready") return;
    const captureMoment = riveCaptureMomentRef.current || riveMarkCaptureRef.current?.();
    riveCaptureMomentRef.current = null;
    const captureRiveCanvas = rivePrepareCaptureRef.current?.(captureMoment) || riveCanvasRef.current;
    renderFrame(true, captureRiveCanvas);

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
    setFlash(true);
    window.setTimeout(() => setFlash(false), 170);

    photoCanvas.toBlob((blob) => {
      if (!blob) {
        showToast("照片生成失败，请再试一次");
        return;
      }
      setMediaPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { type: "photo", blob, url: URL.createObjectURL(blob), day: paddedDay, captionMode };
      });
    }, "image/jpeg", 0.94);
  }, [cameraState, captionMode, paddedDay, renderFrame, showToast]);

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
        setMediaPreview((current) => {
          if (current?.url) URL.revokeObjectURL(current.url);
          return {
            type: "video",
            blob,
            url: URL.createObjectURL(blob),
            day: recordingDayRef.current,
            captionMode: recordingCaptionModeRef.current,
          };
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
  }, [captionMode, paddedDay, showToast, stopRecording]);

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

  const formattedRecordingTime = `${String(Math.floor(recordingTime / 1000)).padStart(2, "0")}.${Math.floor((recordingTime % 1000) / 100)}`;
  const readyForCamera = engineState !== "error";
  const activeRivePlaybackRate = cameraState === "ready" ? CAMERA_RIVE_PLAYBACK_RATE : COVER_RIVE_PLAYBACK_RATE;

  return (
    <main className={`app-shell is-${frameOrientation} ${isMobileDevice ? "is-mobile-device" : "is-desktop-device"}`}>
      <section
        className={`camera-stage is-${frameOrientation} ${cameraState === "ready" ? "is-live" : ""} ${riveReady ? "is-rive-ready" : ""}`}
        data-frame-orientation={frameOrientation}
        data-rive-animation={riveAnimationName}
        data-rive-playback-rate={activeRivePlaybackRate}
        data-rive-switch-mode="on-complete"
        data-rive-position-basis={RIVE_POSITION_ANIMATION}
        data-rive-mouth-animation={RIVE_MOUTH_ANIMATION}
        data-rive-capture-offset-frames={RIVE_CAPTURE_ADVANCE_FRAMES}
        data-person-layer={personLayer}
        data-face-tracking={faceLandmarkerReady ? "ready" : "unavailable"}
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
          <canvas ref={riveCanvasRef} className="rive-source" width={RIVE_SOURCE_SIZE.width} height={RIVE_SOURCE_SIZE.height} aria-hidden="true" />
          <canvas ref={foregroundCanvasRef} className="render-source" width={frameSize.width} height={frameSize.height} aria-hidden="true" />
          <canvas ref={maskCanvasRef} className="render-source" width="256" height="256" aria-hidden="true" />
          <canvas ref={outputCanvasRef} className="camera-output" width={frameSize.width} height={frameSize.height} aria-label="实时合拍画面" />

          {cameraState === "ready" && riveReady && (
            <button
              className="jiaojiao-hit-area"
              type="button"
              onClick={switchRiveAnimation}
              aria-label={`播放叫叫夸夸动作，当前 ${riveAnimationName}`}
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

          {flash && <div className="camera-flash" aria-hidden="true" />}
        </div>

        {cameraState === "ready" && (
          <div className="control-deck">
            <div className="capture-toolbar" aria-label="拍摄工具">
              <button
                className={`round-control layer-control ${segmenterReady ? "is-ready" : ""} ${personLayer === "behind" ? "is-behind" : ""}`}
                type="button"
                disabled={!segmenterReady}
                aria-pressed={personLayer === "front"}
                aria-label={`切换人像图层，当前人像在叫叫${personLayer === "front" ? "前面" : "后面"}`}
                onClick={togglePersonLayer}
              >
                <ArrowsLeftRight size={18} weight="bold" />
                <span>{personLayer === "front" ? "人在前" : "鸡在前"}</span>
              </button>

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

              <button className="round-control camera-switch" type="button" disabled={recording} onClick={switchCamera} aria-label="切换前后摄像头">
                <ArrowClockwise size={23} weight="bold" />
              </button>
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

        {mediaPreview && (
          <div className={`media-preview is-${mediaPreview.type}`} role="dialog" aria-modal="true" aria-label={mediaPreview.type === "photo" ? "照片预览" : "录像预览"}>
            <div className="preview-media-wrap">
              <div className="preview-media-clip">
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
            <div className="preview-actions">
              <div>
                <strong>{mediaPreview.type === "photo" ? "这一刻拍好了" : "这一段录好了"}</strong>
                <span>{getCaptionText(mediaPreview.captionMode || captionMode, mediaPreview.day || paddedDay)}</span>
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

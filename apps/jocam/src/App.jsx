import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  Camera,
  Check,
  DeviceRotate,
  DownloadSimple,
  LockSimple,
  Sparkle,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import { Rive, Layout, Fit, Alignment, RuntimeLoader } from "@rive-app/canvas";
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
import { Calligraph } from "calligraph";

const BASE_URL = import.meta.env.BASE_URL;
const FRAME_SIZES = {
  portrait: { width: 720, height: 1280 },
  landscape: { width: 1280, height: 720 },
};
const RIVE_SOURCE_SIZE = FRAME_SIZES.portrait;
const RIVE_SCALE = 0.512;
const DEFAULT_RIVE_ANIMATION = "Start_Dial";
const SECOND_RIVE_ANIMATION = "TalkingEmotion_Think";
const RIVE_RANDOM_INTERVAL_MS = 1_000;
const MAX_RANDOM_DAY = 520;
const CAPTION_MODES = {
  together: { prefix: "我和叫叫一起阅读的第", suffix: "天" },
  streak: { prefix: "坚持连续学习叫叫阅读第", suffix: "天" },
};
const SEGMENT_INTERVAL_MS = 92;
const LONG_PRESS_MS = 430;
const MAX_RECORDING_MS = 15_000;
const LOAD_ASSETS = [
  { key: "riveFile", path: "media/jiaojiao.riv", bytes: 10_399_115, retain: true },
  { key: "riveWasm", path: "rive/rive.wasm", bytes: 1_808_114, retain: false },
  { key: "riveFallback", path: "rive/rive_fallback.wasm", bytes: 1_818_434, retain: false },
  { key: "visionWasm", path: "mediapipe/wasm/vision_wasm_internal.wasm", bytes: 11_756_954, retain: false },
  { key: "visionLoader", path: "mediapipe/wasm/vision_wasm_internal.js", bytes: 323_377, retain: false },
  { key: "segmentModel", path: "mediapipe/selfie_segmenter.tflite", bytes: 249_537, retain: true },
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
  return `${caption.prefix} ${value} ${caption.suffix}`;
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

function App() {
  const [day, setDay] = useState(() => getRandomValue(MAX_RANDOM_DAY));
  const [captionMode, setCaptionMode] = useState("together");
  const paddedDay = String(day).padStart(2, "0");
  const caption = CAPTION_MODES[captionMode];

  const videoRef = useRef(null);
  const outputCanvasRef = useRef(null);
  const riveCanvasRef = useRef(null);
  const foregroundCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const riveRef = useRef(null);
  const segmenterRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(0);
  const lastSegmentAtRef = useRef(0);
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
  const mediaPreviewRef = useRef(null);
  const riveAnimationsRef = useRef([]);
  const riveAnimationIndexRef = useRef(0);
  const rivePlayRandomRef = useRef(null);
  const riveShuffleIntervalRef = useRef(null);

  const [engineState, setEngineState] = useState("loading");
  const [engineMessage, setEngineMessage] = useState("正在准备叫叫");
  const [loadProgress, setLoadProgress] = useState(2);
  const [riveReady, setRiveReady] = useState(false);
  const [segmenterReady, setSegmenterReady] = useState(false);
  const [cameraState, setCameraState] = useState("idle");
  const [cameraError, setCameraError] = useState("");
  const [facingMode, setFacingMode] = useState("user");
  const [frameOrientation, setFrameOrientation] = useState("portrait");
  const [riveAnimationName, setRiveAnimationName] = useState(DEFAULT_RIVE_ANIMATION);
  const [personLayer, setPersonLayer] = useState("front");
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState("");
  const [mediaPreview, setMediaPreview] = useState(null);
  const frameSize = FRAME_SIZES[frameOrientation];

  useEffect(() => {
    mediaPreviewRef.current = mediaPreview;
  }, [mediaPreview]);

  const showToast = useCallback((message) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2_600);
  }, []);

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
      const alpha = clamp((values[index] - 0.18) / 0.64, 0, 1);
      const offset = index * 4;
      imageData.data[offset] = 255;
      imageData.data[offset + 1] = 255;
      imageData.data[offset + 2] = 255;
      imageData.data[offset + 3] = Math.round(alpha * alpha * (3 - 2 * alpha) * 255);
    }

    maskContext.putImageData(imageData, 0, 0);
    maskReadyRef.current = true;
  }, []);

  const drawCaption = useCallback((context, targetWidth, targetHeight) => {
    const activeCaption = CAPTION_MODES[captionMode];
    const centerX = targetWidth / 2;
    const top = targetHeight < targetWidth ? 44 : 62;
    const labelFontSize = targetHeight < targetWidth ? 32 : 30;
    const numberFontSize = targetHeight < targetWidth ? 58 : 54;
    const gap = 8;
    const labelFont = `700 ${labelFontSize}px "Mohr Rounded", "PingFang SC", sans-serif`;
    const numberFont = `700 ${numberFontSize}px "Mohr Rounded", "PingFang SC", sans-serif`;

    context.save();
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.lineJoin = "round";

    context.font = labelFont;
    const prefixWidth = context.measureText(activeCaption.prefix).width;
    const suffixWidth = context.measureText(activeCaption.suffix).width;
    context.font = numberFont;
    const numberWidth = context.measureText(paddedDay).width;
    let cursorX = centerX - ((prefixWidth + numberWidth + suffixWidth + gap * 2) / 2);

    const drawLabel = (copy) => {
      context.font = labelFont;
      context.lineWidth = 10;
      context.strokeStyle = "rgba(20, 22, 15, 0.52)";
      context.strokeText(copy, cursorX, top);
      context.fillStyle = "#f8f8f1";
      context.fillText(copy, cursorX, top);
      cursorX += context.measureText(copy).width;
    };

    drawLabel(activeCaption.prefix);
    cursorX += gap;
    context.font = numberFont;
    context.lineWidth = captionMode === "streak" ? 7 : 11;
    context.strokeStyle = captionMode === "streak" ? "#fffdf8" : "rgba(20, 22, 15, 0.52)";
    context.strokeText(paddedDay, cursorX, top);
    context.fillStyle = captionMode === "streak" ? "#ef3f37" : "#d5ff4c";
    context.fillText(paddedDay, cursorX, top);
    cursorX += numberWidth + gap;
    drawLabel(activeCaption.suffix);
    context.restore();
  }, [captionMode, paddedDay]);

  const renderFrame = useCallback((includeCaption = recordingRef.current) => {
    const video = videoRef.current;
    const outputCanvas = outputCanvasRef.current;
    const riveCanvas = riveCanvasRef.current;
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
      foregroundContext.globalCompositeOperation = "destination-in";
      foregroundContext.imageSmoothingEnabled = true;
      foregroundContext.drawImage(maskCanvas, rect.x, rect.y, rect.width, rect.height);
      foregroundContext.globalCompositeOperation = "source-over";
      drawMirrored(outputContext, foregroundCanvas, {
        x: 0,
        y: 0,
        width: targetWidth,
        height: targetHeight,
      }, targetWidth);
    };

    if (personLayer === "behind") drawPerson();

    if (riveReady && riveCanvas?.width && riveCanvas?.height) {
      const riveHeight = targetHeight * RIVE_SCALE;
      const riveWidth = riveHeight * (RIVE_SOURCE_SIZE.width / RIVE_SOURCE_SIZE.height);
      outputContext.drawImage(riveCanvas, 0, targetHeight - riveHeight, riveWidth, riveHeight);
    }

    if (personLayer === "front") drawPerson();

    if (includeCaption) drawCaption(outputContext, targetWidth, targetHeight);
  }, [drawCaption, personLayer, riveReady]);

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

        setLoadProgress(84);
        setEngineMessage("正在唤醒叫叫");

        const prepareRive = new Promise((resolve) => {
          const instance = new Rive({
            buffer: riveBuffer,
            canvas: riveCanvasRef.current,
            autoplay: false,
            autoBind: true,
            layout: new Layout({ fit: Fit.Cover, alignment: Alignment.BottomLeft }),
            onLoad: () => {
              if (cancelled) return;
              const animations = instance.animationNames || [];
              const talkingAnimations = animations.filter((name) => (
                name.startsWith("TalkingEmotion") && !name.endsWith("表情")
              ));
              const animationOrder = [...new Set([
                DEFAULT_RIVE_ANIMATION,
                SECOND_RIVE_ANIMATION,
                ...talkingAnimations,
              ])].filter((name) => animations.includes(name));
              riveAnimationsRef.current = animationOrder;
              riveAnimationIndexRef.current = 0;

              const playAtIndex = (index) => {
                const availableAnimations = riveAnimationsRef.current;
                if (!availableAnimations.length) return;
                const normalizedIndex = (index + availableAnimations.length) % availableAnimations.length;
                const nextAnimation = availableAnimations[normalizedIndex];
                instance.stop();
                instance.play(nextAnimation);
                riveAnimationIndexRef.current = normalizedIndex;
                setRiveAnimationName(nextAnimation);
              };

              const playRandom = () => {
                const availableAnimations = riveAnimationsRef.current;
                if (!availableAnimations.length) return;
                const offset = availableAnimations.length > 1
                  ? Math.floor(Math.random() * (availableAnimations.length - 1)) + 1
                  : 0;
                playAtIndex(riveAnimationIndexRef.current + offset);
              };

              rivePlayRandomRef.current = playRandom;
              playAtIndex(0);
              if (riveShuffleIntervalRef.current) window.clearInterval(riveShuffleIntervalRef.current);
              riveShuffleIntervalRef.current = window.setInterval(playRandom, RIVE_RANDOM_INTERVAL_MS);
              setRiveReady(true);
              setLoadProgress((value) => Math.max(value, 92));
              resolve(true);
            },
            onLoadError: () => resolve(false),
          });
          riveRef.current = instance;
        });

        const prepareSegmenter = (async () => {
          try {
            const vision = await FilesetResolver.forVisionTasks(`${BASE_URL}mediapipe/wasm`);
            if (cancelled) return false;
            const segmenter = await ImageSegmenter.createFromOptions(vision, {
              baseOptions: {
                modelAssetBuffer: new Uint8Array(modelBuffer),
                delegate: "CPU",
              },
              runningMode: "VIDEO",
              outputConfidenceMasks: true,
              outputCategoryMask: false,
            });
            if (cancelled) {
              segmenter.close();
              return false;
            }
            segmenterRef.current = segmenter;
            setSegmenterReady(true);
            setLoadProgress((value) => Math.max(value, 97));
            return true;
          } catch (error) {
            console.warn("Person segmentation unavailable", error);
            return false;
          }
        })();

        const [riveLoaded, segmenterLoaded] = await Promise.all([prepareRive, prepareSegmenter]);
        if (cancelled) return;
        if (!riveLoaded) throw new Error("Rive failed to initialize");
        setLoadProgress(100);
        setEngineState("ready");
        setEngineMessage(segmenterLoaded ? "叫叫和人像识别都准备好了" : "叫叫准备好了，人像识别稍后重试");
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
      if (riveShuffleIntervalRef.current) {
        window.clearInterval(riveShuffleIntervalRef.current);
        riveShuffleIntervalRef.current = null;
      }
      riveRef.current?.cleanup();
      riveRef.current = null;
      rivePlayRandomRef.current = null;
      segmenterRef.current?.close();
      segmenterRef.current = null;
    };
  }, []);

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
        renderFrame();
      }
      frameRef.current = window.requestAnimationFrame(loop);
    };

    frameRef.current = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [cameraState, renderFrame, updateMask]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (recordingIntervalRef.current) window.clearInterval(recordingIntervalRef.current);
    if (riveShuffleIntervalRef.current) window.clearInterval(riveShuffleIntervalRef.current);
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    if (autoStopTimerRef.current) window.clearTimeout(autoStopTimerRef.current);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (mediaPreviewRef.current?.url) URL.revokeObjectURL(mediaPreviewRef.current.url);
  }, []);

  const openCamera = useCallback(async (nextFacingMode = facingMode) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      setCameraError("当前浏览器不支持相机，请用最新版 Safari 或 Chrome 打开");
      return;
    }

    setCameraState("opening");
    setCameraError("");
    maskReadyRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: nextFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setFacingMode(nextFacingMode);
      setCameraState("ready");
      if (!segmenterReady) showToast("相机已打开，人像识别还在准备");
    } catch (error) {
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
  }, [facingMode, segmenterReady, showToast]);

  const switchCamera = useCallback(() => {
    if (recordingRef.current) return;
    openCamera(facingMode === "user" ? "environment" : "user");
  }, [facingMode, openCamera]);

  const switchFrameOrientation = useCallback(() => {
    if (recordingRef.current) return;
    setFrameOrientation((current) => {
      const next = current === "portrait" ? "landscape" : "portrait";
      showToast(next === "landscape" ? "已旋转为全屏横屏" : "已切换为竖屏");
      return next;
    });
  }, [showToast]);

  const switchRiveAnimation = useCallback(() => {
    if (!rivePlayRandomRef.current) return;
    rivePlayRandomRef.current();
    showToast("叫叫换了一个动作");
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
    renderFrame(true);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 170);

    canvas.toBlob((blob) => {
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
  }, []);

  const startRecording = useCallback(() => {
    const canvas = outputCanvasRef.current;
    const mimeType = chooseRecordingMimeType();
    if (!canvas?.captureStream || !window.MediaRecorder || !mimeType) {
      showToast("当前浏览器暂不支持网页录像，可以先拍照");
      return;
    }

    try {
      const stream = canvas.captureStream(30);
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
      stopRecording();
    } else if (!longPressTriggeredRef.current) {
      takePhoto();
    }
  }, [stopRecording, takePhoto]);

  const onShutterPointerCancel = useCallback(() => {
    pointerDownRef.current = false;
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

  return (
    <main className={`app-shell is-${frameOrientation}`}>
      <section
        className={`camera-stage is-${frameOrientation} ${cameraState === "ready" ? "is-live" : ""}`}
        data-frame-orientation={frameOrientation}
        data-rive-animation={riveAnimationName}
        data-person-layer={personLayer}
        data-reading-day={day}
        data-caption-mode={captionMode}
        aria-label="和叫叫合拍相机"
      >
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
            aria-label={`切换叫叫动作，当前 ${riveAnimationName}`}
          />
        )}

        {cameraState === "ready" && (
          <>
            <button
              className={`live-caption is-${captionMode} ${recording ? "is-canvas-rendered" : ""}`}
              type="button"
              disabled={recording}
              onClick={switchCaption}
              aria-label={`${getCaptionText(captionMode, day)}，点击切换字幕和数值`}
            >
              <span>{caption.prefix}</span>
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
            </button>

            <div className="top-controls">
              <button
                className={`person-status ${segmenterReady ? "is-ready" : ""} ${personLayer === "behind" ? "is-behind" : ""}`}
                type="button"
                disabled={!segmenterReady}
                aria-pressed={personLayer === "front"}
                aria-label={`切换人像图层，当前人像在叫叫${personLayer === "front" ? "前面" : "后面"}`}
                onClick={togglePersonLayer}
              >
                <Sparkle size={15} weight="fill" />
                <span>{segmenterReady ? `人像在${personLayer === "front" ? "前" : "后"}` : "正在识别人像"}</span>
              </button>
              <div className="camera-actions">
                <button
                  className={`round-control ${frameOrientation === "landscape" ? "is-active" : ""}`}
                  type="button"
                  disabled={recording}
                  onClick={switchFrameOrientation}
                  aria-label={frameOrientation === "portrait" ? "切换为横屏" : "切换为竖屏"}
                >
                  <DeviceRotate size={22} weight="bold" />
                </button>
                <button className="round-control" type="button" disabled={recording} onClick={switchCamera} aria-label="切换前后摄像头">
                  <ArrowClockwise size={22} weight="bold" />
                </button>
              </div>
            </div>

            {engineState === "loading" && (
              <div className="live-loading" role="progressbar" aria-label="合拍素材加载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow={loadProgress}>
                <span>叫叫正在到场</span>
                <strong>{loadProgress}%</strong>
                <i><b style={{ transform: `scaleX(${loadProgress / 100})` }} /></i>
              </div>
            )}

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
          </>
        )}

        {cameraState !== "ready" && (
          <div className="welcome-panel">
            <div className="welcome-brand" aria-hidden="true">
              <span className="brand-dot" />
              JOCAM
            </div>
            <div className="welcome-copy">
              <span className="welcome-icon"><Camera size={30} weight="fill" /></span>
              <h1>和叫叫，拍一张<br />会动的阅读合照</h1>
              <p>相机在透明区域里，人像会站到叫叫前面。</p>
            </div>

            {cameraState === "error" && <p className="camera-error" role="alert">{cameraError}</p>}

            <button
              className="open-camera-button"
              type="button"
              disabled={!readyForCamera || cameraState === "opening"}
              onClick={() => openCamera("user")}
            >
              {cameraState === "opening" ? (
                <><span className="button-loader" />正在打开相机</>
              ) : (
                <><Camera size={21} weight="fill" />{cameraState === "error" ? "重新打开相机" : "打开相机"}</>
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
            <p className="privacy-note"><LockSimple size={14} weight="fill" />画面只在这台设备里合成，不会上传</p>
          </div>
        )}

        {flash && <div className="camera-flash" aria-hidden="true" />}

        {toast && <div className="camera-toast" role="status">{toast}</div>}

        {mediaPreview && (
          <div className="media-preview" role="dialog" aria-modal="true" aria-label={mediaPreview.type === "photo" ? "照片预览" : "录像预览"}>
            <button className="preview-close" type="button" onClick={closePreview} aria-label="关闭预览">
              <X size={22} weight="bold" />
            </button>
            <div className="preview-media-wrap">
              {mediaPreview.type === "photo" ? (
                <img
                  src={mediaPreview.url}
                  alt={getCaptionText(mediaPreview.captionMode || captionMode, mediaPreview.day || paddedDay)}
                />
              ) : (
                <video src={mediaPreview.url} playsInline controls autoPlay loop />
              )}
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

      <aside className="desktop-note" aria-hidden="true">
        <span className="desktop-kicker">JOCAM / 叫叫合拍</span>
        <h2>把阅读的每一天，留在同一个镜头里。</h2>
        <div className="desktop-features">
          <span><Sparkle size={18} weight="fill" />实时人像前景</span>
          <span><Camera size={18} weight="fill" />轻点拍照</span>
          <span><VideoCamera size={18} weight="fill" />按住录像</span>
        </div>
      </aside>
    </main>
  );
}

export default App;

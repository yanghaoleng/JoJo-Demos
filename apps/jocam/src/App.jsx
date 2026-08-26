import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  Camera,
  Check,
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
const OUTPUT_WIDTH = 720;
const OUTPUT_HEIGHT = 1280;
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

function getReadingDay() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = Number.parseInt(params.get("day") || "", 10);
  if (Number.isFinite(fromUrl) && fromUrl > 0) return clamp(fromUrl, 1, 999);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let startedAt = today.getTime();

  try {
    const saved = Number.parseInt(localStorage.getItem("jocam-reading-start") || "", 10);
    if (Number.isFinite(saved) && saved > 0) {
      startedAt = saved;
    } else {
      localStorage.setItem("jocam-reading-start", String(startedAt));
    }
  } catch {
    // Private browsing may deny storage. Day one is still a useful default.
  }

  return clamp(Math.floor((today.getTime() - startedAt) / 86_400_000) + 1, 1, 999);
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

function drawMirrored(context, source, rect) {
  context.save();
  context.translate(OUTPUT_WIDTH, 0);
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
  const day = useMemo(getReadingDay, []);
  const paddedDay = String(day).padStart(2, "0");

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
  const recordingIntervalRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const pointerDownRef = useRef(false);
  const longPressTriggeredRef = useRef(false);
  const autoStopTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const mediaPreviewRef = useRef(null);

  const [engineState, setEngineState] = useState("loading");
  const [engineMessage, setEngineMessage] = useState("正在准备叫叫");
  const [loadProgress, setLoadProgress] = useState(2);
  const [riveReady, setRiveReady] = useState(false);
  const [segmenterReady, setSegmenterReady] = useState(false);
  const [cameraState, setCameraState] = useState("idle");
  const [cameraError, setCameraError] = useState("");
  const [facingMode, setFacingMode] = useState("user");
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState("");
  const [mediaPreview, setMediaPreview] = useState(null);

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

  const drawCaption = useCallback((context) => {
    const centerX = OUTPUT_WIDTH / 2;
    const top = 62;
    const copy = `我和叫叫一起阅读的第 ${paddedDay} 天`;

    context.save();
    context.font = '700 36px "Mohr Rounded", "PingFang SC", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineWidth = 12;
    context.strokeStyle = "rgba(20, 22, 15, 0.48)";
    context.strokeText(copy, centerX, top);
    context.fillStyle = "#f8f8f1";
    context.fillText(copy, centerX, top);
    context.restore();
  }, [paddedDay]);

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
    const rect = getCoverRect(sourceWidth, sourceHeight, OUTPUT_WIDTH, OUTPUT_HEIGHT);

    outputContext.fillStyle = "#181b14";
    outputContext.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    drawMirrored(outputContext, video, rect);

    if (riveReady && riveCanvas?.width && riveCanvas?.height) {
      outputContext.drawImage(riveCanvas, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    }

    if (maskReadyRef.current && maskCanvas?.width && maskCanvas?.height) {
      foregroundContext.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      foregroundContext.globalCompositeOperation = "source-over";
      foregroundContext.drawImage(video, rect.x, rect.y, rect.width, rect.height);
      foregroundContext.globalCompositeOperation = "destination-in";
      foregroundContext.imageSmoothingEnabled = true;
      foregroundContext.drawImage(maskCanvas, rect.x, rect.y, rect.width, rect.height);
      foregroundContext.globalCompositeOperation = "source-over";
      drawMirrored(outputContext, foregroundCanvas, {
        x: 0,
        y: 0,
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
      });
    }

    if (includeCaption) drawCaption(outputContext);
  }, [drawCaption, riveReady]);

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
            autoplay: true,
            autoBind: true,
            layout: new Layout({ fit: Fit.Cover, alignment: Alignment.Center }),
            onLoad: () => {
              if (cancelled) return;
              const stateMachines = instance.stateMachineNames || [];
              const animations = instance.animationNames || [];
              if (stateMachines.length) instance.play(stateMachines[0]);
              else if (animations.length) instance.play(animations);
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
      riveRef.current?.cleanup();
      riveRef.current = null;
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
        return { type: "photo", blob, url: URL.createObjectURL(blob) };
      });
    }, "image/jpeg", 0.94);
  }, [cameraState, renderFrame, showToast]);

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
          return { type: "video", blob, url: URL.createObjectURL(blob) };
        });
      };

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
  }, [showToast, stopRecording]);

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
    const extension = mediaPreview.type === "photo" ? "jpg" : getFileExtension(mediaPreview.blob.type);
    await saveBlob(
      mediaPreview.blob,
      `我和叫叫-第${paddedDay}天-${getTimestamp()}.${extension}`,
      `我和叫叫一起阅读的第 ${paddedDay} 天`,
    );
  }, [mediaPreview, paddedDay]);

  const formattedRecordingTime = `${String(Math.floor(recordingTime / 1000)).padStart(2, "0")}.${Math.floor((recordingTime % 1000) / 100)}`;
  const readyForCamera = engineState !== "error";

  return (
    <main className="app-shell">
      <section className={`camera-stage ${cameraState === "ready" ? "is-live" : ""}`} aria-label="和叫叫合拍相机">
        <video ref={videoRef} className="camera-source" playsInline muted aria-hidden="true" />
        <canvas ref={riveCanvasRef} className="rive-source" width={OUTPUT_WIDTH} height={OUTPUT_HEIGHT} aria-hidden="true" />
        <canvas ref={foregroundCanvasRef} className="render-source" width={OUTPUT_WIDTH} height={OUTPUT_HEIGHT} aria-hidden="true" />
        <canvas ref={maskCanvasRef} className="render-source" width="256" height="256" aria-hidden="true" />
        <canvas ref={outputCanvasRef} className="camera-output" width={OUTPUT_WIDTH} height={OUTPUT_HEIGHT} aria-label="实时合拍画面" />

        {cameraState === "ready" && (
          <>
            <div className={`live-caption ${recording ? "is-canvas-rendered" : ""}`}>
              <span>我和叫叫一起阅读的第</span>
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
              <span>天</span>
            </div>

            <div className="top-controls">
              <div className={`person-status ${segmenterReady ? "is-ready" : ""}`} role="status">
                <Sparkle size={15} weight="fill" />
                <span>{segmenterReady ? "人像已在前景" : "正在识别人像"}</span>
              </div>
              <button className="round-control" type="button" onClick={switchCamera} aria-label="切换前后摄像头">
                <ArrowClockwise size={22} weight="bold" />
              </button>
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
                <img src={mediaPreview.url} alt={`我和叫叫一起阅读的第 ${paddedDay} 天`} />
              ) : (
                <video src={mediaPreview.url} playsInline controls autoPlay loop />
              )}
            </div>
            <div className="preview-actions">
              <div>
                <strong>{mediaPreview.type === "photo" ? "这一刻拍好了" : "这一段录好了"}</strong>
                <span>我和叫叫 · 第 {paddedDay} 天</span>
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

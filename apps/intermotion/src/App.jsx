import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  Camera,
  CameraSlash,
  DownloadSimple,
  FilmSlate,
  LockSimple,
  Microphone,
  MicrophoneSlash,
  Play,
  Stop,
  WarningCircle,
} from "@phosphor-icons/react";
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

const BASE_URL = import.meta.env.BASE_URL;
const FILM_URL = `${BASE_URL}media/caminandes-llamigos-720p.mp4`;
const FILM_POSTER_URL = `${BASE_URL}media/caminandes-llamigos-poster.jpg`;
const MODEL_URL = `${BASE_URL}models/selfie_segmenter.tflite`;
const WASM_URL = `${BASE_URL}wasm`;
const OUTPUT_SIZE = { width: 1280, height: 720 };
const MASK_THRESHOLD = 0.55;
const MASK_FEATHER_PX = 3;
const SEGMENT_INTERVAL_MS = 90;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(value) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(safeValue / 60);
  const seconds = Math.floor(safeValue % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

function createFilmVideoElement(onMetadata) {
  const film = document.createElement("video");
  film.src = FILM_URL;
  film.preload = "auto";
  film.playsInline = true;
  if (onMetadata) {
    film.addEventListener(
      "loadedmetadata",
      () => onMetadata(film.duration || 0),
      {
        once: true,
      },
    );
  }
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

function drawAttribution(context) {
  context.save();
  context.font = "500 14px system-ui, sans-serif";
  context.textBaseline = "middle";
  const label = "Caminandes 3: Llamigos - Blender - CC BY 3.0";
  const width = context.measureText(label).width + 28;
  context.fillStyle = "rgba(18, 20, 18, 0.58)";
  context.beginPath();
  context.roundRect(18, OUTPUT_SIZE.height - 42, width, 28, 10);
  context.fill();
  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.fillText(label, 32, OUTPUT_SIZE.height - 28);
  context.restore();
}

function drawReactionOverlay(
  context,
  personCanvas,
  cameraVideo,
  personBounds,
  cameraEnabled,
) {
  if (!cameraEnabled) return;
  const source = personCanvas?.width ? personCanvas : cameraVideo;
  if (!source || (source === cameraVideo && cameraVideo.readyState < 2)) return;

  const bounds = personCanvas?.width
    ? personBounds
    : { left: 0.18, right: 0.82, top: 0.05, bottom: 1 };
  const sourceWidth = source.width || source.videoWidth;
  const sourceHeight = source.height || source.videoHeight;
  if (!sourceWidth || !sourceHeight) return;

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
  const x = OUTPUT_SIZE.width - targetWidth - 18;
  const y = OUTPUT_SIZE.height - targetHeight;

  context.save();
  context.translate(x + targetWidth, y);
  context.scale(-1, 1);
  context.filter = personCanvas?.width
    ? "drop-shadow(3px 0 0 rgba(255,255,255,.92)) drop-shadow(-3px 0 0 rgba(255,255,255,.92)) drop-shadow(0 3px 0 rgba(255,255,255,.92)) drop-shadow(0 -3px 0 rgba(255,255,255,.92)) drop-shadow(0 12px 18px rgba(18,20,18,.28))"
    : "drop-shadow(0 12px 18px rgba(18,20,18,.28))";
  context.drawImage(source, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
  context.restore();
}

function drawComposition(
  context,
  film,
  personCanvas,
  cameraVideo,
  personBounds,
  cameraEnabled,
) {
  drawFilmFrame(context, film);
  drawReactionOverlay(
    context,
    personCanvas,
    cameraVideo,
    personBounds,
    cameraEnabled,
  );
  drawAttribution(context);
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

function RecorderStage({
  phase,
  canvasRef,
  progress,
  currentTime,
  duration,
  cameraEnabled,
  microphoneEnabled,
  segmentationState,
  errorMessage,
  onStart,
  onStop,
  onToggleCamera,
  onToggleMicrophone,
}) {
  const isRecording = phase === "recording";
  const isBusy = phase === "starting" || phase === "processing";
  return (
    <main className="recorder-shell">
      <header className="topbar">
        <div className="title-lockup">
          <FilmSlate size={22} weight="duotone" aria-hidden="true" />
          <div>
            <strong>童趣反应视频</strong>
            <span>《Caminandes 3: Llamigos》</span>
          </div>
        </div>

        <div className={`recording-state ${isRecording ? "is-live" : ""}`}>
          <span className="recording-dot" aria-hidden="true" />
          {isRecording ? `正在录制 ${formatTime(currentTime)}` : "等待开始"}
        </div>

        {isRecording ? (
          <button className="stop-button" type="button" onClick={onStop}>
            <Stop size={17} weight="fill" aria-hidden="true" />
            结束录制
          </button>
        ) : (
          <span className="privacy-chip">
            <LockSimple size={16} weight="fill" aria-hidden="true" />
            本地生成
          </span>
        )}
      </header>

      <section className="stage-column" aria-label="反应视频拍摄区">
        <div className="video-stage">
          {phase === "idle" || phase === "error" ? (
            <img
              className="stage-poster"
              src={FILM_POSTER_URL}
              alt="Caminandes 动画中的羊驼和企鹅"
            />
          ) : null}
          <canvas
            ref={canvasRef}
            width={OUTPUT_SIZE.width}
            height={OUTPUT_SIZE.height}
          />
          <div className="stage-scrim" aria-hidden="true" />

          {(phase === "idle" || phase === "error") && (
            <div className="start-panel">
              {phase === "error" ? (
                <WarningCircle size={32} weight="duotone" aria-hidden="true" />
              ) : (
                <Play size={32} weight="fill" aria-hidden="true" />
              )}
              <h1>{phase === "error" ? "摄像头没有准备好" : "开始拍摄"}</h1>
              <p>
                {phase === "error"
                  ? errorMessage
                  : "允许摄像头和麦克风后，动画与孩子的反应会同时录制。"}
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={onStart}
              >
                <Camera size={20} weight="fill" aria-hidden="true" />
                {phase === "error" ? "重新授权" : "开始拍摄"}
              </button>
              <small>内容只在当前设备处理，不会自动上传。</small>
            </div>
          )}

          {phase === "starting" && (
            <div className="loading-panel" role="status">
              <span className="loading-ring" aria-hidden="true" />
              <strong>正在打开镜头</strong>
              <span>动画马上开始</span>
            </div>
          )}

          {isRecording && (
            <div className="stage-controls" aria-label="拍摄控制">
              <button
                type="button"
                className={!cameraEnabled ? "is-off" : ""}
                onClick={onToggleCamera}
                aria-label={cameraEnabled ? "关闭摄像头" : "打开摄像头"}
              >
                {cameraEnabled ? (
                  <Camera size={21} />
                ) : (
                  <CameraSlash size={21} />
                )}
              </button>
              <button
                type="button"
                className={!microphoneEnabled ? "is-off" : ""}
                onClick={onToggleMicrophone}
                aria-label={microphoneEnabled ? "关闭麦克风" : "打开麦克风"}
              >
                {microphoneEnabled ? (
                  <Microphone size={21} />
                ) : (
                  <MicrophoneSlash size={21} />
                )}
              </button>
            </div>
          )}

          {isRecording && (
            <div className="progress-track" aria-hidden="true">
              <span style={{ transform: `scaleX(${progress})` }} />
            </div>
          )}
        </div>

        <div className="stage-meta">
          <span>
            {segmentationState === "ready"
              ? `人像边缘羽化最多 ${MASK_FEATHER_PX}px`
              : segmentationState === "loading"
                ? "正在加载人像抠图"
                : "暂时使用原始镜头画面"}
          </span>
          <span>
            {duration > 0 ? `动画时长 ${formatTime(duration)}` : "正在读取动画"}
          </span>
          <a
            href="https://commons.wikimedia.org/wiki/File:Caminandes_3_-_Llamigos_-_Blender_Animated_Short.webm"
            target="_blank"
            rel="noreferrer"
          >
            Blender，CC BY 3.0
          </a>
        </div>
      </section>
    </main>
  );
}

function ResultView({ videoUrl, mimeType, onAgain }) {
  const extension = getFileExtension(mimeType);
  return (
    <main className="result-shell">
      <section className="result-card">
        <div className="result-video-wrap">
          <video src={videoUrl} controls playsInline autoPlay />
        </div>
        <div className="result-copy">
          <FilmSlate size={34} weight="duotone" aria-hidden="true" />
          <h1>反应视频已经生成</h1>
          <p>先看一遍，满意后保存到设备。文件仍然只在当前浏览器里。</p>
          <div className="result-actions">
            <a
              className="primary-button"
              href={videoUrl}
              download={`童趣反应视频.${extension}`}
            >
              <DownloadSimple size={20} weight="bold" aria-hidden="true" />
              保存视频
            </a>
            <button
              className="secondary-button"
              type="button"
              onClick={onAgain}
            >
              <ArrowCounterClockwise size={20} aria-hidden="true" />
              再拍一次
            </button>
          </div>
          <p className="license-note">
            动画：Blender《Caminandes 3: Llamigos》，使用 CC BY 3.0 授权。
          </p>
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
  const segmenterRef = useRef(null);
  const segmentingRef = useRef(false);
  const lastSegmentTimeRef = useRef(0);
  const personCanvasRef = useRef(document.createElement("canvas"));
  const maskCanvasRef = useRef(document.createElement("canvas"));
  const personBoundsRef = useRef({
    left: 0.18,
    right: 0.82,
    top: 0.05,
    bottom: 1,
  });
  const audioContextRef = useRef(null);
  const filmGainRef = useRef(null);
  const microphoneGainRef = useRef(null);
  const resultUrlRef = useRef("");
  const stoppingRef = useRef(false);
  const cameraEnabledRef = useRef(true);

  const [phase, setPhase] = useState("idle");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [segmentationState, setSegmentationState] = useState("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [recordingMimeType, setRecordingMimeType] = useState("video/webm");
  const [errorMessage, setErrorMessage] = useState("");

  const releaseMedia = useCallback(() => {
    cancelAnimationFrame(frameRequestRef.current);
    frameRequestRef.current = 0;
    userStreamRef.current?.getTracks().forEach((track) => track.stop());
    outputStreamRef.current?.getTracks().forEach((track) => track.stop());
    userStreamRef.current = null;
    outputStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    segmenterRef.current?.close();
    segmenterRef.current = null;
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

    if (maxX >= minX && maxY >= minY) {
      const nextBounds = {
        left: minX / confidenceMask.width,
        right: (maxX + 1) / confidenceMask.width,
        top: minY / confidenceMask.height,
        bottom: (maxY + 1) / confidenceMask.height,
      };
      const previous = personBoundsRef.current;
      personBoundsRef.current = {
        left: previous.left + (nextBounds.left - previous.left) * 0.22,
        right: previous.right + (nextBounds.right - previous.right) * 0.22,
        top: previous.top + (nextBounds.top - previous.top) * 0.22,
        bottom: previous.bottom + (nextBounds.bottom - previous.bottom) * 0.22,
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
          setSegmentationState("fallback");
        }
      }

      drawComposition(
        context,
        film,
        personCanvasRef.current,
        camera,
        personBoundsRef.current,
        cameraEnabledRef.current,
      );
      setCurrentTime((previous) =>
        Math.abs(previous - film.currentTime) > 0.12
          ? film.currentTime
          : previous,
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
    setCameraEnabled(true);
    setMicrophoneEnabled(true);
    setSegmentationState("loading");
    setCurrentTime(0);

    try {
      const film = filmVideoRef.current;
      const camera = cameraVideoRef.current;
      const canvas = canvasRef.current;
      if (!film || !camera || !canvas) throw new Error("拍摄画面没有准备好");

      const userStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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
          segmenterRef.current = segmenter;
          setSegmentationState("ready");
        })
        .catch(() => setSegmentationState("fallback"));

      film.currentTime = 0;
      film.volume = 1;
      film.muted = false;
      await film.play();
      setDuration(film.duration || 0);

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
      filmVideoRef.current = createFilmVideoElement(setDuration);
      stoppingRef.current = false;
      setSegmentationState("idle");
      setPhase("error");
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setErrorMessage("请允许浏览器使用摄像头和麦克风，然后再试一次。");
      } else {
        setErrorMessage(
          error instanceof Error ? error.message : "拍摄启动失败，请再试一次。",
        );
      }
    }
  }, [releaseMedia, startDrawLoop]);

  const toggleCamera = useCallback(() => {
    const nextValue = !cameraEnabledRef.current;
    cameraEnabledRef.current = nextValue;
    setCameraEnabled(nextValue);
    userStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = nextValue;
    });
  }, []);

  const toggleMicrophone = useCallback(() => {
    setMicrophoneEnabled((previous) => {
      const nextValue = !previous;
      if (microphoneGainRef.current)
        microphoneGainRef.current.gain.value = nextValue ? 1 : 0;
      return nextValue;
    });
  }, []);

  const recordAgain = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = "";
    }
    setVideoUrl("");
    setCurrentTime(0);
    setSegmentationState("idle");
    filmVideoRef.current = createFilmVideoElement(setDuration);
    setPhase("idle");
  }, []);

  useEffect(() => {
    const film = createFilmVideoElement(setDuration);
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
      progress={duration > 0 ? clamp(currentTime / duration, 0, 1) : 0}
      currentTime={currentTime}
      duration={duration}
      cameraEnabled={cameraEnabled}
      microphoneEnabled={microphoneEnabled}
      segmentationState={segmentationState}
      errorMessage={errorMessage}
      onStart={startRecording}
      onStop={stopRecording}
      onToggleCamera={toggleCamera}
      onToggleMicrophone={toggleMicrophone}
    />
  );
}

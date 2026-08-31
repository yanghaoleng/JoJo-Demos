import { fixWebmDuration } from "@fix-webm-duration/fix";

const TRANSITION_DURATION_MS = 460;
const TRANSITION_DURATION_SECONDS = TRANSITION_DURATION_MS / 1000;

export async function repairRecordedBlobDuration(blob, durationSeconds) {
  if (
    !blob?.type?.includes("webm") ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return blob;
  }
  return fixWebmDuration(blob, durationSeconds * 1000, { logger: false });
}

function waitForMediaEvent(media, eventName, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      media.removeEventListener(eventName, handleEvent);
      media.removeEventListener("error", handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("剪辑素材读取失败，请重新拍摄。"));
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("剪辑素材读取超时，请重新拍摄。"));
    }, timeoutMs);
    media.addEventListener(eventName, handleEvent, { once: true });
    media.addEventListener("error", handleError, { once: true });
  });
}

async function seekVideo(video, time) {
  if (Math.abs(video.currentTime - time) < 0.04 && video.readyState >= 2) {
    return;
  }
  const seeked = waitForMediaEvent(video, "seeked");
  video.currentTime = time;
  await seeked;
}

function drawVideoFrame(context, video) {
  const { width, height } = context.canvas;
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  if (video.readyState < 2) return;
  context.drawImage(video, 0, 0, width, height);
}

async function drawWipeTransition(
  context,
  previousFrame,
  video,
  onProgress,
) {
  const { width, height } = context.canvas;
  const startedAt = performance.now();
  await new Promise((resolve) => {
    const draw = (timestamp) => {
      const progress = Math.min(
        1,
        (timestamp - startedAt) / TRANSITION_DURATION_MS,
      );
      onProgress(progress);
      const eased = 1 - (1 - progress) ** 3;
      const revealX = width * eased;
      const slant = Math.min(width * 0.12, 92);

      context.drawImage(previousFrame, 0, 0, width, height);
      context.save();
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(Math.min(width, revealX + slant), 0);
      context.lineTo(Math.max(0, revealX - slant), height);
      context.lineTo(0, height);
      context.closePath();
      context.clip();
      drawVideoFrame(context, video);
      context.restore();

      if (progress >= 1) resolve();
      else requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
}

async function playRange(
  context,
  video,
  range,
  audioContext,
  gain,
  onProgress,
) {
  const duration = Math.max(0.08, range.end - range.start);
  const now = audioContext.currentTime;
  const fadeDuration = Math.min(0.09, duration / 3);
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + fadeDuration);
  gain.gain.setValueAtTime(1, now + Math.max(fadeDuration, duration - 0.1));
  gain.gain.linearRampToValueAtTime(0, now + duration);

  await video.play();
  await new Promise((resolve) => {
    const draw = () => {
      drawVideoFrame(context, video);
      onProgress(
        Math.min(1, Math.max(0, (video.currentTime - range.start) / duration)),
      );
      if (video.currentTime >= range.end || video.ended) {
        video.pause();
        drawVideoFrame(context, video);
        resolve();
        return;
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
}

export function getMontageTimelineDuration(ranges) {
  const clipDuration = ranges.reduce(
    (total, range) => total + Math.max(0, range.end - range.start),
    0,
  );
  return (
    clipDuration +
    Math.max(0, ranges.length - 1) * TRANSITION_DURATION_SECONDS
  );
}

async function verifyPlayableBlob(blob, expectedDurationSeconds) {
  const previewUrl = URL.createObjectURL(blob);
  const preview = document.createElement("video");
  preview.preload = "auto";
  preview.playsInline = true;
  preview.muted = true;
  preview.src = previewUrl;
  preview.style.cssText =
    "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:.001;pointer-events:none";
  document.body.appendChild(preview);
  preview.load();

  try {
    if (preview.readyState < 1) {
      await waitForMediaEvent(preview, "loadedmetadata");
    }
    const duration = preview.duration;
    const minimumDuration = Math.min(0.2, expectedDurationSeconds * 0.45);
    const maximumDuration = expectedDurationSeconds * 2.2 + 2;
    if (
      !Number.isFinite(duration) ||
      duration < minimumDuration ||
      duration > maximumDuration
    ) {
      throw new Error("成片时间轴异常，请重新拍摄。");
    }

    if (duration >= 0.45) {
      await preview.play();
      await new Promise((resolve) => window.setTimeout(resolve, 520));
      if (preview.currentTime < 0.08) {
        throw new Error("成片画面无法播放，请重新拍摄。");
      }
    }
  } finally {
    preview.pause();
    preview.removeAttribute("src");
    preview.load();
    preview.remove();
    URL.revokeObjectURL(previewUrl);
  }
}

export async function createEmotionMontage({
  sourceBlob,
  ranges,
  canvas,
  mimeType,
  audioContext,
  sourceDuration,
  onProgress = () => {},
}) {
  if (!ranges.length) {
    throw new Error("没有检测到明显的情绪互动，请重新拍摄。");
  }
  if (!audioContext || audioContext.state === "closed") {
    throw new Error("音频剪辑没有准备好，请重新拍摄。");
  }

  onProgress({ progress: 0.01, label: "修复录制时间轴" });
  const normalizedSourceBlob = await repairRecordedBlobDuration(
    sourceBlob,
    sourceDuration,
  );
  const sourceUrl = URL.createObjectURL(normalizedSourceBlob);
  const video = document.createElement("video");
  video.preload = "auto";
  video.playsInline = true;
  video.src = sourceUrl;
  video.load();

  let outputStream = null;
  let recorder = null;
  try {
    onProgress({ progress: 0.02, label: "读取录制内容" });
    if (video.readyState < 1) await waitForMediaEvent(video, "loadedmetadata");
    if (audioContext.state === "suspended") await audioContext.resume();

    const mediaDuration = Number.isFinite(video.duration)
      ? video.duration
      : sourceDuration;
    if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) {
      throw new Error("录制内容的时长异常，请重新拍摄。");
    }

    const safeRanges = ranges
      .map((range) => ({
        start: Math.max(0, Math.min(mediaDuration, range.start)),
        end: Math.max(0, Math.min(mediaDuration, range.end)),
      }))
      .filter((range) => range.end - range.start >= 0.2);
    if (!safeRanges.length) {
      throw new Error("没有检测到可以剪辑的情绪片段，请重新拍摄。");
    }

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("视频剪辑画布没有准备好。");

    const source = audioContext.createMediaElementSource(video);
    const gain = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();
    source.connect(gain);
    gain.connect(destination);

    const canvasStream = canvas.captureStream(30);
    outputStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
    const supportedMimeType = MediaRecorder.isTypeSupported(mimeType)
      ? mimeType
      : "";
    recorder = new MediaRecorder(outputStream, {
      ...(supportedMimeType ? { mimeType: supportedMimeType } : {}),
      videoBitsPerSecond: 4_000_000,
      audioBitsPerSecond: 160_000,
    });
    const actualMimeType =
      recorder.mimeType || supportedMimeType || "video/webm";
    const expectedDuration = getMontageTimelineDuration(safeRanges);
    const chunks = [];
    let recordedDurationMs = 0;
    const recording = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error("情绪片段剪辑失败，请重试。"));
      recorder.onstop = async () => {
        try {
          const rawBlob = new Blob(chunks, { type: actualMimeType });
          if (!rawBlob.size) {
            throw new Error("情绪片段剪辑失败，请重试。");
          }
          onProgress({ progress: 0.96, label: "修复成片时间轴" });
          const blob = actualMimeType.includes("webm")
            ? await fixWebmDuration(rawBlob, recordedDurationMs, {
                logger: false,
              })
            : rawBlob;
          onProgress({ progress: 0.985, label: "校验成片" });
          await verifyPlayableBlob(blob, recordedDurationMs / 1000);
          onProgress({ progress: 1, label: "成片完成" });
          resolve({ blob, mimeType: actualMimeType });
        } catch (error) {
          reject(error);
        }
      };
    });

    await seekVideo(video, safeRanges[0].start);
    drawVideoFrame(context, video);
    recorder.start();
    const recordingStartedAt = performance.now();
    const totalTimelineDuration = Math.max(0.1, expectedDuration);
    let completedTimelineDuration = 0;
    onProgress({ progress: 0.06, label: "剪辑情绪片段" });

    for (let index = 0; index < safeRanges.length; index += 1) {
      const range = safeRanges[index];
      if (index > 0) {
        const previousFrame = document.createElement("canvas");
        previousFrame.width = canvas.width;
        previousFrame.height = canvas.height;
        previousFrame.getContext("2d")?.drawImage(canvas, 0, 0);
        await seekVideo(video, range.start);
        await drawWipeTransition(context, previousFrame, video, (progress) => {
          onProgress({
            progress:
              0.06 +
              0.86 *
                ((completedTimelineDuration +
                  progress * TRANSITION_DURATION_SECONDS) /
                  totalTimelineDuration),
            label: "加入划变转场",
          });
        });
        completedTimelineDuration += TRANSITION_DURATION_SECONDS;
      }
      const rangeDuration = Math.max(0, range.end - range.start);
      await playRange(
        context,
        video,
        range,
        audioContext,
        gain,
        (progress) => {
          onProgress({
            progress:
              0.06 +
              0.86 *
                ((completedTimelineDuration + progress * rangeDuration) /
                  totalTimelineDuration),
            label: `剪辑第 ${index + 1}/${safeRanges.length} 段`,
          });
        },
      );
      completedTimelineDuration += rangeDuration;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 120));
    recordedDurationMs = performance.now() - recordingStartedAt;
    recorder.stop();
    return await recording;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    outputStream?.getTracks().forEach((track) => track.stop());
    if (recorder?.state === "recording") recorder.stop();
    URL.revokeObjectURL(sourceUrl);
  }
}

const TRANSITION_DURATION_MS = 460;

function waitForMediaEvent(media, eventName) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
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

async function drawWipeTransition(context, previousFrame, video) {
  const { width, height } = context.canvas;
  const startedAt = performance.now();
  await new Promise((resolve) => {
    const draw = (timestamp) => {
      const progress = Math.min(
        1,
        (timestamp - startedAt) / TRANSITION_DURATION_MS,
      );
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

async function playRange(context, video, range, audioContext, gain) {
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

export async function createEmotionMontage({
  sourceBlob,
  ranges,
  width,
  height,
  mimeType,
  audioContext,
}) {
  if (!ranges.length) {
    throw new Error("没有检测到明显的情绪互动，请重新拍摄。");
  }
  if (!audioContext || audioContext.state === "closed") {
    throw new Error("音频剪辑没有准备好，请重新拍摄。");
  }

  const sourceUrl = URL.createObjectURL(sourceBlob);
  const video = document.createElement("video");
  video.preload = "auto";
  video.playsInline = true;
  video.src = sourceUrl;
  video.load();

  let outputStream = null;
  let recorder = null;
  try {
    if (video.readyState < 1) await waitForMediaEvent(video, "loadedmetadata");
    if (audioContext.state === "suspended") await audioContext.resume();

    const safeRanges = ranges
      .map((range) => ({
        start: Math.max(0, Math.min(video.duration, range.start)),
        end: Math.max(0, Math.min(video.duration, range.end)),
      }))
      .filter((range) => range.end - range.start >= 0.2);
    if (!safeRanges.length) {
      throw new Error("没有检测到可以剪辑的情绪片段，请重新拍摄。");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
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
    const chunks = [];
    const recording = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error("情绪片段剪辑失败，请重试。"));
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: actualMimeType });
        if (!blob.size) reject(new Error("情绪片段剪辑失败，请重试。"));
        else resolve({ blob, mimeType: actualMimeType });
      };
    });

    await seekVideo(video, safeRanges[0].start);
    drawVideoFrame(context, video);
    recorder.start(500);

    for (let index = 0; index < safeRanges.length; index += 1) {
      const range = safeRanges[index];
      if (index > 0) {
        const previousFrame = document.createElement("canvas");
        previousFrame.width = width;
        previousFrame.height = height;
        previousFrame.getContext("2d")?.drawImage(canvas, 0, 0);
        await seekVideo(video, range.start);
        await drawWipeTransition(context, previousFrame, video);
      }
      await playRange(context, video, range, audioContext, gain);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 120));
    recorder.requestData?.();
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

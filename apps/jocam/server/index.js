import http from "node:http";
import { WebSocketServer } from "ws";
import { getArkConfig, inferJiaojiaoAction } from "./ark-command.js";
import { getVolcAsrConfig, VolcAsrSession } from "./volc-asr.js";

const PORT = Number(process.env.PORT || 8787);
const MAX_SESSION_MS = Number(process.env.JOCAM_MAX_SESSION_MS || 5 * 60_000);
const MAX_CONNECTIONS_PER_IP = Number(process.env.JOCAM_MAX_CONNECTIONS_PER_IP || 2);
const allowedOrigins = new Set((process.env.JOCAM_ALLOWED_ORIGINS || [
  "https://mikeywa.site",
  "https://www.mikeywa.site",
  "https://rive.mikeywa.site",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].join(",")).split(",").map((value) => value.trim()).filter(Boolean));

let asrConfig;
let arkConfig;
try {
  asrConfig = getVolcAsrConfig();
  arkConfig = getArkConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const activeByIp = new Map();
const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ok: true, service: "jocam-voice" }));
    return;
  }
  response.writeHead(404);
  response.end();
});
const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });

function sendJson(socket, payload) {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload));
}

server.on("upgrade", (request, socket, head) => {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  const origin = request.headers.origin || "";
  const ip = String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown").split(",")[0].trim();
  if (!path.endsWith("/voice") || !allowedOrigins.has(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  if ((activeByIp.get(ip) || 0) >= MAX_CONNECTIONS_PER_IP) {
    socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  websocketServer.handleUpgrade(request, socket, head, (client) => {
    client.clientIp = ip;
    websocketServer.emit("connection", client, request);
  });
});

websocketServer.on("connection", (client) => {
  const ip = client.clientIp;
  activeByIp.set(ip, (activeByIp.get(ip) || 0) + 1);
  let asr = null;
  let started = false;
  let closed = false;
  let inferenceRunning = false;
  let queuedTranscript = "";
  let lastInferenceAt = 0;

  const runInference = async (text) => {
    if (!text) return;
    if (inferenceRunning || Date.now() - lastInferenceAt < 1_200) {
      queuedTranscript = text;
      return;
    }
    inferenceRunning = true;
    lastInferenceAt = Date.now();
    try {
      sendJson(client, { type: "ai", state: "thinking" });
      const action = await inferJiaojiaoAction(text, arkConfig, (delta) => {
        sendJson(client, { type: "ai", state: "streaming", delta: String(delta).slice(0, 80) });
      });
      if (action) sendJson(client, { type: "action", action });
      sendJson(client, { type: "ai", state: "idle" });
    } catch (error) {
      console.error("Ark inference failed", { name: error.name, message: error.message });
      sendJson(client, { type: "ai", state: "unavailable" });
    } finally {
      inferenceRunning = false;
      if (queuedTranscript) {
        const next = queuedTranscript;
        queuedTranscript = "";
        setTimeout(() => runInference(next), 1_250).unref();
      }
    }
  };

  const endSession = () => {
    if (closed) return;
    closed = true;
    asr?.close();
    activeByIp.set(ip, Math.max(0, (activeByIp.get(ip) || 1) - 1));
    if (!activeByIp.get(ip)) activeByIp.delete(ip);
  };

  const hardStop = setTimeout(() => {
    sendJson(client, { type: "error", code: "SESSION_LIMIT", message: "语音会话已达到时长上限" });
    client.close(1000);
  }, MAX_SESSION_MS);
  hardStop.unref();

  client.on("message", async (data, isBinary) => {
    if (isBinary) {
      asr?.sendAudio(data);
      return;
    }
    let message;
    try {
      message = JSON.parse(data.toString("utf8"));
    } catch {
      return;
    }
    if (message.type !== "start" || started) return;
    started = true;
    asr = new VolcAsrSession({
      config: asrConfig,
      onReady: () => sendJson(client, { type: "ready" }),
      onTranscript: (transcript) => {
        sendJson(client, { type: "transcript", ...transcript });
        if (transcript.final) runInference(transcript.text);
      },
      onError: (error) => {
        console.error("ASR session failed", { name: error.name, message: error.message });
        sendJson(client, { type: "error", code: "ASR_UNAVAILABLE", message: "语音识别暂时不可用" });
      },
    });
    try {
      await asr.connect();
    } catch {
      client.close(1011);
    }
  });

  client.once("close", () => {
    clearTimeout(hardStop);
    endSession();
  });
  client.once("error", endSession);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`JOCAM voice bridge listening on 127.0.0.1:${PORT}`);
});

function shutdown() {
  websocketServer.clients.forEach((client) => client.close(1001));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

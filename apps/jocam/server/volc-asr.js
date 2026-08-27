import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import WebSocket from "ws";

const MESSAGE_FULL_CLIENT_REQUEST = 0x1;
const MESSAGE_AUDIO_ONLY_REQUEST = 0x2;
const MESSAGE_FULL_SERVER_RESPONSE = 0x9;
const MESSAGE_ERROR = 0xf;
const FLAG_SEQUENCE = 0x1;
const FLAG_FINAL = 0x2;
const SERIALIZATION_NONE = 0x0;
const SERIALIZATION_JSON = 0x1;
const COMPRESSION_GZIP = 0x1;

function buildFrame(messageType, flags, payload, serialization) {
  const compressed = gzipSync(payload);
  const header = Buffer.alloc(8);
  header[0] = 0x11;
  header[1] = (messageType << 4) | flags;
  header[2] = (serialization << 4) | COMPRESSION_GZIP;
  header[3] = 0;
  header.writeUInt32BE(compressed.length, 4);
  return Buffer.concat([header, compressed]);
}

function parseServerFrame(input) {
  const frame = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (frame.length < 8) throw new Error("Volcengine returned a truncated frame");

  const headerLength = (frame[0] & 0x0f) * 4;
  const messageType = frame[1] >> 4;
  const flags = frame[1] & 0x0f;
  const serialization = frame[2] >> 4;
  const compression = frame[2] & 0x0f;
  let offset = headerLength;
  if (flags & FLAG_SEQUENCE) offset += 4;

  if (messageType === MESSAGE_ERROR) {
    const code = frame.readUInt32BE(offset);
    const payloadLength = frame.readUInt32BE(offset + 4);
    const raw = frame.subarray(offset + 8, offset + 8 + payloadLength);
    const decoded = compression === COMPRESSION_GZIP ? gunzipSync(raw) : raw;
    let detail = decoded.toString("utf8");
    try {
      detail = JSON.parse(detail)?.message || detail;
    } catch {
      // The service can return plain text here.
    }
    return { error: { code, message: detail } };
  }

  if (messageType !== MESSAGE_FULL_SERVER_RESPONSE) return { payload: null };
  const payloadLength = frame.readUInt32BE(offset);
  const raw = frame.subarray(offset + 4, offset + 4 + payloadLength);
  const decoded = compression === COMPRESSION_GZIP ? gunzipSync(raw) : raw;
  if (serialization !== SERIALIZATION_JSON) return { payload: decoded };
  return { payload: JSON.parse(decoded.toString("utf8")) };
}

function extractTranscript(payload) {
  const result = payload?.result || payload?.payload?.result;
  if (!result) return null;
  const utterances = Array.isArray(result.utterances) ? result.utterances : [];
  const latest = utterances.at(-1);
  const text = String(latest?.text || result.text || "").trim();
  if (!text) return null;
  return { text, final: Boolean(latest?.definite ?? result.definite) };
}

function getHeaders(config, requestId) {
  const headers = {
    "X-Api-Resource-Id": config.resourceId,
    "X-Api-Request-Id": requestId,
    "X-Api-Connect-Id": requestId,
    "X-Api-Sequence": "-1",
  };
  if (config.apiKey) {
    headers["X-Api-Key"] = config.apiKey;
  } else {
    headers["X-Api-App-Key"] = config.appId;
    headers["X-Api-Access-Key"] = config.accessToken;
  }
  return headers;
}

export function getVolcAsrConfig(env = process.env) {
  const config = {
    endpoint: env.VOLC_SPEECH_ENDPOINT || "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async",
    resourceId: env.VOLC_SPEECH_RESOURCE_ID || "volc.seedasr.sauc.duration",
    apiKey: env.VOLC_SPEECH_API_KEY || "",
    appId: env.VOLC_SPEECH_APP_ID || "",
    accessToken: env.VOLC_SPEECH_ACCESS_TOKEN || "",
  };
  if (!config.apiKey && !(config.appId && config.accessToken)) {
    throw new Error("Volcengine speech credentials are not configured");
  }
  return config;
}

export class VolcAsrSession {
  constructor({ config, onReady, onTranscript, onError }) {
    this.config = config;
    this.onReady = onReady;
    this.onTranscript = onTranscript;
    this.onError = onError;
    this.requestId = randomUUID();
    this.socket = null;
    this.ready = false;
    this.closed = false;
    this.lastFinalText = "";
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.config.endpoint, {
        headers: getHeaders(this.config, this.requestId),
        handshakeTimeout: 8_000,
        perMessageDeflate: false,
      });
      this.socket = socket;
      const fail = (error) => {
        if (!this.ready) reject(error);
        this.onError?.(error);
      };

      socket.once("open", () => {
        const request = {
          user: { uid: this.requestId },
          audio: { format: "pcm", codec: "raw", rate: 16_000, bits: 16, channel: 1 },
          request: {
            model_name: "bigmodel",
            enable_itn: true,
            enable_punc: true,
            enable_ddc: true,
            enable_nonstream: true,
            enable_accelerate_text: true,
            show_utterances: true,
            result_type: "full",
            end_window_size: 800,
            force_to_speech_time: 1_000,
          },
        };
        socket.send(buildFrame(
          MESSAGE_FULL_CLIENT_REQUEST,
          0,
          Buffer.from(JSON.stringify(request)),
          SERIALIZATION_JSON,
        ));
        this.ready = true;
        this.onReady?.();
        resolve();
      });

      socket.on("message", (data) => {
        try {
          const parsed = parseServerFrame(data);
          if (parsed.error) {
            const error = new Error(`Volcengine ASR ${parsed.error.code}: ${parsed.error.message}`);
            error.code = parsed.error.code;
            fail(error);
            return;
          }
          const transcript = extractTranscript(parsed.payload);
          if (!transcript) return;
          if (transcript.final && transcript.text === this.lastFinalText) return;
          if (transcript.final) this.lastFinalText = transcript.text;
          this.onTranscript?.(transcript);
        } catch (error) {
          fail(error);
        }
      });
      socket.once("error", fail);
      socket.once("close", (code) => {
        this.ready = false;
        if (!this.closed && code !== 1000) fail(new Error(`Volcengine ASR connection closed (${code})`));
      });
    });
  }

  sendAudio(pcm) {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN || !pcm?.byteLength) return;
    this.socket.send(buildFrame(MESSAGE_AUDIO_ONLY_REQUEST, 0, Buffer.from(pcm), SERIALIZATION_NONE));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(buildFrame(MESSAGE_AUDIO_ONLY_REQUEST, FLAG_FINAL, Buffer.alloc(0), SERIALIZATION_NONE));
      const socket = this.socket;
      setTimeout(() => socket.close(1000), 180).unref();
    } else {
      this.socket?.close();
    }
  }
}

export const protocolInternals = { buildFrame, extractTranscript, parseServerFrame };

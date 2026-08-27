import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { protocolInternals } from "./volc-asr.js";

test("extractTranscript returns the latest partial utterance", () => {
  assert.deepEqual(protocolInternals.extractTranscript({
    result: { utterances: [{ text: "叫叫比个赞", definite: false }] },
  }), { text: "叫叫比个赞", final: false });
});

test("parseServerFrame handles responses without a sequence field", () => {
  const compressed = gzipSync(Buffer.from(JSON.stringify({ result: { text: "你好" } })));
  const frame = Buffer.alloc(8 + compressed.length);
  frame[0] = 0x11;
  frame[1] = 0x90;
  frame[2] = 0x11;
  frame.writeUInt32BE(compressed.length, 4);
  compressed.copy(frame, 8);
  assert.equal(protocolInternals.parseServerFrame(frame).payload.result.text, "你好");
});

test("buildConnectRequest sends brand terms as Volcengine context hotwords", () => {
  const request = protocolInternals.buildConnectRequest({ hotwords: ["叫叫", "绿豆"] }, "request-id");
  assert.deepEqual(JSON.parse(request.request.context), {
    hotwords: [{ word: "叫叫" }, { word: "绿豆" }],
  });
});

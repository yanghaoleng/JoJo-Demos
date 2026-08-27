import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BRAND_TERMS,
  IP_DOCUMENT_TERMS,
  buildHotwordContext,
  correctBrandTranscript,
  getBrandTerms,
} from "./brand-lexicon.js";

test("default brand lexicon contains the requested product vocabulary", () => {
  for (const term of [
    "叫叫", "绿豆", "粉豆", "猪小弟", "铃铛", "思维", "阅读", "萌萌星球", "豆荚号",
  ]) assert.ok(DEFAULT_BRAND_TERMS.includes(term), `missing ${term}`);
});

test("IP document terms cover its main character, place, and course families", () => {
  for (const term of [
    "叫叫小分队", "皮皮镇", "乌拉拉", "豆芽", "董高分", "帽哥", "咕噜", "艾丽",
  ]) assert.ok(IP_DOCUMENT_TERMS.includes(term), `missing ${term}`);
});

test("custom hotwords extend the defaults without duplicates", () => {
  const terms = getBrandTerms({ JOCAM_ASR_HOTWORDS: "叫叫,阅读星球" });
  assert.equal(terms.filter((term) => term === "叫叫").length, 1);
  assert.ok(terms.includes("阅读星球"));
});

test("hotword context follows Volcengine direct context format", () => {
  assert.deepEqual(JSON.parse(buildHotwordContext(["叫叫"])), {
    hotwords: [{ word: "叫叫" }],
  });
});

test("high-confidence homophones are corrected without rewriting the full sentence", () => {
  assert.deepEqual(correctBrandTranscript("笑笑和驴豆登上萌萌星求的豆夹号"), {
    text: "叫叫和绿豆登上萌萌星球的豆荚号",
    corrections: [
      { heard: "笑笑", brandTerm: "叫叫", occurrences: 1 },
      { heard: "驴豆", brandTerm: "绿豆", occurrences: 1 },
      { heard: "萌萌星求", brandTerm: "萌萌星球", occurrences: 1 },
      { heard: "豆夹号", brandTerm: "豆荚号", occurrences: 1 },
    ],
  });
});

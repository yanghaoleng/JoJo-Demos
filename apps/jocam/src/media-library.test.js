import test from "node:test";
import assert from "node:assert/strict";
import { sortMediaCaptures, toStoredMediaCapture } from "./media-library.js";

test("media captures are shown newest first", () => {
  const captures = sortMediaCaptures([
    { id: "old", createdAt: 10 },
    { id: "new", createdAt: 30 },
    { id: "middle", createdAt: 20 },
  ]);
  assert.deepEqual(captures.map(({ id }) => id), ["new", "middle", "old"]);
});

test("temporary object URLs are never persisted", () => {
  const stored = toStoredMediaCapture({
    id: "photo-1",
    type: "photo",
    blob: { size: 12 },
    url: "blob:temporary",
    createdAt: 10,
  });
  assert.equal("url" in stored, false);
  assert.equal(stored.id, "photo-1");
  assert.equal(stored.type, "photo");
});

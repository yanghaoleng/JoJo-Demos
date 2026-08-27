import assert from "node:assert/strict";
import test from "node:test";
import { arkInternals, looksLikeJiaojiaoCommand } from "./ark-command.js";

test("command hints distinguish photo chat from action requests", () => {
  assert.equal(looksLikeJiaojiaoCommand("叫叫，比个赞"), true);
  assert.equal(looksLikeJiaojiaoCommand("我们今天一起读书"), false);
});

test("tool arguments accept only the action whitelist", () => {
  assert.equal(arkInternals.parseAction('{"action":"praise"}'), "praise");
  assert.equal(arkInternals.parseAction('{"action":"arbitrary_animation"}'), null);
});

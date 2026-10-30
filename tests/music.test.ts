import test from "node:test";
import assert from "node:assert/strict";
import { cityScores } from "../src/music.ts";
test("city soundtracks are distinct original loops with safe musical ranges", () => {
  assert.notDeepEqual(cityScores.berlin, cityScores.seoul);
  for (const score of Object.values(cityScores)) {
    assert.ok(score.bpm >= 60 && score.bpm <= 120);
    assert.equal(score.notes.length, 16);
    assert.ok(score.notes.every((n) => n >= 48 && n <= 84));
  }
});

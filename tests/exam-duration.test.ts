import test from "node:test";
import assert from "node:assert/strict";
import { computeExamDurationMinutes } from "../src/lib/examDuration.ts";

test("duration scales at 3 minutes per question", () => {
  assert.equal(computeExamDurationMinutes(10), 30);
});

test("duration caps at 50 minutes", () => {
  assert.equal(computeExamDurationMinutes(20), 50);
});

test("duration floors at 5 minutes", () => {
  assert.equal(computeExamDurationMinutes(2), 5);
});

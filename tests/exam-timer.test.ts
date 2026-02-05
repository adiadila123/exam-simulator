import test from "node:test";
import assert from "node:assert/strict";
import {
  computeRemainingSeconds,
  shouldAutoSubmit,
  deriveLockState,
} from "../src/lib/examTimer.ts";

test("remaining seconds hits zero at duration end", () => {
  const startedAt = new Date("2025-01-01T00:00:00Z").getTime();
  const nowMs = startedAt + 30 * 60 * 1000;
  const remaining = computeRemainingSeconds({
    startedAt,
    durationMinutes: 30,
    nowMs,
  });
  assert.equal(remaining, 0);
});

test("autosubmit triggers at zero or below", () => {
  assert.equal(shouldAutoSubmit(0), true);
  assert.equal(shouldAutoSubmit(-1), true);
  assert.equal(shouldAutoSubmit(1), false);
});

test("lock state is true when session is locked or submitted", () => {
  assert.equal(deriveLockState({ locked: true }), true);
  assert.equal(deriveLockState({ submittedAt: "2025-01-01T00:00:00Z" }), true);
  assert.equal(deriveLockState({ locked: true }, { submittedAt: undefined }), true);
});

test("refresh keeps locked state from stored session", () => {
  const storedSession = { locked: true };
  assert.equal(deriveLockState(storedSession), true);
});

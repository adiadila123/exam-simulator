import test from "node:test";
import assert from "node:assert/strict";
import {
  getPaceStatus,
  getExpectedElapsedSeconds,
} from "../src/lib/pacing.ts";
import type { ExamQuestion } from "../src/lib/examBank";

const makeQuestions = (): ExamQuestion[] => {
  const questions: ExamQuestion[] = [];
  for (let i = 0; i < 10; i += 1) {
    questions.push({ id: `MCQ-${i}`, type: "mcq_single" } as ExamQuestion);
  }
  for (let i = 0; i < 5; i += 1) {
    questions.push({ id: `SA-${i}`, type: "short_answer" } as ExamQuestion);
  }
  for (let i = 0; i < 2; i += 1) {
    questions.push({ id: `SC-${i}`, type: "scenario" } as ExamQuestion);
  }
  questions.push({ id: "DL-1", type: "diagram_logic" } as ExamQuestion);
  return questions;
};

test("expected elapsed time sums per question type", () => {
  const questions = makeQuestions();
  const expectedAtMcqEnd = getExpectedElapsedSeconds(questions, 10);
  assert.equal(expectedAtMcqEnd, 15 * 60);
});

test("pace status on boundary is on pace", () => {
  const questions = makeQuestions();
  const expected = getExpectedElapsedSeconds(questions, 10);
  const status = getPaceStatus({
    questions,
    currentIndex: 10,
    elapsedSeconds: expected + 120,
  });
  assert.equal(status, "On pace");
});

test("pace status is behind when over 2 minutes late", () => {
  const questions = makeQuestions();
  const expected = getExpectedElapsedSeconds(questions, 10);
  const status = getPaceStatus({
    questions,
    currentIndex: 10,
    elapsedSeconds: expected + 121,
  });
  assert.equal(status, "Behind");
});

test("pace status is ahead when over 2 minutes early", () => {
  const questions = makeQuestions();
  const expected = getExpectedElapsedSeconds(questions, 10);
  const status = getPaceStatus({
    questions,
    currentIndex: 10,
    elapsedSeconds: expected - 121,
  });
  assert.equal(status, "Ahead");
});

test("pace status defaults to on pace with no questions", () => {
  const status = getPaceStatus({
    questions: [],
    currentIndex: 0,
    elapsedSeconds: 0,
  });
  assert.equal(status, "On pace");
});

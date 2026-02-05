import test from "node:test";
import assert from "node:assert/strict";
import { scoreMcqQuestion } from "../src/lib/scoring.ts";
import type { McqMultiQuestion } from "../src/lib/examBank.ts";

test("mcq_multi real_exam requires exact match", () => {
  const question: McqMultiQuestion = {
    id: "MCQ-M-1",
    type: "mcq_multi",
    topic: "Test",
    points: 4,
    prompt: "Pick two",
    options: { A: "A", B: "B", C: "C", D: "D" },
    correct_answers: ["A", "C"],
  };

  const exact = scoreMcqQuestion(question, ["A", "C"], "real_exam");
  const partial = scoreMcqQuestion(question, ["A"], "real_exam");
  const wrong = scoreMcqQuestion(question, ["A", "B"], "real_exam");

  assert.equal(exact.pointsEarned, 4);
  assert.equal(exact.isCorrect, true);
  assert.equal(partial.pointsEarned, 0);
  assert.equal(partial.isCorrect, false);
  assert.equal(wrong.pointsEarned, 0);
  assert.equal(wrong.isCorrect, false);
});

test("mcq_multi practice gives partial credit with no incorrect selections", () => {
  const question: McqMultiQuestion = {
    id: "MCQ-M-2",
    type: "mcq_multi",
    topic: "Test",
    points: 6,
    prompt: "Pick two",
    options: { A: "A", B: "B", C: "C", D: "D" },
    correct_answers: ["A", "C"],
  };

  const partial = scoreMcqQuestion(question, ["A"], "practice");
  const exact = scoreMcqQuestion(question, ["A", "C"], "practice");
  const wrong = scoreMcqQuestion(question, ["A", "B"], "practice");

  assert.equal(partial.pointsEarned, 3);
  assert.equal(partial.isPartial, true);
  assert.equal(exact.pointsEarned, 6);
  assert.equal(exact.isCorrect, true);
  assert.equal(wrong.pointsEarned, 0);
});


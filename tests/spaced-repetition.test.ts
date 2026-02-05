import test from "node:test";
import assert from "node:assert/strict";
import {
  getDueIds,
  updateReviewMapForAnswer,
  type ReviewMap,
} from "../src/lib/spacedRepetition.ts";

const baseDate = new Date(2026, 0, 10);

test("due count respects local date key", () => {
  const map: ReviewMap = {
    "MCQ-1": {
      id: "MCQ-1",
      topic: "Demand",
      stage: 0,
      nextReview: "2026-01-10",
    },
    "MCQ-2": {
      id: "MCQ-2",
      topic: "Supply",
      stage: 1,
      nextReview: "2026-01-12",
    },
  };

  assert.deepEqual(getDueIds(map, baseDate), ["MCQ-1"]);
});

test("schedule resets to +1 day on wrong answers", () => {
  const map: ReviewMap = {
    "MCQ-1": {
      id: "MCQ-1",
      topic: "Demand",
      stage: 2,
      nextReview: "2026-01-17",
    },
  };
  const updated = updateReviewMapForAnswer({
    map,
    question: { id: "MCQ-1", topic: "Demand", type: "mcq_single" },
    isCorrect: false,
    date: baseDate,
  });
  assert.equal(updated["MCQ-1"].stage, 0);
  assert.equal(updated["MCQ-1"].nextReview, "2026-01-11");
});

test("schedule advances and removes on correct answers", () => {
  const map: ReviewMap = {
    "MCQ-1": {
      id: "MCQ-1",
      topic: "Demand",
      stage: 0,
      nextReview: "2026-01-11",
    },
    "MCQ-2": {
      id: "MCQ-2",
      topic: "Supply",
      stage: 2,
      nextReview: "2026-01-17",
    },
  };

  const updated = updateReviewMapForAnswer({
    map,
    question: { id: "MCQ-1", topic: "Demand", type: "mcq_single" },
    isCorrect: true,
    date: baseDate,
  });

  assert.equal(updated["MCQ-1"].stage, 1);
  assert.equal(updated["MCQ-1"].nextReview, "2026-01-13");
  assert.equal(updated["MCQ-2"].stage, 2);

  const cleared = updateReviewMapForAnswer({
    map: updated,
    question: { id: "MCQ-2", topic: "Supply", type: "mcq_single" },
    isCorrect: true,
    date: baseDate,
  });
  assert.equal(cleared["MCQ-2"], undefined);
});

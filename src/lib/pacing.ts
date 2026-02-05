import type { ExamQuestion, QuestionType } from "./examBank";

export type PaceStatus = "Ahead" | "On pace" | "Behind";

const PLAN_SECONDS: Record<QuestionType, number> = {
  mcq_single: (15 * 60) / 10,
  mcq_multi: (15 * 60) / 10,
  short_answer: (20 * 60) / 5,
  scenario: (15 * 60) / 3,
  diagram_logic: (15 * 60) / 3,
  calculation_table: (20 * 60) / 5,
};

export const getExpectedElapsedSeconds = (
  questions: ExamQuestion[],
  currentIndex: number,
): number => {
  if (questions.length === 0) {
    return 0;
  }
  const clampedIndex = Math.max(0, Math.min(currentIndex, questions.length));
  let total = 0;
  for (let i = 0; i < clampedIndex; i += 1) {
    total += PLAN_SECONDS[questions[i].type];
  }
  return total;
};

export const getPaceStatus = ({
  questions,
  currentIndex,
  elapsedSeconds,
  thresholdSeconds = 120,
}: {
  questions: ExamQuestion[];
  currentIndex: number;
  elapsedSeconds: number;
  thresholdSeconds?: number;
}): PaceStatus => {
  if (questions.length === 0) {
    return "On pace";
  }

  const expected = getExpectedElapsedSeconds(questions, currentIndex);
  const delta = elapsedSeconds - expected;

  if (delta > thresholdSeconds) {
    return "Behind";
  }
  if (delta < -thresholdSeconds) {
    return "Ahead";
  }
  return "On pace";
};

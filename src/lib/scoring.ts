import type { ExamQuestion, McqQuestion } from "./examBank";
import type { AnswerMap } from "./examSession";

export type McqScore = {
  correct: number;
  total: number;
  pointsEarned: number;
  pointsAvailable: number;
};

const normalizeSelection = (value: string[] | undefined) =>
  Array.from(new Set(value ?? [])).sort();

export const scoreMcqQuestion = (
  question: McqQuestion,
  answer: AnswerMap[string],
  mode: "practice" | "real_exam",
) => {
  const points = question.points ?? 0;
  if (question.type === "mcq_single") {
    const isCorrect = typeof answer === "string" && answer === question.answer_key;
    return {
      pointsEarned: isCorrect ? points : 0,
      isCorrect,
      isPartial: false,
    };
  }

  const selected = Array.isArray(answer) ? normalizeSelection(answer) : [];
  const correct = normalizeSelection(question.correct_answers);
  const selectedSet = new Set(selected);
  const correctSet = new Set(correct);
  const hasIncorrect = selected.some((choice) => !correctSet.has(choice));
  const correctSelectedCount = selected.filter((choice) =>
    correctSet.has(choice),
  ).length;

  if (mode === "real_exam") {
    const isExact =
      selected.length === correct.length &&
      selected.every((choice, idx) => choice === correct[idx]);
    return {
      pointsEarned: isExact ? points : 0,
      isCorrect: isExact,
      isPartial: false,
    };
  }

  if (selected.length === 0 || hasIncorrect) {
    return { pointsEarned: 0, isCorrect: false, isPartial: false };
  }
  const fraction = correct.length === 0 ? 0 : correctSelectedCount / correct.length;
  const earned = Math.round(points * fraction * 100) / 100;
  const isCorrect = fraction === 1;
  return {
    pointsEarned: earned,
    isCorrect,
    isPartial: !isCorrect && earned > 0,
  };
};

export const scoreMcq = (
  questions: ExamQuestion[],
  answers: AnswerMap,
  mode: "practice" | "real_exam" = "real_exam",
): McqScore => {
  const mcqs = questions.filter(
    (
      question,
    ): question is ExamQuestion & { type: "mcq_single" | "mcq_multi" } =>
      question.type === "mcq_single" || question.type === "mcq_multi",
  );
  const total = mcqs.length;
  let correct = 0;
  let pointsEarned = 0;
  let pointsAvailable = 0;

  mcqs.forEach((question) => {
    pointsAvailable += question.points ?? 0;
    const result = scoreMcqQuestion(question, answers[question.id], mode);
    pointsEarned += result.pointsEarned;
    if (result.isCorrect) {
      correct += 1;
    }
  });

  return { correct, total, pointsEarned, pointsAvailable };
};

import type { ExamQuestion } from "./examBank";
import type { AnswerMap } from "./examSession";

export type McqScore = {
  correct: number;
  total: number;
  pointsEarned: number;
  pointsAvailable: number;
};

export const scoreMcq = (
  questions: ExamQuestion[],
  answers: AnswerMap,
): McqScore => {
  const mcqs = questions.filter((question) => question.type === "mcq_single");
  const total = mcqs.length;
  let correct = 0;
  let pointsEarned = 0;
  let pointsAvailable = 0;

  mcqs.forEach((question) => {
    pointsAvailable += question.points ?? 0;
    if (answers[question.id] === question.answer_key) {
      correct += 1;
      pointsEarned += question.points ?? 0;
    }
  });

  return { correct, total, pointsEarned, pointsAvailable };
};

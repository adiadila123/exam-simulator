import { extractBaseQuestionId } from "./examBank.ts";
import type { ExamBank, McqQuestion } from "./examBank.ts";
import type { AnswerMap } from "./examSession";

export type ReviewStage = 0 | 1 | 2;

export type ReviewEntry = {
  id: string;
  topic: string;
  stage: ReviewStage;
  nextReview: string;
};

export type ReviewMap = Record<string, ReviewEntry>;

const STORAGE_KEY = "examSpacedRepetitionV1";

const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateKeyToNumber = (key: string) => {
  const [year, month, day] = key.split("-").map((value) => Number(value));
  return year * 10000 + month * 100 + day;
};

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const STAGE_OFFSETS: Record<ReviewStage, number> = {
  0: 1,
  1: 3,
  2: 7,
};

export const readReviewMap = (): ReviewMap => {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as ReviewMap;
  } catch {
    return {};
  }
};

const writeReviewMap = (map: ReviewMap) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event("spaced-repetition-change"));
};

export const updateReviewMapForAnswer = ({
  map,
  question,
  isCorrect,
  date,
}: {
  map: ReviewMap;
  question: McqQuestion;
  isCorrect: boolean;
  date: Date;
}): ReviewMap => {
  const nextMap = { ...map };
  const existing = nextMap[question.id];

  if (!isCorrect) {
    const nextReview = getDateKey(addDays(date, STAGE_OFFSETS[0]));
    nextMap[question.id] = {
      id: question.id,
      topic: question.topic,
      stage: 0,
      nextReview,
    };
    return nextMap;
  }

  if (!existing) {
    return nextMap;
  }

  if (existing.stage === 2) {
    delete nextMap[question.id];
    return nextMap;
  }

  const nextStage = (existing.stage + 1) as ReviewStage;
  nextMap[question.id] = {
    ...existing,
    stage: nextStage,
    nextReview: getDateKey(addDays(date, STAGE_OFFSETS[nextStage])),
  };
  return nextMap;
};

export const applyMcqResults = ({
  questions,
  answers,
  date = new Date(),
}: {
  questions: McqQuestion[];
  answers: AnswerMap;
  date?: Date;
}) => {
  const map = readReviewMap();
  const updated = questions.reduce((acc, question) => {
    const baseId = extractBaseQuestionId(question.id);
    const answer = answers[question.id];
    if (!answer || typeof answer !== "string") {
      return acc;
    }
    const isCorrect = answer === question.answer_key;
    return updateReviewMapForAnswer({
      map: acc,
      question: { ...question, id: baseId },
      isCorrect,
      date,
    });
  }, map as ReviewMap);

  writeReviewMap(updated);
};

export const getDueIds = (map: ReviewMap, date: Date) => {
  const todayKey = dateKeyToNumber(getDateKey(date));
  return Object.values(map)
    .filter((entry) => dateKeyToNumber(entry.nextReview) <= todayKey)
    .sort((a, b) => dateKeyToNumber(a.nextReview) - dateKeyToNumber(b.nextReview))
    .map((entry) => entry.id);
};

export const getDueCount = (date = new Date()) =>
  getDueIds(readReviewMap(), date).length;

export const generateReviewSession = ({
  bank,
  limit = 10,
  date = new Date(),
}: {
  bank: ExamBank;
  limit?: number;
  date?: Date;
}) => {
  const map = readReviewMap();
  const dueIds = getDueIds(map, date);
  const selected = new Set(dueIds.slice(0, limit));

  if (selected.size < limit) {
    const dueTopics = new Set(
      dueIds.map((id) => map[id]?.topic).filter(Boolean),
    );
    const mcqs = bank.bank.filter(
      (question): question is McqQuestion => question.type === "mcq_single",
    );
    const similar = mcqs.filter(
      (question) =>
        !selected.has(question.id) && dueTopics.has(question.topic),
    );
    for (const question of similar) {
      if (selected.size >= limit) {
        break;
      }
      selected.add(question.id);
    }

    if (selected.size < limit) {
      for (const question of mcqs) {
        if (selected.size >= limit) {
          break;
        }
        if (!selected.has(question.id)) {
          selected.add(question.id);
        }
      }
    }
  }

  return Array.from(selected);
};

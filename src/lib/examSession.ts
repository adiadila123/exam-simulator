export type AnswerMap = Record<string, string>;

export type ExamSession = {
  setId: string;
  questionIds: string[];
  answers: AnswerMap;
  flags: string[];
  startedAt: string;
  submittedAt?: string;
  durationMinutes: number;
  currentIndex: number;
};

const STORAGE_KEY = "examSessionV1";

export const loadSession = (): ExamSession | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ExamSession;
  } catch {
    return null;
  }
};

export const saveSession = (session: ExamSession) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const clearSession = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
};

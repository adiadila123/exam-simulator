export type MistakeReason =
  | "Concept gap"
  | "Misread question"
  | "Rushed / time pressure"
  | "Diagram confusion"
  | "Careless mistake";

export const MISTAKE_REASONS: MistakeReason[] = [
  "Concept gap",
  "Misread question",
  "Rushed / time pressure",
  "Diagram confusion",
  "Careless mistake",
];

export type MistakeMap = Record<string, MistakeReason>;

const STORAGE_KEY = "examMistakesV1";

export const readMistakes = (): MistakeMap => {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as MistakeMap;
  } catch {
    return {};
  }
};

const writeMistakes = (map: MistakeMap) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
};

export const getMistakeReason = (questionId: string): MistakeReason | null => {
  const map = readMistakes();
  return map[questionId] ?? null;
};

export const setMistakeReason = (
  questionId: string,
  reason: MistakeReason | "",
) => {
  const map = readMistakes();
  if (!reason) {
    delete map[questionId];
  } else {
    map[questionId] = reason;
  }
  writeMistakes(map);
};

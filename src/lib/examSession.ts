export type DiagramLogicResponse = {
  curve: "Demand" | "Supply" | "";
  direction: "Left" | "Right" | "";
  priceEffect: "Up" | "Down" | "Uncertain" | "";
  quantityEffect: "Up" | "Down" | "Uncertain" | "";
  justification: string;
};

export type CalculationTableResponse = Record<string, string>;

export type AnswerValue =
  | string
  | string[]
  | DiagramLogicResponse
  | CalculationTableResponse;

export type AnswerMap = Record<string, AnswerValue>;

export type ExamType = "legacy_set" | "exam1_mcq" | "exam2_written";
export type Mode = "practice" | "real_exam";

export type SessionMeta = {
  legacySetId?: "A" | "B" | "C";
};

export type ExamSession = {
  version: 2;
  id: string;
  examType: ExamType;
  mode: Mode;
  createdAt: string;
  timeLimitSeconds: number;
  locked: boolean;
  questionIds: string[];
  answers: AnswerMap;
  flags: string[];
  selfMark?: Record<string, string[]>;
  startedAt: string;
  submittedAt?: string;
  currentIndex: number;
  seed?: number;
  shuffle?: boolean;
  parts?: unknown;
  meta?: SessionMeta;
  setId?: string;
};

type LegacyExamSession = {
  setId?: "A" | "B" | "C" | string;
  questionIds?: string[];
  answers?: AnswerMap;
  flags?: string[];
  startedAt?: string;
  submittedAt?: string;
  locked?: boolean;
  durationMinutes?: number;
  currentIndex?: number;
  seed?: number;
  shuffle?: boolean;
};

const STORAGE_KEY = "examSessionsV1";
const LEGACY_STORAGE_KEY = "examSessionV1";
const ACTIVE_SESSION_KEY = "activeSessionIdV1";

const parseSessions = (raw: string): ExamSession[] => {
  try {
    const parsed = JSON.parse(raw) as ExamSession[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((session) => session && session.version === 2);
  } catch {
    return [];
  }
};

export const normalizeSessions = (sessions: ExamSession[]) => {
  const sorted = [...sessions].sort((a, b) =>
    (b.createdAt ?? b.startedAt ?? "").localeCompare(
      a.createdAt ?? a.startedAt ?? "",
    ),
  );
  return sorted.slice(0, 20);
};

const migrateLegacySession = (legacy: LegacyExamSession): ExamSession => {
  const now = new Date().toISOString();
  const legacySetId =
    legacy.setId === "A" || legacy.setId === "B" || legacy.setId === "C"
      ? legacy.setId
      : undefined;
  const createdAt = now;
  const startedAt = legacy.startedAt ?? createdAt;
  return {
    version: 2,
    id: createdAt,
    examType: "legacy_set",
    mode: "practice",
    createdAt,
    startedAt,
    timeLimitSeconds: (legacy.durationMinutes ?? 50) * 60,
    locked: legacy.locked ?? false,
    submittedAt: legacy.submittedAt,
    questionIds: legacy.questionIds ?? [],
    answers: legacy.answers ?? {},
    flags: legacy.flags ?? [],
    currentIndex: legacy.currentIndex ?? 0,
    seed: legacy.seed,
    shuffle: legacy.shuffle,
    meta: legacySetId ? { legacySetId } : undefined,
    setId: legacy.setId,
  };
};

export const loadSessions = (): ExamSession[] => {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const sessions = raw ? parseSessions(raw) : [];

  if (sessions.length > 0) {
    return normalizeSessions(sessions);
  }

  const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacyRaw) {
    try {
      const legacy = JSON.parse(legacyRaw) as LegacyExamSession;
      const migrated = migrateLegacySession(legacy);
      const normalized = normalizeSessions([migrated]);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      if (!window.localStorage.getItem(ACTIVE_SESSION_KEY)) {
        window.localStorage.setItem(ACTIVE_SESSION_KEY, migrated.id);
      }
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.info("Migrated examSessionV1 to examSessionsV1.");
      }
      return normalized;
    } catch {
      return [];
    }
  }

  return normalizeSessions(sessions);
};

export const saveSessions = (sessions: ExamSession[]) => {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeSessions(sessions);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
};

export const getActiveSessionId = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(ACTIVE_SESSION_KEY);
};

export const setActiveSessionId = (id: string | null) => {
  if (typeof window === "undefined") {
    return;
  }
  if (id) {
    window.localStorage.setItem(ACTIVE_SESSION_KEY, id);
  } else {
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
};

export const getActiveSession = (): ExamSession | null => {
  const sessions = loadSessions();
  const activeId = getActiveSessionId();
  if (activeId) {
    return sessions.find((session) => session.id === activeId) ?? null;
  }
  return sessions[0] ?? null;
};

export const saveSession = (session: ExamSession) => {
  if (typeof window === "undefined") {
    return;
  }
  const sessions = loadSessions();
  const index = sessions.findIndex(
    (item) => item.id === session.id,
  );
  if (index >= 0) {
    sessions[index] = session;
  } else {
    sessions.unshift(session);
  }
  saveSessions(sessions);
  setActiveSessionId(session.id);
};

export const clearSessionHistory = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(ACTIVE_SESSION_KEY);
};

const hashStringToSeed = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
};

export const getSessionSeed = (
  session: ExamSession | null | undefined,
  fallbackStartedAt?: string,
) => {
  if (session?.seed !== undefined) {
    return session.seed;
  }
  const base = session?.startedAt ?? fallbackStartedAt;
  if (base) {
    return hashStringToSeed(base);
  }
  return 1;
};

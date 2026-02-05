import test from "node:test";
import assert from "node:assert/strict";
import {
  loadSessions,
  saveSession,
  clearSessionHistory,
  getActiveSessionId,
} from "../src/lib/examSession.ts";

const createStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    _dump: () => store,
  };
};

const withStorage = (fn: (storage: ReturnType<typeof createStorage>) => void) => {
  const storage = createStorage();
  const originalWindow = globalThis.window;
  // @ts-expect-error test-only window stub
  globalThis.window = { localStorage: storage };
  try {
    fn(storage);
  } finally {
    globalThis.window = originalWindow;
  }
};

test("migrates legacy session into history storage", () => {
  withStorage((storage) => {
    const legacy = {
      setId: "A",
      questionIds: ["MCQ-1"],
      answers: {},
      flags: [],
      startedAt: "2026-01-01T10:00:00.000Z",
      durationMinutes: 50,
      currentIndex: 0,
    };
    storage.setItem("examSessionV1", JSON.stringify(legacy));
    const sessions = loadSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].examType, "legacy_set");
    assert.equal(sessions[0].meta?.legacySetId, "A");
    assert.equal(storage.getItem("examSessionV1") !== null, true);
    assert.ok(storage.getItem("examSessionsV1"));
    assert.equal(getActiveSessionId(), sessions[0].id);
  });
});

test("history keeps the latest 20 sessions", () => {
  withStorage(() => {
    for (let i = 0; i < 25; i += 1) {
      saveSession({
        version: 2,
        id: `session-${i}`,
        examType: "legacy_set",
        mode: "practice",
        createdAt: `2026-01-01T10:${String(i).padStart(2, "0")}:00.000Z`,
        timeLimitSeconds: 50 * 60,
        locked: false,
        setId: "A",
        questionIds: [],
        answers: {},
        flags: [],
        startedAt: `2026-01-01T10:${String(i).padStart(2, "0")}:00.000Z`,
        currentIndex: 0,
      });
    }
    const sessions = loadSessions();
    assert.equal(sessions.length, 20);
    assert.equal(
      sessions[0].createdAt,
      "2026-01-01T10:24:00.000Z",
    );
  });
});

test("clearSessionHistory removes stored sessions", () => {
  withStorage((storage) => {
    saveSession({
      version: 2,
      id: "session-1",
      examType: "legacy_set",
      mode: "practice",
      createdAt: "2026-01-01T10:00:00.000Z",
      timeLimitSeconds: 50 * 60,
      locked: false,
      setId: "A",
      questionIds: [],
      answers: {},
      flags: [],
      startedAt: "2026-01-01T10:00:00.000Z",
      currentIndex: 0,
    });
    clearSessionHistory();
    assert.equal(storage.getItem("examSessionsV1"), null);
    assert.equal(storage.getItem("activeSessionIdV1"), null);
  });
});

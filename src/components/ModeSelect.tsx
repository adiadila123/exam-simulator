"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExamBank } from "@/lib/examBank";
import {
  fetchExamBank,
  generateExamTypeSession,
  generateExam1McqSession,
  generateFullSimExam1,
  generateFullSimExam2,
  type ExamType,
} from "@/lib/examBank";
import { setExamMode, useExamMode, type ExamMode } from "@/lib/examMode";
import { generateReviewSession, getDueCount } from "@/lib/spacedRepetition";
import { saveSession, type ExamSession } from "@/lib/examSession";
import { computeExamDurationMinutes } from "@/lib/examDuration";
import { EXAM_TYPE_TIME_LIMITS } from "@/lib/examConfig";

export default function ModeSelect() {
  const [bank, setBank] = useState<ExamBank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mode = useExamMode() as ExamSession["mode"];
  const [dueCount, setDueCount] = useState(0);
  const [examTypeError, setExamTypeError] = useState<string | null>(null);
  const [includeFullSim2Mcq, setIncludeFullSim2Mcq] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    fetchExamBank()
      .then((data) => {
        if (alive) {
          setBank(data);
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof Error ? err.message : "Failed to load exam.");
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const updateDue = () => setDueCount(getDueCount());
    updateDue();
    const handler = () => updateDue();
    window.addEventListener("spaced-repetition-change", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("spaced-repetition-change", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  if (error) {
    return (
      <div className="card">
        <p className="muted">Unable to load exam bank: {error}</p>
      </div>
    );
  }

  if (!bank) {
    return (
      <div className="card">
        <p className="muted">Loading exam bank…</p>
      </div>
    );
  }

  const setEntries = Object.entries(bank.exam_sets);
  const mockExam1Ids = [
    "ME1-01",
    "ME1-02",
    "ME1-03",
    "ME1-04",
    "ME1-05",
    "ME1-06",
    "ME1-07",
    "ME1-08",
    "ME1-09",
    "ME1-10",
    "ME1-11",
    "ME1-12",
    "ME1-13",
    "ME1-14",
    "ME1-15",
    "ME1-16",
    "ME1-17",
    "ME1-18",
    "ME1-19",
    "ME1-20",
  ];
  const mockExam1Available = mockExam1Ids.every((id) =>
    bank.bank.some((question) => question.id === id),
  );
  const mockExam1BIds = [
    "ME1B-01",
    "ME1B-02",
    "ME1B-03",
    "ME1B-04",
    "ME1B-05",
    "ME1B-06",
    "ME1B-07",
    "ME1B-08",
    "ME1B-09",
    "ME1B-10",
    "ME1B-11",
    "ME1B-12",
    "ME1B-13",
    "ME1B-14",
    "ME1B-15",
    "ME1B-16",
    "ME1B-17",
    "ME1B-18",
    "ME1B-19",
    "ME1B-20",
  ];
  const mockExam1BAvailable = mockExam1BIds.every((id) =>
    bank.bank.some((question) => question.id === id),
  );
  const mockExam1CIds = [
    "ME1C-01",
    "ME1C-02",
    "ME1C-03",
    "ME1C-04",
    "ME1C-05",
    "ME1C-06",
    "ME1C-07",
    "ME1C-08",
    "ME1C-09",
    "ME1C-10",
    "ME1C-11",
    "ME1C-12",
    "ME1C-13",
    "ME1C-14",
    "ME1C-15",
    "ME1C-16",
    "ME1C-17",
    "ME1C-18",
    "ME1C-19",
    "ME1C-20",
  ];
  const mockExam1CAvailable = mockExam1CIds.every((id) =>
    bank.bank.some((question) => question.id === id),
  );
  const mockExam2Ids = [
    "ME2-SA-01",
    "ME2-SA-02",
    "ME2-SA-03",
    "ME2-SA-04",
    "ME2-SA-05",
    "ME2-SC-01",
    "ME2-SC-02",
    "ME2-DL-01",
  ];
  const mockExam2Available = mockExam2Ids.every((id) =>
    bank.bank.some((question) => question.id === id),
  );

  const updateMode = (nextMode: ExamMode) => {
    setExamMode(nextMode);
  };

  const buildSession = ({
    examType,
    mode: sessionMode,
    setId,
    questionIds,
    timeLimitSeconds,
    meta,
    seed,
    shuffle,
  }: {
    examType: ExamSession["examType"];
    mode: ExamSession["mode"];
    setId?: string;
    questionIds: string[];
    timeLimitSeconds: number;
    meta?: ExamSession["meta"];
    seed: number;
    shuffle?: boolean;
  }): ExamSession => {
    const createdAt = new Date().toISOString();
    return {
      version: 2,
      id: createdAt,
      examType,
      mode: sessionMode,
      createdAt,
      startedAt: createdAt,
      timeLimitSeconds,
      locked: false,
      questionIds,
      answers: {},
      flags: [],
      currentIndex: 0,
      seed,
      shuffle,
      meta,
      setId,
    };
  };

  const startReview = () => {
    if (!bank) {
      return;
    }
    const questionIds = generateReviewSession({ bank, limit: 10 });
    const seed = Date.now();
    saveSession(
      buildSession({
        examType: "legacy_set",
        mode: "practice",
        setId: "review",
        questionIds,
        timeLimitSeconds: computeExamDurationMinutes(questionIds.length) * 60,
        seed,
      }),
    );
    router.push(`/exam?set=review&mode=practice`);
  };

  const getDrillWeight = (question: ExamBank["bank"][number]) => {
    const extra = question as ExamBank["bank"][number] & {
      subtopic?: string;
      part?: string;
    };
    const text = [
      question.prompt,
      question.topic,
      extra.subtopic ?? "",
      extra.part ?? "",
    ]
      .join(" ")
      .toLowerCase();

    let weight = 1;
    if (text.includes("shift") || text.includes("movement")) {
      weight += 2;
    }
    if (text.includes("normal good") || text.includes("inferior good")) {
      weight += 3;
    }
    if (text.includes("market supply") || text.includes("sum of")) {
      weight += 3;
    }
    if (
      text.includes("supply curve") ||
      text.includes("shift in supply") ||
      text.includes("supply shifts")
    ) {
      weight += 3;
    }
    return weight;
  };

  const weightedSample = <T,>(
    items: T[],
    weights: number[],
    count: number,
  ): T[] => {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (items.length === 0 || total <= 0) {
      return [];
    }
    const picks: T[] = [];
    for (let i = 0; i < count; i += 1) {
      const roll = Math.random() * total;
      let cursor = 0;
      for (let j = 0; j < items.length; j += 1) {
        cursor += weights[j];
        if (roll <= cursor) {
          picks.push(items[j]);
          break;
        }
      }
    }
    return picks;
  };

  const toUniqueIds = (items: Array<{ id: string }>) => {
    const counts = new Map<string, number>();
    return items.map((item) => {
      const seen = counts.get(item.id) ?? 0;
      counts.set(item.id, seen + 1);
      return seen === 0 ? item.id : `${item.id}::${seen}`;
    });
  };

  const seminarPacks = [
    {
      key: "week1",
      title: "Week 1",
      subtitle: "Intro economics",
      prefix: "W1I-",
      description: "Scarcity, opportunity cost, marginal thinking.",
      drillLabel: "Week 1 Drill (10 questions)",
    },
    {
      key: "week2-ds",
      title: "Week 2",
      subtitle: "Demand & Supply (Intro)",
      prefix: "W2DS-",
      description: "Core demand and supply concepts.",
      drillLabel: "Week 2 Drill (10 questions)",
      weightFn: getDrillWeight,
    },
    {
      key: "week2",
      title: "Week 2",
      subtitle: "Demand & Supply (Seminar)",
      prefix: "W2-",
      description: "Practice questions from the Week 2 seminar pack.",
      drillLabel: "Week 2 Drill (10 questions)",
      weightFn: getDrillWeight,
    },
  ];

  const getPackQuestions = (prefix: string) =>
    bank.bank.filter((question) => question.id.startsWith(prefix));

  const startPack = (packKey: string, prefix: string) => {
    if (!bank) {
      return;
    }
    const questions = getPackQuestions(prefix);
    if (questions.length === 0) {
      return;
    }
    setExamMode("practice");
    const seed = Date.now();
    const questionIds = questions
      .map((question) => question.id)
      .sort((a, b) => a.localeCompare(b));
    const setId = `pack-${packKey}`;
    saveSession(
      buildSession({
        examType: "legacy_set",
        mode: "practice",
        setId,
        questionIds,
        timeLimitSeconds: computeExamDurationMinutes(questionIds.length) * 60,
        seed,
        shuffle: false,
      }),
    );
    router.push(`/exam?set=${setId}&mode=practice`);
  };

  const startDrill = (
    packKey: string,
    prefix: string,
    weightFn?: (question: ExamBank["bank"][number]) => number,
  ) => {
    if (!bank) {
      return;
    }
    const questions = getPackQuestions(prefix);
    if (questions.length === 0) {
      return;
    }
    setExamMode("practice");
    const seed = Date.now();
    const weights = questions.map((question) =>
      weightFn ? weightFn(question) : 1,
    );
    const sampled = weightedSample(questions, weights, 10);
    const questionIds = toUniqueIds(sampled);
    const setId = `drill-${packKey}`;
    saveSession(
      buildSession({
        examType: "legacy_set",
        mode: "practice",
        setId,
        questionIds,
        timeLimitSeconds: computeExamDurationMinutes(questionIds.length) * 60,
        seed,
      }),
    );
    router.push(`/exam?set=${setId}&mode=practice`);
  };

  const startExamType = (
    examType: ExamType,
    sessionMode: "practice" | "real_exam",
  ) => {
    if (!bank) {
      return;
    }
    const questionIds =
      examType === "exam1_mcq"
        ? (() => {
            const result = generateExam1McqSession(bank);
            if (result.error) {
              setExamTypeError(result.error);
              return null;
            }
            return result.ids;
          })()
        : generateExamTypeSession(bank, examType);
    if (!questionIds) {
      return;
    }
    setExamTypeError(null);
    const seed = Date.now();
    saveSession(
      buildSession({
        examType,
        mode: sessionMode,
        setId: examType,
        questionIds,
        timeLimitSeconds: EXAM_TYPE_TIME_LIMITS[examType],
        seed,
      }),
    );
    router.push(`/exam?set=${examType}&mode=${sessionMode}`);
  };

  const startFullSimExam1 = (sessionMode: "practice" | "real_exam") => {
    if (!bank) {
      return;
    }
    const seed = Date.now();
    const result = generateFullSimExam1(bank, seed);
    if (result.error) {
      setExamTypeError(result.error);
      return;
    }
    setExamTypeError(null);
    const setId = "preset-fullsim1";
    saveSession(
      buildSession({
        examType: "exam1_mcq",
        mode: sessionMode,
        setId,
        questionIds: result.ids,
        timeLimitSeconds: EXAM_TYPE_TIME_LIMITS.exam1_mcq,
        seed,
      }),
    );
    router.push(`/exam?set=${setId}&mode=${sessionMode}`);
  };

  const startFullSimExam2 = (sessionMode: "practice" | "real_exam") => {
    if (!bank) {
      return;
    }
    const seed = Date.now();
    const result = generateFullSimExam2(bank, seed, {
      includeMcq: includeFullSim2Mcq,
    });
    if (result.error) {
      setExamTypeError(result.error);
      return;
    }
    setExamTypeError(null);
    const setId = "preset-fullsim2";
    saveSession(
      buildSession({
        examType: "exam2_written",
        mode: sessionMode,
        setId,
        questionIds: result.ids,
        timeLimitSeconds: EXAM_TYPE_TIME_LIMITS.exam2_written,
        seed,
      }),
    );
    router.push(`/exam?set=${setId}&mode=${sessionMode}`);
  };

  const startMockExam1 = (sessionMode: "practice" | "real_exam") => {
    if (!bank || !mockExam1Available) {
      return;
    }
    const seed = Date.now();
    const setId = "preset-mock1";
    saveSession(
      buildSession({
        examType: "exam1_mcq",
        mode: sessionMode,
        setId,
        questionIds: mockExam1Ids,
        timeLimitSeconds: EXAM_TYPE_TIME_LIMITS.exam1_mcq,
        seed,
      }),
    );
    router.push(`/exam?set=${setId}&mode=${sessionMode}`);
  };

  const startMockExam1B = (sessionMode: "practice" | "real_exam") => {
    if (!bank || !mockExam1BAvailable) {
      return;
    }
    const seed = Date.now();
    const setId = "preset-mock1b";
    saveSession(
      buildSession({
        examType: "exam1_mcq",
        mode: sessionMode,
        setId,
        questionIds: mockExam1BIds,
        timeLimitSeconds: EXAM_TYPE_TIME_LIMITS.exam1_mcq,
        seed,
      }),
    );
    router.push(`/exam?set=${setId}&mode=${sessionMode}`);
  };

  const startMockExam1C = (sessionMode: "practice" | "real_exam") => {
    if (!bank || !mockExam1CAvailable) {
      return;
    }
    const seed = Date.now();
    const setId = "preset-mock1c";
    saveSession(
      buildSession({
        examType: "exam1_mcq",
        mode: sessionMode,
        setId,
        questionIds: mockExam1CIds,
        timeLimitSeconds: EXAM_TYPE_TIME_LIMITS.exam1_mcq,
        seed,
      }),
    );
    router.push(`/exam?set=${setId}&mode=${sessionMode}`);
  };

  const startMockExam2 = (sessionMode: "practice" | "real_exam") => {
    if (!bank || !mockExam2Available) {
      return;
    }
    const seed = Date.now();
    const setId = "preset-mock2";
    saveSession(
      buildSession({
        examType: "exam2_written",
        mode: sessionMode,
        setId,
        questionIds: mockExam2Ids,
        timeLimitSeconds: EXAM_TYPE_TIME_LIMITS.exam2_written,
        seed,
      }),
    );
    router.push(`/exam?set=${setId}&mode=${sessionMode}`);
  };

  return (
    <div className="card">
      <h2 className="title" style={{ fontSize: "22px", marginBottom: 8 }}>
        Choose a mode
      </h2>
      <p className="subtitle" style={{ marginBottom: 16 }}>
        Practice gives instant feedback. Real exam hides feedback until the end.
      </p>
      <div className="btn-row" style={{ marginBottom: 24 }}>
        <button
          type="button"
          className={mode === "practice" ? "btn" : "btn btn-secondary"}
          onClick={() => updateMode("practice")}
        >
          Practice
        </button>
        <button
          type="button"
          className={mode === "real_exam" ? "btn" : "btn btn-secondary"}
          onClick={() => updateMode("real_exam")}
        >
          Real exam
        </button>
        <span className="pill">
          {mode === "practice" ? "Practice" : "Real exam"} mode
        </span>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="question-meta">
          <span className="pill pill-accent">Spaced repetition</span>
          <span className="pill">Due today: {dueCount}</span>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={startReview}>
            Review due (10 questions)
          </button>
        </div>
      </div>

      <h2 className="title" style={{ fontSize: "22px", marginBottom: 8 }}>
        Legacy Sets
      </h2>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        {bank.module} · {bank.assessment}
      </p>
      <div className="grid grid-2">
        {setEntries.map(([setId, set]) => (
          <div key={setId} className="card" style={{ boxShadow: "none" }}>
            <div className="question-meta">
              <span className="pill pill-accent">Set {setId}</span>
              <span className="pill">{set.duration_minutes} min</span>
              <span className="pill">{set.target_points} pts</span>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              {set.sections.length} sections ·{" "}
              {set.sections.reduce(
                (total, section) => total + section.question_ids.length,
                0,
              )}{" "}
              questions
            </p>
            <div className="btn-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const seed = Date.now();
                  const questionIds = set.sections.flatMap(
                    (section) => section.question_ids,
                  );
                  saveSession(
                    buildSession({
                      examType: "legacy_set",
                      mode,
                      setId,
                      meta: { legacySetId: setId as "A" | "B" | "C" },
                      questionIds,
                      timeLimitSeconds: EXAM_TYPE_TIME_LIMITS.legacy_set,
                      seed,
                    }),
                  );
                  router.push(`/exam?set=${setId}&mode=${mode}`);
                }}
              >
                Start exam
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => router.push(`/results?set=${setId}`)}
              >
                View last results
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2
        className="title"
        style={{ fontSize: "22px", marginBottom: 8, marginTop: 28 }}
      >
        Exam Types
      </h2>
      <p className="subtitle" style={{ marginBottom: 16 }}>
        Two-part exams with separate MCQ and written sessions.
      </p>
      {examTypeError && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="muted">{examTypeError}</p>
        </div>
      )}
      <div className="grid grid-2">
        <div className="card" style={{ boxShadow: "none" }}>
          <div className="question-meta">
            <span className="pill pill-accent">Exam 1</span>
            <span className="pill">MCQ 20</span>
          </div>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              onClick={() => startExamType("exam1_mcq", "real_exam")}
            >
              Exam 1 (MCQ 20) – Real Exam
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => startExamType("exam1_mcq", "practice")}
            >
              Exam 1 (MCQ 20) – Practice
            </button>
          </div>
        </div>
        <div className="card" style={{ boxShadow: "none" }}>
          <div className="question-meta">
            <span className="pill pill-accent">Exam 2</span>
            <span className="pill">Written mixed 20</span>
          </div>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              onClick={() => startExamType("exam2_written", "real_exam")}
            >
              Exam 2 (Written mixed) – Real Exam
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => startExamType("exam2_written", "practice")}
            >
              Exam 2 (Written mixed) – Practice
            </button>
          </div>
        </div>
      </div>

      <h2
        className="title"
        style={{ fontSize: "22px", marginBottom: 8, marginTop: 28 }}
      >
        Mock Exams
      </h2>
      <p className="subtitle" style={{ marginBottom: 16 }}>
        Fixed question sets for timed practice.
      </p>
      <div className="grid grid-2">
        <div className="card" style={{ boxShadow: "none" }}>
          <div className="question-meta">
            <span className="pill pill-accent">Mock Exam 1</span>
            <span className="pill">Week 1–2 MCQ (20)</span>
          </div>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              onClick={() => startMockExam1("real_exam")}
              disabled={!mockExam1Available}
            >
              Real Exam
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => startMockExam1("practice")}
              disabled={!mockExam1Available}
            >
              Practice
            </button>
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={() => startMockExam1B("real_exam")}
              disabled={!mockExam1BAvailable}
            >
              Set B – Real Exam
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => startMockExam1B("practice")}
              disabled={!mockExam1BAvailable}
            >
              Set B – Practice
            </button>
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={() => startMockExam1C("real_exam")}
              disabled={!mockExam1CAvailable}
            >
              Set C (Advanced) – Real Exam
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => startMockExam1C("practice")}
              disabled={!mockExam1CAvailable}
            >
              Set C (Advanced) – Practice
            </button>
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={() => startFullSimExam1("real_exam")}
            >
              Full Simulated Exam 1 (Random) – Real Exam
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => startFullSimExam1("practice")}
            >
              Full Simulated Exam 1 (Random) – Practice
            </button>
          </div>
        </div>
        <div className="card" style={{ boxShadow: "none" }}>
          <div className="question-meta">
            <span className="pill pill-accent">Mock Exam 2</span>
            <span className="pill">Written (Week 1–2)</span>
          </div>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              onClick={() => startMockExam2("real_exam")}
              disabled={!mockExam2Available}
            >
              Real Exam
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => startMockExam2("practice")}
              disabled={!mockExam2Available}
            >
              Practice
            </button>
          </div>
        </div>
        <div className="card" style={{ boxShadow: "none" }}>
          <div className="question-meta">
            <span className="pill pill-accent">Full Simulated Exam 2</span>
            <span className="pill">Random Written</span>
          </div>
          <label className="muted" style={{ display: "block", marginTop: 8 }}>
            <input
              type="checkbox"
              checked={includeFullSim2Mcq}
              onChange={(event) => setIncludeFullSim2Mcq(event.target.checked)}
              style={{ marginRight: 8 }}
            />
            Include 5 MCQ (mixed practice)
          </label>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              onClick={() => startFullSimExam2("real_exam")}
            >
              Full Simulated Exam 2 (Random Written) – Real Exam
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => startFullSimExam2("practice")}
            >
              Full Simulated Exam 2 (Random Written) – Practice
            </button>
          </div>
        </div>
      </div>

      <h2
        className="title"
        style={{ fontSize: "22px", marginBottom: 8, marginTop: 28 }}
      >
        Seminar Packs
      </h2>
      <p className="subtitle" style={{ marginBottom: 16 }}>
        Optional practice-only sets from seminar sheets.
      </p>
      <div className="grid grid-2">
        {seminarPacks.map((pack) => {
          const questions = getPackQuestions(pack.prefix);
          const hasPack = questions.length > 0;
          return (
            <div key={pack.key} className="card" style={{ boxShadow: "none" }}>
              <div className="question-meta">
                <span className="pill pill-accent">{pack.title}</span>
                <span className="pill">{pack.subtitle}</span>
                <span className="pill">{hasPack ? questions.length : 0} questions</span>
              </div>
              <p className="muted" style={{ marginTop: 8 }}>
                {hasPack
                  ? pack.description
                  : "Pack not found. Add it to /public/packs to enable."}
              </p>
              <div className="btn-row" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => startPack(pack.key, pack.prefix)}
                  disabled={!hasPack}
                >
                  Start practice
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => startDrill(pack.key, pack.prefix, pack.weightFn)}
                  disabled={!hasPack}
                >
                  {pack.drillLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

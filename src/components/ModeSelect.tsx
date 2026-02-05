"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExamBank } from "@/lib/examBank";
import {
  fetchExamBank,
  generateExamTypeSession,
  generateExam1McqSession,
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
  const router = useRouter();
  const packSetId = "pack-week2";
  const drillSetId = "drill-week2";
  const packPrefix = "W2-";

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

  const week2Questions = bank.bank.filter((question) =>
    question.id.startsWith(packPrefix),
  );
  const hasWeek2Pack = week2Questions.length > 0;
  const week2Ids = week2Questions
    .map((question) => question.id)
    .sort((a, b) => a.localeCompare(b));

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

  const startWeek2Pack = () => {
    if (!bank || !hasWeek2Pack) {
      return;
    }
    setExamMode("practice");
    const seed = Date.now();
    saveSession(
      buildSession({
        examType: "legacy_set",
        mode: "practice",
        setId: packSetId,
        questionIds: week2Ids,
        timeLimitSeconds: computeExamDurationMinutes(week2Ids.length) * 60,
        seed,
        shuffle: false,
      }),
    );
    router.push(`/exam?set=${packSetId}&mode=practice`);
  };

  const startWeek2Drill = () => {
    if (!bank || !hasWeek2Pack) {
      return;
    }
    setExamMode("practice");
    const seed = Date.now();
    const weights = week2Questions.map((question) => getDrillWeight(question));
    const sampled = weightedSample(week2Questions, weights, 10);
    const questionIds = toUniqueIds(sampled);
    saveSession(
      buildSession({
        examType: "legacy_set",
        mode: "practice",
        setId: drillSetId,
        questionIds,
        timeLimitSeconds: computeExamDurationMinutes(questionIds.length) * 60,
        seed,
      }),
    );
    router.push(`/exam?set=${drillSetId}&mode=practice`);
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
        Seminar Packs
      </h2>
      <p className="subtitle" style={{ marginBottom: 16 }}>
        Optional practice-only sets from seminar sheets.
      </p>
      <div className="grid grid-2">
        <div className="card" style={{ boxShadow: "none" }}>
          <div className="question-meta">
            <span className="pill pill-accent">Week 2</span>
            <span className="pill">Demand &amp; Supply</span>
            <span className="pill">
              {hasWeek2Pack ? week2Questions.length : 0} questions
            </span>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            {hasWeek2Pack
              ? "Practice questions from the Week 2 seminar pack."
              : "Pack not found. Add it to /public/packs to enable."}
          </p>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              onClick={startWeek2Pack}
              disabled={!hasWeek2Pack}
            >
              Start practice
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={startWeek2Drill}
              disabled={!hasWeek2Pack}
            >
              Week 2 Drill (10 questions)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

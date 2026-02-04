"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildExamQuestions,
  fetchExamBank,
  type ExamBank,
  type ExamQuestion,
} from "@/lib/examBank";
import { loadSession, saveSession, type AnswerMap } from "@/lib/examSession";

type ExamRunnerProps = {
  setId: string;
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export default function ExamRunner({ setId }: ExamRunnerProps) {
  const router = useRouter();
  const [bank, setBank] = useState<ExamBank | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [sessionSeed] = useState(() => loadSession());
  const storedSession =
    sessionSeed && sessionSeed.setId === setId && !sessionSeed.submittedAt
      ? sessionSeed
      : null;

  const storedDurationOverride = storedSession?.durationMinutes;
  const storedDuration = storedDurationOverride ?? 50;
  const submittedRef = useRef(Boolean(storedSession?.submittedAt));

  const [startedAt] = useState(
    () => storedSession?.startedAt ?? new Date().toISOString(),
  );
  const [answers, setAnswers] = useState<AnswerMap>(
    () => storedSession?.answers ?? {},
  );
  const [flags, setFlags] = useState<Set<string>>(
    () => new Set(storedSession?.flags ?? []),
  );
  const [currentIndex, setCurrentIndex] = useState(
    () => storedSession?.currentIndex ?? 0,
  );
  const [submittedAt, setSubmittedAt] = useState<string | undefined>(
    () => storedSession?.submittedAt,
  );
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    const elapsed = Math.floor(
      (Date.now() - new Date(startedAt).getTime()) / 1000,
    );
    return Math.max(0, storedDuration * 60 - elapsed);
  });

  const answersRef = useRef(answers);
  const flagsRef = useRef(flags);
  const currentIndexRef = useRef(currentIndex);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    flagsRef.current = flags;
  }, [flags]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

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
          setFetchError(
            err instanceof Error ? err.message : "Failed to load exam.",
          );
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const { questions, buildError, durationMinutes } = useMemo(() => {
    if (!bank) {
      return {
        questions: [] as ExamQuestion[],
        buildError: null as string | null,
        durationMinutes: storedDuration,
      };
    }

    try {
      const built = buildExamQuestions(bank, setId);
      const duration =
        storedDurationOverride ??
        bank.exam_sets[setId]?.duration_minutes ??
        bank.duration_minutes ??
        50;
      return { questions: built, buildError: null, durationMinutes: duration };
    } catch (err) {
      return {
        questions: [] as ExamQuestion[],
        buildError:
          err instanceof Error ? err.message : "Unable to build exam.",
        durationMinutes: storedDuration,
      };
    }
  }, [bank, setId, storedDuration, storedDurationOverride]);

  const questionIds =
    storedSession?.questionIds?.length && storedSession.questionIds.length > 0
      ? storedSession.questionIds
      : questions.map((question) => question.id);

  const questionIdsRef = useRef(questionIds);

  useEffect(() => {
    questionIdsRef.current = questionIds;
  }, [questionIds]);

  const timerActive = remainingSeconds > 0 && !submittedAt;

  const submitExam = useCallback(
    (reason: "manual" | "timeout") => {
      if (submittedRef.current || questionIdsRef.current.length === 0) {
        return;
      }
      submittedRef.current = true;
      const submitted = new Date().toISOString();
      setSubmittedAt(submitted);
      saveSession({
        setId,
        questionIds: questionIdsRef.current,
        answers: answersRef.current,
        flags: Array.from(flagsRef.current),
        startedAt,
        submittedAt: submitted,
        durationMinutes,
        currentIndex: currentIndexRef.current,
      });
      router.push(`/results?set=${setId}&reason=${reason}`);
    },
    [durationMinutes, router, setId, startedAt],
  );

  useEffect(() => {
    if (!timerActive) {
      return;
    }
    const interval = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0) {
          submitExam("timeout");
        }
        return next;
      });
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [durationMinutes, submitExam, timerActive]);

  useEffect(() => {
    if (questionIds.length === 0) {
      return;
    }
    saveSession({
      setId,
      questionIds,
      answers,
      flags: Array.from(flags),
      startedAt,
      submittedAt,
      durationMinutes,
      currentIndex,
    });
  }, [
    answers,
    currentIndex,
    durationMinutes,
    flags,
    questionIds,
    setId,
    startedAt,
    submittedAt,
  ]);

  const answeredCount = useMemo(
    () => Object.values(answers).filter((value) => value?.trim()).length,
    [answers],
  );

  const activeIndex = questions.length
    ? Math.min(currentIndex, questions.length - 1)
    : 0;
  const currentQuestion = questions[activeIndex];

  const toggleFlag = () => {
    if (!currentQuestion) {
      return;
    }
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(currentQuestion.id)) {
        next.delete(currentQuestion.id);
      } else {
        next.add(currentQuestion.id);
      }
      return next;
    });
  };

  const updateAnswer = (value: string) => {
    if (!currentQuestion) {
      return;
    }
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
  };

  const error = fetchError ?? buildError;

  if (loading) {
    return (
      <div className="card">
        <p className="muted">Loading exam…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <p className="muted">{error}</p>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="card">
        <p className="muted">No questions found for set {setId}.</p>
      </div>
    );
  }

  return (
    <>
      <header className="header">
        <div>
          <h1 className="title">Exam Runner</h1>
          <p className="subtitle">
            Set {setId} · {questions.length} questions · {durationMinutes} minutes
          </p>
        </div>
        <div className="card" style={{ padding: "12px 16px" }}>
          <div className="question-meta" style={{ marginBottom: 8 }}>
            <span className="pill pill-accent">Exam mode</span>
            <span className="pill">Answered {answeredCount}</span>
            <span className="pill">Flagged {flags.size}</span>
          </div>
          <strong style={{ fontSize: 20 }}>
            {formatTime(remainingSeconds)}
          </strong>
        </div>
      </header>

      <div className="card">
        <div className="nav-bar">
          <div className="btn-row">
            <button className="btn btn-secondary" disabled>
              Start
            </button>
            <button className="btn btn-secondary" disabled>
              Pause
            </button>
          </div>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={toggleFlag}
          >
            {flags.has(currentQuestion.id) ? "Unflag" : "Flag question"}
          </button>
        </div>

        <div className="question-meta" style={{ marginTop: 18 }}>
          <span className="pill">{currentQuestion.section}</span>
          <span className="pill">Question {activeIndex + 1}</span>
          <span className="pill">{currentQuestion.points} pts</span>
          <span className="pill">{currentQuestion.topic}</span>
        </div>

        <p className="question-prompt">{currentQuestion.prompt}</p>

        {currentQuestion.type === "mcq_single" ? (
          <div>
            {Object.entries(currentQuestion.options).map(([key, value]) => (
              <label key={key} className="option">
                <input
                  type="radio"
                  name={currentQuestion.id}
                  value={key}
                  checked={answers[currentQuestion.id] === key}
                  onChange={() => updateAnswer(key)}
                />
                <div>
                  <strong>{key}.</strong> {value}
                </div>
              </label>
            ))}
          </div>
        ) : (
          <textarea
            className="textarea"
            placeholder="Type your response here..."
            value={answers[currentQuestion.id] ?? ""}
            onChange={(event) => updateAnswer(event.target.value)}
          />
        )}

        <div className="nav-bar" style={{ marginTop: 24 }}>
          <div className="btn-row">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={activeIndex === 0}
            >
              Back
            </button>
            {activeIndex < questions.length - 1 ? (
              <button
                className="btn"
                type="button"
                onClick={() =>
                  setCurrentIndex((prev) =>
                    Math.min(questions.length - 1, prev + 1),
                  )
                }
              >
                Next
              </button>
            ) : (
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => submitExam("manual")}
              >
                Finish exam
              </button>
            )}
          </div>
          <span className="muted">
            Autosubmit at 00:00 · MCQs auto-marked
          </span>
        </div>

        <div className="question-nav">
          {questions.map((question, index) => {
            const isAnswered = Boolean(answers[question.id]);
            return (
              <button
                key={question.id}
                type="button"
                onClick={() => setCurrentIndex(index)}
                data-active={index === activeIndex}
                data-flagged={flags.has(question.id)}
                aria-label={`Go to question ${index + 1}`}
                title={
                  isAnswered
                    ? "Answered"
                    : flags.has(question.id)
                      ? "Flagged"
                      : "Not answered"
                }
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildExamQuestions,
  buildQuestionsFromIds,
  fetchExamBank,
  type ExamBank,
  type ExamQuestion,
} from "@/lib/examBank";
import {
  getActiveSession,
  removeSession,
  saveSession,
  type AnswerMap,
  type AnswerValue,
  type DiagramLogicResponse,
  type CalculationTableResponse,
  getSessionSeed,
  type ExamSession,
} from "@/lib/examSession";
import { getPaceStatus } from "@/lib/pacing";
import QuestionNavigator from "@/components/QuestionNavigator";
import { applyMcqResults } from "@/lib/spacedRepetition";
import DiagramLogicAnswer from "@/components/DiagramLogicAnswer";
import { computeExamDurationMinutes } from "@/lib/examDuration";
import { scoreMcqQuestion } from "@/lib/scoring";
import {
  computeRemainingSeconds,
  shouldAutoSubmit,
  deriveLockState,
} from "@/lib/examTimer";
import { EXAM_TYPE_TIME_LIMITS } from "@/lib/examConfig";

type ExamRunnerProps = {
  setId: string;
  mode: "practice" | "real_exam";
};

const packPrefixBySetId: Record<string, string> = {
  "pack-week2": "W2-",
  "pack-week1": "W1I-",
  "pack-week2-ds": "W2DS-",
};
const retryPrefix = "retry-";
const drillPrefix = "drill-";

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const isDiagramResponse = (
  value: AnswerValue | undefined,
): value is DiagramLogicResponse =>
  typeof value === "object" && value !== null && "curve" in value;

const getDiagramResponse = (
  value: AnswerValue | undefined,
): DiagramLogicResponse => {
  if (isDiagramResponse(value)) {
    return {
      curve: value.curve ?? "",
      direction: value.direction ?? "",
      priceEffect: value.priceEffect ?? "",
      quantityEffect: value.quantityEffect ?? "",
      justification: value.justification ?? "",
    };
  }
  return {
    curve: "",
    direction: "",
    priceEffect: "",
    quantityEffect: "",
    justification: typeof value === "string" ? value : "",
  };
};

const isAnsweredValue = (value: AnswerValue | undefined) => {
  if (!value) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (isDiagramResponse(value)) {
    return Boolean(
      value.curve ||
        value.direction ||
        value.priceEffect ||
        value.quantityEffect ||
        value.justification.trim(),
    );
  }
  return Object.values(value).some(
    (entry) => typeof entry === "string" && entry.trim().length > 0,
  );
};

const shuffleList = <T,>(items: T[]) => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const marketSupplyRows = ["£5", "£4", "£3", "£2", "£1"];

const parseNumericInput = (value: string) => {
  const cleaned = value.replace(/[,\s]/g, "").replace(/£/g, "");
  if (cleaned.trim() === "") {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const getTableResponse = (
  value: AnswerValue | undefined,
): CalculationTableResponse => {
  if (value && typeof value === "object" && !isDiagramResponse(value)) {
    return value as CalculationTableResponse;
  }
  return {};
};

export default function ExamRunner({ setId, mode }: ExamRunnerProps) {
  const router = useRouter();
  const [bank, setBank] = useState<ExamBank | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [sessionSnapshot] = useState(() => getActiveSession());
  const matchesSession = (session: ExamSession | null) => {
    if (!session) {
      return false;
    }
    if (setId === "exam1_mcq" || setId === "exam2_written") {
      return session.examType === setId;
    }
    if (setId === "A" || setId === "B" || setId === "C") {
      return session.examType === "legacy_set" && session.meta?.legacySetId === setId;
    }
    return session.setId === setId;
  };
  const storedSession = matchesSession(sessionSnapshot) ? sessionSnapshot : null;
  const completedSession =
    storedSession && storedSession.submittedAt && mode === "real_exam"
      ? storedSession
      : null;

  const storedDurationOverride = storedSession?.timeLimitSeconds;
  const storedDuration = storedDurationOverride
    ? Math.ceil(storedDurationOverride / 60)
    : 50;
  const submittedRef = useRef(Boolean(storedSession?.submittedAt));
  const sessionMode = storedSession?.mode ?? mode;
  const isRealExam = sessionMode === "real_exam";

  const [startedAt] = useState(
    () => storedSession?.startedAt ?? new Date().toISOString(),
  );
  const sessionSeed = useMemo(
    () => getSessionSeed(storedSession, startedAt),
    [startedAt, storedSession],
  );
  const [answers, setAnswers] = useState<AnswerMap>(
    () => storedSession?.answers ?? {},
  );
  const [flags, setFlags] = useState<Set<string>>(
    () => new Set(storedSession?.flags ?? []),
  );
  const [sessionQuestionIds, setSessionQuestionIds] = useState<string[]>(
    () => storedSession?.questionIds ?? [],
  );
  const [shufflePack, setShufflePack] = useState(
    () => storedSession?.shuffle ?? false,
  );
  const [currentIndex, setCurrentIndex] = useState(
    () => storedSession?.currentIndex ?? 0,
  );
  const [revealedSchemes, setRevealedSchemes] = useState<Set<string>>(
    () => new Set(),
  );
  const [submittedAt, setSubmittedAt] = useState<string | undefined>(
    () => storedSession?.submittedAt,
  );
  const [submitReason, setSubmitReason] = useState<"manual" | "timeout" | null>(
    null,
  );
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    return computeRemainingSeconds({
      startedAt,
      durationMinutes: storedDuration,
    });
  });

  const answersRef = useRef(answers);
  const flagsRef = useRef(flags);
  const currentIndexRef = useRef(currentIndex);
  const hasBeepedRef = useRef(false);

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

  useEffect(() => {
    if (completedSession && isRealExam) {
      router.replace(`/results?set=${setId}`);
    }
  }, [completedSession, isRealExam, router, setId]);

  const isReviewSession = setId === "review";
  const isPackSession = setId.startsWith("pack-");
  const isRetrySession = setId.startsWith(retryPrefix);
  const isDrillSession = setId.startsWith(drillPrefix);
  const isExamTypeSession = setId === "exam1_mcq" || setId === "exam2_written";
  const isPresetSession = setId.startsWith("preset-");
  const isCustomSession =
    isReviewSession ||
    isPackSession ||
    isRetrySession ||
    isDrillSession ||
    isExamTypeSession ||
    isPresetSession;

  const packIds = useMemo(() => {
    if (!bank || !isPackSession) {
      return [] as string[];
    }
    const prefix = packPrefixBySetId[setId] ?? "";
    if (!prefix) {
      return [] as string[];
    }
    return bank.bank
      .filter((question) => question.id.startsWith(prefix))
      .map((question) => question.id)
      .sort((a, b) => a.localeCompare(b));
  }, [bank, isPackSession, setId]);

  useEffect(() => {
    if (!isPackSession || sessionQuestionIds.length > 0 || packIds.length === 0) {
      return;
    }
    const nextIds = shufflePack ? shuffleList(packIds) : packIds;
    setSessionQuestionIds(nextIds);
  }, [isPackSession, packIds, sessionQuestionIds.length, shufflePack]);

  const { questions, buildError } = useMemo(() => {
    if (!bank) {
      return {
        questions: [] as ExamQuestion[],
        buildError: null as string | null,
      };
    }

    try {
      const customIds =
        sessionQuestionIds.length > 0
          ? sessionQuestionIds
          : isPackSession
            ? packIds
            : storedSession?.questionIds ?? [];
      const built = isCustomSession
        ? buildQuestionsFromIds(
            bank,
            customIds,
            isReviewSession
              ? "Review"
              : isRetrySession
                ? "Retry"
                : isDrillSession
                  ? "Drill"
                : isExamTypeSession
                  ? "Exam"
                  : "Seminar Pack",
          )
        : buildExamQuestions(bank, setId, sessionSeed);
      return { questions: built, buildError: null };
    } catch (err) {
      return {
        questions: [] as ExamQuestion[],
        buildError:
          err instanceof Error ? err.message : "Unable to build exam.",
      };
    }
  }, [
    bank,
    isCustomSession,
    isPackSession,
    isRetrySession,
    isDrillSession,
    isExamTypeSession,
    isReviewSession,
    packIds,
    sessionQuestionIds,
    sessionSeed,
    setId,
    storedSession,
  ]);

  const questionIds =
    sessionQuestionIds.length > 0
      ? sessionQuestionIds
      : questions.map((question) => question.id);

  const durationMinutes = useMemo(() => {
    if (storedSession?.timeLimitSeconds) {
      return Math.ceil(storedSession.timeLimitSeconds / 60);
    }
    if (storedSession?.examType && storedSession.examType in EXAM_TYPE_TIME_LIMITS) {
      return Math.ceil(EXAM_TYPE_TIME_LIMITS[storedSession.examType] / 60);
    }
    if (questionIds.length > 0) {
      return computeExamDurationMinutes(questionIds.length);
    }
    return 50;
  }, [questionIds.length, storedSession?.timeLimitSeconds, storedSession?.examType]);

  const questionIdsRef = useRef(questionIds);

  useEffect(() => {
    questionIdsRef.current = questionIds;
  }, [questionIds]);

  useEffect(() => {
    if (submittedAt) {
      return;
    }
    setRemainingSeconds(
      computeRemainingSeconds({ startedAt, durationMinutes }),
    );
  }, [durationMinutes, startedAt, submittedAt]);

  const timerActive = remainingSeconds > 0 && !submittedAt;
  const isLocked = isRealExam
    ? deriveLockState({ submittedAt }, storedSession, completedSession)
    : false;
  const warningLevel =
    !isLocked && remainingSeconds <= 60
      ? "critical"
      : !isLocked && remainingSeconds <= 300
        ? "warning"
        : null;

  const submitExam = useCallback(
    (reason: "manual" | "timeout") => {
      if (submittedRef.current || questionIdsRef.current.length === 0) {
        return;
      }
      submittedRef.current = true;
      const submitted = new Date().toISOString();
      setSubmitReason(reason);
      setSubmittedAt(submitted);
      applyMcqResults({
        questions: questions.filter(
          (question) => question.type === "mcq_single",
        ),
        answers: answersRef.current,
      });
      if (storedSession) {
        saveSession({
          ...storedSession,
          questionIds: questionIdsRef.current,
          answers: answersRef.current,
          flags: Array.from(flagsRef.current),
          startedAt,
          submittedAt: submitted,
          locked: isRealExam ? true : storedSession.locked,
          currentIndex: currentIndexRef.current,
        });
      }
      router.push(`/results?set=${setId}&reason=${reason}`);
    },
    [isRealExam, questions, router, setId, startedAt, storedSession],
  );

  useEffect(() => {
    if (isLocked || remainingSeconds > 60 || hasBeepedRef.current) {
      return;
    }
    hasBeepedRef.current = true;
    try {
      const audioCtx = new (window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext!)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gainNode.gain.value = 0.05;
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
      oscillator.onended = () => {
        audioCtx.close().catch(() => undefined);
      };
    } catch {
      // Optional beep; ignore failures (autoplay restrictions, etc.)
    }
  }, [isLocked, remainingSeconds]);

  useEffect(() => {
    if (!timerActive) {
      return;
    }
    const interval = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = Math.max(0, prev - 1);
        if (isRealExam && shouldAutoSubmit(next)) {
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
    if (!storedSession) {
      return;
    }
    saveSession({
      ...storedSession,
      questionIds,
      answers,
      flags: Array.from(flags),
      startedAt,
      submittedAt,
      locked: isRealExam ? Boolean(submittedAt || storedSession.locked) : storedSession.locked,
      currentIndex,
    });
  }, [
    answers,
    currentIndex,
    durationMinutes,
    flags,
    isPackSession,
    questionIds,
    isRealExam,
    startedAt,
    submittedAt,
    storedSession,
  ]);

  const answeredIds = useMemo(() => {
    const ids = new Set<string>();
    questions.forEach((question) => {
      if (isAnsweredValue(answers[question.id])) {
        ids.add(question.id);
      }
    });
    return ids;
  }, [answers, questions]);

  const answeredCount = answeredIds.size;

  const activeIndex = questions.length
    ? Math.min(currentIndex, questions.length - 1)
    : 0;
  const currentQuestion = questions[activeIndex];
  const elapsedSeconds = durationMinutes * 60 - remainingSeconds;
  const paceStatus = useMemo(
    () =>
      getPaceStatus({
        questions,
        currentIndex: activeIndex,
        elapsedSeconds,
      }),
    [activeIndex, elapsedSeconds, questions],
  );
  const paceClass =
    paceStatus === "Behind"
      ? "pill pill-danger"
      : paceStatus === "Ahead"
        ? "pill pill-success"
        : "pill pill-accent";

  const toggleFlag = () => {
    if (!currentQuestion || isLocked) {
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

  const updateAnswer = (value: AnswerValue) => {
    if (!currentQuestion || isLocked) {
      return;
    }
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
  };

  const hasProgress = useMemo(() => {
    const hasAnswer = Object.values(answers).some((value) => {
      if (!value) {
        return false;
      }
      if (typeof value === "string") {
        return value.trim().length > 0;
      }
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      if (typeof value === "object") {
        return Object.values(value).some(
          (entry) => typeof entry === "string" && entry.trim().length > 0,
        );
      }
      return false;
    });
    return hasAnswer || flags.size > 0;
  }, [answers, flags]);

  const toggleMarkScheme = () => {
    if (!currentQuestion || isLocked) {
      return;
    }
    setRevealedSchemes((prev) => {
      const next = new Set(prev);
      if (next.has(currentQuestion.id)) {
        next.delete(currentQuestion.id);
      } else {
        next.add(currentQuestion.id);
      }
      return next;
    });
  };

  const error = fetchError ?? buildError;

  if (loading) {
    return (
      <div className="card">
        <p className="muted">Loading exam…</p>
      </div>
    );
  }

  if (completedSession) {
    return (
      <div className="card">
        <p className="muted">Exam already submitted. Redirecting to results…</p>
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

  const toggleShuffle = () => {
    if (!isPackSession || packIds.length === 0 || isLocked) {
      return;
    }
    const nextShuffle = !shufflePack;
    const nextIds = nextShuffle ? shuffleList(packIds) : packIds;
    const currentId = currentQuestion?.id;
    setShufflePack(nextShuffle);
    setSessionQuestionIds(nextIds);
    if (currentId) {
      const nextIndex = nextIds.indexOf(currentId);
      setCurrentIndex(nextIndex >= 0 ? nextIndex : 0);
    }
  };

  return (
    <>
      {warningLevel === "warning" && (
        <div className="card" style={{ marginBottom: 16, background: "#fff7d6" }}>
          <strong>5 minutes remaining</strong>
        </div>
      )}
      {warningLevel === "critical" && (
        <div className="card" style={{ marginBottom: 16, background: "#ffe0e0" }}>
          <strong>1 minute remaining</strong>
        </div>
      )}
      {isLocked && (
        <div className="card" style={{ marginBottom: 16 }}>
          <strong>
            {submitReason === "timeout"
              ? "Time expired — exam submitted"
              : "Submitted"}
          </strong>
        </div>
      )}
      <header className="header">
        <div>
          <h1 className="title">Exam Runner</h1>
          <p className="subtitle">
            Set {setId} · {questions.length} questions · {durationMinutes} minutes
          </p>
        </div>
        <div className="card" style={{ padding: "12px 16px" }}>
          <div className="question-meta" style={{ marginBottom: 8 }}>
            <span className="pill pill-accent">
              {sessionMode === "practice" ? "Practice mode" : "Real exam"}
            </span>
            <span className="pill">Answered {answeredCount}</span>
            <span className="pill">Flagged {flags.size}</span>
            <span className={paceClass}>{paceStatus}</span>
          </div>
          {sessionMode === "practice" && (
            <div className="btn-row" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (!hasProgress) {
                    if (storedSession?.id) {
                      removeSession(storedSession.id);
                    }
                    router.push("/");
                    return;
                  }
                  setShowExitConfirm(true);
                }}
              >
                Exit to Home
              </button>
            </div>
          )}
          {isPackSession && (
            <label className="muted" style={{ display: "block", marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={shufflePack}
                onChange={toggleShuffle}
                style={{ marginRight: 8 }}
                disabled={isLocked}
              />
              Shuffle
            </label>
          )}
          <strong style={{ fontSize: 20 }}>
            {formatTime(remainingSeconds)}
          </strong>
        </div>
      </header>
      {showExitConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12, 12, 12, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="card"
            style={{
              maxWidth: 520,
              width: "100%",
              boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
            }}
          >
            <h2 className="title" style={{ fontSize: 22, marginBottom: 8 }}>
              Exit practice session?
            </h2>
            <p className="muted">
              You have progress in this session. Choose whether to save it or
              discard it before exiting.
            </p>
            <div className="btn-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (storedSession) {
                    saveSession({
                      ...storedSession,
                      questionIds: questionIdsRef.current,
                      answers: answersRef.current,
                      flags: Array.from(flagsRef.current),
                      startedAt,
                      locked: false,
                      currentIndex: currentIndexRef.current,
                    });
                  }
                  setShowExitConfirm(false);
                  router.push("/");
                }}
              >
                Save &amp; Exit
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (storedSession?.id) {
                    removeSession(storedSession.id);
                  }
                  setShowExitConfirm(false);
                  router.push("/");
                }}
              >
                Discard &amp; Exit
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowExitConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
            disabled={isLocked}
          >
            {flags.has(currentQuestion.id) ? "Unflag" : "Flag question"}
          </button>
        </div>

        <div className="question-meta" style={{ marginTop: 18 }}>
          <span className="pill">{currentQuestion.section}</span>
          <span className="pill">Question {activeIndex + 1}</span>
          <span className="pill">{currentQuestion.points} pts</span>
          <span className="pill">{currentQuestion.topic}</span>
          {currentQuestion.type === "mcq_multi" && (
            <span className="pill pill-accent">Select 2</span>
          )}
        </div>

        <p className="question-prompt">{currentQuestion.prompt}</p>

        {currentQuestion.type === "mcq_single" ||
        currentQuestion.type === "mcq_multi" ? (
          (() => {
            const isMulti = currentQuestion.type === "mcq_multi";
            const currentAnswer = answers[currentQuestion.id];
            const selected = Array.isArray(currentAnswer)
              ? currentAnswer
              : typeof currentAnswer === "string" && !isMulti
                ? currentAnswer
                : isMulti
                  ? []
                  : "";
            const showFeedback =
              sessionMode === "practice" &&
              (isMulti
                ? (selected as string[]).length > 0
                : Boolean(selected));
            const score = showFeedback
              ? scoreMcqQuestion(
                  currentQuestion,
                  currentAnswer,
                  sessionMode,
                )
              : null;
            return (
              <div>
                {Object.entries(currentQuestion.options).map(([key, value]) => (
                  <label key={key} className="option">
                    <input
                      type={isMulti ? "checkbox" : "radio"}
                      name={currentQuestion.id}
                      value={key}
                      checked={
                        isMulti
                          ? (selected as string[]).includes(key)
                          : selected === key
                      }
                      onChange={() => {
                        if (isMulti) {
                          const next = new Set(selected as string[]);
                          if (next.has(key)) {
                            next.delete(key);
                          } else {
                            next.add(key);
                          }
                          updateAnswer(Array.from(next));
                        } else {
                          updateAnswer(key);
                        }
                      }}
                      disabled={isLocked}
                    />
                    <div>
                      <strong>{key}.</strong> {value}
                    </div>
                  </label>
                ))}
                {showFeedback && score && (
                  <div className="feedback">
                    <span
                      className={
                        score.isCorrect
                          ? "pill pill-success"
                          : score.isPartial
                            ? "pill pill-accent"
                            : "pill pill-danger"
                      }
                    >
                      {score.isCorrect
                        ? "Correct"
                        : score.isPartial
                          ? "Partially correct"
                          : "Incorrect"}
                    </span>
                    {currentQuestion.rationale && (
                      <p className="muted" style={{ marginTop: 8 }}>
                        <strong>Rationale:</strong> {currentQuestion.rationale}
                      </p>
                    )}
                    <div className="btn-row" style={{ marginTop: 12 }}>
                      {activeIndex >= questions.length - 1 ? (
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => submitExam("manual")}
                          disabled={isLocked}
                        >
                          Finish exam
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            setCurrentIndex((prev) =>
                              Math.min(questions.length - 1, prev + 1),
                            )
                          }
                          disabled={isLocked}
                        >
                          Next
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        ) : currentQuestion.type === "calculation_table" ? (
          (() => {
            const response = getTableResponse(answers[currentQuestion.id]);
            const marketSupply = currentQuestion.answer_data?.market_supply ?? {};
            const rows = marketSupplyRows.map((price) => {
              const raw = response[price] ?? "";
              const parsed = parseNumericInput(raw);
              const expected = marketSupply[price];
              const isCorrect =
                expected !== undefined && parsed !== null && parsed === expected;
              return {
                price,
                raw,
                expected,
                isCorrect,
              };
            });
            const correctCount = rows.filter((row) => row.isCorrect).length;
            const totalRows = rows.length;
            return (
              <div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 0" }}>
                        Price
                      </th>
                      <th style={{ textAlign: "left", padding: "6px 0" }}>
                        Market supply
                      </th>
                      <th style={{ textAlign: "left", padding: "6px 0" }}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.price}>
                        <td style={{ padding: "6px 0" }}>{row.price}</td>
                        <td style={{ padding: "6px 0" }}>
                          <input
                            type="text"
                            value={row.raw}
                            onChange={(event) => {
                              const next = {
                                ...response,
                                [row.price]: event.target.value,
                              };
                              updateAnswer(next);
                            }}
                            style={{ width: "120px" }}
                            disabled={isLocked}
                          />
                        </td>
                        <td style={{ padding: "6px 0" }}>
                          <span
                            className={
                              row.isCorrect ? "pill pill-success" : "pill pill-danger"
                            }
                          >
                            {row.isCorrect ? "Correct" : "Incorrect"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted" style={{ marginTop: 12 }}>
                  Score: {correctCount}/{totalRows}
                </p>
              </div>
            );
          })()
        ) : currentQuestion.type === "diagram_logic" ? (
          <>
            <DiagramLogicAnswer
              value={getDiagramResponse(answers[currentQuestion.id])}
              onChange={(next) => updateAnswer(next)}
              disabled={isLocked}
            />
            {mode === "practice" && (
              <div className="feedback">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={toggleMarkScheme}
                  disabled={isLocked}
                >
                  {revealedSchemes.has(currentQuestion.id)
                    ? "Hide mark scheme"
                    : "Show mark scheme"}
                </button>
                {revealedSchemes.has(currentQuestion.id) && (
                  <div className="scheme">
                    <p>
                      <strong>Model answer:</strong>{" "}
                      {currentQuestion.model_answer}
                    </p>
                    <div>
                      <strong>Mark scheme:</strong>
                      <ul>
                        {currentQuestion.mark_scheme.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <textarea
              className="textarea"
              placeholder="Type your response here..."
              value={String(answers[currentQuestion.id] ?? "")}
              onChange={(event) => updateAnswer(event.target.value)}
              disabled={isLocked}
            />
            {mode === "practice" && (
              <div className="feedback">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={toggleMarkScheme}
                  disabled={isLocked}
                >
                  {revealedSchemes.has(currentQuestion.id)
                    ? "Hide mark scheme"
                    : "Show mark scheme"}
                </button>
                {revealedSchemes.has(currentQuestion.id) && (
                  <div className="scheme">
                    <p>
                      <strong>Model answer:</strong>{" "}
                      {currentQuestion.model_answer}
                    </p>
                    <div>
                      <strong>Mark scheme:</strong>
                      <ul>
                        {currentQuestion.mark_scheme.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div className="nav-bar" style={{ marginTop: 24 }}>
          <div className="btn-row">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={activeIndex === 0 || isLocked}
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
                disabled={isLocked}
              >
                Next
              </button>
            ) : (
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => submitExam("manual")}
                disabled={isLocked}
              >
                Finish exam
              </button>
            )}
          </div>
          <span className="muted">
            Autosubmit at 00:00 · MCQs auto-marked
          </span>
        </div>

        <QuestionNavigator
          questions={questions}
          currentIndex={activeIndex}
          answeredIds={answeredIds}
          flags={flags}
          onSelect={(index) => {
            if (!isLocked) {
              setCurrentIndex(index);
            }
          }}
          disabled={isLocked}
        />
      </div>
    </>
  );
}

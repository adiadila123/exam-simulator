"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fetchExamBank,
  type ExamBank,
  type ExamQuestion,
  buildExamQuestions,
  buildQuestionsFromIds,
  categorizeExam1Topic,
} from "@/lib/examBank";
import {
  loadSessions,
  type AnswerValue,
  type DiagramLogicResponse,
  type ExamSession,
  getSessionSeed,
  saveSession,
} from "@/lib/examSession";
import { scoreMcq } from "@/lib/scoring";
import {
  MISTAKE_REASONS,
  readMistakes,
  setMistakeReason,
  type MistakeMap,
} from "@/lib/mistakes";

const isDiagramResponse = (
  value: AnswerValue | undefined,
): value is DiagramLogicResponse =>
  typeof value === "object" && value !== null && "curve" in value;

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

const renderDiagramResponse = (value: AnswerValue | undefined) => {
  if (!value) {
    return "No response";
  }
  if (!isDiagramResponse(value)) {
    return `Legacy response: ${value}`;
  }
  const parts = [
    value.curve && `Curve: ${value.curve}`,
    value.direction && `Direction: ${value.direction}`,
    value.priceEffect && `Price: ${value.priceEffect}`,
    value.quantityEffect && `Quantity: ${value.quantityEffect}`,
    value.justification && `Justification: ${value.justification}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "No response";
};

const marketSupplyRows = ["£5", "£4", "£3", "£2", "£1"];

const getTableResponse = (value: AnswerValue | undefined) => {
  if (value && typeof value === "object" && !isDiagramResponse(value)) {
    return value as Record<string, string>;
  }
  return {};
};

const getSelfMarkKey = (sessionId: string) => `selfMarkV1:${sessionId}`;

const readSelfMark = (sessionId: string) => {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = window.localStorage.getItem(getSelfMarkKey(sessionId));
  if (raw) {
    try {
      return JSON.parse(raw) as Record<string, string[]>;
    } catch {
      return {};
    }
  }
  return {};
};

const readSelfMarkForSession = (session: ExamSession) => {
  const data = readSelfMark(session.id);
  if (Object.keys(data).length > 0) {
    return data;
  }
  if (session.startedAt) {
    return readSelfMark(session.startedAt);
  }
  return data;
};

const writeSelfMark = (sessionId: string, data: Record<string, string[]>) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(getSelfMarkKey(sessionId), JSON.stringify(data));
};

type ResultsSummaryProps = {
  setId: string;
};

export default function ResultsSummary({ setId }: ResultsSummaryProps) {
  const [bank, setBank] = useState<ExamBank | null>(null);
  const [sessions] = useState<ExamSession[]>(() => loadSessions());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState<MistakeMap>(() => readMistakes());
  const [error, setError] = useState<string | null>(null);
  const [selfMark, setSelfMark] = useState<Record<string, string[]>>({});
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

  const matchesRoute = (session: ExamSession) => {
    if (setId === "exam1_mcq" || setId === "exam2_written") {
      return session.examType === setId;
    }
    if (setId === "A" || setId === "B" || setId === "C") {
      return session.examType === "legacy_set" && session.meta?.legacySetId === setId;
    }
    return session.setId === setId;
  };

  const filteredSessions = sessions.filter(matchesRoute);

  const selectedSession = useMemo(() => {
    if (selectedId) {
      return filteredSessions.find((item) => item.id === selectedId) ?? null;
    }
    return (
      filteredSessions.find((item) => item.submittedAt) ??
      filteredSessions[0] ??
      null
    );
  }, [filteredSessions, selectedId]);

  useEffect(() => {
    if (selectedSession) {
      setSelfMark(readSelfMarkForSession(selectedSession));
    }
  }, [selectedSession]);

  const submittedSessions = filteredSessions.filter((item) => item.submittedAt);

  const questions = useMemo<ExamQuestion[]>(() => {
    if (!bank || !selectedSession) {
      return [];
    }
    try {
      const seed = getSessionSeed(
        selectedSession,
        selectedSession.startedAt ?? selectedSession.createdAt,
      );
      const sessionSetId =
        selectedSession.setId ??
        (selectedSession.examType === "legacy_set"
          ? selectedSession.meta?.legacySetId ?? "legacy_set"
          : selectedSession.examType);
      const isCustom =
        sessionSetId === "review" ||
        sessionSetId.startsWith("pack-") ||
        sessionSetId.startsWith("retry-") ||
        sessionSetId.startsWith("drill-") ||
        sessionSetId === "exam1_mcq" ||
        sessionSetId === "exam2_written";
      if (isCustom) {
        return buildQuestionsFromIds(
          bank,
          selectedSession.questionIds,
          sessionSetId === "review"
            ? "Review"
              : sessionSetId.startsWith("retry-")
                ? "Retry"
                : sessionSetId.startsWith("drill-")
                  ? "Drill"
                  : sessionSetId === "exam1_mcq" ||
                      sessionSetId === "exam2_written"
                    ? "Exam"
                  : "Seminar Pack",
        );
      }
      const built = buildExamQuestions(bank, sessionSetId, seed);
      const byId = new Map(built.map((question) => [question.id, question]));
      return selectedSession.questionIds
        .map((id) => byId.get(id))
        .filter((question): question is ExamQuestion => !!question);
    } catch {
      return [];
    }
  }, [bank, selectedSession]);

  if (error) {
    return (
      <div className="card">
        <p className="muted">{error}</p>
      </div>
    );
  }

  if (!selectedSession || !matchesRoute(selectedSession) || !selectedSession.submittedAt) {
    return (
      <div className="card">
        <h1 className="title" style={{ fontSize: 24 }}>
          No completed attempt found
        </h1>
        <p className="muted">
          Start a new exam to generate results for set {setId}.
        </p>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Link className="btn" href={`/exam?set=${setId}`}>
            Start exam
          </Link>
          <Link className="btn btn-secondary" href="/">
            Back to mode select
          </Link>
        </div>
      </div>
    );
  }

  const score = scoreMcq(questions, selectedSession.answers);
  const isExam1 = selectedSession.examType === "exam1_mcq";
  const isExam2 = selectedSession.examType === "exam2_written";
  const answeredCount = Object.values(selectedSession.answers).filter((value) =>
    isAnsweredValue(value),
  ).length;
  const wrongMcqs = questions.filter((question) => {
    if (question.type !== "mcq_single") {
      return false;
    }
    const answer = selectedSession.answers[question.id];
    return typeof answer !== "string" || answer.trim() === ""
      ? true
      : answer !== question.answer_key;
  });
  const isWrongForRetry = (question: ExamQuestion) => {
    const answer = selectedSession.answers[question.id];
    if (question.type === "mcq_single") {
      if (typeof answer !== "string" || answer.trim() === "") {
        return true;
      }
      return answer !== question.answer_key;
    }
    return !isAnsweredValue(answer);
  };
  const wrongIds = questions
    .filter((question) => isWrongForRetry(question))
    .map((question) => question.id);
  const mistakeCounts = MISTAKE_REASONS.reduce<Record<string, number>>(
    (acc, reason) => {
      acc[reason] = 0;
      return acc;
    },
    {},
  );

  wrongMcqs.forEach((question) => {
    const reason = mistakes[question.id];
    if (reason) {
      mistakeCounts[reason] += 1;
    }
  });

  const mcqQuestions = questions.filter(
    (question): question is ExamQuestion & { type: "mcq_single" } =>
      question.type === "mcq_single",
  );
  const mcqCorrectCount = mcqQuestions.filter((question) => {
    const answer = selectedSession.answers[question.id];
    return typeof answer === "string" && answer === question.answer_key;
  }).length;
  const mcqPercent = mcqQuestions.length
    ? Math.round((mcqCorrectCount / mcqQuestions.length) * 100)
    : 0;
  const exam1WrongMcqs = isExam1
    ? mcqQuestions.filter((question) => {
        const answer = selectedSession.answers[question.id];
        return typeof answer !== "string" || answer !== question.answer_key;
      })
    : [];
  const exam1TopicBreakdown = isExam1
    ? mcqQuestions.reduce(
        (acc, question) => {
          const category = categorizeExam1Topic(
            question.topic,
            question.prompt,
          );
          acc[category] = acc[category] ?? { total: 0, correct: 0 };
          acc[category].total += 1;
          const answer = selectedSession.answers[question.id];
          if (typeof answer === "string" && answer === question.answer_key) {
            acc[category].correct += 1;
          }
          return acc;
        },
        {} as Record<string, { total: number; correct: number }>,
      )
    : {};

  const writtenQuestions = questions.filter(
    (question) => question.type !== "mcq_single",
  );

  const updateSelfMark = (questionId: string, item: string, checked: boolean) => {
    const next = { ...selfMark };
    const current = new Set(next[questionId] ?? []);
    if (checked) {
      current.add(item);
    } else {
      current.delete(item);
    }
    next[questionId] = Array.from(current);
    setSelfMark(next);
    if (selectedSession?.id) {
      writeSelfMark(selectedSession.id, next);
    }
  };

  const sessionLabel = (() => {
    if (selectedSession.examType === "exam1_mcq") {
      return "Exam 1 (MCQ)";
    }
    if (selectedSession.examType === "exam2_written") {
      return "Exam 2 (Written)";
    }
    if (selectedSession.setId === "review") {
      return "Review";
    }
    if (selectedSession.setId?.startsWith("retry-")) {
      return "Retry";
    }
    if (selectedSession.setId?.startsWith("drill-")) {
      return "Drill";
    }
    if (selectedSession.setId?.startsWith("pack-")) {
      return "Seminar Pack";
    }
    if (selectedSession.examType === "legacy_set") {
      return `Set ${selectedSession.meta?.legacySetId ?? selectedSession.setId ?? "Legacy"}`;
    }
    return selectedSession.setId ?? "Session";
  })();

  const routeSetId =
    selectedSession.examType === "exam1_mcq" ||
    selectedSession.examType === "exam2_written"
      ? selectedSession.examType
      : selectedSession.setId ??
        selectedSession.meta?.legacySetId ??
        selectedSession.examType;

  return (
    <>
      <header className="header">
        <div>
          <h1 className="title">Results Summary</h1>
          <p className="subtitle">
            {sessionLabel} · Submitted{" "}
            {new Date(selectedSession.submittedAt).toLocaleString()}
          </p>
        </div>
        <div className="card" style={{ padding: "12px 16px" }}>
          {isExam1 ? (
            <>
              <p className="score">
                {mcqCorrectCount}/{mcqQuestions.length}
              </p>
              <p className="muted" style={{ margin: 0 }}>
                {mcqPercent}% correct
              </p>
            </>
          ) : isExam2 ? (
            <>
              <p className="score">{score.pointsEarned} pts</p>
              <p className="muted" style={{ margin: 0 }}>
                {mcqQuestions.length > 0
                  ? `MCQ score: ${score.correct}/${score.total} (${score.pointsAvailable} pts)`
                  : "Written self-marking"}
              </p>
            </>
          ) : (
            <>
              <p className="score">{score.pointsEarned} pts</p>
              <p className="muted" style={{ margin: 0 }}>
                MCQ score: {score.correct}/{score.total} (
                {score.pointsAvailable} pts)
              </p>
            </>
          )}
        </div>
      </header>

      <div className="card">
        <div className="question-meta">
          <span className="pill">Answered {answeredCount}</span>
          <span className="pill">Flagged {selectedSession.flags.length}</span>
          <span className="pill">
            Duration {Math.round(selectedSession.timeLimitSeconds / 60)} min
          </span>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Review model answers and mark schemes below for self-marking on
          written sections.
        </p>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Link className="btn" href={`/exam?set=${routeSetId}`}>
            Start new attempt
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={wrongIds.length === 0}
            onClick={() => {
              if (wrongIds.length === 0) {
                return;
              }
              const retrySetId = `retry-${routeSetId}`;
              const seed = Date.now();
              saveSession({
                version: 2,
                id: crypto.randomUUID(),
                setId: retrySetId,
                examType: selectedSession.examType,
                mode: selectedSession.mode,
                questionIds: wrongIds,
                answers: {},
                flags: [],
                locked: false,
                createdAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                timeLimitSeconds: selectedSession.timeLimitSeconds,
                currentIndex: 0,
                seed,
              });
              router.push(`/exam?set=${retrySetId}&mode=${selectedSession.mode}`);
            }}
          >
            Retry wrong only
          </button>
          <Link className="btn btn-secondary" href="/">
            Back to mode select
          </Link>
        </div>
      </div>

      {submittedSessions.length > 1 && (
        <div className="card">
          <h2 className="title" style={{ fontSize: 22, marginBottom: 8 }}>
            Attempt history
          </h2>
          <label className="muted">
            Select attempt
            <select
              style={{ marginLeft: 12 }}
              value={selectedSession.id}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {submittedSessions.map((item) => (
                <option key={item.id} value={item.id}>
                  {new Date(item.submittedAt ?? item.createdAt).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 0" }}>Date</th>
                <th style={{ textAlign: "left", padding: "6px 0" }}>MCQ pts</th>
              </tr>
            </thead>
            <tbody>
              {submittedSessions.map((item) => {
                const seed = getSessionSeed(
                  item,
                  item.startedAt ?? item.createdAt,
                );
                const sessionSetId =
                  item.setId ??
                  (item.examType === "legacy_set"
                    ? item.meta?.legacySetId ?? "legacy_set"
                    : item.examType);
                const isCustom =
                  sessionSetId === "review" ||
                  sessionSetId.startsWith("pack-") ||
                  sessionSetId.startsWith("retry-") ||
                  sessionSetId.startsWith("drill-") ||
                  sessionSetId === "exam1_mcq" ||
                  sessionSetId === "exam2_written";
                const questionsForAttempt = bank
                  ? isCustom
                    ? buildQuestionsFromIds(
                        bank,
                        item.questionIds,
                        sessionSetId === "review"
                          ? "Review"
                          : sessionSetId.startsWith("retry-")
                            ? "Retry"
                            : sessionSetId.startsWith("drill-")
                              ? "Drill"
                              : sessionSetId === "exam1_mcq" ||
                                  sessionSetId === "exam2_written"
                                ? "Exam"
                              : "Seminar Pack",
                      )
                    : (() => {
                        const built = buildExamQuestions(
                          bank,
                          sessionSetId,
                          seed,
                        );
                        const byId = new Map(
                          built.map((q) => [q.id, q]),
                        );
                        return item.questionIds
                          .map((id) => byId.get(id))
                          .filter((q): q is ExamQuestion => !!q);
                      })()
                  : [];
                const attemptScore = scoreMcq(
                  questionsForAttempt,
                  item.answers,
                );
                return (
                  <tr key={item.id}>
                    <td style={{ padding: "6px 0" }}>
                      {new Date(
                        item.submittedAt ?? item.createdAt,
                      ).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "6px 0" }}>
                      {attemptScore.pointsEarned}/{attemptScore.pointsAvailable}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {wrongMcqs.length > 0 && !isExam1 && !isExam2 && (
        <div className="card">
          <h2 className="title" style={{ fontSize: 22, marginBottom: 8 }}>
            Mistake notebook
          </h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Track why mistakes happened to improve focus areas.
          </p>
          <div className="grid" style={{ marginTop: 16 }}>
            {MISTAKE_REASONS.map((reason) => (
              <div key={reason} className="pill">
                {reason}: {mistakeCounts[reason]}
              </div>
            ))}
          </div>
        </div>
      )}

      {isExam1 && (
        <>
          <div className="card">
            <h2 className="title" style={{ fontSize: 22, marginBottom: 8 }}>
              Topic breakdown
            </h2>
            <div className="grid">
              {Object.entries(exam1TopicBreakdown).map(([topic, stats]) => (
                <div key={topic} className="pill">
                  {topic}: {stats.correct}/{stats.total}
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h2 className="title" style={{ fontSize: 22, marginBottom: 8 }}>
              Wrong answers review
            </h2>
            {exam1WrongMcqs.length === 0 ? (
              <p className="muted">All answers correct.</p>
            ) : (
              exam1WrongMcqs.map((question, index) => {
                const userAnswer = selectedSession.answers[question.id];
                return (
                  <div key={question.id} className="review-item">
                    <div className="question-meta">
                      <span className="pill">Q{index + 1}</span>
                      <span className="pill">{question.topic}</span>
                      <span className="pill pill-danger">Incorrect</span>
                    </div>
                    <p className="question-prompt">{question.prompt}</p>
                    <p>
                      <strong>Your answer:</strong>{" "}
                      {typeof userAnswer === "string" && userAnswer
                        ? userAnswer
                        : "No response"}
                    </p>
                    <p>
                      <strong>Correct answer:</strong> {question.answer_key}
                    </p>
                    {question.rationale && (
                      <p className="muted">
                        <strong>Rationale:</strong> {question.rationale}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {isExam2 && (
        <div className="card">
          <h2 className="title" style={{ fontSize: 22, marginBottom: 8 }}>
            Written self-mark checklist
          </h2>
          {writtenQuestions.length === 0 ? (
            <p className="muted">No written questions in this session.</p>
          ) : (
            writtenQuestions.map((question, index) => {
              const response = selectedSession.answers[question.id];
              const responseText =
                typeof response === "string" && response.trim()
                  ? response
                  : "No response";
              return (
              <div key={question.id} className="review-item">
                <div className="question-meta">
                  <span className="pill">{question.section}</span>
                  <span className="pill">Q{index + 1}</span>
                  <span className="pill">{question.points} pts</span>
                </div>
                <p className="question-prompt">{question.prompt}</p>
                <div className="grid">
                  <p>
                    <strong>Your response:</strong>{" "}
                    {question.type === "diagram_logic"
                      ? renderDiagramResponse(
                          response,
                        )
                      : question.type === "calculation_table"
                        ? (() => {
                            const table = getTableResponse(
                              response,
                            );
                            return marketSupplyRows
                              .map((price) => {
                                const value = table[price];
                                return `${price}: ${
                                  value && value.trim() ? value : "—"
                                }`;
                              })
                              .join(" · ");
                          })()
                      : responseText}
                  </p>
                  <p>
                    <strong>Model answer:</strong> {question.model_answer}
                  </p>
                  <div>
                    <strong>Mark scheme:</strong>
                    <ul>
                      {question.mark_scheme.map((item) => {
                        const checked = (selfMark[question.id] ?? []).includes(
                          item,
                        );
                        return (
                          <li key={item}>
                            <label className="muted">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) =>
                                  updateSelfMark(
                                    question.id,
                                    item,
                                    event.target.checked,
                                  )
                                }
                                style={{ marginRight: 8 }}
                              />
                              {item}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>
      )}

      {!isExam1 && !isExam2 && (
        <div className="card">
          <h2 className="title" style={{ fontSize: 22, marginBottom: 8 }}>
            Review
          </h2>
          {questions.map((question, index) => {
            const userAnswer = selectedSession.answers[question.id];
            const isMcq = question.type === "mcq_single";
            const isCorrect =
              isMcq && typeof userAnswer === "string"
                ? userAnswer === question.answer_key
                : false;

            return (
              <div key={question.id} className="review-item">
                <div className="question-meta">
                  <span className="pill">{question.section}</span>
                  <span className="pill">Q{index + 1}</span>
                  <span className="pill">{question.points} pts</span>
                  {isMcq && (
                    <span className={isCorrect ? "pill" : "pill pill-danger"}>
                      {isCorrect ? "MCQ correct" : "MCQ incorrect"}
                    </span>
                  )}
                </div>
                <p className="question-prompt">{question.prompt}</p>

                {isMcq ? (
                  <div className="grid">
                    <p>
                      <strong>Your answer:</strong>{" "}
                      {typeof userAnswer === "string" && userAnswer
                        ? userAnswer
                        : "No response"}
                    </p>
                    <p>
                      <strong>Correct answer:</strong> {question.answer_key}
                    </p>
                    {!isCorrect && (
                      <label className="muted">
                        <strong>Why was this wrong?</strong>
                        <select
                          style={{ marginLeft: 12 }}
                          value={mistakes[question.id] ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setMistakeReason(
                              question.id,
                              value ? (value as typeof MISTAKE_REASONS[number]) : "",
                            );
                            setMistakes(readMistakes());
                          }}
                        >
                          <option value="">Select a reason</option>
                          {MISTAKE_REASONS.map((reason) => (
                            <option key={reason} value={reason}>
                              {reason}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {question.rationale && (
                      <p className="muted">
                        <strong>Rationale:</strong> {question.rationale}
                      </p>
                    )}
                  </div>
                ) : question.type === "calculation_table" ? (
                  <div className="grid">
                    <div>
                      <strong>Your table:</strong>
                      <table
                        style={{
                          width: "100%",
                          marginTop: 8,
                          borderCollapse: "collapse",
                        }}
                      >
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", padding: "6px 0" }}>
                              Price
                            </th>
                            <th style={{ textAlign: "left", padding: "6px 0" }}>
                              Market supply
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {marketSupplyRows.map((price) => {
                            const table = getTableResponse(userAnswer);
                            const value = table[price];
                            return (
                              <tr key={price}>
                                <td style={{ padding: "6px 0" }}>{price}</td>
                                <td style={{ padding: "6px 0" }}>
                                  {value && value.trim() ? value : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <strong>Correct table:</strong>
                      <table
                        style={{
                          width: "100%",
                          marginTop: 8,
                          borderCollapse: "collapse",
                        }}
                      >
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", padding: "6px 0" }}>
                              Price
                            </th>
                            <th style={{ textAlign: "left", padding: "6px 0" }}>
                              Market supply
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {marketSupplyRows.map((price) => {
                            const expected =
                              question.answer_data?.market_supply?.[price];
                            return (
                              <tr key={price}>
                                <td style={{ padding: "6px 0" }}>{price}</td>
                                <td style={{ padding: "6px 0" }}>
                                  {expected !== undefined
                                    ? expected.toLocaleString()
                                    : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p>
                      <strong>Model answer:</strong> {question.model_answer}
                    </p>
                    <div>
                      <strong>Mark scheme:</strong>
                      <ul>
                        {question.mark_scheme.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : question.type === "diagram_logic" ? (
                  <div className="grid">
                    <p>
                      <strong>Your response:</strong>{" "}
                      {renderDiagramResponse(userAnswer)}
                    </p>
                    <p>
                      <strong>Model answer:</strong> {question.model_answer}
                    </p>
                    <div>
                      <strong>Mark scheme:</strong>
                      <ul>
                        {question.mark_scheme.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="grid">
                    <p>
                      <strong>Your response:</strong>{" "}
                      {typeof userAnswer === "string" && userAnswer.trim()
                        ? userAnswer
                        : "No response"}
                    </p>
                    <p>
                      <strong>Model answer:</strong> {question.model_answer}
                    </p>
                    <div>
                      <strong>Mark scheme:</strong>
                      <ul>
                        {question.mark_scheme.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchExamBank,
  type ExamBank,
  type ExamQuestion,
  buildExamQuestions,
} from "@/lib/examBank";
import { loadSession, type ExamSession } from "@/lib/examSession";
import { scoreMcq } from "@/lib/scoring";

type ResultsSummaryProps = {
  setId: string;
};

export default function ResultsSummary({ setId }: ResultsSummaryProps) {
  const [bank, setBank] = useState<ExamBank | null>(null);
  const [session] = useState<ExamSession | null>(() => loadSession());
  const [error, setError] = useState<string | null>(null);

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

  const questions = useMemo<ExamQuestion[]>(() => {
    if (!bank || !session) {
      return [];
    }
    try {
      const built = buildExamQuestions(bank, session.setId);
      const byId = new Map(built.map((question) => [question.id, question]));
      return session.questionIds
        .map((id) => byId.get(id))
        .filter((question): question is ExamQuestion => !!question);
    } catch {
      return [];
    }
  }, [bank, session]);

  if (error) {
    return (
      <div className="card">
        <p className="muted">{error}</p>
      </div>
    );
  }

  if (!session || session.setId !== setId || !session.submittedAt) {
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

  const score = scoreMcq(questions, session.answers);
  const answeredCount = Object.values(session.answers).filter((value) =>
    value?.trim(),
  ).length;

  return (
    <>
      <header className="header">
        <div>
          <h1 className="title">Results Summary</h1>
          <p className="subtitle">
            Set {session.setId} · Submitted{" "}
            {new Date(session.submittedAt).toLocaleString()}
          </p>
        </div>
        <div className="card" style={{ padding: "12px 16px" }}>
          <p className="score">{score.pointsEarned} pts</p>
          <p className="muted" style={{ margin: 0 }}>
            MCQ score: {score.correct}/{score.total} (
            {score.pointsAvailable} pts)
          </p>
        </div>
      </header>

      <div className="card">
        <div className="question-meta">
          <span className="pill">Answered {answeredCount}</span>
          <span className="pill">Flagged {session.flags.length}</span>
          <span className="pill">
            Duration {session.durationMinutes} min
          </span>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Review model answers and mark schemes below for self-marking on
          written sections.
        </p>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Link className="btn" href={`/exam?set=${session.setId}`}>
            Start new attempt
          </Link>
          <Link className="btn btn-secondary" href="/">
            Back to mode select
          </Link>
        </div>
      </div>

      <div className="card">
        <h2 className="title" style={{ fontSize: 22, marginBottom: 8 }}>
          Review
        </h2>
        {questions.map((question, index) => {
          const userAnswer = session.answers[question.id];
          const isMcq = question.type === "mcq_single";
          const isCorrect = isMcq && userAnswer === question.answer_key;

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
                    {userAnswer ? userAnswer : "No response"}
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
              ) : (
                <div className="grid">
                  <p>
                    <strong>Your response:</strong>{" "}
                    {userAnswer?.trim() ? userAnswer : "No response"}
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
    </>
  );
}

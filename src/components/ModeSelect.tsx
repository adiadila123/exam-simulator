"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ExamBank } from "@/lib/examBank";
import { fetchExamBank } from "@/lib/examBank";

export default function ModeSelect() {
  const [bank, setBank] = useState<ExamBank | null>(null);
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

  return (
    <div className="card">
      <h2 className="title" style={{ fontSize: "22px", marginBottom: 8 }}>
        Choose an exam set
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
              <Link className="btn" href={`/exam?set=${setId}`}>
                Start exam
              </Link>
              <Link className="btn btn-secondary" href={`/results?set=${setId}`}>
                View last results
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

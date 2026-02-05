"use client";

import { useMemo, useState } from "react";
import type { ExamQuestion } from "@/lib/examBank";

type QuestionNavigatorProps = {
  questions: ExamQuestion[];
  currentIndex: number;
  answeredIds: Set<string>;
  flags: Set<string>;
  onSelect: (index: number) => void;
  disabled?: boolean;
};

type IndexedQuestion = {
  question: ExamQuestion;
  index: number;
};

export default function QuestionNavigator({
  questions,
  currentIndex,
  answeredIds,
  flags,
  onSelect,
  disabled = false,
}: QuestionNavigatorProps) {
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);

  const indexedQuestions = useMemo<IndexedQuestion[]>(
    () =>
      questions.map((question, index) => ({
        question,
        index,
      })),
    [questions],
  );

  const visibleQuestions = showFlaggedOnly
    ? indexedQuestions.filter(({ question }) => flags.has(question.id))
    : indexedQuestions;

  return (
    <div className="navigator">
      <div className="navigator-row">
        <strong>Question navigator</strong>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showFlaggedOnly}
            onChange={(event) => setShowFlaggedOnly(event.target.checked)}
            disabled={disabled}
          />
          <span>Show flagged only</span>
        </label>
      </div>

      {visibleQuestions.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>
          No flagged questions yet.
        </p>
      ) : (
        <div className="question-nav">
          {visibleQuestions.map(({ question, index }) => {
            const isAnswered = answeredIds.has(question.id);
            const isFlagged = flags.has(question.id);
            return (
              <button
                key={question.id}
                type="button"
                onClick={() => onSelect(index)}
                disabled={disabled}
                data-active={index === currentIndex}
                data-flagged={isFlagged}
                data-answered={isAnswered}
                aria-label={`Go to question ${index + 1}`}
                title={
                  isAnswered
                    ? "Answered"
                    : isFlagged
                      ? "Flagged"
                      : "Not answered"
                }
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

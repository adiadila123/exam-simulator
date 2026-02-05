"use client";

import type { DiagramLogicResponse } from "@/lib/examSession";

type DiagramLogicAnswerProps = {
  value: DiagramLogicResponse;
  onChange: (next: DiagramLogicResponse) => void;
  disabled?: boolean;
};

const curveOptions: DiagramLogicResponse["curve"][] = ["Demand", "Supply"];
const directionOptions: DiagramLogicResponse["direction"][] = ["Left", "Right"];
const effectOptions: DiagramLogicResponse["priceEffect"][] = [
  "Up",
  "Down",
  "Uncertain",
];

export default function DiagramLogicAnswer({
  value,
  onChange,
  disabled = false,
}: DiagramLogicAnswerProps) {
  return (
    <div className="diagram-answer">
      <div className="diagram-row">
        <label>
          Curve
          <select
            value={value.curve}
            onChange={(event) =>
              onChange({ ...value, curve: event.target.value as typeof value.curve })
            }
            disabled={disabled}
          >
            <option value="">Select</option>
            {curveOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Direction
          <select
            value={value.direction}
            onChange={(event) =>
              onChange({
                ...value,
                direction: event.target.value as typeof value.direction,
              })
            }
            disabled={disabled}
          >
            <option value="">Select</option>
            {directionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="diagram-row">
        <label>
          Price effect
          <div className="radio-row">
            {effectOptions.map((option) => (
              <label key={option} className="radio">
                <input
                  type="radio"
                  name="price-effect"
                  value={option}
                  checked={value.priceEffect === option}
                  onChange={() => onChange({ ...value, priceEffect: option })}
                  disabled={disabled}
                />
                {option}
              </label>
            ))}
          </div>
        </label>
        <label>
          Quantity effect
          <div className="radio-row">
            {effectOptions.map((option) => (
              <label key={option} className="radio">
                <input
                  type="radio"
                  name="quantity-effect"
                  value={option}
                  checked={value.quantityEffect === option}
                  onChange={() => onChange({ ...value, quantityEffect: option })}
                  disabled={disabled}
                />
                {option}
              </label>
            ))}
          </div>
        </label>
      </div>

      <label>
        Justification (1–2 sentences)
        <textarea
          className="textarea"
          placeholder="Explain your reasoning..."
          value={value.justification}
          onChange={(event) =>
            onChange({ ...value, justification: event.target.value })
          }
          disabled={disabled}
        />
      </label>
    </div>
  );
}

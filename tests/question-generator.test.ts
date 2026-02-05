import test from "node:test";
import assert from "node:assert/strict";
import { generatePedMidpointQuestion } from "../src/lib/questionGenerator.ts";

const template = {
  id: "TPL-PED-001",
  template: "ped_midpoint" as const,
  topic: "Elasticity",
  points: 6,
  prompt:
    "Price rises from {p1} to {p2} and quantity falls from {q1} to {q2}. Calculate midpoint PED and interpret.",
  ranges: {
    priceMin: 4,
    priceMax: 12,
    quantityMin: 60,
    quantityMax: 140,
  },
};

test("generator is deterministic per seed", () => {
  const first = generatePedMidpointQuestion(template, 123);
  const second = generatePedMidpointQuestion(template, 123);
  assert.deepEqual(first.generated, second.generated);
  assert.equal(first.prompt, second.prompt);
});

test("generator varies values for different seeds", () => {
  const first = generatePedMidpointQuestion(template, 123);
  const second = generatePedMidpointQuestion(template, 456);
  assert.notDeepEqual(first.generated, second.generated);
});

test("generated values are within ranges and valid", () => {
  const question = generatePedMidpointQuestion(template, 999);
  const { p1, p2, q1, q2, ped, interpretation } = question.generated;
  assert.ok(p1 >= template.ranges.priceMin);
  assert.ok(p2 <= template.ranges.priceMax);
  assert.ok(q1 >= template.ranges.quantityMin);
  assert.ok(q2 <= template.ranges.quantityMax);
  assert.notEqual(p1, p2);
  assert.notEqual(q1, q2);
  assert.ok(p1 < p2);
  assert.ok(q1 > q2);

  const percentDeltaQ = (q2 - q1) / ((q1 + q2) / 2);
  const percentDeltaP = (p2 - p1) / ((p1 + p2) / 2);
  const expected = Math.round((percentDeltaQ / percentDeltaP) * 100) / 100;
  assert.equal(ped, expected);
  assert.ok(["Elastic", "Inelastic", "Unit elastic"].includes(interpretation));
});

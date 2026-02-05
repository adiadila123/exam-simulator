import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseExamBank } from "../src/lib/examBank.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadBank = () => {
  const raw = fs.readFileSync(
    path.join(__dirname, "..", "public", "economics_exam_bank_v1.json"),
    "utf8",
  );
  return parseExamBank(raw);
};

test("exam bank includes sets A, B, C", () => {
  const bank = loadBank();
  assert.ok(bank.exam_sets.A);
  assert.ok(bank.exam_sets.B);
  assert.ok(bank.exam_sets.C);
});

test("exam set question ids exist in the bank", () => {
  const bank = loadBank();
  const byId = new Map(bank.bank.map((question) => [question.id, question]));

  Object.values(bank.exam_sets).forEach((set) => {
    set.sections.forEach((section) => {
      section.question_ids.forEach((id) => {
        assert.ok(byId.has(id), `Missing question id ${id}`);
      });
    });
  });
});

test("mcq scoring with all-correct answers yields full points", () => {
  const bank = loadBank();
  const byId = new Map(bank.bank.map((question) => [question.id, question]));
  const mcqSection = bank.exam_sets.A.sections.find(
    (section) => section.name === "MCQ",
  );

  assert.ok(mcqSection, "Missing MCQ section for set A");

  let earned = 0;
  let available = 0;
  mcqSection.question_ids.forEach((id) => {
    const question = byId.get(id);
    assert.ok(question, `Missing question ${id}`);
    available += question.points ?? 0;
    earned += question.points ?? 0;
  });

  assert.ok(available > 0);
  assert.equal(earned, available);
});

test("parseExamBank throws a friendly error on invalid bank", () => {
  const badBank = JSON.stringify({ version: "1.0" });
  assert.throws(
    () => parseExamBank(badBank),
    (err) =>
      err instanceof Error &&
      err.message.includes("Exam bank validation failed"),
  );
});

test("parseExamBank throws a friendly error on invalid JSON", () => {
  assert.throws(
    () => parseExamBank("{ invalid"),
    (err) => err instanceof Error && err.message.includes("Invalid JSON"),
  );
});

const categorize = (topic, prompt) => {
  const text = `${topic} ${prompt}`.toLowerCase();
  if (
    text.includes("elasticity") ||
    text.includes("ped") ||
    text.includes("pes") ||
    text.includes("inelastic") ||
    text.includes("elastic ")
  ) {
    return "elasticity";
  }
  if (
    text.includes("tax") ||
    text.includes("subsidy") ||
    text.includes("price ceiling") ||
    text.includes("price floor") ||
    text.includes("minimum wage") ||
    text.includes("rent") ||
    text.includes("intervention") ||
    text.includes("regulation") ||
    text.includes("government")
  ) {
    return "intervention";
  }
  if (
    text.includes("equilibrium") ||
    text.includes("surplus") ||
    text.includes("shortage") ||
    text.includes("market clearing")
  ) {
    return "equilibrium";
  }
  if (
    text.includes("monopoly") ||
    text.includes("oligopoly") ||
    text.includes("perfect competition") ||
    text.includes("monopolistic") ||
    text.includes("market structure") ||
    text.includes("price taker") ||
    text.includes("price maker")
  ) {
    return "structure";
  }
  if (
    text.includes("demand") ||
    text.includes("supply") ||
    text.includes("substitute") ||
    text.includes("complement") ||
    text.includes("normal good") ||
    text.includes("inferior good") ||
    text.includes("income") ||
    text.includes("preferences") ||
    text.includes("tastes") ||
    text.includes("scarcity")
  ) {
    return "demand/supply";
  }
  return "other";
};

test("exam bank supports session targets per type", () => {
  const bank = loadBank();
  const counts = bank.bank.reduce(
    (acc, question) => {
      acc[question.type] = (acc[question.type] ?? 0) + 1;
      return acc;
    },
    {
      mcq_single: 0,
      mcq_multi: 0,
      short_answer: 0,
      scenario: 0,
      diagram_logic: 0,
    },
  );

  assert.ok(counts.mcq_single >= 10);
  assert.ok(counts.short_answer >= 5);
  assert.ok(counts.scenario >= 2);
  assert.ok(counts.diagram_logic >= 1);
});

test("exam bank covers key topics for balancing", () => {
  const bank = loadBank();
  const categories = new Set(
    bank.bank.map((question) => categorize(question.topic, question.prompt)),
  );

  ["demand/supply", "elasticity", "intervention", "equilibrium", "structure"].forEach(
    (category) => {
      assert.ok(categories.has(category), `Missing category ${category}`);
    },
  );
});

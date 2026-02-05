import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseExamBank,
  generateExam1McqSession,
  categorizeExam1Topic,
} from "../src/lib/examBank.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadBank = () => {
  const raw = fs.readFileSync(
    path.join(__dirname, "..", "public", "economics_exam_bank_v1.json"),
    "utf8",
  );
  return parseExamBank(raw);
};

test("exam1_mcq generator returns 20 unique ids", () => {
  const bank = loadBank();
  const result = generateExam1McqSession(bank);
  assert.ok(!result.error, result.error);
  assert.equal(result.ids.length, 20);
  const unique = new Set(result.ids);
  assert.equal(unique.size, 20);
});

test("exam1_mcq distribution is not overly concentrated", () => {
  const bank = loadBank();
  const result = generateExam1McqSession(bank);
  assert.ok(!result.error, result.error);
  const byId = new Map(bank.bank.map((question) => [question.id, question]));
  const counts = new Map<string, number>();

  result.ids.forEach((id) => {
    const question = byId.get(id);
    assert.ok(question, `Missing question ${id}`);
    const category = categorizeExam1Topic(
      question.topic,
      question.prompt,
    );
    counts.set(category, (counts.get(category) ?? 0) + 1);
  });

  counts.forEach((count) => {
    assert.ok(count <= 8, `Category overrepresented: ${count}`);
  });
});

test("categorizeExam1Topic maps signal topics to equilibrium/signals", () => {
  assert.equal(
    categorizeExam1Topic("Information", "Signals and adverse selection"),
    "equilibrium/signals",
  );
});

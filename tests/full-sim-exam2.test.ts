import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseExamBank,
  generateFullSimExam2,
  categorizeFullSim2Topic,
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

test("full simulated exam 2 returns correct counts", () => {
  const bank = loadBank();
  const result = generateFullSimExam2(bank, 1234, { includeMcq: false });
  assert.equal(result.ids.length, 8);
});

test("full simulated exam 2 returns unique ids", () => {
  const bank = loadBank();
  const result = generateFullSimExam2(bank, 5678, { includeMcq: false });
  assert.equal(new Set(result.ids).size, result.ids.length);
});

test("full simulated exam 2 satisfies balancing constraints", () => {
  const bank = loadBank();
  const result = generateFullSimExam2(bank, 9012, { includeMcq: false });
  const byId = new Map(bank.bank.map((question) => [question.id, question]));
  const counts = {
    fundamentals: 0,
    demand: 0,
    supply: 0,
    shift_trap: 0,
  };

  result.ids.forEach((id) => {
    const question = byId.get(id);
    assert.ok(question, `Missing question ${id}`);
    const category = categorizeFullSim2Topic(question.topic, question.prompt);
    if (category in counts) {
      counts[category as keyof typeof counts] += 1;
    }
  });

  assert.ok(counts.fundamentals >= 1);
  assert.ok(counts.demand >= 2);
  assert.ok(counts.supply >= 2);
  assert.ok(counts.shift_trap >= 1);
});

test("full simulated exam 2 is deterministic per seed", () => {
  const bank = loadBank();
  const a = generateFullSimExam2(bank, 42, { includeMcq: false });
  const b = generateFullSimExam2(bank, 42, { includeMcq: false });
  assert.deepEqual(a.ids, b.ids);
});

test("full simulated exam 2 mixed mode adds 5 mcq", () => {
  const bank = loadBank();
  const result = generateFullSimExam2(bank, 2222, { includeMcq: true });
  assert.equal(result.ids.length, 13);
});


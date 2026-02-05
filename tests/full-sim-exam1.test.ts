import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseExamBank,
  generateFullSimExam1,
  categorizeFullSimTopic,
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

test("full simulated exam 1 returns 20 unique ids", () => {
  const bank = loadBank();
  const result = generateFullSimExam1(bank, 12345);
  assert.equal(result.ids.length, 20);
  assert.equal(new Set(result.ids).size, 20);
});

test("full simulated exam 1 distribution is not overly concentrated", () => {
  const bank = loadBank();
  const result = generateFullSimExam1(bank, 4242);
  const byId = new Map(bank.bank.map((question) => [question.id, question]));
  const counts = new Map<string, number>();

  result.ids.forEach((id) => {
    const question = byId.get(id);
    assert.ok(question);
    const category = categorizeFullSimTopic(
      question.topic,
      question.prompt,
    );
    const prev = counts.get(category) ?? 0;
    counts.set(category, prev + 1);
  });

  const max = Math.max(...Array.from(counts.values()));
  assert.ok(max <= 8, `Too many questions in one category: ${max}`);
});


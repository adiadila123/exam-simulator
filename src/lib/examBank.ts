import { z } from "zod";
import { generatePedMidpointQuestion } from "./questionGenerator.ts";

export type QuestionType =
  | "mcq_single"
  | "short_answer"
  | "scenario"
  | "diagram_logic"
  | "calculation_table";

export type BaseQuestion = {
  id: string;
  type: QuestionType;
  topic: string;
  points: number;
  prompt: string;
};

export type McqQuestion = BaseQuestion & {
  type: "mcq_single";
  options: Record<string, string>;
  answer_key: string;
  rationale?: string;
};

export type WrittenQuestion = BaseQuestion & {
  type: "short_answer" | "scenario" | "diagram_logic" | "calculation_table";
  mark_scheme: string[];
  model_answer: string;
  answer_data?: {
    market_supply?: Record<string, number>;
  };
  generated?: {
    p1: number;
    p2: number;
    q1: number;
    q2: number;
    ped: number;
    interpretation: string;
  };
};

export type ExamQuestion = (McqQuestion | WrittenQuestion) & {
  section: string;
};

export type ExamSection = {
  name: string;
  question_ids: string[];
  points_each?: number;
};

export type ExamSet = {
  duration_minutes: number;
  target_points: number;
  sections: ExamSection[];
};

export type ExamBank = {
  version: string;
  module: string;
  assessment: string;
  duration_minutes: number;
  grading: { total_points: number };
  question_types: QuestionType[];
  bank: Array<McqQuestion | WrittenQuestion>;
  exam_sets: Record<string, ExamSet>;
  templates?: QuestionTemplate[];
};

export type QuestionTemplate = {
  id: string;
  template: "ped_midpoint";
  topic: string;
  points: number;
  prompt: string;
  ranges: {
    priceMin: number;
    priceMax: number;
    quantityMin: number;
    quantityMax: number;
  };
};

const QuestionTypeSchema = z.enum([
  "mcq_single",
  "short_answer",
  "scenario",
  "diagram_logic",
  "calculation_table",
]);

const GeneratedPedSchema = z
  .object({
    p1: z.number(),
    p2: z.number(),
    q1: z.number(),
    q2: z.number(),
    ped: z.number(),
    interpretation: z.string(),
  })
  .optional();

const BaseQuestionSchema = z.object({
  id: z.string(),
  type: QuestionTypeSchema,
  topic: z.string(),
  points: z.number(),
  prompt: z.string(),
});

const McqQuestionSchema = BaseQuestionSchema.extend({
  type: z.literal("mcq_single"),
  options: z.record(z.string(), z.string()),
  answer_key: z.string(),
  rationale: z.string().optional(),
});

const WrittenQuestionSchema = BaseQuestionSchema.extend({
  type: z.enum(["short_answer", "scenario", "diagram_logic", "calculation_table"]),
  mark_scheme: z.array(z.string()),
  model_answer: z.string(),
  answer_data: z
    .object({
      market_supply: z.record(z.string(), z.number()).optional(),
    })
    .passthrough()
    .optional(),
  generated: GeneratedPedSchema,
});

const PackSchema = z
  .object({
    pack: z.string(),
    source: z.string().optional(),
    entries: z.array(z.union([McqQuestionSchema, WrittenQuestionSchema])),
  })
  .passthrough();

const ExamSectionSchema = z.object({
  name: z.string(),
  question_ids: z.array(z.string()),
  points_each: z.number().optional(),
});

const ExamSetSchema = z.object({
  duration_minutes: z.number(),
  target_points: z.number(),
  sections: z.array(ExamSectionSchema),
});

const QuestionTemplateSchema = z.object({
  id: z.string(),
  template: z.literal("ped_midpoint"),
  topic: z.string(),
  points: z.number(),
  prompt: z.string(),
  ranges: z.object({
    priceMin: z.number(),
    priceMax: z.number(),
    quantityMin: z.number(),
    quantityMax: z.number(),
  }),
});

const ExamBankSchema = z
  .object({
    version: z.string(),
    module: z.string(),
    assessment: z.string(),
    duration_minutes: z.number(),
    grading: z.object({
      total_points: z.number(),
    }),
    question_types: z.array(QuestionTypeSchema),
    bank: z.array(z.union([McqQuestionSchema, WrittenQuestionSchema])),
    exam_sets: z.record(z.string(), ExamSetSchema),
    templates: z.array(QuestionTemplateSchema).optional(),
    import_notes: z.any().optional(),
  })
  .passthrough();

export const stripJsonComments = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").trim();

export const parseExamBank = (raw: string): ExamBank => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(raw));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to parse JSON";
    throw new Error(`Invalid JSON: ${message}`);
  }

  const result = ExamBankSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length ? issue.path.join(".") : "root";
    throw new Error(`Exam bank validation failed at ${path}: ${issue.message}`);
  }
  return result.data;
};

export const fetchExamBank = async (): Promise<ExamBank> => {
  const res = await fetch("/economics_exam_bank_v1.json", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to load exam bank");
  }
  const raw = await res.text();
  const base = parseExamBank(raw);

  const packRes = await fetch("/packs/week2_seminar_pack.json", {
    cache: "no-store",
  }).catch(() => null);
  if (!packRes || packRes.status === 404) {
    return base;
  }
  if (!packRes.ok) {
    console.warn("Failed to load seminar pack.");
    return base;
  }
  const packRaw = await packRes.text();
  let packParsed: unknown;
  try {
    packParsed = JSON.parse(packRaw);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to parse JSON";
    console.warn(`Invalid seminar pack JSON: ${message}`);
    return base;
  }
  const packResult = PackSchema.safeParse(packParsed);
  if (!packResult.success) {
    const issue = packResult.error.issues[0];
    const path = issue.path.length ? issue.path.join(".") : "root";
    console.warn(
      `Seminar pack validation failed at ${path}: ${issue.message}`,
    );
    return base;
  }

  const existingIds = new Set(base.bank.map((question) => question.id));
  const mergedEntries = packResult.data.entries.filter(
    (entry) => !existingIds.has(entry.id),
  );
  if (mergedEntries.length === 0) {
    return base;
  }
  const mergedTypes = Array.from(
    new Set([
      ...base.question_types,
      ...mergedEntries.map((entry) => entry.type),
    ]),
  );
  return {
    ...base,
    bank: [...base.bank, ...mergedEntries],
    question_types: mergedTypes,
  };
};

export const buildExamQuestions = (
  bank: ExamBank,
  setId: string,
  seed = 1,
): ExamQuestion[] => {
  const examSet = bank.exam_sets[setId];
  if (!examSet) {
    throw new Error(`Unknown exam set: ${setId}`);
  }

  const byId = new Map(bank.bank.map((question) => [question.id, question]));
  const templateById = new Map(
    (bank.templates ?? []).map((template) => [template.id, template]),
  );
  const missing: string[] = [];

  const questions = examSet.sections.flatMap((section) =>
    section.question_ids.map((id) => {
      const question = byId.get(id);
      if (question) {
        return { ...question, section: section.name };
      }
      const template = templateById.get(id);
      if (template?.template === "ped_midpoint") {
        const generated = generatePedMidpointQuestion(template, seed);
        return { ...generated, section: section.name };
      }
      missing.push(id);
      return null;
    }),
  );

  if (missing.length > 0) {
    console.warn("Missing question IDs:", missing);
  }

  return questions.filter((question): question is ExamQuestion => !!question);
};

export const extractBaseQuestionId = (id: string) => id.split("::")[0];

export const buildQuestionsFromIds = (
  bank: ExamBank,
  ids: string[],
  sectionName = "Review",
): ExamQuestion[] => {
  const byId = new Map(bank.bank.map((question) => [question.id, question]));
  const questions = ids
    .map((id) => {
      const baseId = extractBaseQuestionId(id);
      const question = byId.get(baseId);
      if (!question) {
        return null;
      }
      return { ...question, id, section: sectionName };
    })
    .filter((question): question is ExamQuestion => !!question);
  return questions;
};

const CATEGORY_ORDER = [
  "demand/supply",
  "elasticity",
  "intervention",
  "equilibrium",
  "structure",
] as const;

export type TopicCategory = (typeof CATEGORY_ORDER)[number] | "other";

const pickCategory = (topic: string, prompt: string): TopicCategory => {
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

const EXAM1_CATEGORY_ORDER = [
  "demand/supply",
  "elasticity",
  "intervention",
  "equilibrium/signals",
  "structure",
] as const;

export type Exam1TopicCategory =
  | (typeof EXAM1_CATEGORY_ORDER)[number]
  | "other";

export const categorizeExam1Topic = (
  topic: string,
  prompt: string,
): Exam1TopicCategory => {
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
    text.includes("market clearing") ||
    text.includes("signal") ||
    text.includes("signalling") ||
    text.includes("information") ||
    text.includes("adverse selection") ||
    text.includes("moral hazard")
  ) {
    return "equilibrium/signals";
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

const shuffle = <T,>(items: T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const pickBalanced = (
  pool: Array<McqQuestion | WrittenQuestion>,
  count: number,
): Array<McqQuestion | WrittenQuestion> => {
  const buckets = new Map<TopicCategory, Array<McqQuestion | WrittenQuestion>>([
    ["demand/supply", []],
    ["elasticity", []],
    ["intervention", []],
    ["equilibrium", []],
    ["structure", []],
    ["other", []],
  ]);

  pool.forEach((question) => {
    const category = pickCategory(question.topic, question.prompt);
    buckets.get(category)?.push(question);
  });

  CATEGORY_ORDER.forEach((category) => {
    const items = buckets.get(category);
    if (items) {
      buckets.set(category, shuffle(items));
    }
  });
  buckets.set("other", shuffle(buckets.get("other") ?? []));

  const selected: Array<McqQuestion | WrittenQuestion> = [];
  let progressed = true;

  while (selected.length < count && progressed) {
    progressed = false;
    for (const category of CATEGORY_ORDER) {
      if (selected.length >= count) {
        break;
      }
      const bucket = buckets.get(category);
      if (bucket && bucket.length > 0) {
        selected.push(bucket.pop()!);
        progressed = true;
      }
    }
  }

  if (selected.length < count) {
    const remaining = shuffle(
      Array.from(buckets.values()).flatMap((items) => items),
    );
    selected.push(...remaining.slice(0, count - selected.length));
  }

  return selected;
};

export const generateExamSession = (bank: ExamBank): string[] => {
  const targets: Record<QuestionType, number> = {
    mcq_single: 10,
    short_answer: 5,
    scenario: 2,
    diagram_logic: 1,
    calculation_table: 0,
  };

  const used = new Set<string>();
  const selection: string[] = [];

  (Object.entries(targets) as Array<[QuestionType, number]>).forEach(
    ([type, count]) => {
      const pool = bank.bank.filter(
        (question) => question.type === type && !used.has(question.id),
      );
      const picked = pickBalanced(pool, count);
      picked.forEach((question) => {
        if (!used.has(question.id)) {
          used.add(question.id);
          selection.push(question.id);
        }
      });
    },
  );

  return selection;
};

export type ExamType = "exam1_mcq" | "exam2_written";

export const generateExamTypeSession = (
  bank: ExamBank,
  examType: ExamType,
): string[] => {
  const pool =
    examType === "exam1_mcq"
      ? bank.bank.filter((question) => question.type === "mcq_single")
      : bank.bank.filter((question) => question.type !== "mcq_single");
  const picked = pickBalanced(
    pool as Array<McqQuestion | WrittenQuestion>,
    20,
  );
  return picked.map((question) => question.id);
};

export const generateExam1McqSession = (
  bank: ExamBank,
): { ids: string[]; error?: string } => {
  const mcqs = bank.bank.filter(
    (question): question is McqQuestion => question.type === "mcq_single",
  );
  if (mcqs.length < 20) {
    return {
      ids: [],
      error: "Not enough MCQ questions to build Exam 1 (need 20).",
    };
  }

  const buckets = new Map<
    Exam1TopicCategory,
    Array<McqQuestion>
  >([
    ["demand/supply", []],
    ["elasticity", []],
    ["intervention", []],
    ["equilibrium/signals", []],
    ["structure", []],
    ["other", []],
  ]);

  mcqs.forEach((question) => {
    const category = categorizeExam1Topic(question.topic, question.prompt);
    buckets.get(category)?.push(question);
  });

  EXAM1_CATEGORY_ORDER.forEach((category) => {
    const items = buckets.get(category);
    if (items) {
      buckets.set(category, shuffle(items));
    }
  });
  buckets.set("other", shuffle(buckets.get("other") ?? []));

  const cap = 8;
  const counts = new Map<Exam1TopicCategory, number>();
  EXAM1_CATEGORY_ORDER.forEach((category) => counts.set(category, 0));
  counts.set("other", 0);

  const selected: McqQuestion[] = [];
  let progressed = true;

  while (selected.length < 20 && progressed) {
    progressed = false;
    for (const category of EXAM1_CATEGORY_ORDER) {
      if (selected.length >= 20) {
        break;
      }
      const bucket = buckets.get(category);
      const count = counts.get(category) ?? 0;
      if (bucket && bucket.length > 0 && count < cap) {
        selected.push(bucket.pop()!);
        counts.set(category, count + 1);
        progressed = true;
      }
    }
  }

  if (selected.length < 20) {
    return {
      ids: [],
      error:
        "Not enough topic coverage to balance Exam 1 without overloading a topic.",
    };
  }

  return { ids: selected.map((question) => question.id) };
};

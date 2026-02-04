export type QuestionType =
  | "mcq_single"
  | "short_answer"
  | "scenario"
  | "diagram_logic";

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
  type: "short_answer" | "scenario" | "diagram_logic";
  mark_scheme: string[];
  model_answer: string;
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
};

export const stripJsonComments = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").trim();

export const parseExamBank = (raw: string): ExamBank => {
  return JSON.parse(stripJsonComments(raw)) as ExamBank;
};

export const fetchExamBank = async (): Promise<ExamBank> => {
  const res = await fetch("/economics_exam_bank_v1.json", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to load exam bank");
  }
  const raw = await res.text();
  return parseExamBank(raw);
};

export const buildExamQuestions = (
  bank: ExamBank,
  setId: string,
): ExamQuestion[] => {
  const examSet = bank.exam_sets[setId];
  if (!examSet) {
    throw new Error(`Unknown exam set: ${setId}`);
  }

  const byId = new Map(bank.bank.map((question) => [question.id, question]));
  const missing: string[] = [];

  const questions = examSet.sections.flatMap((section) =>
    section.question_ids.map((id) => {
      const question = byId.get(id);
      if (!question) {
        missing.push(id);
        return null;
      }
      return { ...question, section: section.name };
    }),
  );

  if (missing.length > 0) {
    console.warn("Missing question IDs:", missing);
  }

  return questions.filter((question): question is ExamQuestion => !!question);
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

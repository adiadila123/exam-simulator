import type { WrittenQuestion } from "./examBank";

export type PedMidpointTemplate = {
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

export type GeneratedPedQuestion = WrittenQuestion & {
  generated: {
    p1: number;
    p2: number;
    q1: number;
    q2: number;
    ped: number;
    interpretation: string;
  };
};

const mulberry32 = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let result = Math.imul(t ^ (t >>> 15), 1 | t);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

const clampRange = (min: number, max: number) => ({
  min: Math.min(min, max),
  max: Math.max(min, max),
});

const pickInt = (rng: () => number, min: number, max: number) => {
  const span = max - min + 1;
  return Math.floor(rng() * span) + min;
};

const hashStringToSeed = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
};

const interpretPed = (value: number) => {
  const abs = Math.abs(value);
  if (Math.abs(abs - 1) <= 0.05) {
    return "Unit elastic";
  }
  return abs > 1 ? "Elastic" : "Inelastic";
};

export const generatePedMidpointQuestion = (
  template: PedMidpointTemplate,
  seed: number,
): GeneratedPedQuestion => {
  const rng = mulberry32(hashStringToSeed(`${seed}-${template.id}`));
  const priceRange = clampRange(
    template.ranges.priceMin,
    template.ranges.priceMax,
  );
  const quantityRange = clampRange(
    template.ranges.quantityMin,
    template.ranges.quantityMax,
  );

  let p1 = pickInt(rng, priceRange.min, priceRange.max);
  let p2 = pickInt(rng, priceRange.min, priceRange.max);
  if (p1 === p2) {
    p2 = p1 === priceRange.max ? p1 - 1 : p1 + 1;
  }
  if (p1 > p2) {
    [p1, p2] = [p2, p1];
  }

  let q1 = pickInt(rng, quantityRange.min, quantityRange.max);
  let q2 = pickInt(rng, quantityRange.min, quantityRange.max);
  if (q1 === q2) {
    q2 = q1 === quantityRange.max ? q1 - 1 : q1 + 1;
  }
  if (q1 < q2) {
    [q1, q2] = [q2, q1];
  }

  const percentDeltaQ = (q2 - q1) / ((q1 + q2) / 2);
  const percentDeltaP = (p2 - p1) / ((p1 + p2) / 2);
  const ped = percentDeltaQ / percentDeltaP;
  const pedRounded = Math.round(ped * 100) / 100;
  const interpretation = interpretPed(pedRounded);

  const prompt = template.prompt
    .replace("{p1}", String(p1))
    .replace("{p2}", String(p2))
    .replace("{q1}", String(q1))
    .replace("{q2}", String(q2));

  return {
    id: `${template.id}-${seed}`,
    type: "short_answer",
    topic: template.topic,
    points: template.points,
    prompt,
    mark_scheme: [
      "Correct midpoint PED calculation",
      "Correct sign and magnitude",
      "Correct interpretation (elastic/inelastic/unit elastic)",
    ],
    model_answer: `Midpoint PED = ${pedRounded}. Interpretation: ${interpretation}.`,
    generated: {
      p1,
      p2,
      q1,
      q2,
      ped: pedRounded,
      interpretation,
    },
  };
};

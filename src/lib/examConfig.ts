export const EXAM_TYPE_TIME_LIMITS: Record<
  "exam1_mcq" | "exam2_written" | "legacy_set",
  number
> = {
  exam1_mcq: 25 * 60,
  exam2_written: 50 * 60,
  legacy_set: 50 * 60,
};

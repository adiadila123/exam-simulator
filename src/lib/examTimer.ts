export const computeRemainingSeconds = ({
  startedAt,
  durationMinutes,
  nowMs = Date.now(),
}: {
  startedAt: string | number;
  durationMinutes: number;
  nowMs?: number;
}) => {
  const startMs =
    typeof startedAt === "number" ? startedAt : new Date(startedAt).getTime();
  const elapsedSeconds = Math.floor((nowMs - startMs) / 1000);
  return Math.max(0, durationMinutes * 60 - elapsedSeconds);
};

export const shouldAutoSubmit = (remainingSeconds: number) =>
  remainingSeconds <= 0;

export type LockStateInput = {
  submittedAt?: string;
  locked?: boolean;
};

export const deriveLockState = (...inputs: Array<LockStateInput | null | undefined>) =>
  inputs.some((input) => Boolean(input?.submittedAt || input?.locked));

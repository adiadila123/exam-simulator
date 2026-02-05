export const computeExamDurationMinutes = (questionCount: number) => {
  if (questionCount <= 2) {
    return 5;
  }
  const minutes = questionCount * 3;
  return Math.min(50, Math.max(5, minutes));
};

"use client";

import { useSyncExternalStore } from "react";

export type ExamMode = "practice" | "real_exam";

const STORAGE_KEY = "examModeV1";

export const readExamMode = (): ExamMode => {
  if (typeof window === "undefined") {
    return "real_exam";
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "practice") {
    return "practice";
  }
  return "real_exam";
};

export const setExamMode = (mode: ExamMode) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new Event("exam-mode-change"));
};

const subscribe = (callback: () => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener("exam-mode-change", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("exam-mode-change", handler);
  };
};

export const useExamMode = () =>
  useSyncExternalStore(subscribe, readExamMode, () => "real_exam");

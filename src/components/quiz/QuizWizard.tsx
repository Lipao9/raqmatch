"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { QuestionCard } from "@/components/quiz/QuestionCard";
import { encodeAnswers, type Answers } from "@/lib/answers";
import {
  visibleQuestionsFor,
  type AnswerValue,
  type Question,
  type QuizMode,
} from "@/lib/questions";

function isAnswered(question: Question, value: AnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true; // scale: any picked number counts
}

/** Auto-advance delay after tapping a single-choice option, so the selection
 *  registers visually before the next question slides in. */
const ADVANCE_DELAY_MS = 250;

export function QuizWizard({ mode }: { mode: QuizMode }) {
  const t = useTranslations("quiz");
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recomputed per answer change: gate answers (specKnowledge, currentRacquet)
  // show and hide later questions, so the list itself is answer-dependent.
  const questions = useMemo(
    () => visibleQuestionsFor(mode, answers),
    [mode, answers],
  );

  // Gates only ever hide questions *after* themselves, but clamp anyway so a
  // shrinking list can never strand the step out of range.
  const safeStep = Math.min(step, questions.length - 1);
  const question = questions[safeStep];
  const value = answers[question.id];
  const isLast = safeStep === questions.length - 1;
  const canAdvance = question.optional || isAnswered(question, value);

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  function cancelAutoAdvance() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }

  function next() {
    cancelAutoAdvance();
    if (isLast) {
      router.push(`/results?${encodeAnswers(answers, mode)}`);
    } else {
      setStep(safeStep + 1);
    }
  }

  function back() {
    cancelAutoAdvance();
    setStep(safeStep - 1);
  }

  function handleChange(v: AnswerValue) {
    setAnswers((a) => ({ ...a, [question.id]: v }));
    // Single choice auto-advances: the tap is a complete answer. Multi, scale
    // and text keep the explicit button — there is no natural "done" signal.
    // Never past the last question: submitting must stay a deliberate act.
    if (question.kind === "choice" && !isLast) {
      cancelAutoAdvance();
      const from = safeStep;
      advanceTimer.current = setTimeout(() => {
        advanceTimer.current = null;
        setStep((s) => (s === from ? s + 1 : s));
      }, ADVANCE_DELAY_MS);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            {t("progress", { current: safeStep + 1, total: questions.length })}
          </span>
          <span>{t(`modes.${mode}.title`)}</span>
        </div>
        <Progress value={((safeStep + 1) / questions.length) * 100} />
      </div>

      <div
        key={question.id}
        className="animate-in fade-in slide-in-from-right-4 duration-300"
      >
        <QuestionCard question={question} value={value} onChange={handleChange} />
      </div>

      <div className="mt-auto flex justify-between gap-4 pt-4">
        <Button variant="ghost" disabled={safeStep === 0} onClick={back}>
          {t("back")}
        </Button>
        <Button disabled={!canAdvance} onClick={next}>
          {isLast ? t("finish") : t("next")}
        </Button>
      </div>
    </div>
  );
}

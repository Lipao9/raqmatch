import { z } from "zod";
import {
  questionsFor,
  QUIZ_MODES,
  SCALE_MAX,
  SCALE_MIN,
  visibleQuestionsFor,
  type Answers,
  type AnswerValue,
  type Question,
  type QuizMode,
} from "./questions";

// `Answers` lives in questions.ts (showIf needs it there without a cycle);
// re-exported here because this module is where every consumer imports it from.
export type { Answers, AnswerValue };

function schemaFor(q: Question): z.ZodType<AnswerValue | undefined> {
  let s: z.ZodType<AnswerValue>;
  switch (q.kind) {
    case "choice":
      s = z.enum(q.options as [string, ...string[]]);
      break;
    case "multi":
      s = z
        .array(z.enum(q.options as [string, ...string[]]))
        .min(1)
        .max(q.maxSelections ?? q.options.length)
        .refine(
          (v) =>
            new Set(v).size === v.length &&
            (!q.exclusiveOption ||
              !v.includes(q.exclusiveOption) ||
              v.length === 1),
          { message: "duplicate or non-exclusive selection" },
        );
      break;
    case "scale":
      s = z.number().int().min(SCALE_MIN).max(SCALE_MAX);
      break;
    default: {
      const max = q.kind === "longtext" ? 500 : 120;
      s = z.string().trim().max(max);
    }
  }
  // Gated questions (showIf) are always optional server-side: the server
  // cannot re-evaluate what the wizard hid, so it must not reject a payload
  // in which the condition removed the question.
  if (q.optional || q.showIf) return s.optional();
  if (q.kind === "text" || q.kind === "longtext") {
    return (s as z.ZodType<string>).and(z.string().min(1));
  }
  return s;
}

export function answersSchemaFor(mode: QuizMode): z.ZodType<Answers> {
  return z.object(
    Object.fromEntries(questionsFor(mode).map((q) => [q.id, schemaFor(q)])),
  ) as unknown as z.ZodType<Answers>;
}

export const quizModeSchema = z.enum(QUIZ_MODES as [QuizMode, ...QuizMode[]]);

/**
 * Multi values travel as one comma-joined param (`struggles=low-power,fatigue`);
 * option values are slugs and a test guarantees none contains a comma.
 */
export function encodeAnswers(answers: Answers, mode: QuizMode): string {
  const params = new URLSearchParams();
  params.set("mode", mode);
  // Only visible questions: if the user went back and changed a gate answer,
  // whatever they had typed behind the gate must not leak into the result URL.
  for (const q of visibleQuestionsFor(mode, answers)) {
    const value = answers[q.id];
    if (value === undefined) continue;
    if (typeof value === "string") {
      if (value.trim() !== "") params.set(q.id, value.trim());
    } else if (Array.isArray(value)) {
      if (value.length > 0) params.set(q.id, value.join(","));
    } else {
      params.set(q.id, String(value));
    }
  }
  return params.toString();
}

export function decodeAnswers(
  searchParams: Record<string, string | string[] | undefined>,
): { answers: Answers; mode: QuizMode } | null {
  const modeParsed = quizModeSchema.safeParse(searchParams.mode ?? "quick");
  if (!modeParsed.success) return null;
  const mode = modeParsed.data;

  const raw: Record<string, AnswerValue> = {};
  for (const q of questionsFor(mode)) {
    const value = searchParams[q.id];
    if (typeof value !== "string" || value === "") continue;
    if (q.kind === "multi") {
      raw[q.id] = value.split(",");
    } else if (q.kind === "scale") {
      const n = Number(value);
      if (!Number.isInteger(n)) return null;
      raw[q.id] = n;
    } else {
      raw[q.id] = value;
    }
  }
  const parsed = answersSchemaFor(mode).safeParse(raw);
  return parsed.success ? { answers: parsed.data, mode } : null;
}

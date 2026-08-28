export type QuizMode = "quick" | "detailed";

export type QuestionId =
  | "skill"
  | "frequency"
  | "swing"
  | "style"
  | "spinStyle"
  | "powerControl"
  | "aggression"
  | "fitness"
  | "struggles"
  | "armInjury"
  | "courtType"
  | "specKnowledge"
  | "headSizePref"
  | "stringPattern"
  | "weightSpec"
  | "gripSize"
  | "currentRacquet"
  | "racquetFeel"
  | "strengths"
  | "improveGoals"
  | "anythingElse";

export type AnswerValue = string | string[] | number;
export type Answers = Partial<Record<QuestionId, AnswerValue>>;

export interface Question {
  id: QuestionId;
  /**
   * `scale` is five tappable segments with verbal anchors, not a drag slider:
   * sliders measurably hurt response rates on mobile and >7 points only adds
   * noise (see specs/quiz-v2-brasil.md §0). Stored value is 1..5, 3 = neutral.
   */
  kind: "choice" | "multi" | "scale" | "text" | "longtext";
  options: string[]; // stable machine values; empty for scale/text/longtext
  optional?: boolean;
  modes: QuizMode[];
  /**
   * Multi-select scoring semantics: `any` = union (preferences — matching any
   * selection scores), `all` = intersection (requirements). The prefilter also
   * normalises each multi question's contribution by the number of selections,
   * so ticking more boxes never inflates a question's influence.
   */
  multiMode?: "any" | "all";
  maxSelections?: number;
  /** An option like "nothing" that unticks the others and vice versa. */
  exclusiveOption?: string;
  /**
   * Client-side gating: the wizard skips questions whose condition is false.
   * The server cannot re-check what the wizard hid, so every gated question is
   * treated as optional at validation time (see answers.ts).
   */
  showIf?: (answers: Answers) => boolean;
}

// Labels live in messages/{locale}.json under quiz.questions.<id>.
// Option label key: quiz.questions.<id>.options.<value> ("-" replaced by "_").
// Scale anchors: quiz.questions.<id>.anchors.low / .high.
export const QUESTIONS: Question[] = [
  {
    id: "skill",
    kind: "choice",
    options: ["beginner", "intermediate", "advanced", "competitive"],
    modes: ["quick", "detailed"],
  },
  {
    id: "frequency",
    kind: "choice",
    options: ["occasional", "weekly", "several-times", "daily"],
    modes: ["detailed"],
  },
  {
    // Behavioural framing of swing length/speed ("where does your power come
    // from") — the highest-signal fitting question after level, and less
    // ego-biased than asking players to rate their own swing.
    id: "swing",
    kind: "choice",
    options: ["racquet-power", "mixed", "self-power"],
    modes: ["quick", "detailed"],
  },
  {
    id: "style",
    kind: "choice",
    options: [
      "baseline",
      "serve-volley",
      "all-court",
      "counterpuncher",
      "not-sure",
    ],
    modes: ["quick", "detailed"],
  },
  {
    id: "spinStyle",
    kind: "choice",
    options: ["heavy-topspin", "moderate-spin", "flat", "slice", "not-sure"],
    modes: ["detailed"],
  },
  {
    id: "powerControl",
    kind: "scale",
    options: [],
    modes: ["quick", "detailed"],
  },
  {
    id: "aggression",
    kind: "scale",
    options: [],
    modes: ["detailed"],
  },
  {
    id: "fitness",
    kind: "scale",
    options: [],
    modes: ["detailed"],
  },
  {
    // The problem question: stated frustrations map directly onto spec deltas
    // (short balls → power specs, flying long → control specs, arm fatigue →
    // lighter/softer), which carries more signal than aspiration questions.
    id: "struggles",
    kind: "multi",
    multiMode: "any",
    maxSelections: 3,
    exclusiveOption: "nothing",
    options: [
      "low-power",
      "flies-long",
      "off-center",
      "low-spin",
      "arm-fatigue",
      "unstable",
      "nothing",
    ],
    modes: ["quick", "detailed"],
  },
  {
    id: "armInjury",
    kind: "choice",
    options: ["none", "occasional", "past", "current"],
    modes: ["quick", "detailed"],
  },
  {
    id: "courtType",
    kind: "multi",
    multiMode: "any",
    options: ["clay", "hard", "grass", "indoor"],
    modes: ["detailed"],
  },
  {
    // Knowledge gate: spec questions are only shown to players who say they
    // understand specs. For everyone else "what weight do you prefer?" is a
    // trap — users self-select light, and light+stiff+head-heavy is the
    // classic tennis-elbow recipe. Weight is inferred from level+swing+fitness.
    id: "specKnowledge",
    kind: "choice",
    options: ["yes", "no"],
    modes: ["detailed"],
  },
  {
    id: "headSizePref",
    kind: "choice",
    options: ["midsize", "midplus", "oversize", "no-preference"],
    optional: true,
    modes: ["detailed"],
    showIf: (a) => a.specKnowledge === "yes",
  },
  {
    id: "stringPattern",
    kind: "choice",
    options: ["open", "dense", "no-preference"],
    optional: true,
    modes: ["detailed"],
    showIf: (a) => a.specKnowledge === "yes",
  },
  {
    // Unstrung grams — the convention Brazilian stores quote (US stores quote
    // strung, ~16g heavier; the prefilter converts).
    id: "weightSpec",
    kind: "choice",
    options: ["under-285", "285-300", "300-315", "over-315", "no-preference"],
    optional: true,
    modes: ["detailed"],
    showIf: (a) => a.specKnowledge === "yes",
  },
  {
    id: "gripSize",
    kind: "choice",
    options: ["1", "2", "3", "4", "5", "unknown"],
    optional: true,
    modes: ["detailed"],
  },
  {
    id: "currentRacquet",
    kind: "text",
    options: [],
    optional: true,
    modes: ["quick", "detailed"],
  },
  {
    id: "racquetFeel",
    kind: "longtext",
    options: [],
    optional: true,
    modes: ["detailed"],
    showIf: (a) =>
      typeof a.currentRacquet === "string" && a.currentRacquet.trim() !== "",
  },
  {
    id: "strengths",
    kind: "longtext",
    options: [],
    modes: ["detailed"],
  },
  {
    id: "improveGoals",
    kind: "longtext",
    options: [],
    modes: ["detailed"],
  },
  {
    id: "anythingElse",
    kind: "longtext",
    options: [],
    optional: true,
    modes: ["detailed"],
  },
];

export const QUIZ_MODES: QuizMode[] = ["quick", "detailed"];

export const SCALE_MIN = 1;
export const SCALE_MAX = 5;
export const SCALE_NEUTRAL = 3;

export function questionsFor(mode: QuizMode): Question[] {
  return QUESTIONS.filter((q) => q.modes.includes(mode));
}

/** The questions the wizard actually shows, given the answers so far. */
export function visibleQuestionsFor(
  mode: QuizMode,
  answers: Answers,
): Question[] {
  return questionsFor(mode).filter((q) => q.showIf?.(answers) ?? true);
}

export function optionLabelKey(questionId: QuestionId, value: string): string {
  return `questions.${questionId}.options.${value.replaceAll("-", "_")}`;
}

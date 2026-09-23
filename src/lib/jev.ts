import { z } from "zod";
import type { Answers } from "./answers";
import type { Racket } from "./catalog";
import { SCALE_NEUTRAL } from "./questions";
import { stringProfileFromAnswers } from "./string-advice";
import { isDensePattern, isOpenPattern } from "./traits";
import { weightFor } from "./weight";

/**
 * Ranking with Jev, TypeSafe AI's evaluation model, through the Vercel AI
 * Gateway.
 *
 * Jev is not a language model. It reads one shared `state` and answers a map of
 * typed questions with calibrated probabilities; it cannot write a sentence,
 * which is why the justification lives in justify.ts. What it does — in about
 * half a second and for a fraction of a cent — is judge how well each candidate
 * fits the player along one dimension at a time.
 *
 * So the decision is decomposed, the way the TypeSafe docs recommend: one
 * yes/no question ("noul") per candidate per applicable dimension, combined in
 * code with weights that follow from the answers. An injured arm makes the arm
 * dimension count double; a player who reported no problems gets no control
 * dimension at all. Weights in code means they can be tuned without touching
 * the model, and every ranking is auditable per dimension.
 */

export type Locale = "pt-BR" | "en";

/** AI_MODEL overrides the gateway slug, e.g. to pin a Jev version. */
export const JEV_MODEL = process.env.AI_MODEL || "typesafe-ai/jev";
const ENDPOINT = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";

/**
 * The provider answers 503 on a noticeable share of calls (one in four during
 * the September 2026 probes, sometimes in bursts) and recovers within a
 * second or two, so retrying is the difference between a ranked result and
 * the fallback. Four short attempts with a growing pause stay inside the
 * route's 30s budget even if every one of them hangs to the timeout.
 */
const ATTEMPTS = 4;
const ATTEMPT_TIMEOUT_MS = 5_000;
const BACKOFF_MS = 400;

/**
 * The prefilter already orders candidates by its own rules score. A small
 * prior keeps that order as the tiebreaker when Jev's probabilities sit within
 * noise of each other, instead of letting a 0.01 gap reorder the top three.
 */
const PRIOR_WEIGHT = 0.15;

export type Dimension = "power" | "control" | "arm" | "style" | "goals";

/** Thrown when Jev could not be reached or answered nonsense; the caller falls back. */
export class JevUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JevUnavailableError";
  }
}

export interface RankedCandidate {
  racket: Racket;
  /** Final ordering key: Jev's weighted mean blended with the prefilter prior. */
  score: number;
  /** Weighted mean of the dimension probabilities; null when Jev did not run. */
  jev: number | null;
  /** Per-dimension probability that the candidate fits, 0–1. */
  dims: Partial<Record<Dimension, number>>;
}

export interface RankResult {
  ranked: RankedCandidate[];
  model: string;
  inputTokens: number;
  outputTokens: number;
}

// Answer accessors, same shape as prefilter.ts: one value shape per question.
function str(a: Answers, id: keyof Answers): string | undefined {
  const v = a[id];
  return typeof v === "string" ? v : undefined;
}
function arr(a: Answers, id: keyof Answers): string[] {
  const v = a[id];
  return Array.isArray(v) ? v : [];
}

const FREE_TEXT_FIELDS = [
  "improveGoals",
  "racquetFeel",
  "strengths",
  "anythingElse",
] as const;
export type FreeTextField = (typeof FREE_TEXT_FIELDS)[number];
/** Below this a free-text answer is a shrug ("nada", "ok"), not a goal to weigh. */
const MIN_FREE_TEXT_CHARS = 12;

/** The player's own words, trimmed, only the fields with something in them. */
export function freeText(answers: Answers): Partial<Record<FreeTextField, string>> {
  const out: Partial<Record<FreeTextField, string>> = {};
  for (const field of FREE_TEXT_FIELDS) {
    const v = str(answers, field)?.replace(/\s+/g, " ").trim();
    if (v && v.length >= MIN_FREE_TEXT_CHARS) out[field] = v;
  }
  return out;
}

/** Struggles minus the "nothing" sentinel, which is an answer but not a problem. */
function problems(answers: Answers): string[] {
  return arr(answers, "struggles").filter((s) => s !== "nothing");
}

/**
 * Which dimensions apply to this player and how much each counts. A dimension
 * that does not apply is not asked at all: asking "does it address the
 * player's problems?" of someone who reported none only adds noise and tokens.
 */
export function dimensionWeights(
  answers: Answers,
): Partial<Record<Dimension, number>> {
  const w: Partial<Record<Dimension, number>> = { power: 1 };

  const struggles = problems(answers);
  if (struggles.length > 0) w.control = 2;

  const arm = str(answers, "armInjury");
  if (arm === "current") w.arm = 2;
  else if (arm === "past" || arm === "occasional") w.arm = 1.5;
  else if (struggles.includes("arm-fatigue")) w.arm = 1;

  const style = str(answers, "style");
  if (style && style !== "not-sure") w.style = 1;

  if (Object.keys(freeText(answers)).length > 0) w.goals = 1.5;

  return w;
}

// ---------------------------------------------------------------------------
// State: what Jev reads. English throughout (the model is weaker on other
// languages), enum answers spelled out, and every numeric spec paired with the
// category the rest of the codebase already uses (traits.ts thresholds) —
// a fast-judgement model reads "stiff" far more reliably than "RA 70".
// ---------------------------------------------------------------------------

const DESCRIBE: Record<string, Record<string, string>> = {
  skill: {
    beginner: "beginner, learning the fundamentals",
    intermediate: "intermediate, rallies with consistency",
    advanced: "advanced, plays with technique and strategy",
    competitive: "competitive, plays tournaments regularly",
  },
  frequency: {
    occasional: "once in a while",
    weekly: "once a week",
    "several-times": "2-3 times a week",
    daily: "almost every day",
  },
  swing: {
    "racquet-power":
      "relies on the racquet for power: short swing, needs help from the frame",
    mixed: "medium swing, some power from the racquet and some from the player",
    "self-power": "generates own power: long, fast swing",
  },
  style: {
    baseline: "baseliner, builds points from the back of the court",
    "serve-volley": "serve and volley, rushes the net",
    "all-court": "all-court, adapts to the point",
    counterpuncher: "counterpuncher, gets everything back and waits for the error",
    "not-sure": "not sure yet",
  },
  spinStyle: {
    "heavy-topspin": "heavy topspin, high loaded balls",
    "moderate-spin": "moderate spin, mixes it up",
    flat: "flat hitter, low direct shots",
    slice: "lots of slice, variety and low balls",
    "not-sure": "not sure",
  },
  struggles: {
    "low-power": "shots come out weak or short (lacks power)",
    "flies-long": "shots fly long (lacks control)",
    "off-center": "mishits outside the sweet spot a lot",
    "low-spin": "cannot generate enough spin",
    "arm-fatigue": "arm tires or aches late in sessions",
    unstable: "racquet twists against heavy balls (lacks stability)",
    nothing: "no problems reported",
  },
  armInjury: {
    none: "no arm, elbow or shoulder injury history",
    occasional: "arm aches sometimes after playing",
    past: "past arm injury, recovered",
    current: "current arm pain or active injury",
  },
  headSizePref: {
    midsize: "smaller head, up to 98 in2, for control",
    midplus: "mid-plus head, around 100 in2",
    oversize: "oversize head, 105 in2 or more, for forgiveness",
    "no-preference": "no preference",
  },
  stringPattern: {
    open: "open pattern (16x19) for spin and power",
    dense: "dense pattern (18x20) for control and durability",
    "no-preference": "no preference",
  },
  weightSpec: {
    "under-285": "up to 285 g unstrung (light)",
    "285-300": "285-300 g unstrung (medium)",
    "300-315": "300-315 g unstrung (heavy)",
    "over-315": "over 315 g unstrung (very heavy)",
    "no-preference": "no preference",
  },
  specKnowledge: {
    yes: "understands racquet specs and wants a say in them",
    no: "prefers the specs to follow from the answers",
  },
};

/** Named endpoints per 1-5 scale, so "4/5" reads as a lean, not a number. */
const SCALE_ANCHORS: Record<string, [string, string]> = {
  powerControl: ["total control", "total power"],
  aggression: ["consistency-first", "attacks everything"],
  fitness: ["below-average strength", "very strong"],
};

const PLAYER_FIELDS: Record<string, string> = {
  skill: "skill_level",
  frequency: "playing_frequency",
  swing: "power_source",
  style: "playing_style",
  spinStyle: "spin_style",
  powerControl: "control_vs_power_preference",
  aggression: "aggression",
  fitness: "strength_and_fitness",
  struggles: "reported_problems",
  armInjury: "arm_injury_history",
  courtType: "surfaces",
  specKnowledge: "spec_knowledge",
  headSizePref: "head_size_preference",
  stringPattern: "string_pattern_preference",
  weightSpec: "weight_preference",
  currentRacquet: "current_racquet",
};

const OWN_WORDS_FIELDS: Record<FreeTextField, string> = {
  racquetFeel: "likes_and_dislikes_about_current_racquet",
  strengths: "strengths_of_their_game",
  improveGoals: "wants_to_improve",
  anythingElse: "other_notes",
};

function describeAnswer(key: string, value: string | string[] | number): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => DESCRIBE[key]?.[v] ?? v);
  }
  if (typeof value === "number") {
    const anchors = SCALE_ANCHORS[key];
    if (!anchors) return `${value}/5`;
    if (value === SCALE_NEUTRAL) return `${value}/5 (neutral)`;
    return `${value}/5 (leaning ${value < SCALE_NEUTRAL ? anchors[0] : anchors[1]})`;
  }
  return DESCRIBE[key]?.[value] ?? value;
}

export function weightClass(r: Racket): "light" | "medium" | "heavy" {
  // Strung thresholds, the ones traits.ts and the prefilter are calibrated on.
  if (r.weightGrams <= 295) return "light";
  if (r.weightGrams >= 310) return "heavy";
  return "medium";
}

export function stiffnessClass(
  r: Racket,
): "flexible" | "medium" | "stiff" | "unknown" {
  if (r.stiffnessRA === null) return "unknown";
  if (r.stiffnessRA <= 62) return "flexible";
  if (r.stiffnessRA >= 68) return "stiff";
  return "medium";
}

function swingweightClass(r: Racket): string {
  if (r.swingweight === null) return "unknown";
  if (r.swingweight <= 310) return "low (manoeuvrable, less plow-through)";
  if (r.swingweight >= 325) return "high (stable, heavy through the ball)";
  return "medium";
}

function balanceClass(r: Racket): string {
  if (r.balancePoints === null) return "unknown";
  if (r.balancePoints <= -4) return "head-light";
  if (r.balancePoints >= 1) return "head-heavy";
  return "near even";
}

function describeRacket(r: Racket, locale: Locale) {
  const w = weightFor(r, locale);
  return {
    id: r.id,
    name: `${r.brand} ${r.model}`,
    head_size_in2: r.headSizeIn2,
    weight_g: w.grams,
    ...(w.exact ? {} : { weight_is_approximate: true }),
    weight_class: weightClass(r),
    stiffness_ra: r.stiffnessRA,
    stiffness_class: stiffnessClass(r),
    string_pattern: r.stringPattern,
    pattern_class: isOpenPattern(r.stringPattern)
      ? "open"
      : isDensePattern(r.stringPattern)
        ? "dense"
        : "other",
    swingweight: r.swingweight,
    swingweight_class: swingweightClass(r),
    balance: r.balance || "unknown",
    balance_class: balanceClass(r),
  };
}

/**
 * Candidates arrive in prefilter order and are described in the same weight
 * convention the result card shows, so nothing Jev sees can contradict what
 * the player sees.
 */
export function buildState(
  candidates: Racket[],
  answers: Answers,
  locale: Locale,
): Record<string, unknown> {
  const player: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(PLAYER_FIELDS)) {
    const value = answers[key as keyof Answers];
    if (value === undefined || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    player[field] = describeAnswer(key, value);
  }
  // Same derivation string-advice.ts uses, so "strict" here means the same
  // thing it means for string picks.
  player.arm_care = stringProfileFromAnswers(answers).armCare;

  const words = freeText(answers);
  if (Object.keys(words).length > 0) {
    player.in_their_own_words = Object.fromEntries(
      (Object.entries(words) as [FreeTextField, string][]).map(([k, v]) => [
        OWN_WORDS_FIELDS[k],
        v,
      ]),
    );
  }

  return {
    player,
    weight_convention:
      locale === "pt-BR"
        ? "unstrung grams (Brazilian retail convention)"
        : "strung grams",
    candidates: candidates.map((r) => describeRacket(r, locale)),
  };
}

// ---------------------------------------------------------------------------
// Questions: one yes/no per candidate per dimension. Criteria describe the
// concrete situation on each side of the line — that, not the label, is what
// the model discriminates on.
// ---------------------------------------------------------------------------

interface DimensionQuestion {
  question: string;
  criteria: { true: string; false: string };
}

const QUESTIONS: Record<Dimension, DimensionQuestion> = {
  power: {
    question:
      "does its power level (weight, swingweight, stiffness, head size) match how this player generates power and their skill level?",
    criteria: {
      true: "A player who relies on the racquet for power, or a beginner, gets a lighter, more forgiving, more powerful frame; a self-powered, advanced or competitive player gets a heavier, more stable, control-oriented frame.",
      false:
        "Mismatched: too demanding (heavy, small head, high swingweight) for a player who needs the racquet's help, or too light and powerful for a strong self-powered player.",
    },
  },
  control: {
    question:
      "does it directly address the problems this player reported with their current game?",
    criteria: {
      true: "Its specs counter the stated problems: a dense pattern, smaller head or lower power for balls flying long; a bigger head for off-center hits; more power for weak or short balls; an open pattern for low spin; less weight and lower swingweight for arm fatigue; more weight and swingweight for a racquet that twists.",
      false:
        "It ignores or worsens the stated problems, e.g. extra power or an extended length for a player whose balls already fly long, or a heavy frame for a player whose arm tires.",
    },
  },
  arm: {
    question:
      "is it arm-friendly enough for this player's injury history and arm care level?",
    criteria: {
      true: "Flexible or medium stiffness (RA 66 or lower, or unknown) with moderate weight and swingweight, for a player with current or past arm, elbow or shoulder issues.",
      false:
        "Stiff (RA above 66) or very demanding to swing, for a player with a current or past arm injury.",
    },
  },
  style: {
    question:
      "do its balance and manoeuvrability suit this player's playing style?",
    criteria: {
      true: "Head-light balance and a manageable swingweight for serve-and-volley or all-court net play; higher swingweight and plow-through for a baseliner; a lighter, quicker frame for a counterpuncher.",
      false:
        "Balance or swingweight works against the style, e.g. head-heavy or sluggish for a net player, or too light to hold up in long baseline exchanges.",
    },
  },
  goals: {
    question:
      "does it serve what the player wrote in their own words about their game, their current racquet and what they want to improve?",
    criteria: {
      true: "Its specs move the player toward what they wrote they want (more control if they want to stop hitting long, more stability if their racquet twists, more manoeuvrability if they want to attack the net, more comfort if the arm complains) and away from what they dislike in their current racquet.",
      false:
        "It reproduces what they dislike about their current racquet, or does nothing for what they wrote they want to improve.",
    },
  },
};

export interface JevQuestion {
  type: "noul";
  instructions: string;
  criteria: { true: string; false: string };
}

export function questionKey(dim: Dimension, racketId: string): string {
  return `${dim}:${racketId}`;
}

export function buildQuestions(
  candidates: Racket[],
  weights: Partial<Record<Dimension, number>>,
): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {};
  for (const r of candidates) {
    for (const dim of Object.keys(weights) as Dimension[]) {
      const q = QUESTIONS[dim];
      questions[questionKey(dim, r.id)] = {
        type: "noul",
        instructions: `Candidate ${r.id} (${r.brand} ${r.model}): ${q.question}`,
        criteria: q.criteria,
      };
    }
  }
  return questions;
}

// ---------------------------------------------------------------------------
// Combination, in code.
// ---------------------------------------------------------------------------

export type JevAnswers = Record<string, { noul: number }>;

/**
 * Weighted mean of the dimension probabilities, blended with the prefilter
 * prior. A weighted mean (not a sum) keeps scores comparable across players
 * with different numbers of applicable dimensions. Sort is stable, so equal
 * scores keep prefilter order.
 */
export function combine(
  candidates: Racket[],
  answers: JevAnswers,
  weights: Partial<Record<Dimension, number>>,
): RankedCandidate[] {
  const n = candidates.length;
  return candidates
    .map((racket, i) => {
      const dims: Partial<Record<Dimension, number>> = {};
      let numerator = 0;
      let denominator = 0;
      for (const [dim, w] of Object.entries(weights) as [Dimension, number][]) {
        const a = answers[questionKey(dim, racket.id)];
        if (!a) continue;
        dims[dim] = a.noul;
        numerator += w * a.noul;
        denominator += w;
      }
      const jev = denominator > 0 ? numerator / denominator : null;
      const prior = n > 1 ? 1 - i / (n - 1) : 1;
      const score =
        jev === null ? prior : (1 - PRIOR_WEIGHT) * jev + PRIOR_WEIGHT * prior;
      return { racket, score, jev, dims };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * When Jev is unavailable the prefilter's order is the ranking. It is a real
 * one — the same rules score that chose the candidates — so the player still
 * gets three defensible picks instead of an error page.
 */
export function fallbackRanking(candidates: Racket[]): RankedCandidate[] {
  const n = candidates.length;
  return candidates.map((racket, i) => ({
    racket,
    score: n > 1 ? 1 - i / (n - 1) : 1,
    jev: null,
    dims: {},
  }));
}

// ---------------------------------------------------------------------------
// Transport.
// ---------------------------------------------------------------------------

const responseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(
    z.string(),
    z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) }),
  ),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative().optional(),
      output_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callJev(body: unknown): Promise<z.infer<typeof responseSchema>> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new JevUnavailableError("AI_GATEWAY_API_KEY is not set");

  const payload = JSON.stringify(body);
  let lastFailure = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(BACKOFF_MS * (attempt - 1));
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: payload,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      if (res.ok) {
        const parsed = responseSchema.safeParse(await res.json());
        if (!parsed.success) {
          throw new JevUnavailableError(
            `malformed response: ${parsed.error.message.slice(0, 200)}`,
          );
        }
        return parsed.data;
      }
      const text = (await res.text()).slice(0, 200);
      // 4xx other than rate limiting is our bug or our key: retrying would
      // only repeat it.
      if (res.status < 500 && res.status !== 429) {
        throw new JevUnavailableError(`HTTP ${res.status}: ${text}`);
      }
      lastFailure = `HTTP ${res.status}: ${text}`;
    } catch (error) {
      if (error instanceof JevUnavailableError) throw error;
      // Timeouts and network errors are retryable.
      lastFailure = error instanceof Error ? error.message : String(error);
    }
  }
  throw new JevUnavailableError(
    `gave up after ${ATTEMPTS} attempts: ${lastFailure}`,
  );
}

export async function rankCandidates(
  candidates: Racket[],
  answers: Answers,
  locale: Locale,
): Promise<RankResult> {
  const weights = dimensionWeights(answers);
  const response = await callJev({
    model: JEV_MODEL,
    state: buildState(candidates, answers, locale),
    questions: buildQuestions(candidates, weights),
  });
  return {
    ranked: combine(candidates, response.answers, weights),
    model: response.model ?? JEV_MODEL,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}

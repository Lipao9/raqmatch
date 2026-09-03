import type { Answers } from "./answers";
import type { Racket } from "./catalog";
import { isDensePattern, isOpenPattern } from "./traits";
import { loadStrings, type StringCategory, type TennisString } from "./strings";

/**
 * Deterministic string advice: racquet specs (always available) plus the quiz
 * profile (when there is one) → ranked string picks and a tension range.
 *
 * Same design bet as `traits.ts`: pure and testable, no LLM call, so it runs
 * on the statically generated racquet pages as well as inside /api/recommend.
 * The LLM never sees strings at all — the catalog is 15 hand-curated products
 * and a scoring table covers it; a model call would add cost and
 * nondeterminism to a decision a table already makes well.
 *
 * Thresholds reuse the vocabulary the rest of the codebase already speaks:
 * RA 62/68 from traits.ts, the armInjury/struggles semantics from prefilter.ts.
 */

export interface StringProfile {
  level?: "beginner" | "intermediate" | "advanced" | "competitive";
  /**
   * `strict` is an active injury — stiff poly is ruled out, not merely scored
   * down. `caution` is history or fatigue: soft setups favoured, nothing banned.
   */
  armCare: "none" | "caution" | "strict";
  /** Wants more spin (plays heavy topspin, or names low spin as a struggle). */
  spin: boolean;
  /** 1–5 quiz scale, 1 = total control, 5 = total power (see questions.ts). */
  powerControl?: number;
}

function str(a: Answers, id: keyof Answers): string | undefined {
  const v = a[id];
  return typeof v === "string" ? v : undefined;
}

function arr(a: Answers, id: keyof Answers): string[] {
  const v = a[id];
  return Array.isArray(v) ? v : [];
}

export function stringProfileFromAnswers(answers: Answers): StringProfile {
  const armInjury = str(answers, "armInjury");
  const struggles = arr(answers, "struggles");
  const armCare =
    armInjury === "current"
      ? "strict"
      : armInjury === "past" ||
          armInjury === "occasional" ||
          struggles.includes("arm-fatigue")
        ? "caution"
        : "none";

  const skill = str(answers, "skill");
  const level =
    skill === "beginner" ||
    skill === "intermediate" ||
    skill === "advanced" ||
    skill === "competitive"
      ? skill
      : undefined;

  const powerControl = answers.powerControl;

  return {
    level,
    armCare,
    spin:
      str(answers, "spinStyle") === "heavy-topspin" ||
      struggles.includes("low-spin"),
    powerControl: typeof powerControl === "number" ? powerControl : undefined,
  };
}

/** The one shown to the player as "why this string". */
export type StringReason =
  | "comfort"
  | "spin"
  | "control"
  | "value"
  | "durability"
  | "allround";

export interface StringPick {
  string: TennisString;
  reason: StringReason;
  /** Suggested stringing tension for THIS string on THIS racquet. */
  tension: TensionRange;
}

export interface TensionRange {
  lbs: [number, number];
  kg: [number, number];
}

export interface StringAdvice {
  picks: StringPick[];
}

/**
 * A range, never a single number, because a single number is false precision:
 * the right tension depends on the stringing machine, the weather and the
 * player's feel, and every stringer adjusts anyway. The range says "start
 * here" — its width is the honest part.
 */
export function tensionFor(
  racket: Racket,
  category: StringCategory,
  profile?: StringProfile,
): TensionRange {
  // Larger heads are strung tighter to keep the launch angle in check.
  let lo = racket.headSizeIn2 <= 98 ? 48 : racket.headSizeIn2 <= 102 ? 50 : 52;

  // Poly plays markedly stiffer than nylon at equal tension; the usual guidance
  // is to string it a step lower, and soft poly sits with it.
  if (category === "poly" || category === "soft-poly") lo -= 4;

  if (profile) {
    if (profile.armCare !== "none") lo -= 2;
    // 1–2 on the scale asks for control (tighter), 4–5 for power (looser).
    if (profile.powerControl !== undefined) {
      if (profile.powerControl <= 2) lo += 2;
      else if (profile.powerControl >= 4) lo -= 2;
    }
  }

  lo = Math.min(56, Math.max(40, lo));
  const hi = lo + 6;
  const kg = (n: number) => Math.round(n * 0.453592);
  return { lbs: [lo, hi], kg: [kg(lo), kg(hi)] };
}

/**
 * Category affinity by level. Beginners get multifilament first — they break
 * strings rarely and lose more to a dead stiff poly than they gain from it;
 * competitive players get poly first for the opposite reasons.
 */
const LEVEL_CATEGORY: Record<
  NonNullable<StringProfile["level"]>,
  Record<StringCategory, number>
> = {
  beginner: { multi: 4, "natural-gut": 1, "soft-poly": 1, poly: -3 },
  intermediate: { multi: 2, "soft-poly": 3, poly: 1, "natural-gut": 0 },
  advanced: { poly: 3, "soft-poly": 2, multi: 0, "natural-gut": 0 },
  competitive: { poly: 4, "soft-poly": 2, multi: -1, "natural-gut": 0 },
};

/**
 * With no quiz profile (the static racquet page), the frame stands in for the
 * player: a compact dense-pattern frame is bought by people who play like its
 * buyers, and the advice should read that way.
 */
function categoryScoreFromRacket(
  racket: Racket,
  category: StringCategory,
): number {
  const controlFrame =
    racket.headSizeIn2 <= 98 &&
    (isDensePattern(racket.stringPattern) || racket.weightGrams >= 310);
  if (controlFrame) {
    return { poly: 2, "soft-poly": 2, multi: 1, "natural-gut": 0 }[category];
  }
  const powerFrame = racket.headSizeIn2 >= 103;
  if (powerFrame) {
    // A powerful frame wants the string to give some control back.
    return { poly: 1, "soft-poly": 2, multi: 1, "natural-gut": -1 }[category];
  }
  return { poly: 1, "soft-poly": 2, multi: 2, "natural-gut": -1 }[category];
}

function score(
  s: TennisString,
  racket: Racket,
  profile: StringProfile | undefined,
): number {
  let n = 0;

  if (profile?.level) {
    n += LEVEL_CATEGORY[profile.level][s.category];
  } else {
    n += categoryScoreFromRacket(racket, s.category);
  }

  // Natural gut is priced out of a default recommendation; it has to be earned
  // by the comfort cases below.
  if (s.category === "natural-gut") n -= 2;

  const armCare = profile?.armCare ?? "none";
  if (armCare === "strict") {
    n += { poly: -6, "soft-poly": -1, multi: 4, "natural-gut": 4 }[s.category];
  } else if (armCare === "caution") {
    n += { poly: -2, "soft-poly": 1, multi: 2, "natural-gut": 2 }[s.category];
  }

  // A stiff frame shifts comfort onto the string bed — same RA 68 bar as the
  // `stiff` trait, so the advice never contradicts the racquet page copy.
  if (racket.stiffnessRA !== null && racket.stiffnessRA >= 68) {
    n += { poly: -1, "soft-poly": 1, multi: 1, "natural-gut": 1 }[s.category];
  }

  if (profile?.spin) {
    if (s.tags.includes("spin")) n += 3;
    if (s.category === "multi") n -= 1;
  }

  if (profile?.powerControl !== undefined) {
    if (profile.powerControl <= 2 && s.tags.includes("control")) n += 2;
    if (profile.powerControl >= 4) {
      if (s.tags.includes("power")) n += 2;
      if (s.category === "multi") n += 1;
    }
  }

  if (profile?.level === "beginner" || profile?.level === "intermediate") {
    if (s.priceTier === "budget") n += 1;
    if (s.priceTier === "premium") n -= 1;
  }

  return n;
}

function reasonFor(
  s: TennisString,
  racket: Racket,
  profile: StringProfile | undefined,
): StringReason {
  const soft = s.category === "multi" || s.category === "natural-gut";
  const stiffFrame = racket.stiffnessRA !== null && racket.stiffnessRA >= 68;
  if (soft && ((profile?.armCare ?? "none") !== "none" || stiffFrame)) {
    return "comfort";
  }
  if (
    s.tags.includes("spin") &&
    (profile?.spin || isOpenPattern(racket.stringPattern))
  ) {
    return "spin";
  }
  if (
    s.tags.includes("control") &&
    ((profile?.powerControl !== undefined && profile.powerControl <= 2) ||
      isDensePattern(racket.stringPattern))
  ) {
    return "control";
  }
  if (
    s.tags.includes("value") &&
    (profile?.level === "beginner" || profile?.level === "intermediate")
  ) {
    return "value";
  }
  if (soft) return "comfort";
  if (s.tags.includes("durability")) return "durability";
  return "allround";
}

const MAX_PICKS = 3;
const MAX_PER_CATEGORY = 2;

export function stringAdviceFor(
  racket: Racket,
  profile?: StringProfile,
): StringAdvice {
  const ranked = loadStrings()
    // An active arm injury rules stiff poly out entirely rather than trusting
    // the score to bury it — the same "ruled out, not scored down" stance the
    // prefilter takes on armInjury === "current".
    .filter((s) => !(profile?.armCare === "strict" && s.category === "poly"))
    .map((s, index) => ({ s, n: score(s, racket, profile), index }))
    // Stable order: score, then catalog order — the catalog is curated
    // best-first within each category, so file order is a real tie-break.
    .sort((a, b) => b.n - a.n || a.index - b.index);

  const picks: StringPick[] = [];
  const perCategory = new Map<StringCategory, number>();
  for (const { s } of ranked) {
    const used = perCategory.get(s.category) ?? 0;
    if (used >= MAX_PER_CATEGORY) continue;
    perCategory.set(s.category, used + 1);
    picks.push({
      string: s,
      reason: reasonFor(s, racket, profile),
      tension: tensionFor(racket, s.category, profile),
    });
    if (picks.length >= MAX_PICKS) break;
  }

  return { picks };
}

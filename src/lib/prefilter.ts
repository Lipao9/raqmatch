import type { Answers } from "./answers";
import type { Racket } from "./catalog";
import { SCALE_NEUTRAL } from "./questions";

const MAX_CANDIDATES = 25;
const MIN_BEFORE_RELAX = 10;
const MAX_PER_BRAND = 2;

export class InsufficientCandidatesError extends Error {
  constructor() {
    super("Prefilter found fewer than 3 candidate rackets");
    this.name = "InsufficientCandidatesError";
  }
}

type HardFilter = {
  name: string;
  relaxable: boolean;
  test: (r: Racket, a: Answers) => boolean;
};

// Answer accessors: `Answers` values are string | string[] | number, and the
// scoring below only ever wants one shape per question.
function str(a: Answers, id: keyof Answers): string | undefined {
  const v = a[id];
  return typeof v === "string" ? v : undefined;
}
function num(a: Answers, id: keyof Answers): number | undefined {
  const v = a[id];
  return typeof v === "number" ? v : undefined;
}
function arr(a: Answers, id: keyof Answers): string[] {
  const v = a[id];
  return Array.isArray(v) ? v : [];
}

/** 0 = neutral/unanswered, 1 = mild lean, 2 = strong lean. */
function scaleMagnitude(value: number | undefined): number {
  return value === undefined ? 0 : Math.abs(value - SCALE_NEUTRAL);
}

/**
 * Bands are in STRUNG grams (the catalog's convention), ~17g above the unstrung
 * figure Brazilian players think in. The advanced/competitive floors put the
 * unstrung minimum near 290/295g — club-level players do not swing 280g frames,
 * and recommending one reads as the site not knowing tennis.
 */
const SKILL_BANDS: Record<string, [number, number]> = {
  beginner: [0, 300],
  intermediate: [285, 315],
  advanced: [305, Infinity],
  competitive: [310, Infinity],
};

/**
 * Static weight alone lets stability outliers through (a 310g frame swinging
 * like 303 plays lighter than its scale weight), so higher levels also get a
 * swingweight floor. Frames with unknown swingweight pass — absence of data is
 * not evidence of instability.
 */
const SKILL_SWINGWEIGHT_FLOOR: Record<string, number> = {
  advanced: 310,
  competitive: 315,
};

const HIGH_SKILL = new Set(["advanced", "competitive"]);

/**
 * How the swing answer shifts the skill weight band: a racquet-powered swing
 * needs a lighter frame than the level alone suggests, a self-powered swing
 * carries a heavier one.
 */
const SWING_SHIFT: Record<string, number> = {
  "racquet-power": -10,
  "self-power": 5,
};

/**
 * `weightSpec` is answered in unstrung grams (the Brazilian retail convention)
 * behind the spec-knowledge gate; the catalog holds strung weights, ~16g
 * heavier. Band edges overlap a few grams on purpose — the conversion is only
 * accurate to about ±5g.
 */
const WEIGHT_SPEC_BANDS: Record<string, [number, number]> = {
  "under-285": [0, 300],
  "285-300": [299, 318],
  "300-315": [314, 333],
  "over-315": [329, Infinity],
};

// Ordered: the LAST relaxable filter is dropped first when candidates run low.
const HARD_FILTERS: HardFilter[] = [
  {
    // Active arm pain rules out stiff frames AND very light ones — too little
    // mass means the arm absorbs the shock the racquet doesn't.
    name: "armInjury",
    relaxable: false,
    test: (r, a) =>
      str(a, "armInjury") !== "current" ||
      (r.stiffnessRA !== null &&
        r.stiffnessRA <= 64 &&
        r.weightGrams >= 295),
  },
  {
    name: "beginnerHeadSize",
    relaxable: true,
    test: (r, a) => str(a, "skill") !== "beginner" || r.headSizeIn2 >= 100,
  },
  {
    name: "skillSwingWeight",
    relaxable: true,
    test: (r, a) => {
      const band = skillSwingBand(a);
      if (band && (r.weightGrams < band[0] || r.weightGrams > band[1])) {
        return false;
      }
      const swFloor = SKILL_SWINGWEIGHT_FLOOR[str(a, "skill") ?? ""];
      return (
        swFloor === undefined ||
        r.swingweight === null ||
        r.swingweight >= swFloor
      );
    },
  },
  {
    name: "weightSpec",
    relaxable: true,
    test: (r, a) => {
      const band = WEIGHT_SPEC_BANDS[str(a, "weightSpec") ?? ""];
      if (!band) return true; // no-preference or gate closed
      return r.weightGrams >= band[0] && r.weightGrams <= band[1];
    },
  },
  {
    name: "fitnessCap",
    relaxable: true,
    test: (r, a) => {
      const fitness = num(a, "fitness");
      return fitness === undefined || fitness > 2 || r.weightGrams <= 305;
    },
  },
];

function skillSwingBand(a: Answers): [number, number] | null {
  const skill = str(a, "skill") ?? "";
  const band = SKILL_BANDS[skill];
  if (!band) return null;
  let shift = SWING_SHIFT[str(a, "swing") ?? ""] ?? 0;
  // The advanced/competitive floor is about stability against pace, which a
  // shorter swing does not change — never shift those floors downward.
  if (shift < 0 && HIGH_SKILL.has(skill)) shift = 0;
  return [Math.max(0, band[0] + shift), band[1] + shift];
}

/**
 * Per-selection contributions of the struggles multi-select. The question's
 * total is normalised by the number of selections (weight × matched/selected),
 * so ticking three boxes never outweighs a question answered with one.
 */
function strugglesScore(r: Racket, selections: string[]): number {
  if (selections.length === 0) return 0;
  const open = /16x1[89]/.test(r.stringPattern);
  const dense = /18x20|16x20/.test(r.stringPattern);
  let total = 0;
  for (const struggle of selections) {
    switch (struggle) {
      case "low-power":
        if (r.headSizeIn2 >= 100) total += 2;
        if (r.stiffnessRA !== null && r.stiffnessRA >= 67) total += 1;
        if (open) total += 1;
        break;
      case "flies-long":
        if (dense) total += 2;
        if (r.headSizeIn2 <= 100) total += 1;
        if (r.stiffnessRA !== null && r.stiffnessRA <= 65) total += 1;
        break;
      case "off-center":
        if (r.headSizeIn2 >= 102) total += 2;
        break;
      case "low-spin":
        if (open) total += 2;
        break;
      case "arm-fatigue":
        if (r.weightGrams <= 295) total += 1;
        if (r.swingweight !== null && r.swingweight <= 315) total += 1;
        if (r.stiffnessRA !== null && r.stiffnessRA <= 65) total += 1;
        break;
      case "unstable":
        if (r.weightGrams >= 300) total += 1;
        if (r.swingweight !== null && r.swingweight >= 320) total += 1;
        break;
      // "nothing" contributes zero by design.
    }
  }
  return total / selections.length;
}

function score(r: Racket, a: Answers): number {
  let s = 0;
  const open = /16x1[89]/.test(r.stringPattern);
  const dense = /18x20|16x20/.test(r.stringPattern);

  // Keep relaxed-away hard constraints influencing the ranking.
  const specBand = WEIGHT_SPEC_BANDS[str(a, "weightSpec") ?? ""];
  if (specBand && r.weightGrams >= specBand[0] && r.weightGrams <= specBand[1]) {
    s += 3;
  }
  const skillBand = skillSwingBand(a);
  if (skillBand && r.weightGrams >= skillBand[0] && r.weightGrams <= skillBand[1]) {
    s += 2;
  }

  // Scales: distance from the neutral midpoint is the weight multiplier, so a
  // 4 counts half as strongly as a 5 and a 3 counts for nothing.
  const powerControl = num(a, "powerControl");
  const pcMag = scaleMagnitude(powerControl);
  if (powerControl !== undefined && pcMag > 0) {
    if (powerControl > SCALE_NEUTRAL) {
      if (r.headSizeIn2 >= 102) s += 2 * pcMag;
      if (open) s += 1 * pcMag;
      if (r.stiffnessRA !== null && r.stiffnessRA >= 67) s += 1 * pcMag;
    } else {
      if (r.headSizeIn2 <= 100) s += 2 * pcMag;
      if (dense) s += 1 * pcMag;
      if (r.stiffnessRA !== null && r.stiffnessRA <= 65) s += 1 * pcMag;
    }
  }

  const aggression = num(a, "aggression");
  const agMag = scaleMagnitude(aggression);
  if (aggression !== undefined && agMag > 0) {
    if (aggression > SCALE_NEUTRAL) {
      if (r.swingweight !== null && r.swingweight >= 320) s += 1 * agMag;
      if (r.weightGrams >= 300) s += 1 * agMag;
    } else {
      if (r.weightGrams <= 305) s += 1 * agMag;
      if (r.swingweight !== null && r.swingweight <= 315) s += 1 * agMag;
    }
  }

  s += strugglesScore(r, arr(a, "struggles"));

  const swing = str(a, "swing");
  if (swing === "racquet-power") {
    // The light-frame bonus stops at advanced/competitive: whatever powers the
    // swing, a sub-295g frame is below what that level's pace tolerates.
    if (r.weightGrams <= 295 && !HIGH_SKILL.has(str(a, "skill") ?? "")) s += 2;
    if (r.headSizeIn2 >= 102) s += 1;
  } else if (swing === "self-power") {
    if (r.weightGrams >= 300) s += 1;
    if (r.headSizeIn2 <= 100) s += 1;
  }

  const headSizePref = str(a, "headSizePref");
  if (headSizePref === "midsize" && r.headSizeIn2 <= 98) s += 2;
  if (headSizePref === "midplus" && r.headSizeIn2 >= 99 && r.headSizeIn2 <= 102) s += 2;
  if (headSizePref === "oversize" && r.headSizeIn2 >= 104) s += 2;

  const stringPattern = str(a, "stringPattern");
  if (stringPattern === "open" && open) s += 2;
  if (stringPattern === "dense" && dense) s += 2;

  const style = str(a, "style");
  if (style === "baseline" && r.swingweight !== null && r.swingweight >= 320) s += 1;
  if (style === "serve-volley" && r.balancePoints !== null && r.balancePoints <= -5) s += 1;
  if (style === "counterpuncher" && r.weightGrams <= 315) s += 1;

  const armInjury = str(a, "armInjury");
  if (
    (armInjury === "past" || armInjury === "occasional") &&
    r.stiffnessRA !== null &&
    r.stiffnessRA <= 66
  ) {
    s += 2;
  }

  const spinStyle = str(a, "spinStyle");
  if (spinStyle === "heavy-topspin" && open) s += 2;
  if (spinStyle === "flat" && dense) s += 1;

  // Surface is deliberately a near-zero tiebreaker: club players keep the same
  // frame on every surface; clay only mildly rewards spin-friendly patterns.
  if (arr(a, "courtType").includes("clay") && open) s += 0.5;

  return s;
}

function applyFilters(
  rackets: Racket[],
  answers: Answers,
  filters: HardFilter[],
): Racket[] {
  return rackets.filter((r) => filters.every((f) => f.test(r, answers)));
}

export function prefilter(answers: Answers, rackets: Racket[]): Racket[] {
  const filters = [...HARD_FILTERS];
  let survivors = applyFilters(rackets, answers, filters);

  // Relax the least important constraints until enough candidates remain.
  while (survivors.length < MIN_BEFORE_RELAX) {
    const idx = filters.map((f) => f.relaxable).lastIndexOf(true);
    if (idx === -1) break;
    filters.splice(idx, 1);
    survivors = applyFilters(rackets, answers, filters);
  }

  if (survivors.length < 3) {
    throw new InsufficientCandidatesError();
  }

  const ranked = survivors
    .map((r) => ({ r, s: score(r, answers) }))
    .sort((a, b) => b.s - a.s);

  // Cap per brand so the LLM sees variety.
  const perBrand = new Map<string, number>();
  const diverse: Racket[] = [];
  for (const { r } of ranked) {
    const count = perBrand.get(r.brand) ?? 0;
    if (count < MAX_PER_BRAND) {
      perBrand.set(r.brand, count + 1);
      diverse.push(r);
    }
    if (diverse.length >= MAX_CANDIDATES) break;
  }

  // If the brand cap cut below 3 (tiny catalogs), fall back to the raw ranking.
  return diverse.length >= 3 ? diverse : ranked.slice(0, MAX_CANDIDATES).map((x) => x.r);
}

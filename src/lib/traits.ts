import type { Racket } from "./catalog";

/**
 * Plain-language traits derived from the specs, so a racquet page says something
 * about how the frame plays instead of just listing numbers. Pure and
 * deterministic on purpose: no LLM call on a statically generated page, and it
 * stays cheap to unit-test.
 *
 * Thresholds mirror the ones the prefilter scores on (see lib/prefilter.ts) so
 * the pages and the recommendation never contradict each other.
 */
export type TraitKey =
  | "armFriendly"
  | "stiff"
  | "power"
  | "control"
  | "light"
  | "heavy"
  | "spin"
  | "maneuverable";

export interface Trait {
  key: TraitKey;
  values: Record<string, string | number>;
}

const MAX_TRAITS = 4;

export function isOpenPattern(pattern: string): boolean {
  return /16x1[89]/.test(pattern);
}

export function isDensePattern(pattern: string): boolean {
  return /18x20|16x20/.test(pattern);
}

/**
 * `displayWeight` only changes the number the copy shows, never which traits
 * fire: the thresholds are calibrated on the strung figure the catalog holds, so
 * classifying on a locale-dependent number would make the same frame read as
 * "light" in one language and not the other.
 */
export function racketTraits(r: Racket, displayWeight = r.weightGrams): Trait[] {
  const traits: Trait[] = [];
  const open = isOpenPattern(r.stringPattern);
  const dense = isDensePattern(r.stringPattern);

  // Arm comfort first — it is the one spec that rules a frame out entirely.
  if (r.stiffnessRA !== null && r.stiffnessRA <= 62) {
    traits.push({ key: "armFriendly", values: { ra: r.stiffnessRA } });
  } else if (r.stiffnessRA !== null && r.stiffnessRA >= 68) {
    traits.push({ key: "stiff", values: { ra: r.stiffnessRA } });
  }

  if (r.headSizeIn2 >= 100 && open) {
    traits.push({ key: "power", values: { headSize: r.headSizeIn2 } });
  } else if (r.headSizeIn2 <= 100 && dense) {
    traits.push({ key: "control", values: { headSize: r.headSizeIn2 } });
  }

  if (r.weightGrams <= 295) {
    traits.push({ key: "light", values: { weight: displayWeight } });
  } else if (r.weightGrams >= 310) {
    traits.push({ key: "heavy", values: { weight: displayWeight } });
  }

  if (open) {
    traits.push({ key: "spin", values: { pattern: r.stringPattern } });
  }

  if (r.swingweight !== null && r.swingweight <= 310) {
    traits.push({ key: "maneuverable", values: { sw: r.swingweight } });
  }

  return traits.slice(0, MAX_TRAITS);
}

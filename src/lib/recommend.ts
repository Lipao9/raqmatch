import type { Answers } from "./answers";
import type { Racket } from "./catalog";
import {
  fallbackRanking,
  JevUnavailableError,
  rankCandidates,
  type Locale,
  type RankedCandidate,
} from "./jev";
import { justifyPicks } from "./justify";

export class RecommendationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecommendationError";
  }
}

export interface Pick {
  racketId: string;
  justification: string;
}

export interface RecommendResult {
  picks: Pick[];
  /** Gateway slug of the ranker, or FALLBACK_MODEL when it did not run. */
  model: string;
  inputTokens: number;
  /** Always 0 with Jev: evaluation models emit probabilities, not tokens. */
  outputTokens: number;
  /** Time spent ranking only, not the whole request. */
  latencyMs: number;
}

/** Recorded as the run's model when Jev was unavailable, so the rate is measurable. */
export const FALLBACK_MODEL = "prefilter-order";

const PICKS = 3;

/**
 * Tokens that distinguish versions and editions of the same frame, not frames.
 * "Blade 98 18x20 v9" and "v10", "Speed MP 2024" and "2026", a US Open paint
 * job: the same racquet to the player, and two of them in a top three is one
 * recommendation wasted.
 */
const EDITION_TOKENS = new Set([
  "limited",
  "edition",
  "us",
  "open",
  "racquet",
  "roland",
  "garros",
  "wimbledon",
  "spectra",
  "purple",
  "pink",
  "reverse",
  "midnight",
  "navy",
  "session",
  "soiree",
  "carbon",
  "grey",
  "gen",
  "ig",
]);

function isVersionToken(token: string): boolean {
  return (
    /^v\d+$/.test(token) ||
    /^(19|20)\d{2}$/.test(token) ||
    /^\d+(st|nd|rd|th)$/.test(token)
  );
}

/** Brand plus the model name with version and edition tokens removed. */
export function familyKey(racket: Racket): string {
  const tokens = `${racket.brand} ${racket.model}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !isVersionToken(t) && !EDITION_TOKENS.has(t));
  return tokens.join(" ");
}

/**
 * Best-first, one per family. If the candidate list has fewer distinct
 * families than picks (tiny pools after the availability filter), the
 * remaining slots are filled by rank rather than left empty.
 */
export function pickDistinct(
  ranked: RankedCandidate[],
  count = PICKS,
): RankedCandidate[] {
  const chosen: RankedCandidate[] = [];
  const families = new Set<string>();
  for (const c of ranked) {
    if (chosen.length >= count) break;
    const family = familyKey(c.racket);
    if (families.has(family)) continue;
    families.add(family);
    chosen.push(c);
  }
  for (const c of ranked) {
    if (chosen.length >= count) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  return chosen;
}

export async function recommend(
  candidates: Racket[],
  answers: Answers,
  locale: Locale,
): Promise<RecommendResult> {
  const startedAt = Date.now();

  let ranked: RankedCandidate[];
  let model: string;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const result = await rankCandidates(candidates, answers, locale);
    ranked = result.ranked;
    model = result.model;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } catch (error) {
    if (!(error instanceof JevUnavailableError)) throw error;
    // Degrade, don't fail: the prefilter order is a ranking too, and a slower
    // provider must not turn into an error page for the player.
    console.warn("jev unavailable, using prefilter order:", error.message);
    ranked = fallbackRanking(candidates);
    model = FALLBACK_MODEL;
  }

  const chosen = pickDistinct(ranked, PICKS);
  if (chosen.length < PICKS) {
    throw new RecommendationError(
      `Only ${chosen.length} candidates available to pick from`,
    );
  }

  const justifications = justifyPicks(
    chosen.map((c) => ({ racket: c.racket, dims: c.dims })),
    answers,
    locale,
  );

  return {
    picks: chosen.map((c, i) => ({
      racketId: c.racket.id,
      justification: justifications[i],
    })),
    model,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - startedAt,
  };
}

import type { Racket } from "./catalog";
import { getOffer } from "./offers";
import { BR_STORE_KEYS } from "./stores";

/**
 * Which weight figure to show, and in which convention.
 *
 * The two markets do not quote the same number. Tennis Warehouse — and the US
 * market generally — publishes STRUNG weight; Brazilian stores publish UNSTRUNG.
 * The catalog holds the strung figure because that is what was scraped, so
 * showing it unlabelled to a Brazilian visitor overstates every racquet by
 * roughly a string job. A player who reads "318 g" on a frame that every local
 * listing calls "300 g" concludes the site has the wrong racquet.
 *
 * Deriving unstrung from strung is only good to about ±5 g, measured against
 * real Mercado Livre data: four of six frames converted exactly, two were off by
 * 5 g. That is enough error to matter when choosing between a 300 and a 305, so
 * a derived figure is always marked approximate and a store's own figure wins
 * whenever there is one.
 */

/**
 * Typical mass a string job adds. Not a constant of nature — it varies with
 * string gauge and pattern — which is exactly why the result is approximate.
 */
const STRING_JOB_GRAMS = 17;

export interface WeightDisplay {
  grams: number;
  /** `false` when derived, which is what the UI marks with a "≈". */
  exact: boolean;
  convention: "strung" | "unstrung";
}

/** Rounded to 5 g: the granularity every manufacturer actually publishes. */
function estimateUnstrung(strung: number): number {
  return Math.round((strung - STRING_JOB_GRAMS) / 5) * 5;
}

/** A store's own unstrung figure, if any store publishes one for this racquet. */
function publishedUnstrung(racketId: string): number | null {
  for (const store of BR_STORE_KEYS) {
    const weight = getOffer(racketId, store)?.unstrungWeightGrams;
    if (weight) return weight;
  }
  return null;
}

/**
 * `pt-BR` gets unstrung because that is the local convention; `en` keeps the
 * strung figure the catalog was scraped in, for the same reason dollar prices
 * belong on `/en` only.
 */
export function weightFor(racket: Racket, locale: string): WeightDisplay {
  if (locale !== "pt-BR") {
    return { grams: racket.weightGrams, exact: true, convention: "strung" };
  }

  const published = publishedUnstrung(racket.id);
  return published
    ? { grams: published, exact: true, convention: "unstrung" }
    : { grams: estimateUnstrung(racket.weightGrams), exact: false, convention: "unstrung" };
}

/** Compact form for badges and lists: "300 g" or "≈ 300 g". */
export function weightLabel(racket: Racket, locale: string): string {
  const { grams, exact } = weightFor(racket, locale);
  return `${exact ? "" : "≈ "}${grams} g`;
}

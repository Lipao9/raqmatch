import type { Racket } from "../../src/lib/catalog";
import { attr, type MlProduct } from "./ml";

/**
 * Deciding whether a Mercado Livre catalog product is the same frame as a
 * Tennis Warehouse catalog entry.
 *
 * Deliberately deterministic. A catalog product carries structured specs
 * (`HEAD_SIZE`, `STRING_PATTERN`, `WEIGHT`), and those separate exactly the
 * frames that a title-reading matcher confuses: Pure Aero (100 in², 16x19),
 * Pure Aero 98 (98 in², 16x20) and Pure Aero Team (100 in², lighter) differ on
 * fields we can compare as numbers. An earlier experiment showed Mercado Livre's
 * own search returning a Pure Aero *Lite* for the query "pure aero", which is
 * precisely the failure this replaces.
 *
 * A false positive is far worse than no match: sending a player to the wrong
 * racquet burns the only thing the site sells. So every gate rejects on
 * conflict, and an absent attribute is never treated as agreement.
 */

/** Frames that are not what an adult player was recommended. */
const EXCLUDE_NAME = /\b(junior|infantil|jr|kids|crian|25"|26"|beach|padel|frescobol)\b/i;

/**
 * Tennis Warehouse publishes STRUNG weight; Brazilian listings usually publish
 * unstrung. A string job is roughly 15-20 g, confirmed against real data (Pure
 * Aero 98: 323 g strung at TW, 305 g at Mercado Livre). The window is
 * asymmetric because a listing may quote either convention.
 */
const WEIGHT_TOLERANCE_BELOW = 28;
const WEIGHT_TOLERANCE_ABOVE = 10;

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Brazilian listings write the Plus variant as "Pure Aero +". Stripping
    // punctuation first would delete the only thing naming the model.
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function firstNumber(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(",", ".").match(/[\d.]+/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/** "305 g" → 305, "0.305 kg" → 305. */
function grams(value: string | null): number | null {
  const n = firstNumber(value);
  if (n === null) return null;
  return /kg/i.test(value ?? "") ? Math.round(n * 1000) : Math.round(n);
}

/** "16 x 20" → "16x20". */
function pattern(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/(\d{2})\s*[x×]\s*(\d{2})/i);
  return m ? `${m[1]}x${m[2]}` : null;
}

function years(text: string): number[] {
  return [...text.matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) => Number(m[0]));
}

/** Model name with the year removed — "Pure Aero 98 2026" → "pure aero 98". */
export function modelFamily(racket: Racket): string {
  return normalise(racket.model.replace(/\b(?:19|20)\d{2}\b/g, " "));
}

export function searchTerms(racket: Racket): string {
  return `${normalise(racket.brand)} ${modelFamily(racket)}`.trim();
}

/**
 * Tokens that would make a candidate a DIFFERENT frame in the same family.
 *
 * A base model name is a prefix of its own variants — "Pure Drive" is contained
 * in "Pure Drive Team", "Pure Drive 98" and "Pure Drive Wimbledon" — so
 * requiring the family tokens is not enough to tell them apart. The catalog
 * already knows what the variants are: any sibling of the same brand whose name
 * strictly extends this one contributes its extra words as a disqualifier.
 *
 * Derived from data rather than a hand-written list, so a new frame in a future
 * scrape starts excluding its siblings without anyone remembering to edit this.
 */
export function siblingTokens(racket: Racket, catalog: Racket[]): Set<string> {
  const own = modelFamily(racket).split(" ").filter(Boolean);
  const tokens = new Set<string>();

  for (const other of catalog) {
    if (other.id === racket.id || other.brand !== racket.brand) continue;
    const words = modelFamily(other).split(" ").filter(Boolean);
    if (words.length <= own.length) continue;
    if (own.some((token, i) => words[i] !== token)) continue; // not an extension
    for (const extra of words.slice(own.length)) tokens.add(extra);
  }

  // Never disqualify on a word the racquet itself carries.
  for (const token of own) tokens.delete(token);
  return tokens;
}

export type MatchKind =
  | "exact"
  | "variant_year"
  | "variant_spec"
  | "unknown_generation";

export interface Match {
  product: MlProduct;
  matchKind: MatchKind;
  /** Detected model year when it differs, or null when none is stated. */
  variantNote: string | null;
  /** Higher is better. Only meaningful for ranking within one racquet. */
  score: number;
  /** Which attributes actually agreed, for auditing a decision later. */
  evidence: string[];
}

export interface Rejection {
  product: MlProduct;
  reason: string;
}

/**
 * All the text a product's identity could hide in. `MODEL` and `LINE` are
 * separate attributes and often carry the generation when the name does not.
 */
function haystack(product: MlProduct): string {
  return normalise(
    [product.name, attr(product, "MODEL"), attr(product, "LINE")]
      .filter(Boolean)
      .join(" "),
  );
}

export function evaluate(
  racket: Racket,
  product: MlProduct,
  siblings: Set<string> = new Set(),
): Match | Rejection {
  const text = haystack(product);
  const reject = (reason: string): Rejection => ({ product, reason });

  if (EXCLUDE_NAME.test(product.name)) return reject("junior/other sport");

  const words = new Set(text.split(" "));
  for (const token of siblings) {
    if (words.has(token)) return reject(`sibling variant "${token}"`);
  }

  const brand = normalise(racket.brand);
  const productBrand = normalise(attr(product, "BRAND") ?? "");
  if (productBrand ? productBrand !== brand : !text.includes(brand)) {
    return reject(`brand mismatch (${productBrand || "absent"})`);
  }

  const evidence: string[] = [];

  // Head size comes in either convention: 100 in² or the European 645 cm².
  // No racquet is 300 of anything, so the magnitude disambiguates safely.
  let head = firstNumber(attr(product, "HEAD_SIZE"));
  if (head !== null && head > 300) head = Math.round(head / 6.4516);
  if (head !== null) {
    if (Math.abs(head - racket.headSizeIn2) > 1) {
      return reject(`head ${head} vs ${racket.headSizeIn2}`);
    }
    evidence.push(`head ${head}`);
  }

  const pat = pattern(attr(product, "STRING_PATTERN"));
  if (pat !== null) {
    if (pat !== pattern(racket.stringPattern)) {
      return reject(`pattern ${pat} vs ${racket.stringPattern}`);
    }
    evidence.push(`pattern ${pat}`);
  }

  const weight = grams(attr(product, "WEIGHT"));
  if (weight !== null) {
    const low = racket.weightGrams - WEIGHT_TOLERANCE_BELOW;
    const high = racket.weightGrams + WEIGHT_TOLERANCE_ABOVE;
    if (weight < low || weight > high) {
      return reject(`weight ${weight} outside ${low}-${high}`);
    }
    evidence.push(`weight ${weight}`);
  }

  // The family name has to be there in full. Specs alone are not identity: two
  // different frames can share a head size and a string pattern.
  const family = modelFamily(racket);
  const missing = family.split(" ").filter((token) => !text.includes(token));
  if (missing.length > 0) {
    // Sellers also run the words together — "Superlite" for "Super Lite". Only
    // accepted as one unbroken run, so "Pure Aero Super Lite" still does not
    // match a plain "Pure Aero Lite".
    const glued = text.replace(/ /g, "").includes(family.replace(/ /g, ""));
    if (!glued) return reject(`model tokens missing: ${missing.join(",")}`);
  }

  const wanted = years(racket.model);
  const found = years(text);
  let matchKind: MatchKind = "unknown_generation";
  let variantNote: string | null = null;

  if (wanted.length > 0 && found.includes(wanted[0])) {
    matchKind = "exact";
    evidence.push(`year ${wanted[0]}`);
  } else if (wanted.length > 0 && found.length > 0) {
    matchKind = "variant_year";
    variantNote = String(found[0]);
  }
  // Otherwise one side or the other states no year, so the generations cannot be
  // compared. That is `unknown_generation`, not `variant_year`: calling it a
  // variant would assert a discrepancy nothing established, the same mistake as
  // treating an absent attribute as agreement. The UI can then say "generation
  // not confirmed" instead of inventing "2025".

  const score =
    evidence.length * 10 +
    (product.quality_type === "COMPLETE" ? 5 : 0) +
    (product.attributes?.length ?? 0);

  return { product, matchKind, variantNote, score, evidence };
}

export function isMatch(result: Match | Rejection): result is Match {
  return "matchKind" in result;
}

/**
 * The unstrung weight this listing states, when it is credible.
 *
 * Brazilian listings quote unstrung and Tennis Warehouse quotes strung, so the
 * Mercado Livre figure normally sits 15-20 g below the catalog's. One that comes
 * in at or near the strung figure is quoting the other convention — some say
 * "Encordoada" outright — and recording it as unstrung would reintroduce exactly
 * the overstatement this field exists to remove, while marking it exact.
 * Rejecting is the better failure: an estimate that says so beats a wrong number
 * that does not.
 */
export function unstrungWeight(racket: Racket, product: MlProduct): number | null {
  const stated = grams(attr(product, "WEIGHT"));
  if (stated === null) return null;
  return stated <= racket.weightGrams - 8 ? stated : null;
}

/** Spec agreements, as distinct from the year — see `confidence`. */
export function specEvidence(match: Match): number {
  return match.evidence.filter((e) => !e.startsWith("year ")).length;
}

/**
 * How much to trust this match, stored on the offer so a bad row can be found
 * later without re-running the matcher.
 *
 * Specs and generation are scored separately because they answer different
 * questions: the specs say it is the same frame, the year says it is the same
 * generation. Being the wrong frame is the failure that matters, so a match
 * confirmed on three specs but silent on the year outranks one that agrees on
 * the year and nothing else.
 */
export function confidence(match: Match): number {
  const base = 0.4 + 0.15 * Math.min(specEvidence(match), 3);
  const generation =
    match.matchKind === "exact" ? 0.15 : match.matchKind === "variant_year" ? 0.05 : 0;
  return Math.round((base + generation) * 100) / 100;
}

/**
 * A confirmed model year beats everything. Ranking these together as one number
 * let a spec-rich 2023 listing outrank the actual 2026 frame, because agreeing
 * on head size is worth less than being the right generation — no amount of
 * matching attributes makes a different year the same racquet.
 */
export function tier(match: Match): number {
  if (match.matchKind === "exact") return 2;
  // A known other year beats an unstated one: it is at least the right frame in
  // a generation we can name and label.
  return match.matchKind === "variant_year" ? 1 : 0;
}

/** Best first. */
export function rank(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => tier(b) - tier(a) || b.score - a.score);
}

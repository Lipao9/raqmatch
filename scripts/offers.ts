/**
 * Maps catalog racquets to Mercado Livre offers.
 *
 * Usage:
 *   npm run offers                     # dry run over the whole catalog
 *   npm run offers -- --limit 20       # dry run over the first 20 racquets
 *   npm run offers -- --brand Babolat  # dry run over one brand
 *   npm run offers -- --verbose        # also print why candidates were rejected
 *   npm run offers -- --write          # persist the run to data/offers.json
 *
 * Dry run by default, on purpose: a wrong match puts a wrong racquet behind a
 * buy button, which is the one failure this whole design exists to avoid. So
 * `--write` is a deliberate act taken after reading a run, and it still refuses
 * any match that rests on fewer than two agreeing specs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadCatalog, type Racket } from "../src/lib/catalog";
import { offersCatalogSchema, type Offer } from "../src/lib/offers";
import {
  confidence,
  evaluate,
  isMatch,
  rank,
  searchTerms,
  siblingTokens,
  specEvidence,
  tier,
  unstrungWeight,
  type Match,
} from "./lib/match";
import { productItems, productUrl, searchProducts } from "./lib/ml";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const LIMIT = Number(flag("limit") ?? Infinity);
const BRAND = flag("brand")?.toLowerCase();
const VERBOSE = args.includes("--verbose");
const WRITE = args.includes("--write");

const OFFERS_PATH = new URL("../data/offers.json", import.meta.url);

/**
 * Agreeing specs required before a match may be written.
 *
 * The family name alone is not identity — Mercado Livre's own search answers
 * "pure aero" with a Pure Aero *Lite* — and one agreeing spec can be a
 * coincidence between two frames in the same line. Two independent specs
 * agreeing, on top of the full family name and the sibling exclusions, is the
 * point where being the wrong frame stops being plausible.
 */
const MIN_SPEC_EVIDENCE = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Outcome {
  racket: Racket;
  best: Match | null;
  /** Survivors beyond the best one — the cases an LLM would have to adjudicate. */
  contenders: number;
  searched: number;
  /** Set when the match was surrendered to a racquet with a stronger claim. */
  lostTo: string | null;
}

/**
 * Two queries, unioned. The base query drops the model year so a Brazilian
 * marketplace stocking the previous generation still turns something up — but
 * that same omission buries the current-year product when the family has many
 * generations listed, which is how a real 2026 frame went missing behind a 2023
 * one. Asking for the year explicitly surfaces it; the union keeps both.
 */
async function candidates(racket: Racket) {
  const base = searchTerms(racket);
  const year = racket.model.match(/\b(?:19|20)\d{2}\b/)?.[0];
  const queries = year ? [base, `${base} ${year}`] : [base];

  const byId = new Map<string, Awaited<ReturnType<typeof searchProducts>>[number]>();
  for (const query of queries) {
    for (const product of await searchProducts(query)) byId.set(product.id, product);
  }
  return [...byId.values()];
}

async function inspect(racket: Racket, catalog: Racket[]): Promise<Outcome> {
  const siblings = siblingTokens(racket, catalog);
  const products = await candidates(racket);
  const results = products.map((p) => evaluate(racket, p, siblings));
  const matches = rank(results.filter(isMatch));

  if (VERBOSE) {
    console.log(`  ${racket.brand} ${racket.model}`);
    if (siblings.size) console.log(`      excluding: ${[...siblings].join(", ")}`);
    for (const r of results) {
      if (!isMatch(r)) {
        console.log(`      reject  ${r.product.name.slice(0, 50)} — ${r.reason}`);
      }
    }
  }

  return {
    racket,
    best: matches[0] ?? null,
    contenders: Math.max(0, matches.length - 1),
    searched: products.length,
    lostTo: null,
  };
}

/**
 * One catalog product cannot be the offer for two different racquets — if it is,
 * at least one of them is wrong. The stronger claim keeps it; the weaker one is
 * left with no match, which is the honest outcome rather than a guess.
 */
function resolveCollisions(outcomes: Outcome[]): void {
  const claims = new Map<string, Outcome[]>();
  for (const outcome of outcomes) {
    if (!outcome.best) continue;
    const id = outcome.best.product.id;
    claims.set(id, [...(claims.get(id) ?? []), outcome]);
  }

  for (const [, contenders] of claims) {
    if (contenders.length < 2) continue;
    const stronger = (a: Outcome, b: Outcome): Outcome => {
      const byTier = tier(b.best!) - tier(a.best!);
      if (byTier !== 0) return byTier > 0 ? b : a;
      return b.best!.score > a.best!.score ? b : a;
    };
    const winner = contenders.reduce(stronger);
    for (const loser of contenders) {
      if (loser === winner) continue;
      loser.lostTo = `${winner.racket.brand} ${winner.racket.model}`;
      loser.best = null;
    }
  }
}

function label(match: Match): string {
  if (match.matchKind === "exact") return "exact";
  return match.variantNote ? `variant ${match.variantNote}` : "gen unknown";
}

/**
 * Lowest new-condition price, and proof the product is actually buyable.
 *
 * `null` means no live listing. Mercado Livre keeps a catalog product around
 * after the last seller stops carrying it, so without this check a match would
 * become a buy button landing on a page with nothing for sale.
 *
 * The lowest is taken because the items list is not ordered by price, and the
 * base `price` rather than the headline figure, which can be conditioned on
 * paying with Mercado Livre credit — not the price most visitors would pay. A
 * product sold only used keeps its link but reports no price: the frame is
 * right, the number would not describe what a new one costs.
 */
async function priceOf(productId: string): Promise<number | null | undefined> {
  const items = await productItems(productId);
  if (!items || items.length === 0) return undefined; // not buyable

  const prices = items
    .filter((item) => item.condition === "new")
    .map((item) => item.price)
    .filter((price): price is number => typeof price === "number" && price > 0);

  return prices.length > 0 ? Math.min(...prices) : null;
}

/**
 * Turns a match into a row, or explains why it did not become one. Both the
 * spec floor and the availability check reject here rather than earlier so the
 * dry-run listing still shows what the matcher found — the reason a racquet has
 * no offer is worth reading.
 */
async function toOffer(
  outcome: Outcome,
  checkedAt: string,
): Promise<Offer | { skipped: string }> {
  const match = outcome.best!;
  const specs = specEvidence(match);
  if (specs < MIN_SPEC_EVIDENCE) {
    return { skipped: `only ${specs} agreeing spec(s)` };
  }

  const priceBRL = await priceOf(match.product.id);
  if (priceBRL === undefined) return { skipped: "no live listing" };

  return {
    racketId: outcome.racket.id,
    store: "mercadolivre",
    listingUrl: productUrl(match.product.id),
    // Minted by hand in the affiliate panel, or composed once `matt_word`
    // composition is confirmed by the Métricas report. Neither has happened.
    affiliateUrl: null,
    title: match.product.name,
    priceBRL,
    unstrungWeightGrams: unstrungWeight(outcome.racket, match.product),
    matchKind: match.matchKind,
    variantNote: match.variantNote,
    confidence: confidence(match),
    source: "matcher",
    checkedAt,
  };
}

/**
 * Replaces this run's matcher rows and leaves everything else alone.
 *
 * Hand-curated rows are ground truth and double as the matcher's eval set, so a
 * run yields to them rather than overwriting. Matcher rows for racquets outside
 * this run — a `--brand` pass, say — are kept too, so a narrow run cannot
 * silently delete the results of a wide one.
 */
async function persist(outcomes: Outcome[]): Promise<void> {
  const checkedAt = new Date().toISOString();
  const existing = offersCatalogSchema.parse(
    JSON.parse(readFileSync(OFFERS_PATH, "utf8")),
  );

  const inRun = new Set(outcomes.map((o) => o.racket.id));
  const manual = new Set(
    existing.offers
      .filter((o) => o.source === "manual")
      .map((o) => `${o.racketId}::${o.store}`),
  );

  const minted: Offer[] = [];
  const skipped: string[] = [];

  for (const outcome of outcomes) {
    if (!outcome.best) continue;
    if (manual.has(`${outcome.racket.id}::mercadolivre`)) {
      skipped.push(`  ${outcome.racket.id} — kept the hand-curated row`);
      continue;
    }
    const result = await toOffer(outcome, checkedAt);
    if ("skipped" in result) {
      skipped.push(`  ${outcome.racket.id} — ${result.skipped}`);
      continue;
    }
    minted.push(result);
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  const kept = existing.offers.filter(
    (o) =>
      o.source === "manual" ||
      o.store !== "mercadolivre" ||
      !inRun.has(o.racketId),
  );

  const offers = [...kept, ...minted].sort(
    (a, b) => a.racketId.localeCompare(b.racketId) || a.store.localeCompare(b.store),
  );

  const next = offersCatalogSchema.parse({
    version: existing.version,
    updatedAt: checkedAt,
    offers,
  });
  writeFileSync(OFFERS_PATH, `${JSON.stringify(next, null, 2)}\n`);

  if (skipped.length > 0) {
    console.log(`\nMatched but not written (${skipped.length}):`);
    for (const line of skipped) console.log(line);
  }
  const withWeight = minted.filter((o) => o.unstrungWeightGrams !== null).length;
  const withPrice = minted.filter((o) => o.priceBRL !== null).length;
  console.log(`
  wrote                    ${minted.length} offer(s)
  carrying a price         ${withPrice}
  carrying unstrung weight ${withWeight}
  kept from earlier runs   ${kept.length}
  → data/offers.json`);
}

async function main() {
  const catalog = loadCatalog();
  const subject = catalog
    .filter((r) => !BRAND || r.brand.toLowerCase() === BRAND)
    .slice(0, LIMIT);

  console.log(`Inspecting ${subject.length} racquets against the Mercado Livre catalog.\n`);

  const outcomes: Outcome[] = [];
  for (const racket of subject) {
    outcomes.push(await inspect(racket, catalog));
    if (!VERBOSE) process.stdout.write(".");
    await sleep(250); // polite, and well inside the rate limit
  }
  if (!VERBOSE) console.log("\n");

  resolveCollisions(outcomes);

  for (const outcome of outcomes) {
    const name = `${outcome.racket.brand} ${outcome.racket.model}`.padEnd(34).slice(0, 34);
    if (outcome.best) {
      const { product, evidence } = outcome.best;
      console.log(`  ${name} ${label(outcome.best).padEnd(14)} ${product.id}  [${evidence.join(", ")}]`);
      console.log(`  ${" ".repeat(34)} ${product.name.slice(0, 70)}`);
      if (outcome.contenders > 0) {
        console.log(`  ${" ".repeat(34)} +${outcome.contenders} other survivor(s) — needs adjudication`);
      }
    } else if (outcome.lostTo) {
      console.log(`  ${name} —              product claimed by ${outcome.lostTo}`);
    } else {
      console.log(`  ${name} —              no match (${outcome.searched} candidates seen)`);
    }
  }

  const count = (fn: (o: Outcome) => boolean) => outcomes.filter(fn).length;
  console.log(`
─────────────────────────────────────────────
  exact (year confirmed)   ${count((o) => o.best?.matchKind === "exact")}
  variant (other year)     ${count((o) => o.best?.matchKind === "variant_year")}
  matched, gen unknown     ${count((o) => o.best?.matchKind === "unknown_generation")}
  lost a collision         ${count((o) => Boolean(o.lostTo))}
  no match                 ${count((o) => !o.best && !o.lostTo)}
  ─────
  needing adjudication     ${count((o) => Boolean(o.best) && o.contenders > 0)}
  total                    ${outcomes.length}`);

  if (!WRITE) {
    console.log(`\nDry run. Re-run with --write to persist to data/offers.json.`);
    return;
  }

  console.log(`\nChecking availability and price, then writing.`);
  await persist(outcomes);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

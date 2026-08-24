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

/**
 * How far down the ranked candidates to keep asking "but is it in stock?".
 *
 * Bounded because each probe is a request: unbounded, a racquet Brazil does not
 * carry would walk all twenty candidates before admitting it. Five is well past
 * where a real listing turns up — the frames that motivated this found one at
 * rank two or three.
 */
const MAX_AVAILABILITY_PROBES = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Outcome {
  racket: Racket;
  /** Every survivor of the deterministic gates, best first. */
  matches: Match[];
  /** The one actually chosen: highest-ranked candidate that is free and stocked. */
  best: Match | null;
  /** Price of `best`, learned while proving it was buyable. */
  priceBRL: number | null;
  searched: number;
  /** Why nothing was chosen, when there were candidates to choose from. */
  reason: string | null;
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
    matches,
    best: null,
    priceBRL: null,
    searched: products.length,
    reason: null,
  };
}

/**
 * Picks each racquet's offer: the best-ranked candidate that is both unclaimed
 * and actually stocked.
 *
 * Availability belongs in the choice, not in a veto applied after it. Mercado
 * Livre carries several catalog entries for one frame — grip sizes, colours,
 * sellers' own submissions — and the entry with the richest attributes, which is
 * exactly the one ranking highest, is routinely the one nobody stocks. Vetoing
 * afterwards discarded the whole racquet: the Wilson Blade 98 16x19 v10 matched a
 * dead entry and lost its link while a sibling entry with eight live listings sat
 * one rank below it.
 *
 * Collisions resolve in the same walk. One catalog product cannot be the offer
 * for two racquets, so racquets are served strongest-claim-first and a product
 * already taken is simply skipped — the loser drops to its next candidate rather
 * than being left with nothing, which is what a separate collision pass did.
 */
async function claimOffers(outcomes: Outcome[]): Promise<void> {
  const claimed = new Map<string, Racket>();

  const strength = (o: Outcome) => o.matches[0];
  const order = [...outcomes].sort((a, b) => {
    const [x, y] = [strength(a), strength(b)];
    if (!x || !y) return Number(Boolean(y)) - Number(Boolean(x));
    return tier(y) - tier(x) || y.score - x.score;
  });

  for (const outcome of order) {
    if (outcome.matches.length === 0) continue;

    let probed = 0;
    let eligible = 0;
    let takenBy: Racket | null = null;

    for (const match of outcome.matches) {
      if (specEvidence(match) < MIN_SPEC_EVIDENCE) continue;
      eligible++;

      const owner = claimed.get(match.product.id);
      if (owner) {
        takenBy ??= owner;
        continue;
      }
      if (probed >= MAX_AVAILABILITY_PROBES) break;

      probed++;
      const priceBRL = await priceOf(match.product.id);
      await sleep(200); // polite, and well inside the rate limit
      if (priceBRL === undefined) continue; // nothing for sale behind it

      outcome.best = match;
      outcome.priceBRL = priceBRL;
      claimed.set(match.product.id, outcome.racket);
      break;
    }

    if (outcome.best) continue;
    outcome.reason =
      eligible === 0
        ? `no candidate cleared ${MIN_SPEC_EVIDENCE} agreeing specs`
        : probed === 0 && takenBy
          ? `every candidate claimed by ${takenBy.brand} ${takenBy.model}`
          : `no live listing among ${probed} probed candidate(s)`;
    if (!VERBOSE) process.stdout.write("·");
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
 * Row for a racquet whose offer `claimOffers` already chose and priced.
 *
 * `previous` is the row this one replaces, and exists for one reason: an
 * affiliate link is minted by hand in the panel — Mercado Livre publishes no API
 * for it — so it is the most expensive field in the file and must survive a
 * refresh. It is carried forward only when the listing is unchanged. A different
 * `listingUrl` means the matcher moved to another product, and a minted link
 * points at whatever product it was minted for: keeping it would put the wrong
 * racquet behind the buy button, silently, a week after anyone looked.
 */
function toOffer(
  outcome: Outcome,
  checkedAt: string,
  previous?: Offer,
): Offer {
  const match = outcome.best!;
  const listingUrl = productUrl(match.product.id);
  return {
    racketId: outcome.racket.id,
    store: "mercadolivre",
    listingUrl,
    affiliateUrl:
      previous?.listingUrl === listingUrl ? previous.affiliateUrl : null,
    title: match.product.name,
    priceBRL: outcome.priceBRL,
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
function persist(outcomes: Outcome[]): void {
  const checkedAt = new Date().toISOString();
  const existing = offersCatalogSchema.parse(
    JSON.parse(readFileSync(OFFERS_PATH, "utf8")),
  );

  const inRun = new Set(outcomes.map((o) => o.racket.id));
  const before = new Map(
    existing.offers
      .filter((o) => o.store === "mercadolivre")
      .map((o) => [o.racketId, o]),
  );
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
    minted.push(toOffer(outcome, checkedAt, before.get(outcome.racket.id)));
  }

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
  const affiliate = minted.filter((o) => o.affiliateUrl !== null).length;

  // A minted link that did not survive is hand work destroyed, so it is named
  // rather than counted: the racquet has to be re-minted in the panel, and
  // nothing else in this output would tell anyone that.
  const lostAffiliate = minted.filter(
    (o) => o.affiliateUrl === null && before.get(o.racketId)?.affiliateUrl,
  );
  if (lostAffiliate.length > 0) {
    console.log(`\nAffiliate link dropped — the listing moved, re-mint these (${lostAffiliate.length}):`);
    for (const o of lostAffiliate) {
      console.log(`  ${o.racketId}\n    was ${before.get(o.racketId)!.listingUrl}\n    now ${o.listingUrl}`);
    }
  }

  console.log(`
  wrote                    ${minted.length} offer(s)
  carrying a price         ${withPrice}
  carrying unstrung weight ${withWeight}
  carrying affiliate link  ${affiliate}
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

  console.log("Checking which candidates are actually stocked.");
  await claimOffers(outcomes);
  if (!VERBOSE) console.log("\n");

  for (const outcome of outcomes) {
    const name = `${outcome.racket.brand} ${outcome.racket.model}`.padEnd(34).slice(0, 34);
    if (outcome.best) {
      const { product, evidence } = outcome.best;
      const rank = outcome.matches.indexOf(outcome.best);
      console.log(`  ${name} ${label(outcome.best).padEnd(14)} ${product.id}  [${evidence.join(", ")}]`);
      console.log(`  ${" ".repeat(34)} ${product.name.slice(0, 70)}`);
      // Worth surfacing: a racquet served from further down the ranking means
      // the better-described entries above it were dead or already taken.
      if (rank > 0) {
        console.log(`  ${" ".repeat(34)} rank ${rank + 1} of ${outcome.matches.length} — the ones above had no live listing`);
      }
    } else if (outcome.reason) {
      console.log(`  ${name} —              ${outcome.reason}`);
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
  ─────
  served below rank 1      ${count((o) => Boolean(o.best) && o.matches.indexOf(o.best!) > 0)}
  matched, none stocked    ${count((o) => !o.best && Boolean(o.reason))}
  no match at all          ${count((o) => !o.best && !o.reason)}
  total                    ${outcomes.length}`);

  if (!WRITE) {
    console.log(`\nDry run. Re-run with --write to persist to data/offers.json.`);
    return;
  }

  persist(outcomes);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

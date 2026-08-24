/**
 * Maps catalog racquets to Mercado Livre offers.
 *
 * Usage:
 *   npm run offers                     # dry run over the whole catalog
 *   npm run offers -- --limit 20       # dry run over the first 20 racquets
 *   npm run offers -- --brand Babolat  # dry run over one brand
 *   npm run offers -- --verbose        # also print why candidates were rejected
 *
 * Dry run only, on purpose: nothing is written to `data/offers.json` until the
 * precision of the deterministic gates has been read off a real run. Writing
 * unvetted matches would put a wrong racquet behind a buy button, which is the
 * one failure this whole design exists to avoid.
 */
import { loadCatalog, type Racket } from "../src/lib/catalog";
import {
  evaluate,
  isMatch,
  rank,
  searchTerms,
  siblingTokens,
  tier,
  type Match,
} from "./lib/match";
import { searchProducts } from "./lib/ml";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const LIMIT = Number(flag("limit") ?? Infinity);
const BRAND = flag("brand")?.toLowerCase();
const VERBOSE = args.includes("--verbose");

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
  return match.variantNote ? `variant ${match.variantNote}` : "year unknown";
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
  variant (other year)     ${count((o) => Boolean(o.best?.variantNote))}
  matched, year unknown    ${count((o) => Boolean(o.best) && o.best!.matchKind !== "exact" && !o.best!.variantNote)}
  lost a collision         ${count((o) => Boolean(o.lostTo))}
  no match                 ${count((o) => !o.best && !o.lostTo)}
  ─────
  needing adjudication     ${count((o) => Boolean(o.best) && o.contenders > 0)}
  total                    ${outcomes.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

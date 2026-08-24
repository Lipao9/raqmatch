/**
 * Integrity check across the two data files, run before a refresh opens a PR.
 *
 * Each file is already schema-validated where it is written, so what is left is
 * the thing neither writer can see on its own: whether the two still agree.
 *
 * A scrape that renames or drops a racquet leaves offers pointing at an id that
 * no longer exists. Nothing errors — the racquet just quietly loses its
 * Brazilian link and its unstrung weight, and the buy button reverts to a US
 * store. That failure is invisible in a diff of 270 racquets, which is exactly
 * why it is worth a job that fails loudly.
 */
import { readFileSync } from "node:fs";
import { loadCatalog } from "../src/lib/catalog";
import { offersCatalogSchema } from "../src/lib/offers";

const OFFERS_PATH = new URL("../data/offers.json", import.meta.url);

function main() {
  const catalog = loadCatalog();
  const offers = offersCatalogSchema.parse(
    JSON.parse(readFileSync(OFFERS_PATH, "utf8")),
  ).offers;

  const ids = new Set(catalog.map((racket) => racket.id));
  const orphans = offers.filter((offer) => !ids.has(offer.racketId));

  console.log(`catalog  ${catalog.length} racquets`);
  console.log(`offers   ${offers.length} rows`);

  if (orphans.length > 0) {
    console.error(`\n${orphans.length} offer(s) point at a racquet that no longer exists:`);
    for (const orphan of orphans) {
      console.error(`  ${orphan.racketId} (${orphan.store}) — ${orphan.title}`);
    }
    console.error(
      `\nRe-run \`npm run offers -- --write\` so the offers follow the catalog.`,
    );
    process.exit(1);
  }

  const priced = offers.filter((offer) => offer.priceBRL !== null).length;
  const weighed = offers.filter(
    (offer) => offer.unstrungWeightGrams !== null,
  ).length;
  console.log(`         ${priced} priced, ${weighed} with unstrung weight`);
  console.log(`\nOK — every offer resolves to a catalog racquet.`);
}

main();

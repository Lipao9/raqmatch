/**
 * Helps hand-mint Mercado Livre affiliate links, in two halves.
 *
 *   npm run mint                       # export: URLs to paste into the panel
 *   npm run mint -- --limit 10         # only the first 10 still unminted
 *   npm run mint -- --by-clicks        # busiest racquets first, from the database
 *   npm run mint -- --apply minted.txt # ingest what the panel gave back
 *   npm run mint -- --apply minted.txt --yes
 *
 * Mercado Livre publishes no affiliate API — twelve plausible endpoints all 404
 * on an app token, and the panel is the only way to mint a link. It does accept
 * a batch, so the manual step is pasting one block rather than doing this N
 * times.
 *
 * The awkward part is coming back. A minted link is `/social/<user>?…&ref=<opaque>`:
 * the product it points at is not recoverable from the URL, so the only thing
 * tying a returned link to a racquet is its POSITION in the batch. That is a
 * dangerous thing to rest on — one dropped line shifts every row after it and
 * puts a wrong racquet behind a buy button, which is the failure this whole
 * pipeline is built to avoid.
 *
 * So the export writes a manifest and `--apply` reads the order from there
 * rather than recomputing it. Recomputing would silently produce a different
 * order if an offer changed in between, which the weekly refresh makes likely.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadCatalog } from "../src/lib/catalog";
import { offersCatalogSchema, type Offer } from "../src/lib/offers";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const LIMIT = Number(flag("limit") ?? Infinity);
const BY_CLICKS = args.includes("--by-clicks");
const APPLY = flag("apply");
const CONFIRM = args.includes("--yes");

const OFFERS_PATH = new URL("../data/offers.json", import.meta.url);
const MANIFEST_PATH = new URL("../data/mint-batch.json", import.meta.url);

interface ManifestEntry {
  racketId: string;
  name: string;
  title: string;
  listingUrl: string;
}

function readOffers(): { version: number; updatedAt: string; offers: Offer[] } {
  return offersCatalogSchema.parse(JSON.parse(readFileSync(OFFERS_PATH, "utf8")));
}

/** Busiest first, so a partial batch is the part that earns most. */
async function clickCounts(): Promise<Map<string, number>> {
  const { getDb } = await import("../src/lib/db");
  const db = getDb();
  if (!db) {
    console.log("No DATABASE_URL — falling back to catalog order.\n");
    return new Map();
  }
  const { outboundClicks } = await import("../src/lib/db/schema");
  const { sql } = await import("drizzle-orm");
  const rows = await db
    .select({ racketId: outboundClicks.racketId, n: sql<number>`count(*)::int` })
    .from(outboundClicks)
    .groupBy(outboundClicks.racketId);
  return new Map(rows.map((r) => [r.racketId, r.n]));
}

async function exportBatch(): Promise<void> {
  const { offers } = readOffers();
  const names = new Map(
    loadCatalog().map((r) => [r.id, `${r.brand} ${r.model}`]),
  );

  const pending = offers.filter(
    (o) => o.store === "mercadolivre" && o.affiliateUrl === null,
  );
  const alreadyMinted = offers.filter(
    (o) => o.store === "mercadolivre" && o.affiliateUrl !== null,
  ).length;

  if (pending.length === 0) {
    console.log(`Nothing to mint — all ${alreadyMinted} Mercado Livre offers already carry a link.`);
    return;
  }

  const clicks = BY_CLICKS ? await clickCounts() : new Map<string, number>();
  const ordered = [...pending].sort(
    (a, b) =>
      (clicks.get(b.racketId) ?? 0) - (clicks.get(a.racketId) ?? 0) ||
      a.racketId.localeCompare(b.racketId),
  );
  const batch = ordered.slice(0, LIMIT);

  const manifest: ManifestEntry[] = batch.map((o) => ({
    racketId: o.racketId,
    name: names.get(o.racketId) ?? o.racketId,
    title: o.title,
    listingUrl: o.listingUrl,
  }));
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`${batch.length} racquet(s) to mint${alreadyMinted ? `, ${alreadyMinted} already done` : ""}.\n`);
  manifest.forEach((e, i) => {
    console.log(`${String(i + 1).padStart(3)}. ${e.name}${clicks.get(e.racketId) ? `  (${clicks.get(e.racketId)} clicks)` : ""}`);
  });

  console.log(`
─── paste everything below into the panel's link generator ───

${manifest.map((e) => e.listingUrl).join("\n")}

─── end ───

Order is recorded in data/mint-batch.json. Paste the generated links into a
file, one per line, IN THE SAME ORDER, then:

  npm run mint -- --apply <file>

The panel must return exactly ${batch.length} link(s). If it returns fewer, do not
guess which one is missing — mint the batch again.`);
}

/** Anything Mercado Livre could plausibly have minted. */
function looksMinted(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return /(^|\.)(mercadolivre\.com\.br|mercadolibre\.com|meli\.la)$/.test(hostname);
  } catch {
    return false;
  }
}

function applyBatch(path: string): void {
  const manifest: ManifestEntry[] = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const links = readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (links.length !== manifest.length) {
    console.error(
      `Refusing to write: the manifest has ${manifest.length} racquet(s) but ${path} has ${links.length} link(s).\n\n` +
        `Position is the only thing tying a link to a racquet — a minted URL does not\n` +
        `say which product it points at — so a mismatched count cannot be reconciled.\n` +
        `Re-mint the batch rather than trimming either side to fit.`,
    );
    process.exit(1);
  }

  const bad = links.filter((l) => !looksMinted(l));
  if (bad.length > 0) {
    console.error(`Refusing to write: ${bad.length} line(s) are not Mercado Livre URLs:`);
    for (const l of bad.slice(0, 5)) console.error(`  ${l}`);
    process.exit(1);
  }

  // A minted link that still reads as a plain product URL is the panel handing
  // back what was pasted in — the batch was not actually generated.
  const untouched = links.filter((l) => /\/p\/MLB\d+/.test(l) && !l.includes("matt_"));
  if (untouched.length > 0) {
    console.error(
      `Refusing to write: ${untouched.length} line(s) look like the URLs that went in, not minted links.`,
    );
    process.exit(1);
  }

  console.log(`Pairing ${links.length} link(s) by position:\n`);
  manifest.forEach((e, i) => {
    console.log(`${String(i + 1).padStart(3)}. ${e.name}`);
    console.log(`     ${e.title.slice(0, 68)}`);
    console.log(`     → ${links[i].slice(0, 96)}`);
  });

  if (!CONFIRM) {
    console.log(`\nNothing written. Check the pairing above, then re-run with --yes.`);
    return;
  }

  const existing = readOffers();
  const byRacket = new Map(manifest.map((e, i) => [e.racketId, links[i]]));
  let updated = 0;

  const offers = existing.offers.map((offer) => {
    if (offer.store !== "mercadolivre") return offer;
    const link = byRacket.get(offer.racketId);
    if (!link) return offer;
    // The listing must still be the one the manifest was built from. A refresh
    // in between could have moved this racquet to another product, and the link
    // was minted for the old one.
    const entry = manifest.find((e) => e.racketId === offer.racketId)!;
    if (entry.listingUrl !== offer.listingUrl) {
      console.warn(`  skipped ${offer.racketId} — listing changed since the batch was exported`);
      return offer;
    }
    updated++;
    return { ...offer, affiliateUrl: link };
  });

  const next = offersCatalogSchema.parse({ ...existing, offers });
  writeFileSync(OFFERS_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\n  ${updated} offer(s) now carry an affiliate link → data/offers.json`);
}

async function main() {
  if (APPLY) applyBatch(APPLY);
  else await exportBatch();
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});

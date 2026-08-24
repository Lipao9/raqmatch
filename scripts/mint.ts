/**
 * Helps hand-mint Mercado Livre affiliate links, in two halves.
 *
 *   npm run mint                       # export: URLs to paste into the panel
 *   npm run mint -- --limit 10         # only the first 10 still unminted
 *   npm run mint -- --by-clicks        # busiest racquets first, from the database
 *   npm run mint -- --apply b1.txt --batch 1   # ingest one paste back
 *   npm run mint -- --apply b1.txt --batch 1 --yes
 *
 * Mercado Livre publishes no affiliate API — twelve plausible endpoints all 404
 * on an app token, and the panel is the only way to mint a link. It takes a
 * batch, capped at 30 URLs, so the manual step is a handful of pastes rather
 * than one per racquet.
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
const BATCH = flag("batch") === undefined ? null : Number(flag("batch"));
const CONFIRM = args.includes("--yes");
const VERIFY = !args.includes("--no-verify");

/** The panel's own ceiling: it refuses a paste of more than 30 URLs. */
const BATCH_SIZE = 30;

const OFFERS_PATH = new URL("../data/offers.json", import.meta.url);
const MANIFEST_PATH = new URL("../data/mint-batch.json", import.meta.url);

interface ManifestEntry {
  racketId: string;
  name: string;
  title: string;
  listingUrl: string;
  /** 1-based paste this racquet belongs to. See `BATCH_SIZE`. */
  batch: number;
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

  const manifest: ManifestEntry[] = batch.map((o, i) => ({
    racketId: o.racketId,
    name: names.get(o.racketId) ?? o.racketId,
    title: o.title,
    listingUrl: o.listingUrl,
    batch: Math.floor(i / BATCH_SIZE) + 1,
  }));
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  const batches = Math.max(...manifest.map((e) => e.batch));
  console.log(
    `${batch.length} racquet(s) to mint${alreadyMinted ? `, ${alreadyMinted} already done` : ""}` +
      ` — ${batches} paste(s) of at most ${BATCH_SIZE}.\n`,
  );

  for (let n = 1; n <= batches; n++) {
    const rows = manifest.filter((e) => e.batch === n);
    console.log(`─── batch ${n} of ${batches} — ${rows.length} link(s) ───\n`);
    rows.forEach((e, i) => {
      const clicked = clicks.get(e.racketId);
      console.log(`${String(i + 1).padStart(3)}. ${e.name}${clicked ? `  (${clicked} clicks)` : ""}`);
    });
    console.log(`\n${rows.map((e) => e.listingUrl).join("\n")}\n`);
  }

  console.log(`─── end ───

Paste each batch into the panel separately — it refuses more than ${BATCH_SIZE} URLs at
once. Save each set of generated links to its own file, one per line, in the
order they came back, then apply them one batch at a time:

${Array.from({ length: batches }, (_, i) => `  npm run mint -- --apply batch${i + 1}.txt --batch ${i + 1}`).join("\n")}

Applying per batch rather than concatenating everything: order is the only thing
tying a link to a racquet, so a mistake stays inside one paste instead of
shifting every row after it. Each command checks the count for that batch alone.

The order is recorded in data/mint-batch.json — do not re-run the export before
applying, or the batches will be renumbered under the links you already have.`);
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

/**
 * A line the panel returned in place of a link, e.g. "Este URL não é permitido
 * pelo Programa". Not every product is eligible, and the panel says so inline
 * rather than dropping the row — which is what keeps the batch aligned.
 *
 * Recognised by not being a URL at all. A line that IS a URL but points
 * somewhere else is a stray paste, not a refusal, and stays a hard error.
 */
function isRefusal(line: string): boolean {
  try {
    new URL(line);
    return false;
  } catch {
    return true;
  }
}

type Verdict = "ok" | "mismatch" | "unreachable";

/**
 * Confirms a minted link actually leads to the racquet it was paired with.
 *
 * Position is otherwise the only thing tying the two together, and the link
 * itself is opaque — `/social/<user>?…&ref=<encrypted>` names no product. But
 * the page behind it does: the featured product's id appears in the HTML, so
 * fetching it turns a positional assumption into evidence.
 *
 * Asymmetric on purpose. Finding the id is strong confirmation; not finding it
 * means this link is for some other racquet and the batch is misaligned. The
 * page also carries carousel products, so presence is not proof of *featured* —
 * but absence is proof of wrong.
 */
async function verify(listingUrl: string, minted: string): Promise<Verdict> {
  const productId = listingUrl.match(/\/p\/(MLB\d+)/)?.[1];
  if (!productId) return "unreachable";
  try {
    const res = await fetch(minted, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return "unreachable";
    return (await res.text()).includes(productId) ? "ok" : "mismatch";
  } catch {
    return "unreachable";
  }
}

async function applyBatch(path: string): Promise<void> {
  const full: ManifestEntry[] = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const batches = Math.max(...full.map((e) => e.batch));

  if (BATCH === null && batches > 1) {
    console.error(
      `Refusing to write: this export is split across ${batches} batches, so --batch is required.\n\n` +
        `The panel takes at most ${BATCH_SIZE} URLs per paste, and each paste comes back as its\n` +
        `own set of links. Applying them together would rest on the concatenation being\n` +
        `in exactly the right order, which nothing here can verify.\n\n` +
        Array.from({ length: batches }, (_, i) => `  npm run mint -- --apply <file> --batch ${i + 1}`).join("\n"),
    );
    process.exit(1);
  }
  if (BATCH !== null && !(BATCH >= 1 && BATCH <= batches)) {
    console.error(`Refusing to write: --batch ${BATCH} is outside the ${batches} batch(es) in the manifest.`);
    process.exit(1);
  }

  const manifest = BATCH === null ? full : full.filter((e) => e.batch === BATCH);
  const label = BATCH === null ? "the manifest" : `batch ${BATCH}`;

  const links = readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (links.length !== manifest.length) {
    console.error(
      `Refusing to write: ${label} has ${manifest.length} racquet(s) but ${path} has ${links.length} link(s).\n\n` +
        `Position is the only thing tying a link to a racquet — a minted URL does not\n` +
        `say which product it points at — so a mismatched count cannot be reconciled.\n` +
        `Re-mint that batch rather than trimming either side to fit.`,
    );
    process.exit(1);
  }

  const bad = links.filter((l) => !isRefusal(l) && !looksMinted(l));
  if (bad.length > 0) {
    console.error(`Refusing to write: ${bad.length} line(s) are URLs, but not Mercado Livre ones:`);
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

  const verdicts: (Verdict | "refused")[] = [];
  if (VERIFY) {
    process.stdout.write(`Verifying ${links.filter((l) => !isRefusal(l)).length} link(s) against the page they lead to`);
    for (let i = 0; i < links.length; i++) {
      if (isRefusal(links[i])) { verdicts.push("refused"); continue; }
      verdicts.push(await verify(manifest[i].listingUrl, links[i]));
      process.stdout.write(".");
    }
    console.log("\n");
  }

  console.log(`Pairing ${links.length} link(s) from ${label} by position:\n`);
  const mark = { ok: "verified", mismatch: "WRONG RACQUET", unreachable: "unverified", refused: "not eligible" };
  manifest.forEach((e, i) => {
    const v = verdicts[i];
    console.log(`${String(i + 1).padStart(3)}. ${e.name}${v ? `  [${mark[v]}]` : ""}`);
    console.log(`     ${e.title.slice(0, 68)}`);
    console.log(`     → ${isRefusal(links[i]) ? "(refused by the programme — stays a plain link)" : links[i]}`);
  });

  const mismatched = verdicts.filter((v) => v === "mismatch").length;
  if (mismatched > 0) {
    console.error(
      `\nRefusing to write: ${mismatched} link(s) lead to a page that never mentions the\n` +
        `product they were paired with. That is what a shifted batch looks like — one\n` +
        `line added or dropped moves every row after it. Re-mint rather than reordering\n` +
        `by hand.`,
    );
    process.exit(1);
  }

  const unreachable = verdicts.filter((v) => v === "unreachable").length;
  if (unreachable > 0) {
    console.log(`\n${unreachable} link(s) could not be checked — Mercado Livre blocks some IPs. Those rest on position alone.`);
  }

  if (!CONFIRM) {
    console.log(`\nNothing written. Check the pairing above, then re-run with --yes.`);
    return;
  }

  const existing = readOffers();
  const byRacket = new Map(
    manifest
      .map((e, i) => [e.racketId, links[i]] as const)
      .filter(([, link]) => !isRefusal(link)),
  );
  const refused = manifest.length - byRacket.size;
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
  console.log(
    `\n  ${updated} offer(s) now carry an affiliate link` +
      (refused ? `, ${refused} refused by the programme and left plain` : "") +
      `\n  → data/offers.json`,
  );
}

async function main() {
  if (APPLY) await applyBatch(APPLY);
  else await exportBatch();
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});

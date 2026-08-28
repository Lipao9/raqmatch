import { z } from "zod";
import offersFile from "../../data/offers.json";
import type { Racket } from "./catalog";
import { DEFAULT_STORE, getStore, type StoreKey, STORE_KEYS } from "./stores";

/**
 * Brazilian store offers for catalog racquets.
 *
 * A separate file from `data/rackets.json` on purpose: the catalog is a pure
 * scrape of Tennis Warehouse specs and gets overwritten wholesale by
 * `npm run scrape`, which would destroy hand-curated links if they lived there.
 * The two also rot at different speeds — specs are stable for a model year,
 * listings die weekly.
 *
 * `listingUrl` and `affiliateUrl` are separate because a Mercado Livre affiliate
 * link is an opaque `/social/...` redirect: it cannot be inspected to check it
 * still points at the right racquet, and it cannot be probed for a dead listing.
 * So the plain listing stays the canonical, checkable URL and the affiliate link
 * is only what the button uses.
 */

const storeKeySchema = z.enum(STORE_KEYS);

export const offerSchema = z.object({
  /** Catalog id. Not a foreign key — the catalog is a versioned JSON file. */
  racketId: z.string().min(1),
  store: storeKeySchema,
  /** Canonical, verifiable, always present. What the re-check job probes. */
  listingUrl: z.string().url(),
  /** Monetised destination. Null until one has been minted for this listing. */
  affiliateUrl: z.string().url().nullable(),
  /** The seller's title, kept so a wrong match is obvious in review. */
  title: z.string().min(1),
  priceBRL: z.number().positive().nullable(),
  /**
   * Unstrung weight as the store states it. Brazil quotes unstrung and Tennis
   * Warehouse quotes strung, and deriving one from the other is only accurate to
   * about ±5 g — enough to matter to someone choosing between a 300 and a 305.
   * So the real figure is kept whenever a store publishes it.
   */
  unstrungWeightGrams: z.number().positive().nullable(),
  /**
   * `exact` is the same frame and model year. `variant_year` is the same frame,
   * different generation — the common case in Brazil, and shown with a label
   * rather than hidden. `unknown_generation` is the same frame with no year
   * stated on one side or the other: a distinct state from `variant_year`,
   * because a listing that names no generation has not contradicted ours, and
   * labelling it a variant would invent a discrepancy. `variant_spec` is a
   * sibling in the family (Lite, Team, Tour) and must never be presented as the
   * racquet that was recommended.
   */
  matchKind: z.enum([
    "exact",
    "variant_year",
    "variant_spec",
    "unknown_generation",
  ]),
  /** Short, human-facing note for a variant, e.g. "2023". Null unless `variant_year`. */
  variantNote: z.string().nullable(),
  /** Matcher confidence. Null for hand-curated rows, which are ground truth. */
  confidence: z.number().min(0).max(1).nullable(),
  /** `manual` rows double as the matcher's eval set. */
  source: z.enum(["manual", "matcher"]),
  checkedAt: z.string(),
});

export type Offer = z.infer<typeof offerSchema>;

export const offersCatalogSchema = z.object({
  version: z.number(),
  updatedAt: z.string(),
  offers: z.array(offerSchema),
});

let cached: Map<string, Offer> | null = null;

function key(racketId: string, store: StoreKey): string {
  return `${racketId}::${store}`;
}

function index(): Map<string, Offer> {
  if (!cached) {
    const parsed = offersCatalogSchema.parse(offersFile);
    cached = new Map(
      parsed.offers.map((offer) => [key(offer.racketId, offer.store), offer]),
    );
  }
  return cached;
}

export function getOffer(racketId: string, store: StoreKey): Offer | null {
  return index().get(key(racketId, store)) ?? null;
}

/**
 * Racquets that can actually be bought at a store — the availability bar the
 * pt-BR recommendation pool is filtered on. A `variant_spec` offer does not
 * count: a Team/Lite/Tour sibling in stock is not the recommended frame being
 * purchasable (see `matchKind` above), so recommending on its strength would
 * send the player to a different racquet.
 */
export function availableRacketIds(store: StoreKey): Set<string> {
  const ids = new Set<string>();
  for (const offer of index().values()) {
    if (offer.store === store && offer.matchKind !== "variant_spec") {
      ids.add(offer.racketId);
    }
  }
  return ids;
}

/**
 * How a price is only shown while it is plausibly still true. Evaluated when the
 * page renders, which for the statically generated racquet pages is build time —
 * correct here, because `data/offers.json` itself only changes at build.
 */
const PRICE_MAX_AGE_DAYS = 7;

export function freshPriceBRL(offer: Offer, now = new Date()): number | null {
  if (offer.priceBRL === null) return null;
  const checked = new Date(offer.checkedAt);
  const ageDays = (now.getTime() - checked.getTime()) / 86_400_000;
  return ageDays <= PRICE_MAX_AGE_DAYS ? offer.priceBRL : null;
}

/**
 * How the click was monetised, recorded per click so "is a mapped deep link
 * worth the curation effort?" is answerable with data rather than opinion.
 */
export type LinkKind =
  | "affiliate_deep"
  | "plain_deep"
  | "affiliate_search"
  | "plain_search";

export interface OutboundLink {
  store: StoreKey;
  url: string;
  kind: LinkKind;
  offer: Offer | null;
}

/** Tennis Warehouse needs no mapping — the catalog already holds its URL. */
function listingUrlFor(racket: Racket, store: StoreKey): string | null {
  const offer = getOffer(racket.id, store);
  if (offer) return offer.listingUrl;
  return store === "tennis-warehouse" ? racket.productUrl : null;
}

/**
 * Best available destination for a racquet at a store, degrading in one
 * direction only: mapped and monetised, mapped and plain, a search, nothing.
 * A store is never dropped from the UI for lack of an affiliate id — an
 * unmonetised link that works beats a missing button.
 */
export function resolveStore(
  racket: Racket,
  storeKey: StoreKey,
): OutboundLink | null {
  const store = getStore(storeKey);
  const offer = getOffer(racket.id, storeKey);

  if (offer?.affiliateUrl) {
    return { store: storeKey, url: offer.affiliateUrl, kind: "affiliate_deep", offer };
  }

  const listing = listingUrlFor(racket, storeKey);
  if (listing) {
    const decorated = store.decorate(listing);
    return decorated
      ? { store: storeKey, url: decorated, kind: "affiliate_deep", offer }
      : { store: storeKey, url: listing, kind: "plain_deep", offer };
  }

  const search = store.searchUrl(racket);
  if (search) {
    const decorated = store.decorate(search);
    return decorated
      ? { store: storeKey, url: decorated, kind: "affiliate_search", offer: null }
      : { store: storeKey, url: search, kind: "plain_search", offer: null };
  }

  return null;
}

export function isMonetised(kind: LinkKind): boolean {
  return kind === "affiliate_deep" || kind === "affiliate_search";
}

/**
 * The one store this visitor is sent to.
 *
 * Brazil first, and exclusively: once a racquet has a mapped Mercado Livre
 * offer, a `pt-BR` visitor is not shown Tennis Warehouse at all. A US listing
 * priced in dollars that cannot ship here is not a useful second option — it
 * reads as the site not knowing where its reader is, and it splits the click
 * between a link that can earn and one that cannot.
 *
 * A mapped offer is the bar, not merely "Mercado Livre exists": `resolveStore`
 * will happily fall back to a Mercado Livre *search*, and a search page is not
 * worth displacing a real product page for.
 *
 * `/en` keeps Tennis Warehouse, which is the store that can actually ship to
 * that reader — the same locale split as the weight convention.
 */
export function primaryStore(racket: Racket, locale: string): StoreKey {
  const mapped = locale === "pt-BR" && getOffer(racket.id, "mercadolivre");
  return mapped ? "mercadolivre" : DEFAULT_STORE;
}

export interface Storefront {
  /** Where the buy button goes. */
  store: StoreKey;
  /** Link kind at that store, which decides the `rel` disclosure. */
  kind: LinkKind;
  /**
   * Price in BRL, present only when the chosen store prices in BRL *and* the
   * check is recent. Null means the page falls back to the catalog's USD
   * reference — a stale price shown as current is worse than no price.
   */
  priceBRL: number | null;
  /** ISO timestamp of that price check. Null exactly when `priceBRL` is. */
  checkedAt: string | null;
}

/** Store, link kind and price for a racquet, resolved together. */
export function storefrontFor(
  racket: Racket,
  locale: string,
  now = new Date(),
): Storefront | null {
  const store = primaryStore(racket, locale);
  const link = resolveStore(racket, store);
  if (!link) return null;

  const priceBRL = link.offer ? freshPriceBRL(link.offer, now) : null;
  return {
    store,
    kind: link.kind,
    priceBRL,
    checkedAt: priceBRL === null ? null : link.offer!.checkedAt,
  };
}

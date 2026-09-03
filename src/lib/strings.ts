import { z } from "zod";
import stringsFile from "../../data/strings.json";
import stringOffersFile from "../../data/string-offers.json";
import type { LinkKind } from "./offers";
import { getStore } from "./stores";

/**
 * The curated string catalog and its Brazilian offers.
 *
 * Same two-file split as racquets (`catalog.ts` / `offers.ts`) and for the same
 * reason, even though nothing scrapes strings today: the catalog describes the
 * product and rots slowly, the offers carry listings and prices and rot weekly.
 * Both are hand-curated — ~15 strings is a shelf, not an inventory, and every
 * one exists because a recommendation rule can reach it.
 */

/**
 * `soft-poly` is its own category rather than a comfort tag on `poly` because
 * the advice engine treats them differently in the one decision that matters
 * most: a sensitive arm rules out stiff poly but tolerates soft poly, and a
 * flat tag would make that a matter of scoring luck.
 */
export const STRING_CATEGORIES = [
  "poly",
  "soft-poly",
  "multi",
  "natural-gut",
] as const;

export type StringCategory = (typeof STRING_CATEGORIES)[number];

/** What a string is notably good at, beyond what its category already implies. */
export const STRING_TAGS = [
  "control",
  "spin",
  "power",
  "durability",
  "value",
] as const;

export type StringTag = (typeof STRING_TAGS)[number];

export const tennisStringSchema = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  /** Kept as a string ("1.25") — it is a label, never arithmetic. */
  gaugeMm: z.string().min(1),
  category: z.enum(STRING_CATEGORIES),
  tags: z.array(z.enum(STRING_TAGS)),
  priceTier: z.enum(["budget", "mid", "premium"]),
  /**
   * First carousel picture of the Mercado Livre catalog product — the same
   * hotlink-and-`unoptimized` arrangement the racquet images use with Tennis
   * Warehouse. The CDN rejects HEAD (405), so any checker must probe with GET.
   */
  imageUrl: z.string().url(),
});

export type TennisString = z.infer<typeof tennisStringSchema>;

export const stringsCatalogSchema = z.object({
  version: z.number(),
  updatedAt: z.string(),
  strings: z.array(tennisStringSchema).min(1),
});

/**
 * Leaner than the racquet offer schema on purpose: strings have no
 * strung/unstrung ambiguity and no model-year variants worth tracking — a set
 * of Alu Power is the same product every year. What is kept mirrors the parts
 * of `offerSchema` that earned their place: the checkable `listingUrl` separate
 * from the opaque minted `affiliateUrl`, and `checkedAt` so a stale price can
 * be hidden rather than shown.
 */
export const stringOfferSchema = z.object({
  stringId: z.string().min(1),
  store: z.literal("mercadolivre"),
  listingUrl: z.string().url(),
  affiliateUrl: z.string().url().nullable(),
  title: z.string().min(1),
  priceBRL: z.number().positive().nullable(),
  source: z.enum(["manual"]),
  checkedAt: z.string(),
});

export type StringOffer = z.infer<typeof stringOfferSchema>;

export const stringOffersCatalogSchema = z.object({
  version: z.number(),
  updatedAt: z.string(),
  offers: z.array(stringOfferSchema),
});

let cachedStrings: Map<string, TennisString> | null = null;
let cachedOffers: Map<string, StringOffer> | null = null;

function stringsIndex(): Map<string, TennisString> {
  cachedStrings ??= new Map(
    stringsCatalogSchema.parse(stringsFile).strings.map((s) => [s.id, s]),
  );
  return cachedStrings;
}

function offersIndex(): Map<string, StringOffer> {
  cachedOffers ??= new Map(
    stringOffersCatalogSchema
      .parse(stringOffersFile)
      .offers.map((o) => [o.stringId, o]),
  );
  return cachedOffers;
}

export function loadStrings(): TennisString[] {
  return [...stringsIndex().values()];
}

export function getStringById(id: string): TennisString | undefined {
  return stringsIndex().get(id);
}

export function getStringOffer(stringId: string): StringOffer | null {
  return offersIndex().get(stringId) ?? null;
}

/** Same staleness bar as racquet prices — see `freshPriceBRL` in offers.ts. */
const PRICE_MAX_AGE_DAYS = 7;

export function freshStringPriceBRL(
  offer: StringOffer,
  now = new Date(),
): number | null {
  if (offer.priceBRL === null) return null;
  const ageDays = (now.getTime() - new Date(offer.checkedAt).getTime()) / 86_400_000;
  return ageDays <= PRICE_MAX_AGE_DAYS ? offer.priceBRL : null;
}

function searchUrl(s: TennisString): string {
  const slug = `corda tenis ${s.brand} ${s.model}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/ /g, "-");
  return `https://lista.mercadolivre.com.br/${slug}`;
}

export interface StringOutboundLink {
  url: string;
  kind: LinkKind;
  offer: StringOffer | null;
}

/**
 * Same one-directional degradation as `resolveStore` for racquets: minted
 * affiliate link, decorated listing, decorated search, plain search. Mercado
 * Livre only — it is the one store strings are curated for, and unlike
 * racquets there is no Tennis Warehouse fallback because a US string shipment
 * makes no sense for a set that costs less than its own freight.
 */
export function resolveStringLink(s: TennisString): StringOutboundLink {
  const store = getStore("mercadolivre");
  const offer = getStringOffer(s.id);

  if (offer?.affiliateUrl) {
    return { url: offer.affiliateUrl, kind: "affiliate_deep", offer };
  }

  if (offer) {
    const decorated = store.decorate(offer.listingUrl);
    return decorated
      ? { url: decorated, kind: "affiliate_deep", offer }
      : { url: offer.listingUrl, kind: "plain_deep", offer };
  }

  const search = searchUrl(s);
  const decorated = store.decorate(search);
  return decorated
    ? { url: decorated, kind: "affiliate_search", offer: null }
    : { url: search, kind: "plain_search", offer: null };
}

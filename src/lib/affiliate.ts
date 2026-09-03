import { type LinkKind, isMonetised, offersCatalogSchema } from "./offers";
import {
  DEFAULT_STORE,
  getStore,
  isStoreKey,
  STORE_KEYS,
  type StoreKey,
} from "./stores";
import offersFile from "../../data/offers.json";

/**
 * Outbound link policy: what `rel` a link gets, whether the site owes a
 * disclosure, and the internal href that records the click.
 *
 * Where the destination itself comes from is `offers.ts` / `stores.ts` — this
 * module is only about how a link is presented and measured.
 */

/**
 * `sponsored` is what Google asks for on paid links; without it monetised
 * outbound links are a manual-action risk. `nofollow` covers crawlers that
 * predate `sponsored`.
 */
export const AFFILIATE_REL = "sponsored nofollow noopener noreferrer";
export const PLAIN_REL = "noopener noreferrer";

/**
 * A per-link decision, not a global one: with three stores, the Amazon link can
 * be monetised while the Mercado Livre one is still a plain listing, and
 * claiming `sponsored` on a link that pays nothing is a false disclosure in the
 * other direction.
 */
export function relForKind(kind: LinkKind): string {
  return isMonetised(kind) ? AFFILIATE_REL : PLAIN_REL;
}

/**
 * Whether ANY monetisation is configured, which is what decides if the footer
 * disclosure shows. Probing `decorate` rather than reading env names keeps the
 * two in one place: a store that gains a new tracking scheme is picked up here
 * without touching this function.
 */
export function isAffiliateEnabled(): boolean {
  const probe = "https://example.com/";
  if (STORE_KEYS.some((key) => getStore(key).decorate(probe) !== null)) {
    return true;
  }
  // Stored links carry their own tracking, so they count even with no env set.
  const parsed = offersCatalogSchema.safeParse(offersFile);
  return parsed.success
    ? parsed.data.offers.some((offer) => offer.affiliateUrl !== null)
    : false;
}

export type ClickSource = "results" | "racquet_page";

/**
 * Internal href that records the click before bouncing to the store. Every
 * outbound link goes through this so "which racquets, at which store, do people
 * actually click" is answerable; /api/ is disallowed in robots.txt, so crawlers
 * never follow it.
 *
 * `store` is optional to keep links minted before the multi-store change
 * working — the redirect defaults to Tennis Warehouse when it is absent.
 */
export function trackedUrl(
  racketId: string,
  source: ClickSource,
  store?: StoreKey,
): string {
  const params = new URLSearchParams({ src: source });
  if (store) params.set("store", store);
  return `/api/go/${encodeURIComponent(racketId)}?${params}`;
}

export function parseStoreParam(value: string | null): StoreKey {
  return value && isStoreKey(value) ? value : DEFAULT_STORE;
}

/**
 * Same contract as `trackedUrl`, for a string. A separate literal segment
 * (`/api/go/string/...`) rather than a product-kind query param on the racquet
 * route, so the racquet route's "the slug resolves against the racquet catalog"
 * invariant stays exactly as simple as it reads.
 */
export function trackedStringUrl(stringId: string, source: ClickSource): string {
  const params = new URLSearchParams({ src: source });
  return `/api/go/string/${encodeURIComponent(stringId)}?${params}`;
}

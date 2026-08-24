import type { Racket } from "./catalog";

/**
 * The stores a visitor can be sent to, and how each one is monetised.
 *
 * This replaces the single global affiliate program that `affiliate.ts` used to
 * assume. Every Brazilian marketplace deep-links and pays differently, and two
 * of the three cannot be monetised by composing a URL at all:
 *
 *   - Amazon  — `tag` is a plain query param, composable on any URL including a
 *               search page. Fully automatable.
 *   - Shopee  — links must be minted by the affiliate Open API, so a URL we
 *               build ourselves can never carry tracking. `decorate` returns
 *               null and only a stored `affiliateUrl` earns anything.
 *   - Mercado Livre — verified by experiment: the panel's only generator emits
 *               `/social/<user>` profile links, never product deep links, and
 *               attribution rides on `matt_word` (the etiqueta) + `matt_tool`
 *               (the account). Whether those params also work on a URL we
 *               compose ourselves is UNCONFIRMED — the affiliate toolbar that
 *               shows up on the page is an artefact of being logged in as an
 *               affiliate, not evidence the click was recorded. So composition
 *               is env-gated: set the two ids only once the Métricas report
 *               confirms a click, and until then every ML link degrades to the
 *               plain listing.
 *
 * Tennis Warehouse is kept in the registry because the catalog links to it, but
 * it is a spec source rather than a store for a Brazilian visitor.
 */

export const STORE_KEYS = [
  "mercadolivre",
  "amazon",
  "shopee",
  "tennis-warehouse",
] as const;

export type StoreKey = (typeof STORE_KEYS)[number];

export function isStoreKey(value: string): value is StoreKey {
  return (STORE_KEYS as readonly string[]).includes(value);
}

interface StoreDefinition {
  key: StoreKey;
  /** Shown in the UI. Not translated — these are proper nouns. */
  label: string;
  /** Whether this store actually ships to the primary market. */
  market: "br" | "us";
  /**
   * Where to send someone when no offer has been mapped yet. Returning null
   * means "no useful fallback exists", not "no store" — see `resolveStore`.
   */
  searchUrl: (racket: Racket) => string | null;
  /**
   * Add tracking to a URL we built ourselves. Null when the program mints its
   * own links and a composed URL therefore cannot be monetised.
   */
  decorate: (url: string) => string | null;
}

/**
 * Read env on every call rather than at module scope: a module constant is
 * captured when the module first loads, which for a statically generated page is
 * build time, so a value set only at runtime would be silently ignored. Same
 * reasoning as the original `affiliate.ts`.
 */
function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function withParams(
  url: string,
  params: Record<string, string | undefined>,
): string | null {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
  if (entries.length !== Object.keys(params).length) return null;

  const parsed = new URL(url);
  for (const [key, value] of entries) parsed.searchParams.set(key, value);
  return parsed.toString();
}

/**
 * Search text for a fallback link. The model year is dropped on purpose: a
 * Brazilian marketplace mostly stocks the previous generation, so "pure aero
 * 2026" often returns nothing while "pure aero" returns the shelf. Only 19xx/20xx
 * are stripped — "98", "100" and "V5" are part of the model name, not years.
 */
export function searchQuery(racket: Racket): string {
  const model = racket.model.replace(/\b(19|20)\d{2}\b/g, " ");
  return `raquete de tenis ${racket.brand} ${model}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STORES: Record<StoreKey, StoreDefinition> = {
  mercadolivre: {
    key: "mercadolivre",
    label: "Mercado Livre",
    market: "br",
    // Verified shape: `lista.mercadolivre.com.br/<query-slug>`. The other
    // plausible shape (`/<category>/<brand>`) 404s.
    searchUrl: (racket) =>
      `https://lista.mercadolivre.com.br/${searchQuery(racket).replace(/ /g, "-")}`,
    decorate: (url) =>
      withParams(url, {
        matt_word: env("MERCADOLIVRE_MATT_WORD"),
        matt_tool: env("MERCADOLIVRE_MATT_TOOL"),
      }),
  },

  amazon: {
    key: "amazon",
    label: "Amazon",
    market: "br",
    searchUrl: (racket) =>
      `https://www.amazon.com.br/s?k=${encodeURIComponent(searchQuery(racket))}`,
    decorate: (url) => withParams(url, { tag: env("AMAZON_ASSOCIATES_TAG") }),
  },

  shopee: {
    key: "shopee",
    label: "Shopee",
    market: "br",
    searchUrl: (racket) =>
      `https://shopee.com.br/search?keyword=${encodeURIComponent(searchQuery(racket))}`,
    // Shopee mints its own short links; a composed URL can never be tracked.
    decorate: () => null,
  },

  "tennis-warehouse": {
    key: "tennis-warehouse",
    label: "Tennis Warehouse",
    market: "us",
    // The catalog already carries the product URL, so a search fallback would
    // never be reached.
    searchUrl: () => null,
    decorate: (url) => {
      const template = env("AFFILIATE_URL_TEMPLATE");
      if (template) return template.replace("{url}", encodeURIComponent(url));
      const param = env("AFFILIATE_PARAM");
      if (!param) return null;
      return withParams(url, { [param]: env("AFFILIATE_ID") });
    },
  },
};

export function getStore(key: StoreKey): StoreDefinition {
  return STORES[key];
}

/** Stores that sell to the primary market, in display order. */
export const BR_STORE_KEYS = STORE_KEYS.filter(
  (key) => STORES[key].market === "br",
);

/**
 * Where a visitor goes when nothing better applies. Tennis Warehouse because it
 * is the one store the catalog carries a URL for on every racquet — but it is a
 * last resort for a Brazilian visitor, not a default in the ordinary sense. See
 * `primaryStore` in `offers.ts` for what overrides it.
 *
 * Lives here rather than in `affiliate.ts` so `offers.ts` can reach it: link
 * policy depends on which store was chosen, not the other way round.
 */
export const DEFAULT_STORE: StoreKey = "tennis-warehouse";

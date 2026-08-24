/**
 * Mercado Livre API client, for offline use by the offer matcher only.
 *
 * Nothing here runs in the deployed app: the offers it produces are committed to
 * `data/offers.json`, so production never needs a Mercado Livre credential.
 *
 * Authentication is `client_credentials`, verified to work — which means no
 * browser authorisation, no user token and no rotating refresh token to persist.
 * The classic endpoints are closed to an app token (`/sites/MLB/search` and
 * `/items/{id}` both 403), but the catalog endpoints are open, and they are the
 * better source anyway: a catalog product is one normalised entity per real
 * product carrying structured specs, rather than thousands of seller listings
 * whose titles have to be parsed.
 */

/** The one domain that is a tennis racquet. Excludes bags, backpacks, nets. */
export const RACKET_DOMAIN = "MLB-TENNIS_AND_SQUASH_RACKETS";

const API = "https://api.mercadolibre.com";

export interface MlAttribute {
  id: string;
  name?: string;
  value_name?: string | null;
}

export interface MlProduct {
  id: string;
  name: string;
  domain_id: string;
  status: string;
  quality_type?: string;
  attributes?: MlAttribute[];
}

export interface MlProductItem {
  item_id: string;
  price: number | null;
  original_price: number | null;
  currency_id: string;
  condition: string;
  official_store_id: number | null;
  seller_id: number;
}

/**
 * Cached for the process lifetime rather than per call: the token lasts 6 hours
 * and a matcher run makes hundreds of requests, so re-minting per request would
 * be pure waste. Not cached across runs — there is nothing to gain from a token
 * file when minting one costs a single request.
 */
let token: string | null = null;

async function accessToken(): Promise<string> {
  if (token) return token;

  const id = process.env.ML_CLIENT_ID?.trim();
  const secret = process.env.ML_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    throw new Error(
      "ML_CLIENT_ID and ML_CLIENT_SECRET are required. Create the application at " +
        "developers.mercadolivre.com.br with the Client Credentials flow enabled.",
    );
  }

  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    }),
  });
  if (!res.ok) {
    throw new Error(`token request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("token response carried no access_token");
  token = data.access_token;
  return token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One request, retried on the failures that are worth retrying. A 403 is not:
 * it means the endpoint is closed to app tokens, and hammering it would only
 * burn the rate limit.
 */
async function api<T>(path: string, attempt = 1): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });

  if (res.ok) return (await res.json()) as T;
  if (res.status === 404 || res.status === 403) return null;

  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(500 * 2 ** attempt);
    return api<T>(path, attempt + 1);
  }

  console.warn(`  ML ${res.status} on ${path}`);
  return null;
}

/**
 * Catalog products matching free text, already narrowed to racquets by the API.
 * `category_id` is accepted but silently ignored by this endpoint — `domain_id`
 * is what actually filters, which is why the category tree lookup is not used.
 */
export async function searchProducts(
  query: string,
  limit = 20,
): Promise<MlProduct[]> {
  const params = new URLSearchParams({
    status: "active",
    site_id: "MLB",
    domain_id: RACKET_DOMAIN,
    q: query,
    limit: String(limit),
  });
  const data = await api<{ results?: MlProduct[] }>(`/products/search?${params}`);
  return (data?.results ?? []).filter((p) => p.domain_id === RACKET_DOMAIN);
}

/**
 * Live listings behind a catalog product, which is where the price lives — and
 * doubles as the availability check: a product with nothing for sale returns an
 * error rather than an empty list, so `null` means "not buyable in Brazil".
 */
export async function productItems(
  productId: string,
): Promise<MlProductItem[] | null> {
  const data = await api<{ results?: MlProductItem[] }>(
    `/products/${productId}/items`,
  );
  return data?.results ?? null;
}

/** Reads an attribute by id, e.g. `HEAD_SIZE`, `WEIGHT`, `STRING_PATTERN`. */
export function attr(product: MlProduct, id: string): string | null {
  return product.attributes?.find((a) => a.id === id)?.value_name ?? null;
}

/**
 * Buyable URL for a catalog product. The API returns `permalink` empty for an
 * app token, but the short form resolves and Mercado Livre canonicalises it to
 * the slug URL itself — verified in a browser. Preferred over a seller listing
 * URL because it survives that seller going away.
 */
export function productUrl(productId: string): string {
  return `https://www.mercadolivre.com.br/p/${productId}`;
}

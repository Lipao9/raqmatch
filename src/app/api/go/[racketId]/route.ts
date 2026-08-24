import { after, NextResponse } from "next/server";
import { parseStoreParam } from "@/lib/affiliate";
import { recordOutboundClick } from "@/lib/analytics";
import { getRacketBySlug } from "@/lib/catalog";
import { isMonetised, resolveStore } from "@/lib/offers";

const KNOWN_SOURCES = new Set(["results", "racquet_page"]);

/**
 * Click-through redirect for outbound store links.
 *
 * Not an open redirect: the destination is derived from the catalog entry the
 * slug resolves to plus a store key from a fixed allowlist, never from a
 * user-supplied URL, so there is nothing to forge. An unknown `store` value
 * falls back to the default rather than erroring — a stale link in the wild
 * should still reach a store.
 */
export async function GET(
  req: Request,
  { params }: RouteContext<"/api/go/[racketId]">,
) {
  const { racketId } = await params;
  const racket = getRacketBySlug(racketId);
  if (!racket) {
    return NextResponse.json({ error: "unknown_racket" }, { status: 404 });
  }

  const requestUrl = new URL(req.url);
  const requestedSource = requestUrl.searchParams.get("src") ?? "";
  const source = KNOWN_SOURCES.has(requestedSource) ? requestedSource : "unknown";
  const locale = requestUrl.searchParams.get("locale");
  const store = parseStoreParam(requestUrl.searchParams.get("store"));

  const link = resolveStore(racket, store);
  if (!link) {
    return NextResponse.json({ error: "no_destination" }, { status: 404 });
  }

  // after() so the visitor is redirected immediately and the insert happens on
  // the way out — a slow database must never sit between a click and the store.
  after(async () => {
    await recordOutboundClick({
      racketId: racket.id,
      store: link.store,
      merchant: new URL(link.url).hostname.replace(/^www\./, ""),
      linkKind: link.kind,
      source,
      locale,
      affiliate: isMonetised(link.kind),
    });
  });

  // 302, not 301: the destination changes whenever an offer is mapped or an
  // affiliate program changes, and a permanent redirect would be cached by
  // browsers well past that.
  return NextResponse.redirect(link.url, 302);
}

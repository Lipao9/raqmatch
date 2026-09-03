import { after, NextResponse } from "next/server";
import { recordOutboundClick } from "@/lib/analytics";
import { isMonetised } from "@/lib/offers";
import { getStringById, resolveStringLink } from "@/lib/strings";

const KNOWN_SOURCES = new Set(["results", "racquet_page"]);

/**
 * Click-through redirect for string purchases — the sibling of
 * `/api/go/[racketId]`, resolving against the string catalog instead. Not an
 * open redirect for the same reason: the destination comes from the catalog
 * entry the id resolves to, never from the request.
 */
export async function GET(
  req: Request,
  { params }: RouteContext<"/api/go/string/[stringId]">,
) {
  const { stringId } = await params;
  const tennisString = getStringById(stringId);
  if (!tennisString) {
    return NextResponse.json({ error: "unknown_string" }, { status: 404 });
  }

  const requestUrl = new URL(req.url);
  const requestedSource = requestUrl.searchParams.get("src") ?? "";
  const source = KNOWN_SOURCES.has(requestedSource) ? requestedSource : "unknown";
  const locale = requestUrl.searchParams.get("locale");

  const link = resolveStringLink(tennisString);

  // after() so the visitor is redirected immediately — same reasoning as the
  // racquet route: a slow database must never sit between a click and the store.
  after(async () => {
    await recordOutboundClick({
      racketId: tennisString.id,
      productKind: "string",
      store: "mercadolivre",
      merchant: new URL(link.url).hostname.replace(/^www\./, ""),
      linkKind: link.kind,
      source,
      locale,
      affiliate: isMonetised(link.kind),
    });
  });

  return NextResponse.redirect(link.url, 302);
}

import { adsenseClientId } from "@/lib/ads";

/**
 * `/ads.txt` — the IAB authorised-sellers file.
 *
 * Without it AdSense reports the domain as unauthorised inventory and buyers
 * discount or skip the bids, so this is not optional once ads are live.
 *
 * A route handler rather than `public/ads.txt` because the publisher id is
 * env-driven: a static file would have to be edited and committed to change it,
 * and a wrong id here silently suppresses revenue rather than erroring. Not
 * locale-prefixed — `src/proxy.ts` skips any path containing a dot, so next-intl
 * never rewrites this to `/pt-BR/ads.txt`, which crawlers would not find.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const clientId = adsenseClientId();

  // 404 rather than an empty 200: an empty ads.txt declares "nobody may sell
  // this inventory", which is worse than having no file at all.
  if (!clientId) {
    return new Response("Not Found", { status: 404 });
  }

  // AdSense's client id is the publisher id prefixed with `ca-`; ads.txt wants
  // it bare. `f08c47fec0942fa0` is Google's TAG certification authority id, the
  // same constant for every AdSense publisher.
  const publisherId = clientId.replace(/^ca-/, "");

  return new Response(
    `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`,
    {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        // `s-maxage` so Vercel's CDN answers the crawler instead of waking this
        // function every time. The file only ever changes with a deploy, and a
        // deploy purges the CDN, so a long shared TTL costs nothing and removes
        // a cold start from the one request whose failure is invisible to us —
        // a crawl that times out is simply reported back as "no ads.txt found".
        "cache-control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}

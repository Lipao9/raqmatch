/**
 * Google AdSense inventory.
 *
 * Same posture as `affiliate.ts`: everything is env-driven, and with nothing
 * configured every helper degrades to "no ads" — no script tag, no empty
 * placeholders, no reserved space. The site works unmonetised.
 *
 * Unlike the affiliate ids, these values *must* be public: the `<ins>` element
 * and the loader `<script>` are rendered in the browser, so AdSense cannot be
 * driven from server-only env vars. That has one consequence worth remembering:
 * `NEXT_PUBLIC_*` is inlined at build time, so changing a slot id in the Vercel
 * dashboard does nothing until the next build (`vercel redeploy`) — the same
 * trap `NEXT_PUBLIC_SITE_URL` has.
 */

/**
 * Named inventory. A placement is a *position in the product*, not an AdSense
 * unit, so the mapping to slot ids stays in one place and a page never hardcodes
 * a number. Adding a placement here without setting its env var is safe: the
 * slot resolves to `undefined` and renders nothing.
 */
export type AdPlacement =
  | "home_below_hero"
  | "catalog_infeed"
  | "racquet_below_specs"
  | "results_below_picks"
  | "guide_in_article";

/**
 * Reserved height per format, in pixels.
 *
 * AdSense responsive units settle on a height only after the creative loads, so
 * without a reservation every slot shifts the page — and Core Web Vitals is a
 * ranking input on the exact pages whose whole purpose is organic traffic. These
 * are floors, not caps: the container may grow, it just never starts at zero.
 */
export const AD_MIN_HEIGHT = { banner: 100, rectangle: 280 } as const;

export type AdFormat = keyof typeof AD_MIN_HEIGHT;

/**
 * Routes that never carry ads, whatever the config says.
 *
 * This is the monetisation policy expressed as code. The quiz is a multi-step
 * form the visitor has to finish for the product to work at all; an ad inside it
 * buys a fraction of a cent and risks the whole session. Keeping the list here —
 * and having `AdSlot` consult it rather than trusting each page — means the rule
 * survives someone later dropping a slot into the quiz by hand.
 *
 * `/privacy` is here for a different reason: AdSense forbids ads on pages without
 * publisher content, and a policy page is exactly that. Being on this list means
 * the loader never even runs there — verified as load-bearing, because with the
 * real library present Google's Auto Ads injects its own `<ins>` into any page
 * that loads the script, regardless of where we placed slots. Blocking the script
 * is the only enforcement that does not depend on a dashboard setting.
 *
 * `/contact` shares that rationale: a mailto page has no publisher content.
 * `/about` and `/guides` are deliberately NOT here — they are exactly the
 * publisher content AdSense reviews for.
 *
 * `/results` is deliberately *not* ad-free, but it is the page carrying the
 * affiliate CTAs: one click on a R$1.500 racquet at Mercado Livre's 16% is worth
 * on the order of a thousand AdSense impressions in this niche. So its slot sits
 * below all three recommendations, after the outbound buttons, where it can only
 * catch attention that was already on its way out.
 */
const AD_FREE_PREFIXES = ["/quiz", "/privacy", "/contact"] as const;

/** Expects a locale-stripped pathname, i.e. what `usePathname` from `@/i18n/navigation` returns. */
export function isAdFreePath(pathname: string): boolean {
  return AD_FREE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** The `ca-pub-…` publisher id, or undefined when AdSense is not configured. */
export function adsenseClientId(): string | undefined {
  return process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID?.trim() || undefined;
}

export function adsEnabled(): boolean {
  return Boolean(adsenseClientId());
}

/**
 * Each env var is read as a literal member access, never `process.env[key]`:
 * Next inlines `NEXT_PUBLIC_*` by statically analysing the source, and a computed
 * lookup is left alone — it would silently be `undefined` in the browser.
 */
export function adSlotId(placement: AdPlacement): string | undefined {
  switch (placement) {
    case "home_below_hero":
      return process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME?.trim() || undefined;
    case "catalog_infeed":
      return process.env.NEXT_PUBLIC_ADSENSE_SLOT_CATALOG?.trim() || undefined;
    case "racquet_below_specs":
      return process.env.NEXT_PUBLIC_ADSENSE_SLOT_RACQUET?.trim() || undefined;
    case "results_below_picks":
      return process.env.NEXT_PUBLIC_ADSENSE_SLOT_RESULTS?.trim() || undefined;
    case "guide_in_article":
      return process.env.NEXT_PUBLIC_ADSENSE_SLOT_GUIDE?.trim() || undefined;
  }
}

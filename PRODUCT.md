# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Recreational and competitive tennis players in Brazil, choosing a racquet without
a coach or a shop assistant to ask. They know how they play — level, style, what
hurts, what they want to improve — but not how that maps to head size, swingweight
or RA stiffness. The job is "tell me which racquet fits my game, and why", not
"show me a catalog".

Secondary audience, in `/en`: the same player outside Brazil. English exists from
the MVP and is not an afterthought, but Brazil is the primary market and store
coverage is built for it first.

## Product Purpose

Turn a quiz about how someone plays into three specific racquets with a written
justification per pick. Success is a player leaving with a shortlist they
understand well enough to act on, and — for the operator — an affiliate click or
an ad impression that funds the site.

The project has a second, explicit purpose the owner stated: it is also a vehicle
for studying AI, architecture and Next.js. Work is chosen to serve both.

## Positioning

The recommendation is made by an LLM reading the player's own words, over a
rules-prefiltered candidate set from a real spec catalog — not a decision tree and
not a "best racquets of 2026" listicle. Two things a neighbouring product could not
truthfully copy without doing the same work:

- The free-text answers (swing, injuries, what the current racquet lacks) actually
  reach the model, so the justification references the player's situation.
- The model never sees price or commission, so the picks cannot be accused of
  following the payout.

## Operating Context

Two quiz modes: quick (~3 min, 11 multiple-choice) and detailed (~7 min, 18
questions, several free-text). Results are generated per visitor, shareable by URL,
and deliberately `noindex`.

Organic search is the growth channel, so the racquet pages — not the quiz — are the
front door for most visitors. That inverts the usual priority: catalog pages are
statically generated with metadata, JSON-LD, dynamic OG images and a sitemap, and
Core Web Vitals is treated as a revenue input rather than a nicety.

## Capabilities and Constraints

- Next.js App Router (Next 16; middleware lives at `src/proxy.ts`), TypeScript,
  Tailwind + shadcn/ui on Base UI — `Button` takes `render`, not `asChild`.
- next-intl, bilingual `pt-BR` (default) / `en`.
- Catalog is scraped from Tennis Warehouse into a versioned `data/rackets.json`.
  Tennis Warehouse is the **spec database**, not the store: it supplies RA,
  swingweight and balance, which Brazilian retailers do not publish.
- Recommendation = rules prefilter → Claude Haiku with strict tool use, static
  schema, and server-side validation of returned racquet ids.
- Postgres (Neon) via Drizzle over `postgres.js` TCP — chosen over Neon's HTTP
  driver so the same code runs against a local Postgres in test and CI. Quiz runs,
  recommendations and outbound clicks are recorded; every write is best-effort and
  degrades to a no-op without a database.
- No accounts, no auth, no payments. Rate limiting on `/api/recommend` because each
  call costs an Anthropic request.
- **Never asks about budget, and the model never sees price.**
- Monetisation is two independent, env-driven layers, both inert unless configured:
  affiliate deep links (`src/lib/affiliate.ts`) and Google AdSense
  (`src/lib/ads.ts`). Ads never render on `/quiz`; the loader is not even fetched
  there.
- Known open item: racquet pages still show `US$ {priceUSD}` to `pt-BR` visitors,
  which is misleading. Dollar prices belong on `/en` only.

## Brand Commitments

- Name: **RaqMatch**, at `raqmatch.com` (apex is canonical, no www). Wordmark sets
  "Raq" in the foreground and "Match" in the accent colour.
- Mark: a racquet head — hoop plus string bed — in `src/components/BrandLogo.tsx`.
  Rejected alternatives are recorded in that file's comment; a round hoop with a
  short 45° handle reads as a magnifying glass and must not be retried.
- Visual identity is the equipment, not a venue: graphite racquet frames,
  natural-gut cream and the optic ball's citron, with Fraunces for display and
  Geist for body. It is deliberately tied to no tournament — during each Grand
  Slam's season the site retints to that major's palette (`src/lib/slam.ts` +
  the `[data-theme]` blocks in `globals.css`) and returns to the house palette
  between seasons. Brand surfaces that leave the site (favicon, OG images)
  stay on the house palette year-round. (Replaced the original "Monte Carlo"
  terracotta identity in Sep 2026: next to the seasonal themes it read as
  Roland-Garros.)
- Voice: plain and specific, never hype. The privacy policy states its own
  practical limits rather than papering over them; product copy explains the
  trade-off in a recommendation instead of asserting a "perfect match".

## Evidence on Hand

- `data/rackets.json` — 272 racquets across 8 brands, real scraped specs.
- Live end-to-end run confirmed: `POST /api/recommend` returned 200 in ~6s with
  pt-BR justifications.
- No testimonials, no user counts, no traffic figures, no revenue, and no reviews
  exist. Future work must not fabricate any of them. The "272 racquets / 8 brands /
  3 picks" figures on the landing page are the only quantitative claims that can be
  substantiated.
- Affiliate research on hand: Mercado Livre pays 16% cash in sports; Pró Spin pays
  5% in **store credit only**, so it is a conversion partner, not a revenue source.

## Product Principles

1. **The conversion path is not for sale.** The quiz carries no ads at all, and on
   `/results` the ad sits below every affiliate CTA. One affiliate click is worth
   on the order of a thousand impressions in this niche.
2. **Recommendations must stay uncorrupted by monetisation.** Price and commission
   never enter the model's context; the affiliate layer is applied to links after
   the picks exist.
3. **Compare stores, do not elect one.** Brazilian players should see several
   options side by side, because import taxes make a US price roughly 2.1× its
   label and no single store is right for everyone.
4. **SEO before features.** The monetisation bottleneck is traffic and measurement,
   not functionality, so catalog reach and Core Web Vitals outrank new product
   surface.
5. **Every integration degrades to nothing.** Affiliate ids, ad slots and the
   database are all optional; with none configured the site still works and makes
   no false disclosures.

## Accessibility & Inclusion

No standard was formally adopted. Working floor in the code: visible focus rings
via the `ring` token, real landmark elements, `aria-hidden` on decorative SVG,
labelled icon-only links, and a consent banner that is a labelled region with
equally reachable accept and decline actions rather than a blocking overlay.

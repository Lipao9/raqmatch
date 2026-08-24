import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, ExternalLink } from "lucide-react";
import { AdSlot } from "@/components/ads/AdSlot";
import { CourtLines } from "@/components/CourtLines";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { PLAIN_REL, relForKind, trackedUrl } from "@/lib/affiliate";
import { storefrontFor } from "@/lib/offers";
import { findRelated, getRacketBySlug, loadCatalog } from "@/lib/catalog";
import { absoluteUrl } from "@/lib/site";
import { racketTraits } from "@/lib/traits";
import { weightFor, weightLabel } from "@/lib/weight";
import { alternatesFor } from "@/lib/urls";

// The parent [locale] layout generates the locale params, so this segment only
// needs to supply the slugs — Next runs it once per locale (top-down pattern).
export function generateStaticParams() {
  return loadCatalog().map((racket) => ({ slug: racket.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/racquets/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const racket = getRacketBySlug(slug);
  if (!racket) return {};

  const t = await getTranslations({ locale, namespace: "racquet" });
  const name = `${racket.brand} ${racket.model}`;
  const description = t("metaDescription", {
    name,
    headSize: racket.headSizeIn2,
    // The snippet is the first thing a Brazilian sees on Google, so it quotes
    // the convention they shop in — a strung figure here reads as a different
    // racquet before the page is even opened. The label lives in the message,
    // which is why this passes a formatted string rather than a number.
    weight: weightLabel(racket, locale),
    pattern: racket.stringPattern,
  });
  const { canonical, languages } = alternatesFor(
    `/racquets/${slug}`,
    locale as Locale,
  );

  return {
    title: name,
    description,
    alternates: { canonical, languages },
    openGraph: { title: name, description, url: canonical, type: "website" },
  };
}

export default async function RacquetPage({
  params,
}: PageProps<"/[locale]/racquets/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const racket = getRacketBySlug(slug);
  if (!racket) notFound();

  const t = await getTranslations("racquet");
  const tNav = await getTranslations("nav");
  const tStores = await getTranslations("stores");
  const format = await getFormatter();
  const name = `${racket.brand} ${racket.model}`;
  const related = findRelated(racket);
  const weight = weightFor(racket, locale);
  const traits = racketTraits(racket, weight.grams);

  // One store, chosen for this visitor — a Brazilian with a mapped Mercado Livre
  // offer is not offered Tennis Warehouse as well. See `primaryStore`.
  const storefront = storefrontFor(racket, locale);
  const storeAt = tStores(`at.${storefront?.store ?? "tennis-warehouse"}`);
  const priceBRL = storefront?.priceBRL ?? null;
  // Through the click-tracking redirect rather than straight to the store, so
  // this statically generated page still reports which racquets get clicked.
  const href = `${trackedUrl(racket.id, "racquet_page", storefront?.store)}&locale=${locale}`;
  const { canonical } = alternatesFor(`/racquets/${slug}`, locale as Locale);

  const specs: { label: string; value: string }[] = [
    { label: t("specs.brand"), value: racket.brand },
    { label: t("specs.headSize"), value: `${racket.headSizeIn2} in²` },
    // Both conventions, always, each labelled. A Brazilian visitor needs the
    // unstrung figure to recognise the frame; the strung one is what the specs
    // were scraped in and what a US reader expects, and dropping either would
    // make one audience think the page is about a different racquet.
    ...(weight.convention === "unstrung"
      ? [{ label: t("specs.weightUnstrung"), value: weightLabel(racket, locale) }]
      : []),
    { label: t("specs.weight"), value: `${racket.weightGrams} g` },
    { label: t("specs.balance"), value: racket.balance || t("unknown") },
    {
      label: t("specs.stiffness"),
      value: racket.stiffnessRA !== null ? `${racket.stiffnessRA}` : t("unknown"),
    },
    { label: t("specs.stringPattern"), value: racket.stringPattern },
    {
      label: t("specs.swingweight"),
      value: racket.swingweight !== null ? `${racket.swingweight}` : t("unknown"),
    },
    // The US reference price is dropped once a real Brazilian one is shown:
    // two prices in two currencies on one page is not more information, it is a
    // question about which one applies.
    ...(priceBRL === null
      ? [{ label: t("specs.price"), value: `US$ ${racket.priceUSD}` }]
      : []),
  ];

  // `offers` only when a checked Brazilian price is on the page. The USD figure
  // is a scrape with no refresh cadence, and advertising a stale price in
  // structured data is a rich-result mismatch risk; the BRL one is re-checked
  // weekly and hidden past seven days, so it can be asserted to Google.
  // Specs go in additionalProperty either way.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${canonical}#product`,
        name,
        sku: racket.id,
        image: racket.imageUrl,
        brand: { "@type": "Brand", name: racket.brand },
        category: "Tennis Racquet",
        url: canonical,
        additionalProperty: [
          { name: "Head size", value: `${racket.headSizeIn2} in2` },
          { name: "Strung weight", value: `${racket.weightGrams} g` },
          { name: "String pattern", value: racket.stringPattern },
          ...(racket.stiffnessRA !== null
            ? [{ name: "Stiffness (RA)", value: `${racket.stiffnessRA}` }]
            : []),
          ...(racket.swingweight !== null
            ? [{ name: "Swingweight", value: `${racket.swingweight}` }]
            : []),
          ...(racket.balance ? [{ name: "Balance", value: racket.balance }] : []),
        ].map((p) => ({ "@type": "PropertyValue", ...p })),
        // AggregateOffer, not Offer: the figure is the cheapest of several
        // active sellers, which is what the page says too. Declaring it as
        // `price` would claim a single fixed price and mismatch the "a partir
        // de" on the page — the kind of disagreement that costs a rich result.
        ...(priceBRL !== null
          ? {
              offers: {
                "@type": "AggregateOffer",
                lowPrice: priceBRL,
                priceCurrency: "BRL",
                availability: "https://schema.org/InStock",
                url: canonical,
              },
            }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: tNav("racquets"),
            item: absoluteUrl(getPathname({ href: "/racquets", locale: locale as Locale })),
          },
          { "@type": "ListItem", position: 2, name },
        ],
      },
    ],
  };

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CourtLines className="pointer-events-none absolute -left-48 top-40 h-[24rem] w-auto rotate-6 text-primary/[0.07]" />
      <SiteHeader />

      <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col gap-12 px-6 py-10">
        <nav className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <Link href="/racquets" className="transition-colors hover:text-primary">
            {tNav("racquets")}
          </Link>
        </nav>

        <header className="flex flex-col gap-8 sm:flex-row sm:items-start">
          <div className="relative mx-auto h-64 w-52 shrink-0 rounded-2xl bg-accent/40 p-3 sm:mx-0">
            <Image
              src={racket.imageUrl}
              alt={name}
              fill
              sizes="208px"
              className="object-contain p-3"
              priority
              unoptimized
            />
          </div>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {racket.brand}
              </span>
              <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                {racket.model}
              </h1>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{racket.headSizeIn2} in²</Badge>
              <Badge variant="secondary">{weightLabel(racket, locale)}</Badge>
              <Badge variant="secondary">{racket.stringPattern}</Badge>
              {racket.stiffnessRA !== null && (
                <Badge variant="secondary">RA {racket.stiffnessRA}</Badge>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-4">
                {/* "a partir de" because the figure is the cheapest of several
                    active listings, and Mercado Livre opens on whichever seller
                    it features — often a dearer one. Stating it flat invites the
                    visitor to arrive at a higher number and feel baited. */}
                <span className="flex items-baseline gap-1.5">
                  {priceBRL !== null && (
                    <span className="text-sm text-muted-foreground">
                      {tStores("priceFrom")}
                    </span>
                  )}
                  <span className="font-heading text-2xl font-semibold">
                    {priceBRL !== null
                      ? format.number(priceBRL, {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        })
                      : `US$ ${racket.priceUSD}`}
                  </span>
                </span>
                <Button
                  nativeButton={false}
                  render={
                    <a
                      href={href}
                      target="_blank"
                      rel={storefront ? relForKind(storefront.kind) : PLAIN_REL}
                    />
                  }
                >
                  {tStores("viewAt", { at: storeAt })}
                  <ExternalLink />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {storefront?.checkedAt
                  ? tStores("priceChecked", {
                      at: storeAt,
                      date: format.dateTime(new Date(storefront.checkedAt), {
                        dateStyle: "short",
                      }),
                    })
                  : tStores("priceReference", { at: storeAt })}
              </p>
            </div>
          </div>
        </header>

        {traits.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="font-heading text-2xl font-semibold">
              {t("profileTitle")}
            </h2>
            <ul className="flex flex-col gap-2.5">
              {traits.map((trait) => (
                <li
                  key={trait.key}
                  className="flex gap-3 text-sm leading-relaxed text-foreground/90"
                >
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden
                  />
                  {t(`traits.${trait.key}`, trait.values)}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-2xl font-semibold">
            {t("specsTitle")}
          </h2>
          <dl className="grid gap-x-8 sm:grid-cols-2">
            {specs.map((spec) => (
              <div
                key={spec.label}
                className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2.5"
              >
                <dt className="text-sm text-muted-foreground">{spec.label}</dt>
                <dd className="text-sm font-medium tabular-nums">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* After the spec table, which is what organic visitors came for, and
            well below the buy button in the header — the affiliate click is worth
            orders of magnitude more than the impression. */}
        <AdSlot placement="racquet_below_specs" />

        <Card className="border-primary/30 bg-accent/30">
          <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <h2 className="font-heading text-xl font-semibold">
                {t("quizTitle")}
              </h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {t("quizBody")}
              </p>
            </div>
            <Button
              nativeButton={false}
              className="shrink-0"
              render={<Link href="/quiz/quick" />}
            >
              {t("quizCta")}
              <ArrowRight />
            </Button>
          </CardContent>
        </Card>

        {related.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-2xl font-semibold">
                {t("relatedTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("relatedHint")}
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {related.map((other) => (
                <li key={other.id}>
                  <Link
                    href={`/racquets/${other.id}`}
                    className="flex h-full flex-col gap-1.5 rounded-xl border border-border/60 p-4 transition-colors hover:border-primary/50 hover:bg-accent/30"
                  >
                    <span className="font-heading font-semibold">
                      {other.brand} {other.model}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {other.headSizeIn2} in² · {weightLabel(other, locale)} ·{" "}
                      {other.stringPattern}
                      {other.stiffnessRA !== null && ` · RA ${other.stiffnessRA}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <SiteFooter />
    </main>
  );
}

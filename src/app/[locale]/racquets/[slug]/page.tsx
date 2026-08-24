import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
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
import { DEFAULT_STORE, PLAIN_REL, relForKind, trackedUrl } from "@/lib/affiliate";
import { resolveStore } from "@/lib/offers";
import { findRelated, getRacketBySlug, loadCatalog } from "@/lib/catalog";
import { absoluteUrl } from "@/lib/site";
import { racketTraits } from "@/lib/traits";
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
    weight: racket.weightGrams,
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
  const name = `${racket.brand} ${racket.model}`;
  const related = findRelated(racket);
  const traits = racketTraits(racket);
  // Through the click-tracking redirect rather than straight to the store, so
  // this statically generated page still reports which racquets get clicked.
  const href = `${trackedUrl(racket.id, "racquet_page")}&locale=${locale}`;
  const referenceLink = resolveStore(racket, DEFAULT_STORE);
  const { canonical } = alternatesFor(`/racquets/${slug}`, locale as Locale);

  const specs: { label: string; value: string }[] = [
    { label: t("specs.brand"), value: racket.brand },
    { label: t("specs.headSize"), value: `${racket.headSizeIn2} in²` },
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
    { label: t("specs.price"), value: `US$ ${racket.priceUSD}` },
  ];

  // Product without `offers`: the price is a scraped reference value with no
  // re-scrape cadence, and advertising a stale price in structured data is a
  // rich-result mismatch risk. Specs go in additionalProperty instead.
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
              <Badge variant="secondary">{racket.weightGrams} g</Badge>
              <Badge variant="secondary">{racket.stringPattern}</Badge>
              {racket.stiffnessRA !== null && (
                <Badge variant="secondary">RA {racket.stiffnessRA}</Badge>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-heading text-2xl font-semibold">
                  US$ {racket.priceUSD}
                </span>
                <Button
                  nativeButton={false}
                  render={
                    <a
                      href={href}
                      target="_blank"
                      rel={referenceLink ? relForKind(referenceLink.kind) : PLAIN_REL}
                    />
                  }
                >
                  {t("buy")}
                  <ExternalLink />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("priceNote")}</p>
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
                      {other.headSizeIn2} in² · {other.weightGrams} g ·{" "}
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

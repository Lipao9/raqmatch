import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { AdSlot } from "@/components/ads/AdSlot";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getRacketBySlug } from "@/lib/catalog";
import { getGuide, GUIDES } from "@/lib/guides";
import { absoluteUrl, siteUrl } from "@/lib/site";
import { alternatesFor } from "@/lib/urls";
import { weightLabel } from "@/lib/weight";

// The parent [locale] layout generates the locale params; this segment only
// supplies the slugs (same top-down pattern as the racquet pages).
export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

// Registry-less slugs 404 at the router instead of throwing inside the
// content import below.
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/guides/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};

  const { title, description } = guide.i18n[locale as Locale];
  const { canonical, languages } = alternatesFor(
    `/guides/${slug}`,
    locale as Locale,
  );

  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: { title, description, url: canonical, type: "article" },
  };
}

export default async function GuidePage({
  params,
}: PageProps<"/[locale]/guides/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const guide = getGuide(slug);
  if (!guide) notFound();

  // After setRequestLocale: the MDX embeds (RacquetCard) read the locale via
  // getLocale(), which only works once the request locale is pinned.
  const { default: Content } = await guide.content[locale as Locale]();

  const t = await getTranslations("guides");
  const format = await getFormatter();
  const meta = guide.i18n[locale as Locale];
  const { canonical } = alternatesFor(`/guides/${slug}`, locale as Locale);
  const cited = guide.relatedRacquetIds
    .map((id) => getRacketBySlug(id))
    .filter((racket) => racket !== undefined);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${canonical}#article`,
        headline: meta.title,
        description: meta.description,
        inLanguage: locale,
        datePublished: guide.publishedAt,
        dateModified: guide.updatedAt ?? guide.publishedAt,
        // Organization, not Person: the guides are editorial output of the
        // site's methodology (see /about), and no individual byline exists.
        author: { "@type": "Organization", name: "RaqMatch", url: siteUrl() },
        publisher: { "@type": "Organization", name: "RaqMatch" },
        mainEntityOfPage: canonical,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: t("title"),
            item: absoluteUrl(
              getPathname({ href: "/guides", locale: locale as Locale }),
            ),
          },
          { "@type": "ListItem", position: 2, name: meta.title },
        ],
      },
    ],
  };

  return (
    <main className="relative flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />

      <article className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-14">
        <nav className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <Link href="/guides" className="transition-colors hover:text-primary">
            {t("title")}
          </Link>
        </nav>

        <header className="flex flex-col gap-3">
          <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {meta.title}
          </h1>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
            {t("updated", {
              date: format.dateTime(
                new Date(guide.updatedAt ?? guide.publishedAt),
                { dateStyle: "long" },
              ),
            })}
          </p>
        </header>

        <Content />

        {/* Below the whole article: the guides exist to be publisher content,
            but the reading experience — and the internal links to racquet
            pages, which are the conversion path — still outrank the ad. */}
        <AdSlot placement="guide_in_article" />

        {cited.length > 0 && (
          <section className="flex flex-col gap-4 border-t border-border/60 pt-8">
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-2xl font-semibold">
                {t("citedTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("citedHint")}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {cited.map((racket) => (
                <li key={racket.id}>
                  <Link
                    href={`/racquets/${racket.id}`}
                    className="flex h-full flex-col gap-1.5 rounded-xl border border-border/60 p-4 transition-colors hover:border-primary/50 hover:bg-accent/30"
                  >
                    <span className="font-heading font-semibold">
                      {racket.brand} {racket.model}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {racket.headSizeIn2} in² · {weightLabel(racket, locale)} ·{" "}
                      {racket.stringPattern}
                      {racket.stiffnessRA !== null &&
                        ` · RA ${racket.stiffnessRA}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>

      <SiteFooter />
    </main>
  );
}

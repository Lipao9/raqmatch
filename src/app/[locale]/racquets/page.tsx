import type { Metadata } from "next";
import { Fragment } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { AdSlot } from "@/components/ads/AdSlot";
import { CourtLines } from "@/components/CourtLines";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { loadCatalog, racketsByBrand } from "@/lib/catalog";
import { alternatesFor } from "@/lib/urls";
import { weightLabel } from "@/lib/weight";

function counts() {
  const rackets = loadCatalog();
  return {
    count: rackets.length,
    brands: new Set(rackets.map((r) => r.brand)).size,
  };
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/racquets">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "racquets" });
  const { canonical, languages } = alternatesFor("/racquets", locale as Locale);
  const description = t("metaDescription", counts());

  return {
    title: t("metaTitle"),
    description,
    alternates: { canonical, languages },
    openGraph: { title: t("metaTitle"), description, url: canonical },
  };
}

export default async function RacquetsIndexPage({
  params,
}: PageProps<"/[locale]/racquets">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("racquets");
  const groups = racketsByBrand();

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <CourtLines className="pointer-events-none absolute -right-44 top-32 h-[24rem] w-auto -rotate-6 text-primary/[0.07]" />
      <SiteHeader />

      <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-12">
        <header className="flex flex-col gap-4">
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {t("subtitle", counts())}
          </p>
          <Button
            variant="outline"
            className="self-start"
            nativeButton={false}
            render={<Link href="/quiz/quick" />}
          >
            {t("quizCta")}
            <ArrowRight />
          </Button>
        </header>

        {groups.map(({ brand, rackets }, index) => (
          <Fragment key={brand}>
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2">
                <h2 className="font-heading text-2xl font-semibold">{brand}</h2>
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("models", { count: rackets.length })}
                </span>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {rackets.map((racket) => (
                  <li key={racket.id}>
                    <Link
                      href={`/racquets/${racket.id}`}
                      className="flex h-full flex-col gap-1 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/40"
                    >
                      <span className="font-medium">{racket.model}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
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
            {/* One in-feed unit after the first brand, not between every group:
                the page is a long list, and a slot per group would read as a
                wall of ads and trip AdSense's "more ads than content" rule. */}
            {index === 0 && <AdSlot placement="catalog_infeed" />}
          </Fragment>
        ))}
      </div>

      <SiteFooter />
    </main>
  );
}

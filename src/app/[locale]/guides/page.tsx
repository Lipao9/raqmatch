import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { CourtLines } from "@/components/CourtLines";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { guidesByCategory, guideLastModified } from "@/lib/guides";
import { alternatesFor } from "@/lib/urls";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/guides">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "guides" });
  const { canonical, languages } = alternatesFor("/guides", locale as Locale);

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical, languages },
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      url: canonical,
    },
  };
}

export default async function GuidesIndexPage({
  params,
}: PageProps<"/[locale]/guides">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("guides");
  const format = await getFormatter();
  const groups = guidesByCategory();

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
            {t("subtitle")}
          </p>
        </header>

        {groups.map(({ category, guides }) => (
          <section key={category} className="flex flex-col gap-3">
            <div className="border-b border-border/60 pb-2">
              <h2 className="font-heading text-2xl font-semibold">
                {t(`categories.${category}`)}
              </h2>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {guides.map((guide) => {
                const meta = guide.i18n[locale as Locale];
                return (
                  <li key={guide.slug}>
                    <Link
                      href={`/guides/${guide.slug}`}
                      className="flex h-full flex-col gap-2 rounded-xl border border-border/60 p-4 transition-colors hover:border-primary/50 hover:bg-accent/30"
                    >
                      <span className="font-heading font-semibold leading-snug">
                        {meta.title}
                      </span>
                      <span className="text-sm leading-relaxed text-muted-foreground">
                        {meta.description}
                      </span>
                      <span className="mt-auto pt-1 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
                        {format.dateTime(guideLastModified(guide), {
                          dateStyle: "medium",
                        })}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <SiteFooter />
    </main>
  );
}

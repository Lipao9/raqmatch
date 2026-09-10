import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { alternatesFor } from "@/lib/urls";

/**
 * About + methodology.
 *
 * Same skeleton as /privacy: section identity and order live here, the text
 * lives in messages. The methodology and editorial sections state publicly
 * what the code enforces privately — the deterministic prefilter, the model
 * never seeing price or commission, and racquet write-ups being derived from
 * catalog specs rather than invented playtests. That is the page's job: it is
 * the trust signal reviewers (human and AdSense) look for, written as plain
 * disclosure instead of marketing.
 */
const SECTIONS = [
  "what",
  "howItWorks",
  "dataSources",
  "methodology",
  "editorial",
  "independence",
] as const;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  const { canonical, languages } = alternatesFor("/about", locale as Locale);

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

export default async function AboutPage({
  params,
}: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("about");

  return (
    <main className="relative flex flex-1 flex-col">
      <SiteHeader />

      <article className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-14">
        <header className="flex flex-col gap-3">
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            {t("intro")}
          </p>
        </header>

        {SECTIONS.map((section) => (
          <section key={section} className="flex flex-col gap-3">
            <h2 className="font-heading text-2xl font-semibold">
              {t(`sections.${section}.title`)}
            </h2>
            <p className="whitespace-pre-line leading-relaxed text-foreground/85">
              {t(`sections.${section}.body`)}
            </p>
          </section>
        ))}

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl font-semibold">
            {t("sections.reach.title")}
          </h2>
          <p className="leading-relaxed text-foreground/85">
            {t("sections.reach.body")}{" "}
            <Link
              href="/contact"
              className="font-medium text-primary underline decoration-primary/40 underline-offset-2"
            >
              {t("sections.reach.link")}
            </Link>
            .
          </p>
        </section>
      </article>

      <SiteFooter />
    </main>
  );
}

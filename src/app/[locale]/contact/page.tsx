import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import type { Locale } from "@/i18n/routing";
import { contactEmail } from "@/lib/site";
import { alternatesFor } from "@/lib/urls";

/**
 * Contact. A page, not just a footer mailto: AdSense's reviewers look for a
 * reachable contact route as a site-legitimacy signal, and LGPD requests need
 * a stated destination. In AD_FREE_PREFIXES — no publisher content here.
 */
const SECTIONS = ["general", "data", "corrections"] as const;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  const { canonical, languages } = alternatesFor("/contact", locale as Locale);

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

export default async function ContactPage({
  params,
}: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("contact");
  const email = contactEmail();

  return (
    <main className="relative flex flex-1 flex-col">
      <SiteHeader />

      <article className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-14">
        <header className="flex flex-col gap-3">
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            {t("intro")}{" "}
            <a
              href={`mailto:${email}`}
              className="font-medium text-primary underline decoration-primary/40 underline-offset-2"
            >
              {email}
            </a>
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
      </article>

      <SiteFooter />
    </main>
  );
}

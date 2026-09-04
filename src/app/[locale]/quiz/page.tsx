import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Graticule } from "@/components/Graticule";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CourtLines } from "@/components/CourtLines";

// Both readings measured on one shared scale (0–8 min): the quick one lands
// around 2 minutes, the detailed one around 6 — the graticule shows the
// trade before the copy does.
const MODES = [
  { mode: "quick", pct: 25 },
  { mode: "detailed", pct: 75 },
] as const;

export default function QuizModePage({ params }: PageProps<"/[locale]/quiz">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("quiz.modes");

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <CourtLines className="pointer-events-none absolute -left-48 bottom-0 h-80 w-auto rotate-3 text-primary/8" />
      <SiteHeader />
      <section className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
        <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
          <h1 className="font-heading text-4xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="animate-in fade-in slide-in-from-bottom-4 mt-10 flex flex-col gap-4 duration-700">
          {MODES.map(({ mode, pct }) => (
            <Link
              key={mode}
              href={`/quiz/${mode}`}
              className="group block border border-border bg-card p-6 transition-colors hover:border-primary/60 hover:bg-accent/40 sm:p-8"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-heading text-2xl font-semibold">
                  {t(`${mode}.title`)}
                </h2>
                <span className="shrink-0 font-mono text-xs uppercase tracking-[0.14em] text-primary">
                  {t(`${mode}.duration`)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`${mode}.description`)}
              </p>
              <Graticule pct={pct} mode="bar" className="mt-5" />
              <div className="mt-5 flex items-end justify-between gap-6">
                <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                  {t(`${mode}.detail`)}
                </p>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {t("choose")}
                  <ArrowRight className="size-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { alternatesFor } from "@/lib/urls";
import { loadCatalog, specRanges } from "@/lib/catalog";
import { SLAM_IDS, SLAM_NAMES } from "@/lib/slam";
import { Button } from "@/components/ui/button";
import { Graticule } from "@/components/Graticule";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { TrackingCourt } from "@/components/TrackingCourt";
import { AdSlot } from "@/components/ads/AdSlot";

// Title and description come from the locale layout; this only pins the
// canonical and hreflang set for the locale root.
export async function generateMetadata({
  params,
}: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: alternatesFor("/", locale as Locale) };
}

/**
 * The proof section measures one real racquet against the whole catalog's
 * ruler — the instrument at work on true data, not a claim. Computed at
 * build time from data/rackets.json.
 */
function proofData() {
  const rackets = loadCatalog();
  const featured =
    rackets.find((r) => r.id === "babolat-pure-aero-2026") ??
    rackets.find((r) => r.stiffnessRA !== null && r.swingweight !== null) ??
    rackets[0];
  const ranges = specRanges();

  return {
    featured,
    count: rackets.length,
    gauges: [
      {
        key: "headSize" as const,
        value: featured.headSizeIn2,
        unit: "in²",
        ...ranges.headSize,
      },
      {
        key: "weight" as const,
        value: featured.weightGrams,
        unit: "g",
        ...ranges.weight,
      },
      {
        key: "stiffness" as const,
        value: featured.stiffnessRA,
        unit: "RA",
        ...ranges.stiffness,
      },
      {
        key: "swingweight" as const,
        value: featured.swingweight,
        unit: "SW",
        ...ranges.swingweight,
      },
    ].filter((g) => g.value !== null) as {
      key: "headSize" | "weight" | "stiffness" | "swingweight";
      value: number;
      unit: string;
      min: number;
      max: number;
    }[],
  };
}

/** The four season surfaces, as depictions — fixed, not theme tokens. */
const SEASON_SWATCH: Record<string, string> = {
  "australian-open": "oklch(0.5 0.115 225)",
  "roland-garros": "oklch(0.5 0.115 45)",
  wimbledon: "oklch(0.42 0.1 150)",
  "us-open": "oklch(0.44 0.115 255)",
};

export default function LandingPage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("landing");
  const proof = proofData();

  return (
    <main className="relative flex flex-1 flex-col">
      <SiteHeader />

      {/* ————— First viewport: the court of the season, being read ————— */}
      <section className="relative min-h-[calc(100svh-3.75rem)] overflow-hidden">
        <TrackingCourt className="absolute inset-0 h-full w-full" />

        {/* Top-left status readout */}
        <p className="absolute left-6 top-5 flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-foreground/80 sm:left-10 sm:top-8">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          {t("kicker")}
        </p>

        {/* Chyron panel at the bounce point */}
        <div className="absolute inset-x-0 bottom-0 p-4 sm:bottom-10 sm:left-10 sm:right-auto sm:max-w-xl sm:p-0">
          <div className="animate-in fade-in slide-in-from-bottom-4 relative border border-border bg-background/85 p-7 backdrop-blur-md duration-700 sm:p-10">
            <h1 className="font-heading text-4xl font-bold leading-[1.02] tracking-tight sm:text-6xl">
              {t.rich("title", {
                em: (chunks) => (
                  <em className="not-italic text-primary">{chunks}</em>
                ),
              })}
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("subtitle")}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                className="h-12 px-7 text-base font-semibold"
                nativeButton={false}
                render={<Link href="/quiz/quick" />}
              >
                {t("cta")}
                <ArrowRight />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-12 bg-transparent px-5 text-base text-muted-foreground"
                nativeButton={false}
                render={<Link href="/quiz/detailed" />}
              >
                {t("ctaDetailed")}
              </Button>
            </div>
            <p className="mt-4 font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
              {t("duration")}
            </p>
          </div>
        </div>
      </section>

      {/* ————— Ticker: the only claims we can substantiate ————— */}
      <dl className="grid grid-cols-3 border-y border-border">
        {(
          [
            ["272", "racquets"],
            ["8", "brands"],
            ["3", "picks"],
          ] as const
        ).map(([value, key], i) => (
          <div
            key={key}
            className={`flex flex-col gap-1 px-6 py-5 sm:flex-row sm:items-baseline sm:gap-3 ${
              i > 0 ? "border-l border-border" : ""
            }`}
          >
            <dd className="order-1 font-heading text-2xl font-bold text-primary sm:text-3xl">
              {value}
            </dd>
            <dt className="order-2 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
              {t(`stats.${key}`)}
            </dt>
          </div>
        ))}
      </dl>

      {/* ————— How it reads your game: a rally in three bounces ————— */}
      <section className="px-6 py-20 sm:px-10 sm:py-28">
        <h2 className="max-w-2xl font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          {t("how.title")}
        </h2>
        <ol className="relative mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {/* the rally line the three bounces sit on */}
          <span
            aria-hidden
            className="absolute -top-5 hidden h-px w-full bg-border sm:block"
          />
          {(["answer", "filter", "picks"] as const).map((step) => (
            <li key={step} className="relative">
              <span
                aria-hidden
                className="absolute -top-[1.55rem] hidden size-2.5 rounded-full bg-primary sm:block"
              />
              <h3 className="font-heading text-lg font-semibold">
                {t(`how.steps.${step}.title`)}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {t(`how.steps.${step}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ————— Proof: one real racquet on the catalog's ruler ————— */}
      <section className="border-t border-border bg-card/60 px-6 py-20 sm:px-10 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
          <div>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              {t("proof.title")}
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              {t("proof.subtitle")}
            </p>
            <p className="mt-6 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
              {proof.featured.brand} · {proof.featured.model}
            </p>
          </div>
          <div className="flex flex-col justify-center gap-7">
            {proof.gauges.map((g) => {
              const pct = ((g.value - g.min) / (g.max - g.min)) * 100;
              return (
                <div key={g.key}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-foreground">
                      {t(`proof.labels.${g.key}`)}
                    </span>
                    <span className="font-mono text-sm text-primary">
                      {g.value} {g.unit}
                    </span>
                  </div>
                  {/* graticule: the value never floats without a scale */}
                  <Graticule pct={pct} className="mt-2" />
                  <div className="mt-1 flex justify-between font-mono text-[0.65rem] text-muted-foreground">
                    <span>{g.min}</span>
                    <span>{g.max}</span>
                  </div>
                </div>
              );
            })}
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
              {t("proof.rangeNote", { count: proof.count })}
            </p>
          </div>
        </div>
      </section>

      {/* ————— The site lives the calendar ————— */}
      <section className="border-t border-border px-6 py-20 sm:px-10 sm:py-28">
        <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          {t("seasons.title")}
        </h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("seasons.subtitle")}
        </p>
        <ul className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {SLAM_IDS.map((slam) => (
            <li
              key={slam}
              data-season-chip={slam}
              className="border border-border bg-card p-5"
            >
              <span
                aria-hidden
                className="block h-16 w-full"
                style={{ background: SEASON_SWATCH[slam] }}
              />
              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="font-heading text-sm font-semibold">
                  {SLAM_NAMES[slam]}
                </span>
                <span
                  data-season-now
                  className="items-center gap-1 bg-primary px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-primary-foreground"
                >
                  {t("seasons.now")}
                </span>
              </div>
              <span className="mt-1 block font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
                {t(`seasons.windows.${slam}`)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <AdSlot placement="home_below_hero" format="banner" className="px-6 pb-12" />
      <SiteFooter />
    </main>
  );
}

import type { Metadata } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";
import { AdsenseLoader } from "@/components/ads/AdsenseLoader";
import { ConsentBanner } from "@/components/ads/ConsentBanner";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { SlamThemeSync } from "@/components/SlamThemeSync";
import { Toaster } from "@/components/ui/sonner";
import { slamThemeScript } from "@/lib/slam";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face of the "Leitura de Jogo" world: a broadcast-grade grotesque
// whose width axis gives the expanded chyron display and the narrow labels
// from one file.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

// Defaults every page inherits. `alternates` deliberately stays out of here:
// a canonical set on the layout would be inherited by /quiz and /results, which
// would then all declare themselves as the locale root. Pages that want a
// canonical set their own.
export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};

  const t = await getTranslations({ locale, namespace: "landing" });

  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: t("metaTitle"),
      template: "%s · RaqMatch",
    },
    description: t("metaDescription"),
    openGraph: {
      siteName: "RaqMatch",
      type: "website",
      locale,
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    // suppressHydrationWarning: the head script below stamps data-theme on
    // <html> before React hydrates; React must accept the DOM, not "fix" it.
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} h-full antialiased`}
    >
      <head>
        {/* Grand Slam season theming. Runs synchronously during parsing so
            the seasonal palette applies before first paint — these pages are
            statically generated, so the server cannot know today's date. */}
        <script dangerouslySetInnerHTML={{ __html: slamThemeScript() }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Direction contract — must survive the production build as a real
            HTML comment, hence the innerHTML carrier. */}
        <div
          hidden
          dangerouslySetInnerHTML={{
            __html: `<!--
THESIS: A match-analytics instrument that reads your game - the court of the
current Grand Slam season is the ground, your answers become a tracked trace,
three racquets land as bounce points. Refuses the centered-hero quiz-tool page.
OWN-WORLD: Night graphite ground; the season surface (--court) owns the large
fields; optic citron is the only action color (the ball is the constant);
hairline court lines; Archivo (wide) display, Geist body, Geist Mono readouts;
specs measured on graticules.
STORY: A player watches their game being read, starts the reading, leaves with
three justified racquets.
FIRST VIEWPORT: Full-bleed court on the season surface; animated serve trace;
headline in a chyron panel bottom-left; citron CTA at the bounce point;
stats as mono readouts.
FORM: Hawk-Eye ball-tracking graphics; candidate 6/7; seed 75c9d8a4.
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance.
-->`,
          }}
        />
        <NextIntlClientProvider>
          {children}
          {/* Measurement runs everywhere, including the ad-free routes — see
              GoogleAnalytics for why it does not follow the ad policy. */}
          <GoogleAnalytics />
          {/* Both opt themselves out on ad-free routes — see AdsenseLoader. The
              layout has no pathname, so it cannot make that call here. */}
          <AdsenseLoader />
          <ConsentBanner />
          <Toaster />
          <SlamThemeSync />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

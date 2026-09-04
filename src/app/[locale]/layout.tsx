import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
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

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        {/* Grand Slam season theming. Runs synchronously during parsing so
            the seasonal palette applies before first paint — these pages are
            statically generated, so the server cannot know today's date. */}
        <script dangerouslySetInnerHTML={{ __html: slamThemeScript() }} />
      </head>
      <body className="min-h-full flex flex-col">
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

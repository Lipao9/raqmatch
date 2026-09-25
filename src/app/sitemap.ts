import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { catalogUpdatedAt, loadCatalog } from "@/lib/catalog";
import { GUIDES, guideLastModified, latestGuideDate } from "@/lib/guides";
import { racketNoteGeneratedAt } from "@/lib/racket-notes";
import { alternatesFor } from "@/lib/urls";

// Every indexable route, listed once under the default locale with the other
// locales as hreflang alternates — the shape Google prefers over one entry per
// locale. /results is deliberately absent: it is a parameterised, per-visitor
// page, marked noindex at the page level so shared links still get OG previews.
const STATIC_PATHS = [
  "/",
  "/quiz",
  "/quiz/quick",
  "/quiz/detailed",
  // Listed so AdSense review and crawlers can both reach the policy; a privacy
  // page they cannot find does not satisfy either.
  "/privacy",
  "/about",
  "/contact",
] as const;

function entry(href: string, lastModified?: Date): MetadataRoute.Sitemap[number] {
  // Same helper the pages use, so the hreflang set here can never drift from
  // the one in the <head>.
  const { canonical, languages } = alternatesFor(href, routing.defaultLocale);

  return {
    url: canonical,
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages },
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const updatedAt = catalogUpdatedAt();

  return [
    ...STATIC_PATHS.map((href) => entry(href)),
    entry("/racquets", updatedAt),
    ...loadCatalog().map((racket) => {
      // Whichever of the two sources of this page's content changed last.
      const note = racketNoteGeneratedAt(racket.id);
      return entry(
        `/racquets/${racket.id}`,
        note && note > updatedAt ? note : updatedAt,
      );
    }),
    entry("/guides", latestGuideDate()),
    ...GUIDES.map((guide) =>
      entry(`/guides/${guide.slug}`, guideLastModified(guide)),
    ),
  ];
}

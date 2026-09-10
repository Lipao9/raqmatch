import type { MDXContent } from "mdx/types";
import type { Locale } from "@/i18n/routing";

/**
 * The guide registry — single source of truth for the editorial layer.
 *
 * Metadata lives here, not in MDX frontmatter: @next/mdx would need a remark
 * plugin to read frontmatter, and a typed registry already feeds the index
 * page, sitemap and generateMetadata from one greppable place. Content files
 * at src/content/guides/<slug>.<locale>.mdx carry prose only and start at
 * `##` — the page owns the h1.
 *
 * Each content import is a literal, not a template string: Turbopack can then
 * code-split one chunk per guide, and a missing or misnamed file fails
 * `next build` instead of 500ing at request time. `Record<Locale, …>` makes a
 * missing translation a type error for the same reason.
 *
 * Slugs are pt-BR-flavored and shared across locales, consistent with the
 * project-wide decision to run next-intl without a `pathnames` map.
 */

export const GUIDE_CATEGORIES = ["choosing", "specs", "strings"] as const;
export type GuideCategory = (typeof GUIDE_CATEGORIES)[number];

interface GuideText {
  title: string;
  description: string;
}

export interface GuideDef {
  slug: string;
  category: GuideCategory;
  /** ISO date, e.g. "2026-09-10". */
  publishedAt: string;
  updatedAt?: string;
  /** Catalog ids surfaced as "cited racquets" below the article. */
  relatedRacquetIds: readonly string[];
  i18n: Record<Locale, GuideText>;
  content: Record<Locale, () => Promise<{ default: MDXContent }>>;
}

export const GUIDES: readonly GuideDef[] = [
  {
    slug: "como-escolher-raquete-de-tenis",
    category: "choosing",
    publishedAt: "2026-09-10",
    relatedRacquetIds: [
      "babolat-boost-drive",
      "babolat-pure-aero-team-2026",
      "wilson-clash-100l-v3",
      "wilson-blade-98-16x19-v10",
    ],
    i18n: {
      "pt-BR": {
        title: "Como escolher uma raquete de tênis",
        description:
          "As quatro especificações que definem como uma raquete joga — tamanho da cabeça, peso, rigidez e padrão de cordas — e como lê-las de acordo com o seu jogo.",
      },
      en: {
        title: "How to choose a tennis racquet",
        description:
          "The four specs that decide how a racquet plays — head size, weight, stiffness and string pattern — and how to read them against your own game.",
      },
    },
    content: {
      "pt-BR": () =>
        import("@/content/guides/como-escolher-raquete-de-tenis.pt-BR.mdx"),
      en: () =>
        import("@/content/guides/como-escolher-raquete-de-tenis.en.mdx"),
    },
  },
  {
    slug: "peso-com-corda-ou-sem-corda",
    category: "specs",
    publishedAt: "2026-09-10",
    relatedRacquetIds: [
      "babolat-pure-aero-2026",
      "head-speed-mp-l-2026",
      "wilson-ultra-100ul-v5",
    ],
    i18n: {
      "pt-BR": {
        title: "Peso da raquete: com corda ou sem corda?",
        description:
          "Lojas brasileiras anunciam o peso sem corda; catálogos americanos, com corda. A diferença de ~17 g faz a mesma raquete parecer duas — entenda qual número comparar.",
      },
      en: {
        title: "Racquet weight: strung or unstrung?",
        description:
          "US catalogs list strung weight; many markets, including Brazil, list unstrung. The ~17 g gap makes one racquet look like two — here is which number to compare.",
      },
    },
    content: {
      "pt-BR": () =>
        import("@/content/guides/peso-com-corda-ou-sem-corda.pt-BR.mdx"),
      en: () => import("@/content/guides/peso-com-corda-ou-sem-corda.en.mdx"),
    },
  },
  {
    slug: "rigidez-ra-e-dor-no-braco",
    category: "specs",
    publishedAt: "2026-09-10",
    relatedRacquetIds: [
      "wilson-clash-100l-v3",
      "wilson-blade-98-16x19-v10",
      "babolat-evo-aero-2026",
    ],
    i18n: {
      "pt-BR": {
        title: "Rigidez (RA): o número que importa para o seu braço",
        description:
          "O que a escala RA mede, por que quadros rígidos devolvem mais potência e transmitem mais impacto, e como escolher se você tem histórico de dor no cotovelo.",
      },
      en: {
        title: "Stiffness (RA): the number that matters for your arm",
        description:
          "What the RA scale measures, why stiff frames return more power but transmit more shock, and how to choose if you have a history of elbow pain.",
      },
    },
    content: {
      "pt-BR": () =>
        import("@/content/guides/rigidez-ra-e-dor-no-braco.pt-BR.mdx"),
      en: () => import("@/content/guides/rigidez-ra-e-dor-no-braco.en.mdx"),
    },
  },
];

export function getGuide(slug: string): GuideDef | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

export function guideLastModified(guide: GuideDef): Date {
  return new Date(guide.updatedAt ?? guide.publishedAt);
}

/** Sitemap lastModified for the /guides index: the newest guide movement. */
export function latestGuideDate(): Date {
  return new Date(
    Math.max(...GUIDES.map((guide) => guideLastModified(guide).getTime())),
  );
}

/** Categories in declaration order, only those with at least one guide. */
export function guidesByCategory(): {
  category: GuideCategory;
  guides: GuideDef[];
}[] {
  return GUIDE_CATEGORIES.map((category) => ({
    category,
    guides: GUIDES.filter((guide) => guide.category === category),
  })).filter((group) => group.guides.length > 0);
}

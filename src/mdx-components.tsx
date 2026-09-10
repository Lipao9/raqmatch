import type { MDXComponents } from "mdx/types";
import { Link } from "@/i18n/navigation";
import { CatalogStat } from "@/components/guides/CatalogStat";
import { RacquetCard } from "@/components/guides/RacquetCard";
import { SpecScale } from "@/components/guides/SpecScale";

/**
 * Global element map for every imported .mdx file — this is the guides'
 * typography layer, so DESIGN.md stays authoritative instead of a prose-class
 * plugin. Required by @next/mdx on the App Router.
 *
 * Two rules encoded here rather than in each guide:
 * - Guides start at `##`; the h1 belongs to the page, fed from the registry.
 * - Internal links written as plain markdown (`[x](/racquets/...)`) go through
 *   next-intl's Link so they pick up the locale prefix. A raw <a> would drop
 *   the visitor from /en back into pt-BR mid-article.
 */
const linkClass =
  "font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary";

const components: MDXComponents = {
  h2: ({ children }) => (
    <h2 className="mt-8 font-heading text-2xl font-semibold">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 font-heading text-xl font-semibold">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="leading-relaxed text-foreground/85">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-foreground/85 marker:text-primary">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="flex list-decimal flex-col gap-2 pl-5 leading-relaxed text-foreground/85 marker:text-primary">
      {children}
    </ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l border-primary/50 pl-4 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border/60" />,
  code: ({ children }) => (
    <code className="font-mono text-sm text-primary">{children}</code>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  a: ({ href = "", children }) =>
    href.startsWith("/") ? (
      <Link href={href} className={linkClass}>
        {children}
      </Link>
    ) : (
      <a href={href} rel="noopener noreferrer" className={linkClass}>
        {children}
      </a>
    ),
  // Catalog-driven embeds, available in every guide without an import line:
  // unknown capitalized identifiers in MDX resolve through this map.
  CatalogStat,
  RacquetCard,
  SpecScale,
};

export function useMDXComponents(): MDXComponents {
  return components;
}

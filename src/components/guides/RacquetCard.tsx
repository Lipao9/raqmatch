import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getRacketBySlug } from "@/lib/catalog";
import { weightLabel } from "@/lib/weight";

/**
 * A racquet reference inside guide prose — same card shape as the "related"
 * block on the racquet page, so a guide's examples read as catalog citations,
 * not editorial endorsements.
 *
 * Throws on an unknown slug: guide content is authored in the repo, so a typo
 * should fail `next build`, never silently drop the example from the article.
 */
export async function RacquetCard({ slug }: { slug: string }) {
  const racket = getRacketBySlug(slug);
  if (!racket) throw new Error(`RacquetCard: unknown racquet slug "${slug}"`);

  const locale = await getLocale();

  return (
    <Link
      href={`/racquets/${racket.id}`}
      className="my-2 flex flex-col gap-1.5 rounded-xl border border-border/60 p-4 transition-colors hover:border-primary/50 hover:bg-accent/30"
    >
      <span className="font-heading font-semibold">
        {racket.brand} {racket.model}
      </span>
      <span className="text-xs text-muted-foreground">
        {racket.headSizeIn2} in² · {weightLabel(racket, locale)} ·{" "}
        {racket.stringPattern}
        {racket.stiffnessRA !== null && ` · RA ${racket.stiffnessRA}`}
      </span>
    </Link>
  );
}

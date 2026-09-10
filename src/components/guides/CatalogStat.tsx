import { loadCatalog } from "@/lib/catalog";

/**
 * A live figure computed from the catalog, cited inside guide prose as a mono
 * readout. Named stats only — a guide cites a handful of known quantities, and
 * a generic query prop would turn content files into a query language.
 *
 * These numbers are the guides' claim to being non-generic: they restate what
 * data/rackets.json actually holds today, not what a listicle asserts.
 */
const STATS = {
  racquets: () => `${loadCatalog().length}`,
  brands: () => `${new Set(loadCatalog().map((r) => r.brand)).size}`,
  medianWeight: () => `${median(loadCatalog().map((r) => r.weightGrams))} g`,
  medianStiffness: () =>
    `RA ${median(
      loadCatalog()
        .map((r) => r.stiffnessRA)
        .filter((ra): ra is number => ra !== null),
    )}`,
  shareHead100: () => {
    const rackets = loadCatalog();
    const over = rackets.filter((r) => r.headSizeIn2 >= 100).length;
    return `${Math.round((over / rackets.length) * 100)}%`;
  },
} as const;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function CatalogStat({
  stat,
  label,
}: {
  stat: keyof typeof STATS;
  label: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
      <span className="font-mono text-sm text-primary">{STATS[stat]()}</span>
      <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </span>
  );
}

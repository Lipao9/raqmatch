import { z } from "zod";
import catalogFile from "../../data/rackets.json";

export const racketSchema = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  headSizeIn2: z.number().positive(),
  weightGrams: z.number().positive(), // strung
  balance: z.string(),
  balancePoints: z.number().nullable(), // negative = head light
  stiffnessRA: z.number().nullable(),
  stringPattern: z.string(),
  swingweight: z.number().nullable(),
  priceUSD: z.number().positive(),
  imageUrl: z.string().url(),
  productUrl: z.string().url(),
});

export type Racket = z.infer<typeof racketSchema>;

export const catalogSchema = z.object({
  version: z.number(),
  updatedAt: z.string(),
  source: z.string(),
  rackets: z.array(racketSchema).min(1),
});

export type Catalog = z.infer<typeof catalogSchema>;

let cached: Catalog | null = null;

function parsed(): Catalog {
  cached ??= catalogSchema.parse(catalogFile);
  return cached;
}

export function loadCatalog(): Racket[] {
  return parsed().rackets;
}

/** When the catalog was last scraped — drives `lastModified` in the sitemap. */
export function catalogUpdatedAt(): Date {
  return new Date(parsed().updatedAt);
}

export type SpecRange = { min: number; max: number };

/**
 * Min–max across the whole catalog for each measured spec — the ruler every
 * graticule on the site measures a racquet against.
 */
export function specRanges(): {
  headSize: SpecRange;
  weight: SpecRange;
  stiffness: SpecRange;
  swingweight: SpecRange;
} {
  const rackets = loadCatalog();
  const range = (pick: (r: Racket) => number | null): SpecRange => {
    const values = rackets
      .map(pick)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    return { min: Math.min(...values), max: Math.max(...values) };
  };
  return {
    headSize: range((r) => r.headSizeIn2),
    weight: range((r) => r.weightGrams),
    stiffness: range((r) => r.stiffnessRA),
    swingweight: range((r) => r.swingweight),
  };
}

/**
 * Racket ids are already slug-shaped (`babolat-pure-aero-2026`), so they double
 * as the URL segment — no separate slug field to keep in sync.
 */
export function getRacketBySlug(slug: string): Racket | undefined {
  return loadCatalog().find((r) => r.id === slug);
}

/** Brands with their racquets, alphabetical, for the browsable index. */
export function racketsByBrand(): { brand: string; rackets: Racket[] }[] {
  const groups = new Map<string, Racket[]>();
  for (const racket of loadCatalog()) {
    const list = groups.get(racket.brand);
    if (list) list.push(racket);
    else groups.set(racket.brand, [racket]);
  }
  return [...groups.entries()]
    .map(([brand, rackets]) => ({
      brand,
      rackets: [...rackets].sort((a, b) => a.model.localeCompare(b.model)),
    }))
    .sort((a, b) => a.brand.localeCompare(b.brand));
}

/**
 * Racquets a shopper on this page would plausibly cross-shop: closest on the
 * specs that actually change how a frame plays. Same-brand frames are nudged
 * down so the block reads as a comparison rather than a brand catalogue, which
 * is also what makes the internal links worth crawling.
 */
export function findRelated(racket: Racket, limit = 4): Racket[] {
  return loadCatalog()
    .filter((r) => r.id !== racket.id)
    .map((r) => {
      let distance =
        Math.abs(r.headSizeIn2 - racket.headSizeIn2) * 2 +
        Math.abs(r.weightGrams - racket.weightGrams) * 0.4;
      if (r.stiffnessRA !== null && racket.stiffnessRA !== null) {
        distance += Math.abs(r.stiffnessRA - racket.stiffnessRA);
      }
      if (r.stringPattern !== racket.stringPattern) distance += 4;
      if (r.brand === racket.brand) distance += 6;
      return { racket: r, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((x) => x.racket);
}

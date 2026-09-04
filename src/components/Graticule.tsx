import { cn } from "@/lib/utils";

/**
 * A measured track — the world's rule that no number floats without a scale.
 * Ten divisions, hairline center line, square end caps. `pct` places either a
 * point marker (a value measured on the catalog's ruler) or a filled bar from
 * zero (a quantity, e.g. minutes).
 */
export function Graticule({
  pct,
  mode = "marker",
  className,
}: {
  pct: number;
  mode?: "marker" | "bar";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      aria-hidden
      className={cn("relative h-3 border-x border-border", className)}
    >
      <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-border"
          style={{ left: `${(i + 1) * 10}%` }}
        />
      ))}
      {mode === "marker" ? (
        <span
          className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 bg-primary"
          style={{ left: `${clamped}%` }}
        />
      ) : (
        <span
          className="absolute left-0 top-1/2 h-1 -translate-y-1/2 bg-primary"
          style={{ width: `${clamped}%` }}
        />
      )}
    </div>
  );
}

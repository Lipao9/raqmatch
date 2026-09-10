import { Graticule } from "@/components/Graticule";
import { specRanges } from "@/lib/catalog";

/**
 * A number cited in guide prose, measured on the catalog's min–max ruler —
 * the same treatment the racquet page gives its specs ("no number floats
 * without a scale"). `label` is authored in the guide's own language since
 * MDX content is already per-locale.
 */
export function SpecScale({
  spec,
  value,
  label,
  unit,
}: {
  spec: keyof ReturnType<typeof specRanges>;
  value: number;
  label: string;
  unit: string;
}) {
  const { min, max } = specRanges()[spec];

  return (
    <figure className="my-2 flex flex-col">
      <div className="flex items-baseline justify-between gap-4">
        <figcaption className="text-sm text-muted-foreground">
          {label}
        </figcaption>
        <span className="font-mono text-sm text-primary">
          {value} {unit}
        </span>
      </div>
      <Graticule
        pct={((value - min) / (max - min)) * 100}
        className="mt-2"
      />
      <div className="mt-1 flex justify-between font-mono text-[0.65rem] text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </figure>
  );
}

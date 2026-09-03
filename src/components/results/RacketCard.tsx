"use client";

import Image from "next/image";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Racket } from "@/lib/catalog";
import { storefrontFor } from "@/lib/offers";
// Type-only, so the strings catalog JSON never enters the client bundle.
import type { StringReason, TensionRange } from "@/lib/string-advice";
import { weightLabel } from "@/lib/weight";

/** The one string suggestion /api/recommend attaches to each pick. */
export interface StringPickView {
  name: string;
  gaugeMm: string;
  reason: StringReason;
  tension: TensionRange;
  /** Null for locales with no string store (/en) — advice only, no button. */
  buyUrl: string | null;
  rel: string;
}

interface RacketCardProps {
  racket: Racket;
  justification: string;
  buyUrl: string;
  rel: string;
  rank: number;
  stringPick?: StringPickView | null;
}

export function RacketCard({
  racket,
  justification,
  buyUrl,
  rel,
  rank,
  stringPick,
}: RacketCardProps) {
  const t = useTranslations("results");
  const tStores = useTranslations("stores");
  const tStrings = useTranslations("strings");
  const format = useFormatter();
  const locale = useLocale();
  const isBestMatch = rank === 1;

  // Same choice the buy URL was built from, and deterministic on the same
  // inputs, so the label always names the store the click actually reaches.
  const storefront = storefrontFor(racket, locale);
  const storeAt = tStores(`at.${storefront?.store ?? "tennis-warehouse"}`);
  const priceBRL = storefront?.priceBRL ?? null;
  // The USD reference only makes sense next to a Tennis Warehouse button. When
  // the button goes to a Brazilian store and the BRL price is missing or stale,
  // no price beats a dollar figure the store will never charge.
  const showUSD =
    priceBRL === null &&
    (storefront?.store ?? "tennis-warehouse") === "tennis-warehouse";

  const specs = [
    `${racket.headSizeIn2} in²`,
    weightLabel(racket, locale),
    racket.stiffnessRA !== null ? `RA ${racket.stiffnessRA}` : null,
    racket.stringPattern,
    racket.swingweight !== null ? `SW ${racket.swingweight}` : null,
    racket.balance,
  ].filter(Boolean) as string[];

  return (
    <Card
      className={`relative overflow-hidden transition-shadow hover:shadow-lg hover:shadow-primary/5 ${
        isBestMatch ? "border-primary/60 shadow-md shadow-primary/10" : ""
      }`}
    >
      {isBestMatch && (
        <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/30" />
      )}
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full font-heading text-sm font-semibold ${
                isBestMatch
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {rank}
            </span>
            <CardTitle className="font-heading text-2xl">
              {racket.brand} {racket.model}
            </CardTitle>
          </div>
          {isBestMatch && <Badge>{t("bestMatch")}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row">
        <div className="relative mx-auto h-44 w-36 shrink-0 rounded-xl bg-accent/40 p-2 sm:mx-0">
          <Image
            src={racket.imageUrl}
            alt={`${racket.brand} ${racket.model}`}
            fill
            sizes="144px"
            className="object-contain p-2"
            unoptimized
          />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {specs.map((s) => (
              <Badge key={s} variant="secondary">
                {s}
              </Badge>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">
            {justification}
          </p>
          {stringPick && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-accent/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                {tStrings("resultLabel")}:
              </span>
              <span className="font-medium">
                {stringPick.name} {stringPick.gaugeMm}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {tStrings("tensionRange", {
                  lowKg: stringPick.tension.kg[0],
                  highKg: stringPick.tension.kg[1],
                  lowLbs: stringPick.tension.lbs[0],
                  highLbs: stringPick.tension.lbs[1],
                })}
              </span>
              {stringPick.buyUrl && (
                <a
                  href={stringPick.buyUrl}
                  target="_blank"
                  rel={stringPick.rel}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {tStores("viewAt", { at: tStores("at.mercadolivre") })}
                </a>
              )}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        {/* See the racquet page: the BRL figure is the cheapest of several
            listings, so it is framed as a floor rather than the price. */}
        <span className="flex items-baseline gap-1.5">
          {priceBRL !== null && (
            <span className="text-xs text-muted-foreground">
              {tStores("priceFrom")}
            </span>
          )}
          <span className="font-heading text-lg font-semibold">
            {priceBRL !== null
              ? format.number(priceBRL, {
                  style: "currency",
                  currency: "BRL",
                  maximumFractionDigits: 0,
                })
              : showUSD && `US$ ${racket.priceUSD}`}
          </span>
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={`/racquets/${racket.id}`} />}
          >
            {t("viewSpecs")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={buyUrl} target="_blank" rel={rel} />}
          >
            {tStores("viewAt", { at: storeAt })}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

import { getFormatter, getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relForKind, trackedStringUrl } from "@/lib/affiliate";
import type { Racket } from "@/lib/catalog";
import { stringAdviceFor } from "@/lib/string-advice";
import { freshStringPriceBRL, resolveStringLink } from "@/lib/strings";

/**
 * "Which strings for this frame" on the racquet page. Advice is deterministic
 * (see string-advice.ts) with no player profile: on a static page the frame
 * stands in for its typical buyer. Quiz results get the personalised version
 * through /api/recommend instead.
 *
 * Buy buttons are pt-BR only — string offers exist only on Mercado Livre, and
 * a Brazilian marketplace link is dead weight for a reader it cannot ship to.
 * The advice itself (pick + tension) renders for both locales: it is the part
 * with SEO value, and it is true everywhere.
 */
export async function RecommendedStrings({
  racket,
  locale,
}: {
  racket: Racket;
  locale: string;
}) {
  const t = await getTranslations("strings");
  const tStores = await getTranslations("stores");
  const format = await getFormatter();
  const { picks } = stringAdviceFor(racket);
  if (picks.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-semibold">
          {t("sectionTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("sectionHint")}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {picks.map((pick) => {
          const link = resolveStringLink(pick.string);
          const priceBRL = link.offer
            ? freshStringPriceBRL(link.offer)
            : null;
          const href = `${trackedStringUrl(pick.string.id, "racquet_page")}&locale=${locale}`;

          return (
            <li
              key={pick.string.id}
              className="flex flex-col gap-3 rounded-xl border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-heading font-semibold">
                    {pick.string.brand} {pick.string.model}
                  </span>
                  <Badge variant="secondary">
                    {t("gauge", { gauge: pick.string.gaugeMm })}
                  </Badge>
                  <Badge>{t(`reasons.${pick.reason}`)}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {t("tensionLabel")}:{" "}
                  <span className="font-medium tabular-nums text-foreground/80">
                    {t("tensionRange", {
                      lowKg: pick.tension.kg[0],
                      highKg: pick.tension.kg[1],
                      lowLbs: pick.tension.lbs[0],
                      highLbs: pick.tension.lbs[1],
                    })}
                  </span>
                </span>
              </div>
              {locale === "pt-BR" && (
                <div className="flex items-center gap-3">
                  {priceBRL !== null && (
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {tStores("priceFrom")}
                      </span>
                      <span className="font-heading font-semibold">
                        {format.number(priceBRL, {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={
                      <a
                        href={href}
                        target="_blank"
                        rel={relForKind(link.kind)}
                      />
                    }
                  >
                    {tStores("viewAt", { at: tStores("at.mercadolivre") })}
                    <ExternalLink />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{t("tensionDisclaimer")}</p>
    </section>
  );
}

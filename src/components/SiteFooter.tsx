import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { isAffiliateEnabled } from "@/lib/affiliate";

export async function SiteFooter() {
  const t = await getTranslations("footer");

  return (
    <footer className="relative border-t border-border/60 px-6 py-5 text-center text-xs text-muted-foreground">
      <span className="mx-auto mb-4 block h-1 w-16 rounded-full bg-primary/30" />
      {/* Only shown when links are actually monetised — an affiliate notice on
          unmonetised links would be a false disclosure. */}
      {isAffiliateEnabled() && (
        <p className="mx-auto mb-3 max-w-xl leading-relaxed">
          {t("disclosure")}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>RaqMatch · {new Date().getFullYear()}</span>
        <span aria-hidden className="text-border">
          ·
        </span>
        <Link
          href="/about"
          className="transition-colors hover:text-primary hover:underline"
        >
          {t("about")}
        </Link>
        <span aria-hidden className="text-border">
          ·
        </span>
        <Link
          href="/contact"
          className="transition-colors hover:text-primary hover:underline"
        >
          {t("contact")}
        </Link>
        <span aria-hidden className="text-border">
          ·
        </span>
        {/* Unconditional, not gated on ads being enabled: AdSense review needs to
            reach this from every page, and LGPD disclosure is owed regardless of
            whether ads happen to be switched on. */}
        <Link
          href="/privacy"
          className="transition-colors hover:text-primary hover:underline"
        >
          {t("privacy")}
        </Link>
      </div>
    </footer>
  );
}

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { SLAM_IDS, SLAM_NAMES } from "@/lib/slam";

export async function SiteHeader() {
  const t = await getTranslations("nav");

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/60 bg-background/75 px-6 py-4 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="RaqMatch">
          <BrandLogo />
        </Link>
        {/* One badge per major; globals.css shows only the one matching the
            data-theme the head script stamped, so this stays static HTML. */}
        {SLAM_IDS.map((slam) => (
          <span
            key={slam}
            data-slam-badge={slam}
            className="items-center gap-1.5 rounded-full border border-accent-foreground/15 bg-accent/50 px-2.5 py-0.5 text-xs text-accent-foreground"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            {t("season", { slam: SLAM_NAMES[slam] })}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4">
        {/* Site-wide entry point into the catalog: gives every page a crawlable
            path to the racquet pages, not just the quiz flow. */}
        <Link
          href="/racquets"
          className="text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          {t("racquets")}
        </Link>
        <LocaleSwitcher />
      </div>
    </header>
  );
}

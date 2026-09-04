"use client";

import { useLayoutEffect } from "react";
import { getActiveSlam, slamOverride } from "@/lib/slam";

/**
 * The inline head script (see slamThemeScript) sets data-theme during HTML
 * parsing, which is all production needs. In development, React Strict Mode's
 * remount resets <html> to the attributes JSX manages and wipes it — the
 * Next docs' own fix is re-applying in a layout effect, which runs before
 * paint and is a no-op in production where the attribute is already correct.
 */
export function SlamThemeSync() {
  useLayoutEffect(() => {
    // Honour the same ?slam= preview override as the head script, or the
    // Strict Mode remount would snap a forced preview back to today's date.
    const override = slamOverride(window.location.search);
    const slam = override === undefined ? getActiveSlam(new Date()) : override;
    if (slam) {
      document.documentElement.setAttribute("data-theme", slam);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, []);

  return null;
}

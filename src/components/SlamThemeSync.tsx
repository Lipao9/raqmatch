"use client";

import { useLayoutEffect } from "react";
import { getActiveSlam } from "@/lib/slam";

/**
 * The inline head script (see slamThemeScript) sets data-theme during HTML
 * parsing, which is all production needs. In development, React Strict Mode's
 * remount resets <html> to the attributes JSX manages and wipes it — the
 * Next docs' own fix is re-applying in a layout effect, which runs before
 * paint and is a no-op in production where the attribute is already correct.
 */
export function SlamThemeSync() {
  useLayoutEffect(() => {
    const slam = getActiveSlam(new Date());
    if (slam) {
      document.documentElement.setAttribute("data-theme", slam);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, []);

  return null;
}

import { ImageResponse } from "next/og";
import { getRacketBySlug, loadCatalog } from "@/lib/catalog";
import { weightLabel } from "@/lib/weight";
import { MARK_PATHS, MARK_VIEWBOX } from "@/components/BrandLogo";

export const alt = "RaqMatch — racquet specs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// opengraph-image is its own route handler and does not inherit the params of
// the sibling page.tsx. Declaring them here does not bake the PNGs at build
// time — no image bodies land in .next — but it does register the route for
// incremental caching (it moves into `dynamicRoutes` in the prerender
// manifest), so each image is rendered once on first request instead of on
// every request. Verified by diffing the manifest with and without this.
export function generateStaticParams() {
  return loadCatalog().map((racket) => ({ slug: racket.id }));
}

// Hex approximations of the Monte Carlo tokens in globals.css: Satori resolves
// neither CSS variables nor oklch(), so the palette is duplicated here.
const SAND_BG = "#faf7f2";
const INK = "#22303f";
const TERRACOTTA = "#b65f3c";
const MUTED = "#5c6a80";
const BORDER = "#e3dcd2";

// The brand mark, as a data URI. Satori renders `<img>` reliably but supports only
// a subset of inline SVG, so the mark travels as an image rather than as elements.
// Geometry is imported rather than transcribed — see the note on MARK_PATHS.
const MARK = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" fill="${TERRACOTTA}">` +
    MARK_PATHS.map((d) => `<path d="${d}"/>`).join("") +
    `</svg>`,
).toString("base64")}`;

// The mark's bounding box is 532×701, so it is drawn to a matching 24×32 slot.
// Satori stretches an <img> to whatever box it is given rather than preserving
// the aspect ratio, so a square one would squash it.
const MARK_WIDTH = 24;
const MARK_HEIGHT = 32;

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const racket = getRacketBySlug(slug);

  const specs = (
    racket
      ? [
          `${racket.headSizeIn2} in²`,
          weightLabel(racket, locale),
          racket.stringPattern,
          racket.stiffnessRA !== null ? `RA ${racket.stiffnessRA}` : null,
        ]
      : []
  ).filter(Boolean) as string[];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: SAND_BG,
          color: INK,
          position: "relative",
        }}
      >
        {/* Court-line motif, echoing CourtLines.tsx in the app itself. */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -60,
            width: 420,
            height: 780,
            display: "flex",
            justifyContent: "space-between",
            transform: "rotate(-8deg)",
            opacity: 0.12,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ width: 6, height: "100%", background: TERRACOTTA }} />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Satori renders into a PNG, so next/image would be meaningless here. */}
          <img src={MARK} width={MARK_WIDTH} height={MARK_HEIGHT} alt="" />
          <span
            style={{
              fontSize: 24,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            RaqMatch
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span
            style={{
              fontSize: 30,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: TERRACOTTA,
            }}
          >
            {racket?.brand ?? "Tennis racquets"}
          </span>
          <span
            style={{
              fontSize: 84,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 900,
            }}
          >
            {racket?.model ?? "Full specs and comparison"}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: 14,
            borderTop: `2px solid ${BORDER}`,
            paddingTop: 28,
          }}
        >
          {specs.map((spec) => (
            <div
              key={spec}
              style={{
                display: "flex",
                fontSize: 28,
                color: INK,
                background: "#f2e6da",
                border: `2px solid ${BORDER}`,
                borderRadius: 999,
                padding: "10px 24px",
              }}
            >
              {spec}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

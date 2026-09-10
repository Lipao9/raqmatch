import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.tennis-warehouse.com" },
      { protocol: "https", hostname: "www.tennis-warehouse.com" },
    ],
  },
  // `pageExtensions` deliberately stays at the default: guide content is
  // imported through the registry in src/lib/guides.ts, and an .mdx file must
  // never be able to become a route by merely existing.
};

// No remark/rehype plugins — the guides only need core CommonMark + JSX, and
// under Turbopack only string-named plugins with serializable options work
// anyway (see node_modules/next/dist/docs/01-app/02-guides/mdx.md).
const withMDX = createMDX({});

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(withMDX(nextConfig));

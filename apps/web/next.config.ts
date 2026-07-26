import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The root demo launcher isolates its resource-bounded Webpack cache from
  // normal production builds and any Turbopack cache left by older commands.
  distDir: process.env['REMIT_NEXT_DIST_DIR'] ?? '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  async redirects() {
    return [
      // The marketing page is the static, designed landing in public/landing.
      // A visitor arriving at the root should see that, not the workspace.
      // Temporary rather than permanent so the root stays free to change
      // without browsers caching the hop indefinitely.
      { source: '/', destination: '/landing/index.html', permanent: false },
    ];
  },
};

export default nextConfig;

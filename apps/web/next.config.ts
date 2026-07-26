import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async redirects() {
    return [
      // The marketing page is the static, designed landing in public/landing.
      // A visitor arriving at the root should see that, not the workspace.
      // Temporary rather than permanent so the root stays free to change
      // without browsers caching the hop indefinitely.
      { source: '/', destination: '/landing', permanent: false },
    ];
  },
};

export default nextConfig;

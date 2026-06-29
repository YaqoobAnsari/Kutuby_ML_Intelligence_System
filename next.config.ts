import type { NextConfig } from 'next';

/**
 * Next.js 15 configuration for the Kutuby ML Intelligence Dashboard.
 * Type and ESLint checks are intentionally left enabled (the verification gate
 * relies on them).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;

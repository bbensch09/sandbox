import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@mozilla/readability', 'jsdom'],
};

export default nextConfig;

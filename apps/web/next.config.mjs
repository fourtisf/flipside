/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@coinside/core'],
  // Nothing uses next/image, so the image optimizer (/_next/image) stays off. Nginx blocks the path too.
  images: { unoptimized: true },
  async redirects() {
    // The prototype calls the leaderboard view "leaders"; keep that path working.
    return [{ source: '/leaders', destination: '/leaderboard', permanent: false }];
  },
};

export default nextConfig;

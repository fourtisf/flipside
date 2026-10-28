/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@flipside/core'],
  async redirects() {
    // The prototype calls the leaderboard view "leaders"; keep that path working.
    return [{ source: '/leaders', destination: '/leaderboard', permanent: false }];
  },
};

export default nextConfig;

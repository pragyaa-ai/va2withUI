/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prevent trailing slash redirects on API routes (307 issues)
  skipTrailingSlashRedirect: true,
};

export default nextConfig;

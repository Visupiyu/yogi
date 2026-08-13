import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deliberately NOT using serverExternalPackages for firebase-admin:
  // excluding it from webpack's bundle means Node's raw require() has to
  // load its dependency chain directly, and jwks-rsa's require() of
  // jose's ESM-only build then crashes production with ERR_REQUIRE_ESM.
  // Letting webpack bundle it normally handles that CJS/ESM interop
  // correctly (build script uses --webpack everywhere, so there's no
  // Turbopack junction-point issue to work around either).
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
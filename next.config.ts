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
      // LOCAL TEST ONLY: images uploaded to the Storage emulator. Present
      // only when the opt-in emulator switch is on (see lib/firebase.ts);
      // otherwise this list is exactly the production one above.
      ...(process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
        ? [
            {
              protocol: "http" as const,
              hostname: "127.0.0.1",
              port: "9199",
              pathname: "/v0/b/**",
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
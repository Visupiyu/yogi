import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin's nested node_modules tree (grpc/protobuf/opentelemetry)
  // trips a Turbopack bug on Windows when bundled ("failed to create
  // junction point" / Cannot find module errors) — keep it (and its
  // Google Cloud dependencies) external and required directly by Node at
  // runtime instead of bundled.
  serverExternalPackages: [
    "firebase-admin",
    "@google-cloud/firestore",
    "google-gax",
  ],
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
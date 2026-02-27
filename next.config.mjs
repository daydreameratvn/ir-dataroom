/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
    serverComponentsExternalPackages: [
      "fluent-ffmpeg",
      "@prisma/client",
      "@prisma/adapter-better-sqlite3",
      "better-sqlite3",
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Handle node: protocol imports used by Prisma v7 generated client
      const nodeProtocolModules = [
        "node:crypto", "node:fs", "node:module", "node:os",
        "node:path", "node:process", "node:url", "node:util",
        "node:async_hooks",
      ];

      // Map node: imports to their non-prefixed equivalents
      const nodeExternals = {};
      for (const mod of nodeProtocolModules) {
        nodeExternals[mod] = `commonjs ${mod.replace("node:", "")}`;
      }

      config.externals = [
        ...config.externals,
        nodeExternals,
      ];
    }
    return config;
  },
};

export default nextConfig;

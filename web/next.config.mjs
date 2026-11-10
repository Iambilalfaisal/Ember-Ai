import path from "node:path";
import { fileURLToPath } from "node:url";

// The workspace root is the folder above web/, so Next finds the shared packages and one lockfile.
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The workspace packages ship TypeScript source; Next compiles it.
  transpilePackages: ["@ember/ui", "@ember/api", "@ember/live"],
  turbopack: { root: workspaceRoot },
};

export default nextConfig;

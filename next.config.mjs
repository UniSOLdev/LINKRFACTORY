import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  webpack: (config) => {
    config.resolve.alias["@"] = root;
    return config;
  },
};

export default nextConfig;

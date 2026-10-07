import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/opengraph-image",
        destination: "/images/733E6493-CD8B-4674-959E-365DF9B16AA7.png",
        permanent: false,
      },
      {
        source: "/twitter-image",
        destination: "/images/733E6493-CD8B-4674-959E-365DF9B16AA7.png",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

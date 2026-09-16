import type { NextConfig } from 'next';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const config: NextConfig = {
  output: 'export',
  basePath,
  images: { unoptimized: true },
  transpilePackages: ['@relay/engine', '@relay/dotnet-host'],
};

export default config;
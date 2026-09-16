import type { NextConfig } from 'next';

// No Pages o site vive em /<nome-do-repo>; localmente, na raiz.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const config: NextConfig = {
  output: 'export',
  basePath,
  images: { unoptimized: true },
};

export default config;
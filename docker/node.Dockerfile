FROM node:24-slim
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_HOME=/opt/corepack
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN corepack enable && corepack install
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @relay/api exec tsx --version && chmod -R a+rX /opt/corepack /pnpm
USER node
CMD ["pnpm", "--filter", "@relay/api", "start"]

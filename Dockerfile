# syntax=docker/dockerfile:1
#
# Builds the mAirList webinterface straight from its GitHub repository —
# no local checkout is copied into the image, `git clone` pulls the source
# during the build instead. Override REPO_URL/REPO_REF to build a fork or a
# specific branch/tag:
#   docker build --build-arg REPO_REF=some-branch -t mairlist-webinterface .
#
# Single stage on purpose: better-sqlite3's native addon is compiled here
# and must run in the exact same environment it was compiled in. Compiling
# it in a separate builder stage and COPYing the result into a different
# runtime stage is a common way to end up with a native module that
# segfaults (SIGSEGV, exit 139) instead of failing with a clear JS error.

FROM node:20-bookworm-slim

# python3/make/g++ are required to compile the better-sqlite3 native addon.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG REPO_URL=https://github.com/Mongstaen/mairlist-webinterface.git
ARG REPO_REF=main

WORKDIR /build
RUN git clone --depth 1 --branch "${REPO_REF}" "${REPO_URL}" .

RUN cd server && npm ci --omit=dev --build-from-source
RUN cd frontend && npm ci && npm run build

# Build tools and git are only needed above; drop them from the final image.
RUN apt-get purge -y --auto-remove git python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN mv /build/server ./server \
    && mv /build/frontend/dist ./frontend/dist \
    && rm -rf /build

# Writable mount point for the .mldb file and uploads (see docker-compose.yml).
# Owned by the non-root "node" user this image runs as.
RUN mkdir -p /data && chown -R node:node /data /app

WORKDIR /app/server
USER node

ENV NODE_ENV=production
ENV PORT=8841
EXPOSE 8841

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD node -e "fetch('http://localhost:'+(process.env.PORT||8841)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]

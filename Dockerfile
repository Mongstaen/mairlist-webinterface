# syntax=docker/dockerfile:1
#
# Builds the mAirList webinterface straight from its GitHub repository —
# no local checkout is copied into the image, `git clone` pulls the source
# during the build instead. Override REPO_URL/REPO_REF to build a fork or a
# specific branch/tag:
#   docker build --build-arg REPO_REF=some-branch -t mairlist-webinterface .

FROM node:20-bookworm-slim AS builder

# python3/make/g++ are required to compile the better-sqlite3 native addon.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG REPO_URL=https://github.com/Mongstaen/mairlist-webinterface.git
ARG REPO_REF=main

WORKDIR /build
RUN git clone --depth 1 --branch "${REPO_REF}" "${REPO_URL}" .

RUN cd server && npm install --production
RUN cd frontend && npm install && npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

COPY --from=builder /build/server ./server
COPY --from=builder /build/frontend/dist ./frontend/dist

WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=8841
EXPOSE 8841

CMD ["node", "index.js"]

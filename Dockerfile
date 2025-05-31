FROM node:24-bookworm-slim AS build-stage

WORKDIR /helmholtz

COPY package*.json ./

RUN apt-get update && apt-get install -y --no-install-recommends \
 python3 \
 make \
 gcc \
 g++ \
 libc-dev \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

RUN npm ci

COPY . .
RUN npm run build && npm prune --production

FROM gcr.io/distroless/nodejs24-debian12:nonroot

WORKDIR /helmholtz

COPY --from=build-stage /helmholtz/node_modules ./node_modules
COPY --from=build-stage /helmholtz/dist ./dist

ENTRYPOINT ["/nodejs/bin/node", "./dist/helmholtz.cjs"]
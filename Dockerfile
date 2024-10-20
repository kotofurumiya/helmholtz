FROM node:22-buster-slim AS build-stage

COPY ./ /helmholtz/
WORKDIR /helmholtz
RUN apt-get update && apt-get install -y --no-install-recommends \
 python3 \
 make \
 gcc \
 g++ \
 libc-dev \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*
RUN npm ci && npm run build && npm prune --production

FROM node:22-buster-slim

COPY --from=build-stage /helmholtz /helmholtz
WORKDIR /helmholtz

USER node
ENTRYPOINT ["node", "dist/helmholtz.cjs"]
#Dockerfile

# use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /usr/src/app
# Create logs and db directories with the correct permissions
RUN mkdir -p /usr/src/app/logs /usr/src/app/src/db && chown -R bun:bun /usr/src/app/logs /usr/src/app/src/db

# install dependencies into temp directory
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lockb /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile
# install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lockb /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .
# [optional] tests & build
ENV NODE_ENV=production
RUN bun test
RUN bun build ./src/index.ts --target=node --outdir ./dist

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/dist/ ./dist/
COPY --from=prerelease /usr/src/app/package.json .
# Set ownership of app directory to bun user
RUN chown -R bun:bun /usr/src/app

# Set NODE_TLS_REJECT_UNAUTHORIZED environment variable
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

# run the app
USER bun
EXPOSE 8080/tcp
ENTRYPOINT [ "bun", "run", "dist/index.js" ]

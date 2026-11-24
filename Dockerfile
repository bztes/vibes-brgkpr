# syntax=docker/dockerfile:1

# Runs natively on the runner: the output is platform-independent JS, and vite's
# native binaries crash with SIGILL (exit 132) under QEMU arm64 emulation.
FROM --platform=$BUILDPLATFORM node:24-trixie-slim AS build
WORKDIR /app
RUN npm install -g pnpm@12.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-trixie-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@12.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:24-trixie-slim
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssh-server borgbackup tini \
	&& rm -rf /var/lib/apt/lists/* /etc/ssh/ssh_host_* \
	&& userdel -r node && useradd --create-home --shell /bin/sh --uid 1000 --user-group borg \
	&& usermod -p '*' borg \
	&& mkdir -p /run/sshd /data /repos

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY server.js ./
COPY drizzle ./drizzle
COPY docker/sshd_config /etc/ssh/sshd_config
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/brgkpr-serve ./docker/brgkpr-serve
RUN chmod +x /entrypoint.sh ./docker/brgkpr-serve

ENV NODE_ENV=production \
	PORT=3000 \
	DATA_DIR=/data \
	REPO_DIR=/repos

VOLUME ["/data", "/repos"]
EXPOSE 3000 22
# Polls /health (src/routes/health/+server.ts); node, as the slim image has neither curl nor wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/entrypoint.sh"]
